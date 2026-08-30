const $ = (sel, root = document) => root.querySelector(sel);
const main = $("#main");
const toastEl = $("#toast");
const PAGE_TITLE = "OSSA 工作台 · 先选项，再拍写";

function lockTitle() {
  if (document.title !== PAGE_TITLE) document.title = PAGE_TITLE;
}
lockTitle();
const titleEl = document.querySelector("title");
if (titleEl) {
  new MutationObserver(lockTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
}

let toastTimer = 0;
/** kind: "busy" 进行中（不自动消失）· "ok" 好了 · "err" 出错 · 不传就是普通提示。 */
function toast(text, kind) {
  clearTimeout(toastTimer);
  toastEl.className = `toast show${kind ? ` ${kind}` : ""}`;
  toastEl.innerHTML = kind === "busy" ? `<i class="spin" aria-hidden="true"></i>${esc(text)}` : esc(text);
  if (kind !== "busy") toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

function skelHtml(kind = "cards", n = 4) {
  if (kind === "rows") {
    return `<div class="skel-list" aria-hidden="true">${`<div class="skel row"></div>`.repeat(n)}</div>`;
  }
  return `<div class="skel-grid" aria-hidden="true">${`<div class="skel"></div>`.repeat(n)}</div>`;
}

function friendlyError(text) {
  const s = String(text || "");
  if (/JSON Parse|Unexpected token|Unrecognized token|not valid JSON/i.test(s)) {
    return "模型这次没按结构交稿，再点一次「选这个」。";
  }
  return s;
}

let currentUser = null;
let gateMode = "login";
let captcha = { id: "", svg: "", startedAt: 0 };

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) data.error = friendlyError(data.error);
  if (!res.ok && !data.error) data.error = "请求失败";
  if (res.status === 401 && data.code === "auth" && !String(path).startsWith("/api/auth/")) {
    currentUser = null;
    renderGate();
  }
  return data;
}

function stripEmoji(s) {
  return String(s || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function esc(s) {
  return stripEmoji(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function coverSrc(url) {
  if (!url) return "";
  if (url.startsWith("/api/img")) return url;
  return `/api/img?u=${encodeURIComponent(url)}`;
}

function coverHtml(url, cls = "cover") {
  if (!url) return "";
  return `<img class="${cls}" src="${esc(coverSrc(url))}" alt="" width="640" height="360" decoding="async" onerror="this.remove()">`;
}

function bindChineseValidity(form) {
  if (!form) return;
  form.addEventListener(
    "invalid",
    (e) => {
      const el = e.target;
      if (!el.setCustomValidity) return;
      if (el.validity.valueMissing) el.setCustomValidity("请填这一项");
      else if (el.validity.typeMismatch) el.setCustomValidity("这一项格式不对");
      else if (el.validity.tooShort) el.setCustomValidity("至少 8 位");
      else el.setCustomValidity("");
    },
    true,
  );
  form.addEventListener("input", (e) => {
    e.target.setCustomValidity?.("");
  });
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "/hot";
  const [path, query] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  return { view: parts[0] || "hot", tab: parts[1] || "", query: new URLSearchParams(query || "") };
}

function userLabel(user) {
  const name = String(user?.name || "").trim();
  if (name) return name;
  return String(user?.email || "").split("@")[0] || "用户";
}

function userInitial(user) {
  const label = userLabel(user);
  if (/^\d+$/.test(label)) return label.slice(-2);
  return label.slice(0, 1).toUpperCase();
}

function avatarStyle(user) {
  const s = String(user?.email || user?.id || "ossa");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = [16, 28, 148, 188, 210, 262, 330][(h >>> 0) % 7];
  return `background:hsl(${hue} 42% 38%)`;
}

function paintUser() {
  const slot = $("#userSlot");
  if (!slot) return;
  if (!currentUser) {
    slot.innerHTML = "";
    return;
  }
  const admin = currentUser.role === "admin";
  slot.innerHTML = `
    <a class="user-chip" href="#/settings" title="打开设置">
      <span class="user-avatar" style="${avatarStyle(currentUser)}">${esc(userInitial(currentUser))}</span>
      <span>
        <b>${esc(userLabel(currentUser))}</b>
        <small>${esc(currentUser.email || "")}</small>
        ${admin ? `<small class="user-role">超级管理员</small>` : ""}
      </span>
    </a>
    <div class="user-actions">
      <a class="btn ghost" href="#/settings">资料</a>
      <button class="btn ghost" type="button" id="railLogout">退出</button>
    </div>
    <p style="padding:0 10px"><a href="/about.html">关于 OSSA</a></p>
  `;
  $("#railLogout")?.addEventListener("click", logoutNow);
}

async function logoutNow() {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  currentUser = null;
  gateMode = "login";
  paintUser();
  renderGate();
}

function setNav(view) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    a.classList.toggle("on", a.dataset.nav === view);
  });
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "刚刚刷新";
  if (mins < 60) return `上次刷新 ${mins} 分钟前`;
  return `上次刷新 ${Math.round(mins / 60)} 小时前`;
}

function pinPayload(item) {
  return {
    title: item.title,
    url: item.url,
    source: item.source || item.kind || "",
    summary: item.summary || item.line || "",
    cover: item.cover || "",
  };
}

async function pinItem(item) {
  if (!item?.url) return toast("这条没有原文链接，钉不上");
  await api("/api/pins", { method: "POST", body: JSON.stringify(pinPayload(item)) });
  toast("已钉进借鉴");
  render();
}

async function toTopic(item) {
  if (!item?.title) return toast("这句没有标题，做不成一份活");
  toast("正在做成一份活…");
  const data = await api("/api/topics", {
    method: "POST",
    body: JSON.stringify({
      title: item.title,
      url: item.url || "",
      source: item.originLabel || item.source || item.kind || "",
      summary: item.summary || item.why || item.line || "",
      cover: item.cover || "",
    }),
  });
  if (!data.task?.id) return toast(data.error || "没做成");
  if (data.error) toast(data.error);
  else toast("这份活已经立了");
  location.hash = `#/tasks/${encodeURIComponent(data.task.id)}`;
}

const PLATFORMS = [
  { id: "rednote", name: "小红书" },
  { id: "douyin", name: "抖音" },
  { id: "bili", name: "B站" },
  { id: "weibo", name: "微博" },
  { id: "zhihu", name: "知乎" },
  { id: "toutiao", name: "头条" },
  { id: "baidu", name: "百度" },
  { id: "quark", name: "夸克" },
  { id: "hacker-news", name: "HN" },
];
const STAGE_PLATFORMS = [
  { id: "rednote", name: "小红书" },
  { id: "douyin", name: "抖音" },
  { id: "bili", name: "B站" },
];
const TALK_PLATFORMS = [
  { id: "zhihu", name: "知乎" },
  { id: "weibo", name: "微博" },
];

function actionsHtml(item) {
  const open = item.url
    ? `<a class="btn ghost" href="${esc(item.url)}" target="_blank" rel="noopener">打开原文</a>`
    : "";
  const pin = item.url ? `<button class="btn ghost" data-pin>钉借鉴</button>` : "";
  return `<div class="actions">
    <button class="btn" data-topic>选这个</button>
    <button class="btn ghost" data-plant>种成长期主题</button>
    <button class="btn ghost" data-dig>事件地图</button>
    ${open}
    ${pin}
  </div>`;
}

function bindCard(el, item) {
  el.querySelector("[data-pin]")?.addEventListener("click", () => pinItem(item));
  el.querySelector("[data-topic]")?.addEventListener("click", () => toTopic(item));
  el.querySelector("[data-plant]")?.addEventListener("click", () => plantTheme(item));
  el.querySelector("[data-dig]")?.addEventListener("click", () => {
    location.hash = `#/dig?q=${encodeURIComponent(item.title || "")}`;
  });
}

async function plantTheme(item) {
  if (!item?.title) return toast("没有标题，种不成主题");
  const data = await api("/api/themes", {
    method: "POST",
    body: JSON.stringify({
      title: item.title,
      fromTitle: item.title,
      fromUrl: item.url || "",
      origin: item.originLabel || item.origin || item.source || "",
      summary: item.why || item.summary || "",
    }),
  });
  if (!data.theme?.id) return toast(data.error || "没种上");
  toast(data.already ? "这棵已经在了，重新激活" : "已种成长期主题，先放着不拍");
}

async function renderHot(tab) {
  setNav("hot");
  main.innerHTML = `<p class="kicker">OSSA</p>
    <h1 class="mast">先选项，再拍写</h1>
    <p class="sub">当下大家都在谈的场。选这个是进场，切口点进去再出。</p>
    <div class="hook cold">正在拉今天的场…</div>
    <div class="skel-grid" aria-hidden="true"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;

  const batch = Number(sessionStorage.getItem("ossa-batch") || 0);
  const home = await api(`/api/home?batch=${batch}`);
  const cards = home.inspirations || home.must || [];
  const pins = (home.pins || [])
    .map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>`)
    .join("");

  const jobs = (home.jobs || [])
    .map(
      (j) =>
        `<a class="job-chip" href="#/tasks/${encodeURIComponent(j.id)}"><span class="job-chip-title">${esc(j.title)}</span><small>${esc(STAGE_NAME[j.stage] || j.stage)}</small></a>`,
    )
    .join("");

  const must = cards
    .map(
      (item, i) => `<article style="--i:${i}">
        ${coverHtml(item.cover)}
        <div class="pad">
        <div class="line">${esc(item.line || item.originLabel || item.do || "")}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.execOpen || item.why || (item.summary || "").slice(0, 90))}</p>
        ${actionsHtml(item)}
        </div>
      </article>`,
    )
    .join("");

  const tabs = [
    ["platform", "平台热榜"],
    ["cases", "案例"],
    ["talk", "讨论"],
    ["nodes", "节点"],
    ["subscribe", "订阅"],
    ["creators", "对标"],
  ]
    .map(
      ([id, name]) =>
        `<a href="#/hot/${id}" class="${tab === id ? "on" : ""}">${name}</a>`,
    )
    .join("");

  main.innerHTML = `
    <p class="kicker">${esc(home.companyName || "OSSA")} · 不管账号</p>
    <h1 class="mast">先选项，再拍写</h1>
    <p class="sub">当下大家都在谈的场。选这个是进场，不是跟榜；种成主题，先放着。</p>
    <div class="hook ${home.hookReady ? "" : "cold"}">${esc(home.hook || home.coldStart)}</div>
    <div class="meta-row">
      <span>${esc(timeAgo(home.fetchedAt))}</span>
      <button type="button" id="refresh">换一批</button>
    </div>
    ${jobs ? `<div class="section-label">进行中的活</div><div class="jobs-rail">${jobs}</div>` : ""}
    <form class="start" id="startForm">
      <label class="sr" for="startLine">一句话开工</label>
      <input id="startLine" name="line" maxlength="120" placeholder="一句话开工，不必从热搜里长出来" autocomplete="off" />
      <button class="btn" type="submit">开工</button>
    </form>
    <div class="section-label">今日选题池 · 选场，切口点进去再出${
      home.domainFilterOn
        ? ` · 已按领域「${esc((home.domains || []).join("、"))}」偏过`
        : home.themeFilterOn
          ? " · 已按长期主题筛过热搜"
          : ""
    }</div>
    <div class="must">${must || `<div class="empty"><p>${esc(home.coldStart)}</p></div>`}</div>
    ${pins ? `<div class="section-label">最近钉进来的借鉴</div><div class="pins">${pins}</div>` : ""}
    <div class="section-label">原料货架 · 热搜只是原料，不是选题</div>
    <div class="tabs">${tabs}</div>
    <div id="pane"></div>
  `;
  $("#refresh")?.addEventListener("click", () => {
    sessionStorage.setItem("ossa-batch", String(batch + 1));
    render();
  });
  bindChineseValidity($("#startForm"));
  $("#startForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("#startLine")?.value.trim();
    if (!title) return toast("先写一句要做什么");
    toTopic({ title, source: "自己说的", originLabel: "自己说的", summary: "", url: "", cover: "" });
  });
  main.querySelectorAll(".must article").forEach((el, i) => bindCard(el, cards[i]));
  await renderTab(tab);
}

async function renderTab(tab) {
  const pane = $("#pane");
  if (!pane) return;
  if (!tab) {
    pane.innerHTML = `<div class="empty"><h2>货架先收着</h2><p>先在上面选一张，或写一句话开工。货架按怎么找选题来切：舞台、案例、讨论、节点、订阅、对标，不按美妆、职场、地产开格子。你认的领域贴进订阅和对标，或种成长期主题。</p></div>`;
    return;
  }
  if (tab === "platform") return renderPlatform(pane);
  if (tab === "cases" || tab === "marketing") return renderRss(pane);
  if (tab === "talk") return renderTalk(pane);
  if (tab === "nodes") return renderNodes(pane);
  if (tab === "subscribe" || tab === "ai" || tab === "tech" || tab === "open") {
    return renderBundle(pane, "/api/subscribe", "订阅还是空的");
  }
  if (tab === "creators") {
    pane.innerHTML = `<div class="empty"><h2>先贴对标账号的主页链接</h2><p>对标是你认的人，不是产品给你的行业榜。没有官方公开接口。去数据引擎贴链接。读失败会标明，不会装成没更新。</p><a class="btn" href="#/engine">去数据引擎</a></div>`;
  }
}

async function renderRankBoard(pane, platforms, two) {
  pane.innerHTML = `<div class="hot-board${two ? " two" : ""}">
    ${platforms.map(
      (p, i) => `<section class="col">
      <header><strong>${p.name}</strong><select id="col${i}">${PLATFORMS.map(
        (opt) => `<option value="${opt.id}" ${opt.id === p.id ? "selected" : ""}>${opt.name}</option>`,
      ).join("")}</select></header>
      <div id="list${i}" class="rank"></div>
    </section>`,
    ).join("")}
  </div>`;

  async function fill(sel, target) {
    const platform = $(sel).value;
    const box = $(target);
    box.innerHTML = skelHtml("rows", 6);
    const data = await api(`/api/hot?platform=${platform}`);
    if (!data.ok) {
      box.innerHTML = `<div class="empty" style="margin:12px;max-width:none"><p>${esc(data.error)}</p></div>`;
      return;
    }
    const items = (data.items || []).slice(0, 6);
    box.innerHTML = `<ol class="rank">${items
      .map(
        (it, i) => `<li>
          <span class="n num">${it.rank}</span>
          <a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
          <span class="heat num">${it.heat ? Math.round(it.heat).toLocaleString("zh-CN") : ""}</span>
          <button type="button" class="btn ghost tiny" data-topic-i="${i}">选这个</button>
          <button type="button" class="btn ghost tiny" data-plant-i="${i}">种成主题</button>
        </li>`,
      )
      .join("")}</ol>`;
    box.querySelectorAll("[data-topic-i]").forEach((btn) => {
      btn.addEventListener("click", () => toTopic(items[Number(btn.dataset.topicI)]));
    });
    box.querySelectorAll("[data-plant-i]").forEach((btn) => {
      btn.addEventListener("click", () => plantTheme(items[Number(btn.dataset.plantI)]));
    });
  }
  platforms.forEach((_, i) => {
    $(`#col${i}`).addEventListener("change", () => fill(`#col${i}`, `#list${i}`));
  });
  await Promise.all(platforms.map((_, i) => fill(`#col${i}`, `#list${i}`)));
}

async function renderPlatform(pane) {
  return renderRankBoard(pane, STAGE_PLATFORMS, false);
}

async function renderTalk(pane) {
  return renderRankBoard(pane, TALK_PLATFORMS, true);
}

async function renderNodes(pane) {
  pane.innerHTML = skelHtml("cards", 4);
  const data = await api("/api/nodes");
  const items = data.items || [];
  if (!items.length) {
    pane.innerHTML = `<div class="empty"><h2>近两个月没有大节点</h2><p>${esc(data.error || "先做常青。")}</p></div>`;
    return;
  }
  pane.innerHTML = `<p class="muted" style="margin:0 0 12px">日子到了，内容会挤在这一天。不是爬来的新闻。</p><div class="cards"></div>`;
  const grid = $(".cards", pane);
  items.forEach((item) => {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `<div class="body">
      <div class="src">${esc(item.do || "节点")} · ${esc((item.publishedAt || "").slice(0, 10))}</div>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.why || (item.summary || "").slice(0, 140))}</p>
      ${actionsHtml(item)}
    </div>`;
    bindCard(el, item);
    grid.appendChild(el);
  });
}

async function renderAi(pane) {
  pane.innerHTML = skelHtml("cards", 4);
  const data = await api("/api/aihot");
  if (!data.ok) {
    pane.innerHTML = `<div class="empty"><h2>AIHOT 暂时连不上</h2><p>稍后再刷。不要编新闻。</p></div>`;
    return;
  }
  pane.innerHTML = `<div class="cards"></div>`;
  const grid = $(".cards", pane);
  data.items.forEach((item) => {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `<div class="body">
      <div class="src">${esc(item.do || "做教程")} · ${esc(item.source)} · ${esc((item.publishedAt || "").slice(0, 10))}</div>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.why || (item.summary || "").slice(0, 140))}</p>
      ${actionsHtml(item)}
    </div>`;
    bindCard(el, item);
    grid.appendChild(el);
  });
}

async function renderBundle(pane, path, emptyText) {
  pane.innerHTML = skelHtml("cards", 4);
  const data = await api(path);
  if (!data.ok) {
    pane.innerHTML = `<div class="empty"><h2>${esc(emptyText)}</h2><p>${esc(data.error || "")}</p><a class="btn" href="#/engine">去数据引擎</a></div>`;
    return;
  }
  const domainHint = (data.domains || []).length
    ? `当前领域「${esc(data.domains.join("、"))}」，撞上的排前面，没撞上的仍在。`
    : "你贴的领域源排在前面。";
  const intro =
    path === "/api/subscribe"
      ? `<p class="muted" style="margin:0 0 12px">你认的源。科技快报是冷启动填充，不是把你定义成科技创作者。${domainHint}</p>`
      : "";
  pane.innerHTML = `${intro}<div class="cards"></div>`;
  const grid = $(".cards", pane);
  data.items.forEach((item) => {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `${coverHtml(item.cover)}
      <div class="body">
        <div class="src">${esc(item.do || "")} · ${esc(item.source)}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.why || (item.summary || "").slice(0, 140))}</p>
        ${actionsHtml(item)}
      </div>`;
    bindCard(el, item);
    grid.appendChild(el);
  });
}

async function renderRss(pane) {
  pane.innerHTML = skelHtml("cards", 4);
  const data = await api("/api/rss?group=marketing");
  if (!data.ok) {
    pane.innerHTML = `<div class="empty"><h2>案例还没稿</h2><p>${esc(data.error)}</p><p>默认是营销圈成品。你领域的案例源去数据引擎贴，不要等产品开一格美妆或职场。</p><a class="btn" href="#/engine">去数据引擎</a></div>`;
    return;
  }
  const domainHint = (data.domains || []).length
    ? `当前领域「${esc(data.domains.join("、"))}」，贴近的排前面。`
    : "默认是营销圈；你领域的成品源去数据引擎贴。";
  pane.innerHTML = `<p class="muted" style="margin:0 0 12px">别人刚做成的。招聘不进这一格。${domainHint}</p><div class="cards"></div>`;
  const grid = $(".cards", pane);
  data.items.forEach((item) => {
    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML = `${coverHtml(item.cover)}
      <div class="body">
        <div class="src">${esc(item.do || item.source)} · ${esc(item.source)}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.why || (item.summary || "").slice(0, 140))}</p>
        ${actionsHtml(item)}
      </div>`;
    bindCard(el, item);
    grid.appendChild(el);
  });
}

async function renderEngine() {
  setNav("engine");
  const state = await api("/api/state");
  const s = state.settings;
  main.innerHTML = `
    <p class="kicker">数据引擎</p>
    <h1 class="mast" style="font-size:28px">所有源的开关都在这</h1>
    <p class="sub">接上了，原料货架才有今天的数。测不通就说实话，不填假榜。</p>
    <form class="engine" id="engineForm">
      <section class="block">
        <h2>60s 热榜</h2>
        <div class="field">
          <label for="sixty">本机地址</label>
          <input id="sixty" name="sixtyBase" value="${esc(s.sixtyBase)}" />
        </div>
        <button class="btn ghost" type="button" id="ping">测连通</button>
        <p class="ping" id="pingOut"></p>
      </section>
      <section class="block">
        <h2>AIHOT</h2>
        <p>开箱即用，不用填 key。连不上时 AI 快报会自己说。</p>
      </section>
      <section class="block">
        <h2>RSS 订阅</h2>
        <div class="field">
          <label for="rss">每行一个：名字 | 地址。你领域的源贴这里；营销圈成品进「案例」，其余进「订阅」。已预置：少数派 / 36氪 / IT之家 / V2EX / Product Hunt。</label>
          <textarea id="rss" rows="5">${esc(
            (s.rssFeeds || []).map((f) => `${f.name} | ${f.url}`).join("\n"),
          )}</textarea>
        </div>
      </section>
      <section class="block">
        <h2>对标主页</h2>
        <div class="field">
          <label for="creators">每行一个链接。贴你认的人，不是产品给你的行业榜。没有官方接口，第一版只收链接。</label>
          <textarea id="creators" rows="4">${esc((s.creators || []).map((c) => c.url).join("\n"))}</textarea>
        </div>
      </section>
      <section class="block">
        <h2>RedFox Key</h2>
        <div class="field">
          <label for="redfox">低粉高赞用。没有就留空。</label>
          <div class="pw-wrap">
            <input id="redfox" type="password" value="${esc(s.redfoxKey)}" autocomplete="off" />
            <button class="pw-toggle" type="button" id="redfoxEye">查看</button>
          </div>
        </div>
      </section>
      <button class="btn" type="submit">保存</button>
    </form>
  `;
  $("#ping").addEventListener("click", async () => {
    const out = $("#pingOut");
    out.textContent = "在测…";
    await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({ sixtyBase: $("#sixty").value.trim() }),
    });
    const r = await api("/api/ping-60s");
    out.className = `ping ${r.ok ? "ok" : "bad"}`;
    out.textContent = r.ok ? r.hint : r.hint;
  });
  $("#engineForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const rssFeeds = $("#rss")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const [name, url] = line.split("|").map((x) => x.trim());
        const href = url || name;
        const old = (s.rssFeeds || []).find((f) => f.url === href);
        return {
          id: old?.id || `rss-${i}`,
          name: name || `源${i + 1}`,
          url: href,
          enabled: true,
          group: old?.group || "user",
        };
      });
    const creators = $("#creators")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((url, i) => ({ id: `c-${i}`, name: url, url }));
    await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        sixtyBase: $("#sixty").value.trim(),
        rssFeeds,
        creators,
        redfoxKey: $("#redfox").value,
      }),
    });
    toast("已保存");
  });
  bindPasswordEye($("#redfox"), $("#redfoxEye"));
}

const FORMATS = [
  ["short_video", "短视频"],
  ["xhs", "小红书图文"],
  ["wechat", "公众号"],
  ["short_drama", "短剧"],
  ["bilibili", "B站"],
  ["ad", "广告"],
  ["live", "直播场次"],
];
const FORMAT_NAME = Object.fromEntries(FORMATS);
const RISK_NAME = { low: "低", mid: "中", high: "高" };
const STAGE_NAME = {
  judge: "待判断",
  need_evidence: "待补证",
  adopted: "已采纳",
  making: "制作中",
  review: "待复盘",
  skipped: "不跟",
};

function situationFilled(s) {
  return Boolean(s?.niche || s?.persona || s?.audience);
}

function ideaCard(idea, i, selected) {
  return `<button type="button" class="idea ${selected ? "on" : ""}" data-idea="${i}">
    <div class="idea-top"><strong>${esc(idea.title)}</strong><span class="risk risk-${esc(idea.risk || "mid")}">风险${RISK_NAME[idea.risk] || "中"}</span></div>
    <p>${esc([idea.type, idea.angle].filter(Boolean).join(" · "))}</p>
    <p class="muted">${esc(idea.shareLine || idea.logic || idea.whyUs || "")}</p>
    <small>${esc([idea.platform, idea.style, idea.subject].filter(Boolean).join(" · "))}</small>
  </button>`;
}

function ideaDetail(idea) {
  if (!idea) return "";
  const titles = (idea.titles || []).map((t) => `<li>${esc(t)}</li>`).join("");
  const hooks = (idea.hooks || []).map((t) => `<li>${esc(t)}</li>`).join("");
  const row = (k, v) => (v ? `<p class="draft-k">${k}</p><p>${esc(v)}</p>` : "");
  return `<div class="idea-detail">
    ${row("切入逻辑", idea.logic)}
    ${row("主语 / 视角", idea.subject)}
    ${row("核心人物 / 受众", idea.audience)}
    ${row("打中情绪", idea.emotion)}
    ${row("预设转发语", idea.shareLine)}
    ${row("平台与风格", [idea.platform, idea.style].filter(Boolean).join(" · "))}
    ${titles ? `<p class="draft-k">可直接发的标题</p><ol class="title-list">${titles}</ol>` : ""}
    ${hooks ? `<p class="draft-k">可直接念的开头</p><ol class="title-list">${hooks}</ol>` : ""}
    ${row("可拍画面 / 象征细节", idea.shot)}
    ${row("和我们的关系", idea.whyUs)}
    ${row("赌注", idea.bet)}${idea.riskReason ? row("风险", idea.riskReason) : ""}
  </div>`;
}

function scanHtml(scan, goldLine) {
  if (!scan || !(scan.mode || (scan.spikes || []).length || scan.node || scan.symbol || goldLine)) return "";
  const spikes = (scan.spikes || []).map((x) => `<li>${esc(x)}</li>`).join("");
  return `<section class="block">
    <h2>深度扫描 · 硬刺</h2>
    ${scan.mode ? `<p class="muted">模式：${esc(scan.mode)}</p>` : ""}
    ${spikes ? `<p class="draft-k">硬刺</p><ul class="limits">${spikes}</ul>` : ""}
    ${scan.node ? `<p class="draft-k">节点</p><p>${esc(scan.node)}</p>` : ""}
    ${scan.symbol ? `<p class="draft-k">象征细节</p><p>${esc(scan.symbol)}</p>` : ""}
    ${scan.weak ? `<p class="muted">${esc(scan.weakNote || "素材偏弱，下面是可救方向。")}</p>` : ""}
    ${!scan.weak && scan.weakNote ? `<p class="muted">${esc(scan.weakNote)}</p>` : ""}
    ${goldLine ? `<p class="draft-k">金句</p><p class="gold">${esc(goldLine)}</p>` : ""}
  </section>`;
}

function draftHtml(pack) {
  if (!pack) return "";
  const titles = (pack.write?.titles || []).map((t) => `<li>${esc(t)}</li>`).join("");
  const tags = (pack.write?.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  return `<div class="draft-grid">
    <section class="block">
      <h2>如何拍（可直接照搬）</h2>
      <p class="draft-k">开头 / 钩子</p><p>${esc(pack.shoot?.hook || "")}</p>
      <p class="draft-k">结构</p><p>${esc(pack.shoot?.structure || "")}</p>
      <p class="draft-k">结尾</p><p>${esc(pack.shoot?.ending || "")}</p>
      ${pack.shoot?.shots ? `<p class="draft-k">画面</p><p>${esc(pack.shoot.shots)}</p>` : ""}
    </section>
    <section class="block">
      <h2>如何写（可直接照搬）</h2>
      ${titles ? `<p class="draft-k">可直接发的标题</p><ol class="title-list">${titles}</ol>` : ""}
      <p class="draft-k">开头</p><p>${esc(pack.write?.opening || "")}</p>
      <p class="draft-k">正文 / 口播</p><pre class="draft-body">${esc(pack.write?.body || "")}</pre>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </section>
  </div>`;
}

async function renderTopic(id) {
  setNav("tasks");
  main.innerHTML = `<p class="kicker">选题卡</p>${skelHtml("cards", 2)}`;
  const data = await api(`/api/topics/${encodeURIComponent(id)}`);
  if (!data.ok || !data.task) {
    main.innerHTML = `<div class="empty"><h2>找不到这条选题</h2><p>${esc(data.error || "")}</p><a class="btn" href="#/tasks">回看板</a></div>`;
    return;
  }
  const t = data.task;
  const s = data.settings || {};
  const selected = typeof t.selectedIndex === "number" ? t.topicIdeas?.[t.selectedIndex] : t.topicIdeas?.[0];
  const format = t.format || (s.formats || [])[0] || "short_video";
  const pack = t.drafts?.[format];
  const sitLine = situationFilled(s)
    ? `这次备注：${[s.niche, s.persona, s.audience].filter(Boolean).join(" · ")}`
    : "没写背景备注。判断只看这份活本身，不是账号档案。";

  main.innerHTML = `
    <p class="kicker"><a href="#/tasks">进行中的活</a> · ${esc(STAGE_NAME[t.stage] || t.stage)}</p>
    <h1 class="mast" style="font-size:28px">${esc(t.title)}</h1>
    <p class="sub">${esc(t.by || "未署名")} · 来自「${esc(t.signal?.title || t.fromTitle || "")}」</p>
    <div class="banner ${situationFilled(s) ? "" : ""}">${esc(sitLine)}</div>
    ${t.error ? `<div class="banner warn">${esc(friendlyError(t.error))}</div>` : ""}

    <section class="block">
      <h2>这份活从哪来</h2>
      <p>${esc(t.signal?.title || t.fromTitle || "")}</p>
      <p class="muted">${esc(t.signal?.source || "")} ${t.signal?.summary ? " · " + esc(t.signal.summary) : ""}</p>
      <div class="actions">
        ${t.signal?.url ? `<a class="btn ghost" href="${esc(t.signal.url)}" target="_blank" rel="noopener">打开原文</a>` : ""}
      </div>
    </section>

    <section class="block">
      <h2>做不做</h2>
      <p>${esc(t.followReason || (!t.error && t.noSignalReason) || "看完可切的方向，再决定。")}</p>
      ${t.noSignal && !t.error ? `<p class="muted">${esc(t.noSignalReason || "这份活先别押。")}</p>` : ""}
      <div class="actions" id="verdict">
        <button class="btn ${t.verdict === "follow" ? "" : "ghost"}" data-v="follow">跟</button>
        <button class="btn ghost" data-v="need_evidence">待补证</button>
        <button class="btn ghost" data-v="skip">不跟</button>
      </div>
      ${(t.evidence?.limitations || []).length ? `<ul class="limits">${t.evidence.limitations.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    </section>

    ${scanHtml(t.scan, t.goldLine)}

    <section class="block">
      <h2>可切的方向</h2>
      <p class="muted">先选一份活，再出方向；三个方向必须不同。点选一条，才出切口、标题、Hook 和可拍细节。</p>
      ${
        t.topicIdeas?.length
          ? `<div class="ideas">${t.topicIdeas.map((idea, i) => ideaCard(idea, i, i === (t.selectedIndex ?? 0))).join("")}</div>${ideaDetail(selected)}`
          : `<p class="muted">没有可切的方向。${t.noSignal ? "证据不够，或素材按方法救不起来。" : "生成失败的话，补密钥后再从灵感里选一次。"}</p>`
      }
    </section>

    <section class="block">
      <h2>如何拍 / 如何写</h2>
      <p class="muted">先选定上面一条方向，再出稿。按这份活的格式出，不按身份。短视频、小红书、公众号、直播场次都挂在这里。直播场次走场次方法：循环、原话、不编稀缺。</p>
      <div class="tabs" id="fmtTabs">
        ${FORMATS.map(([id, name]) => `<button type="button" class="${format === id ? "on" : ""}" data-fmt="${id}">${name}</button>`).join("")}
      </div>
      <div class="actions">
        <button class="btn" id="makeDraft" ${t.topicIdeas?.length ? "" : "disabled"}>出拍法和稿</button>
      </div>
      <div id="draftBox">${draftHtml(pack)}</div>
    </section>
  `;

  $("#verdict")?.querySelectorAll("[data-v]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api("/api/tasks", { method: "POST", body: JSON.stringify({ id: t.id, verdict: btn.dataset.v }) });
      renderTopic(id);
    });
  });
  main.querySelectorAll("[data-idea]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ id: t.id, selectedIndex: Number(btn.dataset.idea) }),
      });
      renderTopic(id);
    });
  });
  $("#fmtTabs")?.querySelectorAll("[data-fmt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api("/api/tasks", { method: "POST", body: JSON.stringify({ id: t.id, format: btn.dataset.fmt }) });
      renderTopic(id);
    });
  });
  $("#makeDraft")?.addEventListener("click", async () => {
    toast("正在出拍法和稿…");
    $("#makeDraft").disabled = true;
    const r = await api(`/api/topics/${encodeURIComponent(t.id)}/draft`, {
      method: "POST",
      body: JSON.stringify({ format }),
    });
    if (!r.ok) toast(r.error || "没出成");
    else toast("拍法和稿好了");
    renderTopic(id);
  });
}

async function renderTasks() {
  setNav("tasks");
  const state = await api("/api/state");
  const lanes = [
    ["judge", "待判断"],
    ["need_evidence", "待补证"],
    ["adopted", "已采纳"],
    ["making", "制作中"],
    ["review", "待复盘"],
  ];
  main.innerHTML = `
    <p class="kicker">进行中的活</p>
    <h1 class="mast" style="font-size:28px">桌上这些活</h1>
    <p class="sub">从选题池选出来、已经立起来的。卡片上标着切了哪条、有没有拍法和稿。</p>
    <div class="board" id="board"></div>
  `;
  const board = $("#board");
  lanes.forEach(([id, name]) => {
    const items = (state.tasks || []).filter((t) => t.stage === id);
    const lane = document.createElement("section");
    lane.className = "lane";
    lane.innerHTML = `<h3>${name} ${items.length ? items.length : ""}</h3>${
      items.length
        ? items
            .map((t) => {
              const idea = typeof t.selectedIndex === "number" ? t.topicIdeas?.[t.selectedIndex] : t.topicIdeas?.[0];
              const hasDraft = t.drafts && Object.keys(t.drafts).length;
              return `<a class="chip" draggable="true" data-id="${esc(t.id)}" href="#/tasks/${encodeURIComponent(t.id)}">
                ${esc(t.title)}
                <small>${esc(t.by || "未署名")} · ${esc(FORMAT_NAME[t.format] || "")}${hasDraft ? " · 已有拍法" : ""}${idea?.angle ? " · " + esc(idea.angle) : ""}
                ${t.fromTitle ? `<br>来自 ${esc(t.fromTitle)}` : ""}</small>
              </a>`;
            })
            .join("")
        : `<p style="color:var(--ink-3);font-size:12px">还没有。回今天选一张，或写一句话开工。</p>`
    }`;
    lane.addEventListener("dragover", (e) => e.preventDefault());
    lane.addEventListener("drop", async (e) => {
      e.preventDefault();
      const tid = e.dataTransfer.getData("text/plain");
      if (!tid) return;
      await api("/api/tasks", { method: "POST", body: JSON.stringify({ id: tid, stage: id }) });
      renderTasks();
    });
    lane.querySelectorAll("[draggable]").forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", el.dataset.id);
      });
    });
    board.appendChild(lane);
  });
}

async function renderReview() {
  setNav("review");
  const state = await api("/api/state");
  const n = (state.pins || []).length;
  const m = (state.tasks || []).length;
  const k = (state.tasks || []).filter((t) => t.stage === "judge" || t.stage === "need_evidence").length;
  main.innerHTML = `
    <p class="kicker">月度复盘</p>
    <h1 class="mast" style="font-size:28px">你这个月钉了什么</h1>
    ${
      n || m
        ? `<div class="must">
            <article class="pad-card"><div class="line">钉子</div><h3 class="num">${n}</h3><p>本机记下的借鉴</p></article>
            <article class="pad-card"><div class="line">活</div><h3 class="num">${m}</h3><p>已经立起来的活</p></article>
            <article class="pad-card"><div class="line">还停在待判断</div><h3 class="num">${k}</h3><p>还没拍板</p></article>
          </div>`
        : `<div class="empty"><h2>先选一份活</h2><p>月底这儿才有得看。</p><a class="btn" href="#/hot">回今天</a></div>`
    }
  `;
}

async function renderSettings() {
  setNav("settings");
  const state = await api("/api/state");
  const s = state.settings;
  main.innerHTML = `
    <p class="kicker">设置</p>
    <h1 class="mast" style="font-size:28px">可选备注，不是进门问卷</h1>
    <div class="account-card">
      <span class="user-avatar" style="${avatarStyle(currentUser)}">${esc(userInitial(currentUser))}</span>
      <div>
        <p><b>${esc(userLabel(currentUser))}</b></p>
        <p class="muted">${esc(currentUser?.email || "")}${currentUser?.role === "admin" ? " · 超级管理员，别人看不见你的工作台" : " · 只看见你自己的活"}</p>
      </div>
    </div>
    <form class="engine" id="setForm">
      <section class="block">
        <h2>这次可能用得上的背景</h2>
        <p class="muted" style="margin-bottom:12px">不填也能开工。这不是账号档案，不管你有几个号。判断默认只看这一份活。</p>
        <div class="field"><label for="company">公司 / 组名（可选）</label><input id="company" value="${esc(s.companyName || "")}" /></div>
        <div class="field"><label for="who">我的名字（钉子会记上，可选）</label><input id="who" value="${esc(s.operatorName || "")}" placeholder="例如 小周" /></div>
        <div class="field"><label for="niche">你认的领域，最多 1 到 3 个（可选）</label><input id="niche" value="${esc(s.niche || "")}" placeholder="例如 地产, 品牌。逗号分开。不填也能开工，填了选题池往这边偏，不硬清空" /></div>
        <div class="field"><label for="persona">这一次怎么说话（可选）</label><input id="persona" value="${esc(s.persona || "")}" placeholder="不是人设档案，只是这次的语气" /></div>
        <div class="field"><label for="audience">这一次拍给谁（可选）</label><input id="audience" value="${esc(s.audience || "")}" placeholder="谁会看" /></div>
        <div class="field">
          <label>这一次可能用的格式</label>
          <div class="checks" id="fmtChecks">
            ${FORMATS.map(
              ([id, name]) =>
                `<label class="check"><input type="checkbox" value="${id}" ${(s.formats || ["short_video", "xhs", "wechat"]).includes(id) ? "checked" : ""}/> ${name}</label>`,
            ).join("")}
          </div>
        </div>
      </section>
      <section class="block">
        <h2>大模型</h2>
        <p class="muted" style="margin-bottom:12px">选题、如何拍、如何写都走这里。默认 Agnes。Key 只存在本机，别发进对话框。</p>
        <div class="field"><label for="llmBase">Base URL</label><input id="llmBase" value="${esc(s.llmBaseUrl || "https://apihub.agnes-ai.com/v1")}" /></div>
        <div class="field"><label for="llmKey">API Key</label>
          <div class="pw-wrap">
            <input id="llmKey" type="password" value="${esc(s.agnesKey || "")}" autocomplete="off" placeholder="${s.hasAgnesKey ? "已保存，留空不改" : "在这里贴"}" />
            <button class="pw-toggle" type="button" id="llmEye">查看</button>
          </div>
        </div>
        <div class="field">
          <label for="llmModel">对话模型</label>
          <div class="field-row">
            <select id="llmModel">${modelOptions(s.llmModels, s.llmModel)}</select>
            <button class="btn ghost" type="button" id="syncModels">同步模型</button>
          </div>
        </div>
        <div class="actions">
          <button class="btn ghost" type="button" id="pingLlm">测连通</button>
        </div>
        <p class="ping" id="llmPing">${s.hasAgnesKey ? "密钥已保存。同步模型后可切换，再测连通。" : "先填 Key，再同步模型和测连通。"}</p>
      </section>
      <section class="block">
        <h2>刷新和阈值</h2>
        <div class="field"><label for="n">选题池场数（3～5，不含临近节点）</label><input id="n" type="number" min="3" max="5" value="${s.mustReadCount >= 3 && s.mustReadCount <= 5 ? s.mustReadCount : 5}" /></div>
        <div class="field"><label for="r">刷新间隔（分钟）</label><input id="r" type="number" min="5" max="180" value="${s.refreshMinutes}" /></div>
        <div class="field"><label for="f">低粉阈值 · 粉丝低于</label><input id="f" type="number" value="${s.lowFanFollowers}" /></div>
        <div class="field"><label for="l">低粉阈值 · 单篇赞高于</label><input id="l" type="number" value="${s.lowFanLikes}" /></div>
        <button class="btn" type="submit">保存</button>
      </section>
      <section class="block">
        <h2>退出</h2>
        <p class="muted">退出后，别人用这台电脑也进不了你的工作台。</p>
        <button class="btn ghost" type="button" id="logoutBtn">退出登录</button>
      </section>
    </form>
  `;
  bindChineseValidity($("#setForm"));
  $("#setForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const formats = [...document.querySelectorAll("#fmtChecks input:checked")].map((el) => el.value);
    const payload = {
      companyName: $("#company").value.trim(),
      operatorName: $("#who").value.trim(),
      niche: $("#niche").value.trim(),
      persona: $("#persona").value.trim(),
      audience: $("#audience").value.trim(),
      formats: formats.length ? formats : ["short_video", "xhs", "wechat"],
      mustReadCount: Number($("#n").value),
      refreshMinutes: Number($("#r").value),
      lowFanFollowers: Number($("#f").value),
      lowFanLikes: Number($("#l").value),
    };
    Object.assign(payload, llmForm());
    await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
    if (currentUser) currentUser.name = payload.operatorName;
    paintUser();
    toast("已保存");
  });
  $("#syncModels")?.addEventListener("click", syncModels);
  $("#pingLlm")?.addEventListener("click", pingLlm);
  bindPasswordEye($("#llmKey"), $("#llmEye"));
  $("#logoutBtn")?.addEventListener("click", logoutNow);
}

const KIND_LABEL = { chat: "对话", image: "图像", video: "视频" };

function modelOptions(models, current) {
  const list = Array.isArray(models) && models.length ? models : [
    { id: "agnes-2.5-flash", kind: "chat" },
    { id: "agnes-2.0-flash", kind: "chat" },
    { id: "agnes-1.5-flash", kind: "chat" },
  ];
  const groups = { chat: [], image: [], video: [] };
  list.forEach((m) => {
    const kind = m.kind || "chat";
    (groups[kind] || groups.chat).push(m.id);
  });
  if (current && !list.some((m) => m.id === current)) groups.chat.unshift(current);
  return Object.entries(groups)
    .filter(([, ids]) => ids.length)
    .map(
      ([kind, ids]) =>
        `<optgroup label="${KIND_LABEL[kind] || kind}">${ids
          .map((id) => `<option value="${esc(id)}" ${id === current ? "selected" : ""}>${esc(id)}</option>`)
          .join("")}</optgroup>`,
    )
    .join("");
}

function llmForm() {
  const payload = {
    llmBaseUrl: $("#llmBase")?.value.trim() || "https://apihub.agnes-ai.com/v1",
    llmModel: $("#llmModel")?.value || "agnes-2.5-flash",
  };
  const key = $("#llmKey")?.value.trim();
  if (key && key !== "••••") payload.agnesKey = key;
  return payload;
}

async function syncModels() {
  const out = $("#llmPing");
  out.className = "ping";
  out.textContent = "正在同步模型…";
  await api("/api/settings", { method: "POST", body: JSON.stringify(llmForm()) });
  const r = await api("/api/llm/models", { method: "POST", body: JSON.stringify({ baseUrl: llmForm().llmBaseUrl }) });
  const sel = $("#llmModel");
  if (sel && r.models) sel.innerHTML = modelOptions(r.models, r.model || sel.value);
  out.className = `ping ${r.ok ? "ok" : "bad"}`;
  out.textContent = r.hint || r.error || (r.ok ? "已同步" : "同步失败");
  toast(r.ok ? "模型列表已更新" : r.error || "同步失败");
}

async function pingLlm() {
  const out = $("#llmPing");
  out.className = "ping";
  out.textContent = "正在测连通…";
  const form = llmForm();
  await api("/api/settings", { method: "POST", body: JSON.stringify(form) });
  const r = await api("/api/llm/ping", {
    method: "POST",
    body: JSON.stringify({ baseUrl: form.llmBaseUrl, model: form.llmModel }),
  });
  out.className = `ping ${r.ok ? "ok" : "bad"}`;
  out.textContent = r.hint || (r.ok ? "通了" : "不通");
  toast(r.hint || (r.ok ? "通了" : "不通"));
}

async function renderThemes() {
  setNav("themes");
  const state = await api("/api/state");
  const themes = state.themes || [];
  main.innerHTML = `
    <p class="kicker">长期主题</p>
    <h1 class="mast" style="font-size:28px">种下的题，下次还长</h1>
    <p class="sub">高价值的话题种在这儿，先放着不拍。拆成子主题是下一步；现在可以直接从一棵树上开工。</p>
    <form class="start" id="plantForm">
      <label class="sr" for="plantLine">种一个主题</label>
      <input id="plantLine" maxlength="80" placeholder="一句话种一个主题，比如：把一次做砸的事写成对照" autocomplete="off" />
      <button class="btn" type="submit">种下</button>
    </form>
    ${
      themes.length
        ? `<div class="cards">${themes
            .map(
              (t) => `<a class="card" href="#/themes/${encodeURIComponent(t.id)}">
                <div class="body">
                  <div class="src">${esc(t.status === "paused" ? "已停用" : "在长")} · ${esc(t.origin || "")}</div>
                  <h3>${esc(t.title)}</h3>
                  <p>${esc(t.summary || t.fromTitle || "")}</p>
                </div>
              </a>`,
            )
            .join("")}</div>`
        : `<div class="empty"><h2>还没有长期主题</h2><p>从今天的选题池点「种成长期主题」，或在上面写一句。没种的时候，选题池不过滤。</p><a class="btn" href="#/hot">回今天</a></div>`
    }
  `;
  bindChineseValidity($("#plantForm"));
  $("#plantForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#plantLine")?.value.trim();
    if (!title) return toast("先写一句要种什么");
    await plantTheme({ title, origin: "自己说的", summary: "" });
    renderThemes();
  });
}

async function renderTheme(id) {
  setNav("themes");
  const state = await api("/api/state");
  const t = (state.themes || []).find((x) => x.id === id);
  if (!t) {
    main.innerHTML = `<div class="empty"><h2>找不到这棵主题</h2><a class="btn" href="#/themes">回长期主题</a></div>`;
    return;
  }
  main.innerHTML = `
    <p class="kicker"><a href="#/themes">长期主题</a> · ${esc(t.status === "paused" ? "已停用" : "在长")}</p>
    <h1 class="mast" style="font-size:28px">${esc(t.title)}</h1>
    <p class="sub">${esc(t.by || "未署名")} · 种于 ${(t.plantedAt || "").slice(0, 10)} · 来自「${esc(t.fromTitle || t.title)}」</p>
    <div class="banner">拆成 10 个子主题、20 个角度是下一步；现在就能从这开工，先变一份活。</div>
    ${t.summary ? `<section class="block"><h2>种下时的理由</h2><p>${esc(t.summary)}</p></section>` : ""}
    <div class="actions">
      <button class="btn" id="fromTheme">从这开工</button>
      ${t.fromUrl ? `<a class="btn ghost" href="${esc(t.fromUrl)}" target="_blank" rel="noopener">打开原文</a>` : ""}
      <button class="btn ghost" id="pauseTheme">${t.status === "paused" ? "重新激活" : "先停用"}</button>
    </div>
  `;
  $("#fromTheme")?.addEventListener("click", () =>
    toTopic({ title: t.title, url: t.fromUrl || "", source: "长期主题", summary: t.summary || "", cover: "" }),
  );
  $("#pauseTheme")?.addEventListener("click", async () => {
    await api("/api/themes", {
      method: "POST",
      body: JSON.stringify({ id: t.id, status: t.status === "paused" ? "active" : "paused" }),
    });
    renderTheme(id);
  });
}

function bindPasswordEye(input, button) {
  if (!input || !button) return;
  const sync = () => {
    const on = input.type === "text";
    button.textContent = on ? "关闭" : "查看";
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.setAttribute("aria-label", on ? "关闭密码显示" : "查看密码");
  };
  sync();
  button.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    sync();
  });
}

async function loadCaptcha() {
  const data = await api("/api/auth/captcha");
  captcha = { id: data.id || "", svg: data.svg || "", startedAt: data.startedAt || Date.now() };
  const box = $("#captchaBox");
  if (box) box.innerHTML = captcha.svg || "";
  const input = $("#captchaAnswer");
  if (input) input.value = "";
}

async function renderGate() {
  document.body.classList.add("gated");
  const app = document.querySelector(".app");
  if (app) app.hidden = true;
  let root = $("#gateRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "gateRoot";
    document.body.appendChild(root);
  }
  const isReg = gateMode === "register";
  root.innerHTML = `<div class="gate">
    <div class="gate-stage">
      <img src="/desk.jpg" width="1600" height="900" alt="" />
      <h1>先选项，再拍写</h1>
      <p>每人一份工作台，活、主题、密钥只有你看见。别人管账号，你只管这一份活；热榜是公共货架，选题池选的是场，跟着你认的领域偏。</p>
    </div>
    <form class="gate-card" id="gateForm">
      <h1>${isReg ? "建一个自己的工作台" : "进来干活"}</h1>
      <p class="sub">${isReg ? "邮箱只用来登录，不会发信。密码输两次，避免打错。" : "登录后只看见你自己的选题和活。"}</p>
      <div class="tabs" style="margin:0 0 16px">
        <button type="button" class="${isReg ? "" : "on"}" id="toLogin">登录</button>
        <button type="button" class="${isReg ? "on" : ""}" id="toReg">注册</button>
      </div>
      <div class="field"><label for="gateEmail">邮箱</label><input id="gateEmail" type="email" autocomplete="username" required /></div>
      <div class="field">
        <label for="gatePassword">密码</label>
        <div class="pw-wrap">
          <input id="gatePassword" type="password" autocomplete="${isReg ? "new-password" : "current-password"}" required minlength="8" />
          <button class="pw-toggle" type="button" id="pwEye">查看</button>
        </div>
        ${isReg ? `<p class="hint">至少 8 位</p>` : ""}
      </div>
      ${
        isReg
          ? `<div class="field">
        <label for="gatePassword2">再输一次密码</label>
        <div class="pw-wrap">
          <input id="gatePassword2" type="password" autocomplete="new-password" required minlength="8" />
          <button class="pw-toggle" type="button" id="pwEye2">查看</button>
        </div>
      </div>`
          : ""
      }
      <div class="honeypot" aria-hidden="true"><input id="gateWebsite" tabindex="-1" autocomplete="off" /></div>
      <div class="field">
        <label for="captchaAnswer">验证码</label>
        <div class="captcha-row">
          <div id="captchaBox" aria-hidden="true"></div>
          <input id="captchaAnswer" inputmode="numeric" autocomplete="off" required />
          <button class="btn ghost" type="button" id="captchaRefresh">换一张</button>
        </div>
      </div>
      <p class="gate-err" id="gateErr" role="alert"></p>
      <button class="btn" type="submit">${isReg ? "注册并进入" : "登录"}</button>
    </form>
  </div>`;
  bindPasswordEye($("#gatePassword"), $("#pwEye"));
  bindPasswordEye($("#gatePassword2"), $("#pwEye2"));
  bindChineseValidity($("#gateForm"));
  $("#toLogin")?.addEventListener("click", () => {
    gateMode = "login";
    renderGate();
  });
  $("#toReg")?.addEventListener("click", () => {
    gateMode = "register";
    renderGate();
  });
  $("#captchaRefresh")?.addEventListener("click", () => loadCaptcha());
  $("#gateForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#gateErr");
    const submit = $("#gateForm button[type=submit]");
    err.textContent = "";
    const password = $("#gatePassword").value;
    const passwordConfirm = $("#gatePassword2")?.value ?? "";
    if (isReg && password !== passwordConfirm) {
      err.textContent = "两次密码不一致";
      return;
    }
    const payload = {
      email: $("#gateEmail").value.trim(),
      password,
      passwordConfirm,
      captchaId: captcha.id,
      captchaAnswer: $("#captchaAnswer").value.trim(),
      website: $("#gateWebsite").value,
      startedAt: captcha.startedAt,
    };
    if (submit) {
      submit.disabled = true;
      submit.classList.add("busy");
      submit.textContent = isReg ? "正在建…" : "正在进…";
    }
    const data = await api(isReg ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!data.ok) {
      err.textContent = data.error || "没成功";
      if (submit) {
        submit.disabled = false;
        submit.classList.remove("busy");
        submit.textContent = isReg ? "注册并进入" : "登录";
      }
      await loadCaptcha();
      return;
    }
    currentUser = data.user;
    $("#gateRoot")?.remove();
    document.body.classList.remove("gated");
    const shell = document.querySelector(".app");
    if (shell) shell.hidden = false;
    paintUser();
    render();
  });
  await loadCaptcha();
}
const DIG_KIND = { news: "新闻简报", post: "社交帖子", meme: "表情包", image: "图片", note: "便签", derivative: "衍生品" };
const DIG_KIND_ORDER = ["news", "post", "meme", "image", "derivative", "note"];
const DIG_REL = { report: "报道", quote: "引用", repost: "转发", remix: "二创", business: "商业" };
const DIG_REL_ORDER = ["report", "quote", "repost", "remix", "business"];
const DIG_LANE = { news: "news", post: "post", meme: "visual", image: "visual", derivative: "derivative", note: "note" };
const LANE_LABEL = { news: "新闻简报", post: "社交帖子", visual: "表情包 / 图片", derivative: "衍生品", note: "便签" };
const LANE_ORDER = ["news", "post", "visual", "derivative", "note"];
// 卡片几何，与 app/dig.ts · LANE 一致，改一处要改两边。
const CARD_METRICS = {
  news: { w: 268, h: 250 },
  post: { w: 236, h: 220 },
  meme: { w: 200, h: 258 },
  image: { w: 200, h: 258 },
  derivative: { w: 200, h: 226 },
  note: { w: 180, h: 190 },
};
// 这一格空着时说什么，跟 app/dig.ts · kindGaps 同一套措辞。
const LANE_GAP = {
  news: "这一轮新闻不够",
  post: "公开社交原帖这一轮没搜到",
  visual: "表情包/热梗这一轮没搜到",
  derivative: "衍生品这一轮没搜到",
};
const LANE_DOT = {
  news: "var(--color-rel-report)",
  post: "var(--color-rel-quote)",
  visual: "var(--color-rel-repost)",
  derivative: "var(--color-rel-business)",
  note: "var(--color-warn)",
};

const metrics = (kind) => CARD_METRICS[kind] || CARD_METRICS.news;
const evTime = (c) => Date.parse(c.publishedAt) || Date.parse(c.firstSeenAt) || 0;
const evDate = (c) => (c.publishedAt ? String(c.publishedAt).slice(0, 10) : "");

/** 新闻转述的当事人发声——传播链里真正的发酵节点，脸上要看得出来。 */
const isRelay = (c) => c.kind === "news" && (c.stance === "当事人回应" || c.stance === "单方陈述");
/** 从标题里认出发声的人：「景甜方回应」「孙宇晨承认…长文」→ 景甜方 / 孙宇晨。认不出就空。 */
const evSpeaker = (c) => {
  const m = String(c.title || "").match(
    /([\u4e00-\u9fff·]{2,6}(?:方|工作室)?)(?:今日|凌晨|深夜|昨晚|上午|下午|刚刚|随后)?(发布长文|发文回应|回应|声明|道歉|承认|控诉|自述|喊话|发文|发帖|长文)/,
  );
  const name = m?.[1] || "";
  if (!name || /^(媒体|网友|记者|知情人士|报道|消息|传闻)$/.test(name)) return "";
  return name;
};
/** 标题或摘要里带引号的原话（4–60 字），摘不到就空，不编。 */
const evQuote = (c) => {
  const m = String(`${c.title} ${c.summary || ""}`).match(/[“「]([^”」]{4,60})[”」]/);
  return m ? m[1] : "";
};
const evKindLabel = (c) => (c.hotEntry && c.kind === "post" ? "热搜词条" : DIG_KIND[c.kind] || c.kind);

async function renderDig() {
  main.classList.add("wide");
  const q0 = route().query.get("q") || "";
  main.innerHTML = `<div class="dig-page">
    <header class="dig-chrome">
      <div class="dig-bar">
        <form id="digForm">
          <label class="sr" for="digQuery">公开事件</label>
          <input id="digQuery" name="q" maxlength="80" value="${esc(q0)}" placeholder="任意公开事件，例如 孙宇晨 景甜" autocomplete="off" />
          <button class="btn" type="submit" id="digGo">铺开</button>
          <button class="btn ghost" type="button" id="digRefresh">更新</button>
        </form>
        <div class="dig-tools">
          <button class="btn ghost" type="button" id="digFit">看全场</button>
          <button class="btn ghost" type="button" id="digOrigin">回到源头</button>
          <button class="btn ghost" type="button" id="digListBtn">清单</button>
          <button class="btn ghost" type="button" id="digNoteBtn">贴便签</button>
          <button class="btn ghost" type="button" id="digZoomOut" aria-label="缩小">−</button>
          <button class="btn ghost" type="button" id="digZoomIn" aria-label="放大">＋</button>
        </div>
      </div>
      <p class="dig-stats" id="digStats"></p>
      <div class="dig-legend" id="digLegend"></div>
    </header>
    <div class="dig-stage">
      <div class="dig-lane-rail" id="digLaneRail" aria-hidden="true"></div>
      <div class="dig-canvas" id="digCanvas">
        <div class="dig-wall" id="digWall" tabindex="0" aria-label="证据墙画布，可拖拽平移，加号减号缩放">
          <div class="dig-world" id="digWorld">
            <div id="digLanes"></div>
            <div id="digGaps"></div>
            <svg class="dig-lines" id="digLines" aria-hidden="true"></svg>
          </div>
        </div>
        <div class="dig-empty" id="digEmpty">
          <h2>这张墙怎么看</h2>
          <ol>
            <li>顶上写一个公开事件，点铺开</li>
            <li>一行之内横着是时间，左早右晚；行底刻度是这一行的真实日期</li>
            <li>竖着分五格：新闻、帖子、图、衍生品、便签</li>
            <li>绳是关系，箭头指向下游：报道、引用、转发、二创、商业</li>
            <li>社交原帖大多抓不到：新闻转述的当事人发声盖「转述」章、能摘到就引原话；热榜词条只代表「此刻在榜」，都不冒充原帖</li>
            <li>点一张卡，右边出这条链；拖动能挪位置</li>
            <li>点「贴便签」再点墙上，就把你的判断贴上去了</li>
          </ol>
          <p>搜不到的格子会空着写明，不编假卡。更新只补新卡，不推倒重来。</p>
        </div>
        <div class="dig-skel" id="digSkel" hidden>${"<i></i>".repeat(9)}</div>
        <div class="dig-hint" id="digHint" hidden></div>
        <form class="dig-note-editor" id="digNoteEditor" hidden>
          <label class="sr" for="digNoteText">便签内容</label>
          <textarea id="digNoteText" maxlength="120" placeholder="写一句你的判断"></textarea>
          <div class="row">
            <button class="btn" type="submit">贴上</button>
            <button class="btn ghost" type="button" id="digNoteCancel">取消</button>
          </div>
        </form>
        <div class="dig-list" id="digList" hidden></div>
      </div>
      <aside class="dig-dock" id="digDock" hidden aria-live="polite"></aside>
    </div>
  </div>`;

  let dig = null;
  let pan = { x: 40, y: 24 };
  let zoom = 0.72;
  let selectedId = "";
  let hoverLn = "";
  let noteMode = false;
  let saving = false;
  const kindOn = { news: true, post: true, meme: true, image: true, note: true, derivative: true };
  const relOn = { report: true, quote: true, repost: true, remix: true, business: true };

  const allCards = () => dig?.cards || [];
  const visibleCards = () => allCards().filter((c) => kindOn[c.kind] !== false);
  const cardShown = (c) => Boolean(c) && kindOn[c.kind] !== false;
  const byIdMap = () => Object.fromEntries(allCards().map((c) => [c.id, c]));
  const liveLinks = () => (dig?.links || []).filter((ln) => relOn[ln.relation] !== false);
  const originCard = () => {
    const pool = allCards().filter((c) => c.kind !== "note" && evTime(c));
    if (!pool.length) return null;
    return pool.reduce((a, b) => (evTime(a) <= evTime(b) ? a : b));
  };
  const degreeOf = (id) => liveLinks().filter((ln) => ln.fromId === id || ln.toId === id).length;
  const linkedSet = (id) => {
    const s = new Set([id]);
    liveLinks().forEach((ln) => {
      if (ln.fromId === id) s.add(ln.toId);
      if (ln.toId === id) s.add(ln.fromId);
    });
    return s;
  };
  /** 顺着绳往两头走，取出这一整条链，按时间排。 */
  const chainOf = (id) => {
    const links = liveLinks();
    const seen = new Set([id]);
    const grow = (dir) => {
      let frontier = [id];
      while (frontier.length && seen.size < 16) {
        const next = [];
        for (const cur of frontier) {
          for (const ln of links) {
            const other = dir === "up" ? (ln.toId === cur ? ln.fromId : null) : (ln.fromId === cur ? ln.toId : null);
            if (!other || seen.has(other)) continue;
            seen.add(other);
            next.push(other);
          }
        }
        frontier = next;
      }
    };
    grow("up");
    grow("down");
    const byId = byIdMap();
    return [...seen].map((x) => byId[x]).filter((c) => cardShown(c)).sort((a, b) => evTime(a) - evTime(b));
  };

  /* ── 坐标 ─────────────────────────────────────────────────── */
  const pinOf = (c) => ({ x: c.x + metrics(c.kind).w / 2, y: c.y + 15 });

  const paintTransform = () => {
    const world = $("#digWorld");
    if (world) world.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    paintLaneRail();
  };

  const setZoom = (next, anchor) => {
    const wall = $("#digWall");
    const z0 = zoom;
    zoom = Math.min(1.5, Math.max(0.3, next));
    if (wall && anchor) {
      // 以指针位置为锚缩放，别让画面跳走
      pan.x = anchor.x - ((anchor.x - pan.x) / z0) * zoom;
      pan.y = anchor.y - ((anchor.y - pan.y) / z0) * zoom;
    }
    paintTransform();
  };

  const fitAll = () => {
    const wall = $("#digWall");
    const cards = visibleCards();
    if (!wall || !cards.length) {
      pan = { x: 40, y: 24 };
      zoom = 0.72;
      paintTransform();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    cards.forEach((c) => {
      const m = metrics(c.kind);
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + m.w);
      maxY = Math.max(maxY, c.y + m.h);
    });
    const box = wall.getBoundingClientRect();
    const pad = 56;
    const sx = (box.width - pad * 2) / Math.max(maxX - minX, 240);
    const sy = (box.height - pad * 2 - 42) / Math.max(maxY - minY, 180);
    zoom = Math.min(1.05, Math.max(0.3, Math.min(sx, sy)));
    pan.x = Math.round(pad - minX * zoom);
    pan.y = Math.round(56 + pad - minY * zoom);
    paintTransform();
  };

  /** 进场：看得清的倍率，停在最早那批证据上。看全场才整墙缩略。 */
  const frameStart = () => {
    const wall = $("#digWall");
    const cards = visibleCards();
    if (!wall || !cards.length) return fitAll();
    let minX = Infinity;
    let minY = Infinity;
    cards.forEach((c) => {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
    });
    zoom = 0.72;
    pan.x = Math.round(48 - minX * zoom);
    pan.y = Math.round(56 - minY * zoom);
    paintTransform();
  };

  const focusCard = (id) => {
    const c = allCards().find((x) => x.id === id);
    const wall = $("#digWall");
    if (!c || !wall) return;
    const box = wall.getBoundingClientRect();
    const m = metrics(c.kind);
    zoom = Math.min(1.15, Math.max(zoom, 0.6));
    pan.x = Math.round(box.width / 2 - (c.x + m.w / 2) * zoom);
    pan.y = Math.round(box.height / 2 - (c.y + m.h / 2) * zoom);
    paintTransform();
  };

  /* ── 世界底层：时间带 / 泳道 / 网格 / 时间轴 ────────────────── */
  const paintWorldSize = () => {
    const world = $("#digWorld");
    if (!world) return;
    const b = dig?.bounds || { w: 2200, h: 1300 };
    world.style.width = `${b.w}px`;
    world.style.height = `${b.h}px`;
  };

  /** 卡片按道、再按行分组（同一行的 y 相同）。 */
  const rowGroups = () => {
    const lanes = new Map();
    visibleCards().forEach((c) => {
      const lane = DIG_LANE[c.kind] || "news";
      if (!lanes.has(lane)) lanes.set(lane, new Map());
      const rows = lanes.get(lane);
      if (!rows.has(c.y)) rows.set(c.y, []);
      rows.get(c.y).push(c);
    });
    const out = [];
    LANE_ORDER.forEach((lane) => {
      const rows = lanes.get(lane);
      if (!rows) return;
      const list = [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, cards]) => {
          let top = Infinity;
          let bottom = -Infinity;
          cards.forEach((c) => {
            const m = metrics(c.kind);
            top = Math.min(top, c.y);
            bottom = Math.max(bottom, c.y + m.h);
          });
          return { top, bottom, cards };
        });
      out.push({ lane, rows: list });
    });
    return out;
  };

  /** 一行底下 3–4 个真实日期刻度，落在该行真实卡片的位置上。 */
  const rowTicks = (cards) => {
    const sorted = [...cards].sort((a, b) => a.x - b.x);
    const n = Math.min(4, sorted.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = sorted[Math.round((i * (sorted.length - 1)) / Math.max(n - 1, 1))];
      if (!c) continue;
      out.push({ x: c.x + metrics(c.kind).w / 2, label: evDate(c) });
    }
    return out.filter((t, i, a) => i === 0 || (t.label !== a[i - 1].label && t.x - a[i - 1].x > 60));
  };

  const paintLanes = () => {
    const host = $("#digLanes");
    if (!host) return;
    let i = 0;
    host.innerHTML = rowGroups()
      .map((g) => {
        const top = Math.min(...g.rows.map((r) => r.top));
        const bottom = Math.max(...g.rows.map((r) => r.bottom));
        const band = `<div class="dig-lane${i % 2 ? " alt" : ""}" style="top:${Math.round(top - 22)}px;height:${Math.round(
          bottom - top + 44,
        )}px"></div>`;
        i += 1;
        const strips = g.rows
          .map(
            (r) =>
              `<div class="dig-row" style="top:${Math.round(r.bottom + 4)}px">${rowTicks(r.cards)
                .map((t) => `<span class="dig-row-tick" style="left:${Math.round(t.x)}px">${esc(t.label)}</span>`)
                .join("")}</div>`,
          )
          .join("");
        return band + strips;
      })
      .join("");
  };

  /** 搜不到的种类在墙尾留一格写明，不假装不存在。 */
  const paintGaps = () => {
    const host = $("#digGaps");
    if (!host) return;
    const present = new Set(rowGroups().map((g) => g.lane));
    let bottom = 96;
    visibleCards().forEach((c) => {
      bottom = Math.max(bottom, c.y + metrics(c.kind).h);
    });
    let y = bottom + 52;
    host.innerHTML = LANE_ORDER.filter((l) => !present.has(l) && LANE_GAP[l])
      .map((l) => {
        const box = `<div class="dig-lane" style="top:${Math.round(y - 22)}px;height:104px"></div>
          <div class="dig-gap" style="left:88px;top:${Math.round(y)}px;width:320px;height:70px"><b>${esc(
            LANE_LABEL[l],
          )}</b>${esc(LANE_GAP[l])}</div>`;
        y += 148;
        return box;
      })
      .join("");
    const world = $("#digWorld");
    if (world) {
      const base = parseInt(world.style.height, 10) || 0;
      world.style.height = `${Math.max(base, Math.round(y + 20))}px`;
    }
  };

  const paintLaneRail = () => {
    const rail = $("#digLaneRail");
    if (!rail) return;
    if (!dig?.cardCount) {
      rail.innerHTML = "";
      return;
    }
    rail.innerHTML = rowGroups()
      .map((g) => {
        const top = Math.min(...g.rows.map((r) => r.top));
        const y = Math.round(pan.y + (top - 22) * zoom + 4);
        if (y < -30 || y > 4000) return "";
        const n = g.rows.reduce((s, r) => s + r.cards.length, 0);
        return `<span style="top:${y}px"><i style="background:${LANE_DOT[g.lane]}"></i>${esc(LANE_LABEL[g.lane])}<b>${n}</b></span>`;
      })
      .join("");
  };

  /* ── 绳 ───────────────────────────────────────────────────── */
  const drawLines = () => {
    const svg = $("#digLines");
    if (!svg || !dig) return;
    const byId = byIdMap();
    const b = dig.bounds || { w: 2200, h: 1300 };
    const defs = DIG_REL_ORDER.map(
      (r) =>
        `<marker id="ar-${r}" viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path class="ar-${r}" d="M0 0.6 L8 4 L0 7.4 z"/></marker>`,
    ).join("");
    const parts = liveLinks()
      .map((ln) => {
        const a = byId[ln.fromId];
        const c = byId[ln.toId];
        if (!cardShown(a) || !cardShown(c)) return "";
        const p1 = pinOf(a);
        const p2 = pinOf(c);
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const sag = Math.min(84, Math.max(22, dist * 0.17));
        const ey = p2.y + 14;
        const d = `M${p1.x} ${p1.y} C ${p1.x} ${Math.round(p1.y + sag)} ${p2.x} ${Math.round(ey + sag)} ${p2.x} ${Math.round(ey)}`;
        const label = DIG_REL[ln.relation] || ln.relation;
        const lw = label.length * 11 + 16;
        const cx = Math.round((p1.x + p2.x) / 2);
        const cy = Math.round((p1.y + ey) / 2 + sag * 0.75);
        const touching = selectedId && (ln.fromId === selectedId || ln.toId === selectedId);
        const state = !selectedId ? "" : touching ? " is-on" : " is-dim";
        const id = esc(ln.id);
        return `<path class="str rel-${ln.relation}${state}" d="${d}" data-ln="${id}" marker-end="url(#ar-${ln.relation})" />
          <path class="hit" d="${d}" data-ln="${id}" />
          <g class="rel-chip${state}" data-ln="${id}"><rect x="${cx - lw / 2}" y="${cy - 9}" width="${lw}" height="18" rx="9" /><text x="${cx}" y="${cy + 4}" text-anchor="middle">${esc(label)}</text></g>`;
      })
      .join("");
    svg.setAttribute("viewBox", `0 0 ${b.w} ${b.h}`);
    svg.innerHTML = `<defs>${defs}</defs>${parts}`;
  };

  /* ── 证据卡 ───────────────────────────────────────────────── */
  const cardHtml = (card) => {
    const src = card.sourceName || "";
    const date = evDate(card);
    const sum = String(card.summary || "").slice(0, 108);
    const origin = originCard();
    const isOrigin = origin && origin.id === card.id;
    const open = card.url ? `<a class="btn ghost" href="${esc(card.url)}" target="_blank" rel="noopener">原文</a>` : "";
    const acts = `<div class="actions">${open}<button class="btn" type="button" data-topic>选这个</button></div>`;
    if (card.kind === "news") {
      const relay = isRelay(card);
      const quote = relay ? evQuote(card) : "";
      const speaker = relay ? evSpeaker(card) : "";
      const stanceLine = relay
        ? `<b class="ev-relay">${esc(speaker ? `${speaker}${card.stance === "当事人回应" ? "回应" : "自述"}` : card.stance)}</b>${card.isNew ? " · 新到" : ""}`
        : `${esc(card.stance || "")}${card.isNew ? " · 新到" : ""}`;
      return `<i class="pin" aria-hidden="true"></i>
        <div class="ev-k"><span>${esc(src || "来源未标")}</span><span>${esc(date)}</span></div>
        <h3>${esc(card.title)}</h3>
        ${quote ? `<p class="ev-quote">${esc(quote)}</p>` : sum ? `<p>${esc(sum)}</p>` : ""}
        <div class="ev-src">${stanceLine}</div>
        ${isOrigin ? '<span class="stamp">第一现场</span>' : relay ? '<span class="stamp relay">转述</span>' : ""}
        ${acts}`;
    }
    if (card.kind === "post") {
      const hot = Boolean(card.hotEntry);
      return `<i class="pin" aria-hidden="true"></i>
        <div class="ev-head">
          <span class="ev-ava" aria-hidden="true">${esc((src || "?").slice(0, 1))}</span>
          <span class="ev-who"><b>${esc(src || "未知平台")}</b><span class="ev-k">${
            hot ? `热搜词条${date ? " · " + esc(date) : " · 此刻"}` : `${esc(card.stance || "帖子")} · ${esc(date)}`
          }</span></span>
        </div>
        <h3>${esc(card.title)}</h3>
        ${sum ? `<p>${esc(sum)}</p>` : ""}
        ${acts}`;
    }
    if (card.kind === "meme" || card.kind === "image") {
      const shot = card.imageUrl
        ? coverHtml(card.imageUrl, "ev-shot")
        : `<div class="ev-shot-none">没抓到图</div>`;
      return `<i class="pin" aria-hidden="true"></i>
        ${shot}
        <h3>${esc(card.title)}</h3>
        <div class="ev-src">${esc(src)}${date ? " · " + esc(date) : ""}</div>
        ${acts}`;
    }
    if (card.kind === "derivative") {
      return `<i class="pin" aria-hidden="true"></i>
        <div class="ev-k">衍生品</div>
        <h3>${esc(card.title)}</h3>
        ${sum ? `<p>${esc(sum.slice(0, 72))}</p>` : ""}
        <div class="ev-src">${esc(src)}${date ? " · " + esc(date) : ""}</div>
        ${acts}`;
    }
    return `<i class="pin" aria-hidden="true"></i>
      <h3>${esc(card.title)}</h3>
      <div class="ev-src">${esc(date)} · 我贴的</div>`;
  };

  const paintCards = () => {
    const world = $("#digWorld");
    if (!world) return;
    [...world.querySelectorAll(".ev-card")].forEach((n) => n.remove());
    const active = selectedId ? linkedSet(selectedId) : null;
    visibleCards().forEach((card) => {
      const el = document.createElement("article");
      const isOn = card.id === selectedId;
      const dim = Boolean(active) && !active.has(card.id);
      const deg = degreeOf(card.id);
      el.className = `ev-card kind-${card.kind}${card.isNew ? " is-new" : ""}${card.stale ? " is-stale" : ""}${
        isRelay(card) ? " is-relay" : ""
      }${isOn ? " is-on" : ""}${dim ? " is-dim" : ""}${active && !isOn && !dim ? " is-linked" : ""}`;
      el.style.left = `${card.x}px`;
      el.style.top = `${card.y}px`;
      el.dataset.id = card.id;
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute(
        "aria-label",
        `${evKindLabel(card)}${isRelay(card) ? "（经新闻转述）" : ""}：${card.title}。${card.sourceName || ""} ${
          evDate(card) || (card.hotEntry ? "此刻在榜" : "日期未标")
        }。连着 ${deg} 条线绳`,
      );
      el.innerHTML = cardHtml(card);
      if (deg) el.insertAdjacentHTML("afterbegin", `<span class="ev-deg">${deg}</span>`);
      el.querySelector("[data-topic]")?.addEventListener("click", (e) => {
        e.stopPropagation();
        toTopic({
          title: card.title,
          url: card.url,
          source: card.sourceName,
          originLabel: "事件地图",
          summary: card.summary,
          cover: card.imageUrl,
        });
      });
      world.appendChild(el);
      bindDrag(el, card);
    });
    drawLines();
    paintDock();
  };

  const paintDock = () => {
    const box = $("#digDock");
    if (!box) return;
    if (!selectedId || !dig) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const card = allCards().find((c) => c.id === selectedId);
    if (!card) {
      box.hidden = true;
      return;
    }
    const steps = chainOf(card.id);
    const origin = originCard();
    const links = liveLinks();
    const ids = new Set(steps.map((s) => s.id));
    const relCount = {};
    links
      .filter((ln) => ids.has(ln.fromId) && ids.has(ln.toId))
      .forEach((ln) => {
        relCount[ln.relation] = (relCount[ln.relation] || 0) + 1;
      });
    const relBits = Object.keys(relCount)
      .map((k) => `${DIG_REL[k]} ${relCount[k]} 条`)
      .join("、");
    const first = steps[0];
    const last = steps[steps.length - 1];
    const summary =
      steps.length > 1
        ? `这条链 <b>${steps.length}</b> 手，${esc(evDate(first))} → ${esc(evDate(last))}${relBits ? " · " + relBits : ""}`
        : "这张卡还没连上别的卡。搜到更多结果后点更新，会把它接上。";
    const inRel = (id) => {
      const ln = links.find((l) => l.toId === id && ids.has(l.fromId));
      if (!ln) return "";
      const up = allCards().find((c) => c.id === ln.fromId);
      return `<span class="rel">${esc(DIG_REL[ln.relation] || ln.relation)} · 来自 ${esc(up?.sourceName || up?.title || "上游")}</span>`;
    };
    const open = card.url
      ? `<a class="btn ghost" href="${esc(card.url)}" target="_blank" rel="noopener">打开原文</a>`
      : "";
    box.hidden = false;
    box.innerHTML = `<div class="dock-top">
        <span class="dock-kind">${esc(evKindLabel(card))}${card.stance ? " · " + esc(card.stance) : ""}${
          isRelay(card) ? " · 经媒体转述" : ""
        }</span>
        <button class="dock-x" type="button" id="dockClose" aria-label="关掉这条链">✕</button>
      </div>
      <h2 class="dock-title">${esc(card.title)}</h2>
      <p class="dock-meta">${esc(card.sourceName || "来源未标")} · ${esc(evDate(card) || (card.hotEntry ? "此刻在榜" : "日期未标"))}${
        card.stale ? " · 这一轮没再搜到" : ""
      }</p>
      ${card.summary ? `<p class="dock-meta">${esc(card.summary)}</p>` : ""}
      <p class="dock-sum">${summary}</p>
      <div class="dock-acts">${open}<button class="btn" type="button" id="dockTopic">选这个</button></div>
      <p class="dock-h">这条链上的每一步</p>
      <ol class="dock-steps">${steps
        .map((c, i) => {
          const rel = inRel(c.id);
          const firstStep = origin && c.id === origin.id;
          return `<li class="dock-step${c.id === selectedId ? " is-on" : ""}">
            <span class="n">${i + 1}</span>
            <button type="button" data-goto="${esc(c.id)}">
              <span class="t">${esc(c.title)}</span>
              <span class="m">${esc(evDate(c) || (c.hotEntry ? "此刻" : "—"))} · ${esc(c.sourceName || evKindLabel(c))}</span>
              ${rel || (firstStep ? '<span class="rel">第一现场</span>' : '<span class="rel">这一段里最早</span>')}
            </button>
          </li>`;
        })
        .join("")}</ol>`;
    $("#dockClose")?.addEventListener("click", () => selectCard(""));
    $("#dockTopic")?.addEventListener("click", () =>
      toTopic({
        title: card.title,
        url: card.url,
        source: card.sourceName,
        originLabel: "事件地图",
        summary: card.summary,
        cover: card.imageUrl,
      }),
    );
    box.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectCard(btn.dataset.goto);
        focusCard(btn.dataset.goto);
      });
    });
  };

  /* ── 统计 / 图例 ───────────────────────────────────────────── */
  const paintStats = () => {
    const el = $("#digStats");
    if (!el) return;
    if (!dig?.cardCount) {
      el.className = "dig-stats";
      el.innerHTML = `<span class="cold">${esc(
        dig?.error || "输入一个公开事件，点铺开。墙只铺搜到的结果，搜不到的格子空着写明。",
      )}</span>`;
      return;
    }
    const shown = liveLinks().length;
    const early = dig.earliestAt ? String(dig.earliestAt).slice(0, 10) : "";
    const late = dig.newestAt ? String(dig.newestAt).slice(0, 10) : "";
    const span = early && late && early !== late ? `${early} → ${late}` : early;
    const ago = dig.fetchedAt ? timeAgo(dig.fetchedAt).replace("上次刷新", "上次搜过").replace("刚刚刷新", "刚刚搜过") : "";
    el.className = "dig-stats";
    el.innerHTML = [
      `<span><b>${dig.cardCount}</b> 张证据</span>`,
      `<span><b>${shown}</b> 条线绳</span>`,
      span ? `<span>${esc(span)}</span>` : "",
      dig.newCount ? `<span>新到 <b>${dig.newCount}</b> 张</span>` : "",
      ago ? `<span>${esc(ago)}</span>` : "",
    ]
      .filter(Boolean)
      .join("");
  };

  const paintLegend = () => {
    const el = $("#digLegend");
    if (!el) return;
    const cards = allCards();
    const kindBits = DIG_KIND_ORDER.map((k) => {
      const n = cards.filter((c) => c.kind === k).length;
      const shape = k === "meme" || k === "image" ? "lg-visual" : `lg-${k}`;
      return `<button type="button" class="dig-chip ${kindOn[k] ? "on" : "off"}" data-kind="${k}" aria-pressed="${kindOn[k]}"${
        n ? "" : " disabled"
      }><i class="lg ${shape}"></i>${esc(DIG_KIND[k])}<span class="n">${n}</span></button>`;
    }).join("");
    const relBits = DIG_REL_ORDER.map(
      (k) =>
        `<button type="button" class="dig-chip ${relOn[k] ? "on" : "off"}" data-rel="${k}" aria-pressed="${relOn[k]}"><svg class="sw-str" viewBox="0 0 22 10" aria-hidden="true"><path class="rel-${k}" d="M1 2 C 1 11, 21 11, 21 2"/></svg>${esc(
          DIG_REL[k],
        )}</button>`,
    ).join("");
    const gaps = (dig?.gaps || []).map((g) => `<span class="leg-k">没搜到：${esc(g)}</span>`).join("");
    el.innerHTML = `<span class="leg-k">种类</span>${kindBits}<i class="leg-sep" aria-hidden="true"></i><span class="leg-k">线绳</span>${relBits}${gaps}`;
    el.querySelectorAll("[data-kind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        kindOn[btn.dataset.kind] = !kindOn[btn.dataset.kind];
        if (selectedId && !kindOn[(allCards().find((c) => c.id === selectedId) || {}).kind]) selectedId = "";
        paintAll(false);
      });
    });
    el.querySelectorAll("[data-rel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        relOn[btn.dataset.rel] = !relOn[btn.dataset.rel];
        paintAll(false);
      });
    });
  };

  const paintAll = (shouldFit) => {
    paintWorldSize();
    paintStats();
    paintLegend();
    paintLanes();
    paintGaps();
    paintCards();
    const empty = $("#digEmpty");
    if (empty) empty.hidden = Boolean(dig?.cardCount);
    if (shouldFit) fitAll();
    else paintTransform();
  };

  /* ── 选中 / 拖拽 ───────────────────────────────────────────── */
  const selectCard = (id) => {
    selectedId = selectedId === id ? "" : id;
    paintCards();
  };

  /** 只把刚拖过的那张钉住（pinned），其余留着可重排，避免整墙被旧坐标锁死。 */
  const saveLayout = async (movedId) => {
    if (!dig || saving) return;
    saving = true;
    await api("/api/dig/layout", {
      method: "POST",
      body: JSON.stringify({
        id: dig.id,
        cards: allCards().map((c) => ({ id: c.id, x: c.x, y: c.y, pinned: c.id === movedId })),
      }),
    });
    saving = false;
  };

  const bindDrag = (el, card) => {
    let drag = null;
    let moved = 0;
    el.addEventListener("pointerdown", (e) => {
      if (e.target.closest("a,button")) return;
      if (noteMode) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      moved = 0;
      drag = { x: e.clientX, y: e.clientY, ox: card.x, oy: card.y };
      el.classList.add("is-dragging");
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      if (moved < 6) return;
      card.x = Math.round(drag.ox + dx / zoom);
      card.y = Math.round(drag.oy + dy / zoom);
      card.pinned = true;
      el.style.left = `${card.x}px`;
      el.style.top = `${card.y}px`;
      drawLines();
    });
    const end = () => {
      if (!drag) return;
      const wasDrag = moved >= 6;
      drag = null;
      el.classList.remove("is-dragging");
      if (!wasDrag) {
        selectCard(card.id);
        return;
      }
      paintLanes();
      saveLayout(card.id);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectCard(card.id);
        return;
      }
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const cur = pinOf(card);
        const pool = visibleCards().filter((c) => c.id !== card.id);
        if (!pool.length) return;
        const pick = (score) => pool.reduce((a, b) => (score(a) < score(b) ? a : b));
        let next = null;
        if (e.key === "ArrowRight") next = pick((c) => (pinOf(c).x > cur.x ? pinOf(c).x - cur.x + Math.abs(pinOf(c).y - cur.y) * 3 : Infinity));
        if (e.key === "ArrowLeft") next = pick((c) => (pinOf(c).x < cur.x ? cur.x - pinOf(c).x + Math.abs(pinOf(c).y - cur.y) * 3 : Infinity));
        if (e.key === "ArrowDown") next = pick((c) => (pinOf(c).y > cur.y ? pinOf(c).y - cur.y + Math.abs(pinOf(c).x - cur.x) * 3 : Infinity));
        if (e.key === "ArrowUp") next = pick((c) => (pinOf(c).y < cur.y ? cur.y - pinOf(c).y + Math.abs(pinOf(c).x - cur.x) * 3 : Infinity));
        if (next) {
          $(`.ev-card[data-id="${next.id}"]`)?.focus();
          focusCard(next.id);
        }
      }
    });
  };

  /* ── 便签 ─────────────────────────────────────────────────── */
  const setNoteMode = (on) => {
    noteMode = on;
    const btn = $("#digNoteBtn");
    const hint = $("#digHint");
    const wall = $("#digWall");
    btn?.classList.toggle("on", on);
    wall?.classList.toggle("is-noting", on);
    if (hint) {
      hint.hidden = !on;
      hint.textContent = on ? "在墙上点一下要贴的位置，写好按贴上" : "";
    }
    if (!on) closeNoteEditor();
  };
  const closeNoteEditor = () => {
    const ed = $("#digNoteEditor");
    if (ed) ed.hidden = true;
  };
  const openNoteEditor = (clientX, clientY) => {
    const canvas = $("#digCanvas");
    const ed = $("#digNoteEditor");
    if (!canvas || !ed) return;
    const box = canvas.getBoundingClientRect();
    const local = { x: clientX - box.left, y: clientY - box.top };
    ed.hidden = false;
    ed.style.left = `${Math.max(8, Math.min(box.width - 210, local.x - 100))}px`;
    ed.style.top = `${Math.max(8, Math.min(box.height - 150, local.y - 40))}px`;
    ed.dataset.wx = String(Math.round((local.x - pan.x) / zoom));
    ed.dataset.wy = String(Math.round((local.y - pan.y) / zoom));
    $("#digNoteText")?.focus();
  };

  /* ── 清单（窄屏也能读全） ──────────────────────────────────── */
  const closeList = () => {
    const box = $("#digList");
    if (box) box.hidden = true;
    $("#digListBtn")?.classList.remove("on");
  };
  const paintList = () => {
    const box = $("#digList");
    if (!box) return;
    const cards = visibleCards().slice().sort((a, b) => evTime(a) - evTime(b));
    const origin = originCard();
    const links = liveLinks();
    const byId = byIdMap();
    box.innerHTML = `<h2>${esc(dig?.query || "这场")} · 证据清单</h2>
      <p class="lead">按时间排 ${cards.length} 条。点一条回到墙上的位置。</p>
      <ol>${cards
        .map((c) => {
          const ln = links.find((l) => l.toId === c.id);
          const up = ln ? byId[ln.fromId] : null;
          const rel = up
            ? `${esc(DIG_REL[ln.relation] || ln.relation)} · 来自 ${esc(up.sourceName || up.title)}`
            : origin && c.id === origin.id
              ? "这一场最先出现的一条"
              : "还没连上别的卡";
          return `<li><button type="button" data-goto="${esc(c.id)}">
            <span class="r1"><span class="rk">${esc(evKindLabel(c))}</span><span>${esc(evDate(c) || (c.hotEntry ? "此刻" : "—"))}</span><span>${esc(
              c.sourceName || "",
            )}</span></span>
            <span class="r2">${esc(c.title)}</span>
            <span class="r3">${rel}</span>
          </button></li>`;
        })
        .join("")}</ol>
      <button class="btn ghost close" type="button" id="digListClose">回到墙上</button>`;
    box.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeList();
        if (selectedId !== btn.dataset.goto) selectCard(btn.dataset.goto);
        focusCard(btn.dataset.goto);
      });
    });
    $("#digListClose")?.addEventListener("click", closeList);
  };

  /* ── 跑一轮搜索 ────────────────────────────────────────────── */
  const run = async (query) => {
    const go = $("#digGo");
    const skel = $("#digSkel");
    if (go) {
      go.disabled = true;
      go.dataset.state = "loading";
    }
    if (skel) skel.hidden = false;
    const empty = $("#digEmpty");
    if (empty) empty.hidden = true;
    toast("正在搜公开结果…", "busy");
    const data = await api("/api/dig", { method: "POST", body: JSON.stringify({ query }) });
    if (go) {
      go.disabled = false;
      delete go.dataset.state;
    }
    if (skel) skel.hidden = true;
    if (data.dig) {
      dig = data.dig;
      selectedId = "";
      if (location.hash.indexOf("/dig") === 1) {
        history.replaceState(null, "", `#/dig?q=${encodeURIComponent(dig.query)}`);
      }
      paintAll(true);
      if (!dig.cardCount) toast(dig.error || "这一轮没搜到，换一个说法试试", "err");
      else toast(dig.newCount ? `补上 ${dig.newCount} 张` : `铺上 ${dig.cardCount} 张`, "ok");
    } else {
      paintAll(false);
      toast(data.error || "这场没铺开", "err");
    }
  };

  paintWorldSize();
  const loaded = await api(`/api/dig?q=${encodeURIComponent(q0)}`);
  if (loaded.dig) {
    dig = loaded.dig;
    const input = $("#digQuery");
    if (input) input.value = dig.query || q0;
    paintAll(Boolean(dig.cardCount));
    if (dig.cardCount) frameStart();
  } else {
    paintAll(false);
  }

  /* ── 事件绑定 ─────────────────────────────────────────────── */
  $("#digForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#digQuery");
    const q = input?.value.trim();
    if (!q) {
      input?.setAttribute("aria-invalid", "true");
      input?.focus();
      return toast("先写一个公开事件", "err");
    }
    input?.removeAttribute("aria-invalid");
    run(q);
  });
  $("#digRefresh")?.addEventListener("click", () => {
    const q = $("#digQuery")?.value.trim() || dig?.query;
    if (!q) return toast("先写一个公开事件", "err");
    run(q);
  });
  $("#digFit")?.addEventListener("click", fitAll);
  $("#digOrigin")?.addEventListener("click", () => {
    const o = originCard();
    if (!o) return toast("这场还没有能定位的源头", "err");
    if (selectedId !== o.id) selectCard(o.id);
    focusCard(o.id);
  });
  $("#digListBtn")?.addEventListener("click", () => {
    const box = $("#digList");
    if (!box) return;
    if (!box.hidden) return closeList();
    if (!dig?.cardCount) return toast("先铺开一场，清单才有内容", "err");
    paintList();
    box.hidden = false;
    $("#digListBtn")?.classList.add("on");
  });
  $("#digNoteBtn")?.addEventListener("click", () => {
    if (!dig?.cardCount) return toast("先铺开一场，再往上贴便签", "err");
    setNoteMode(!noteMode);
  });
  $("#digNoteCancel")?.addEventListener("click", () => setNoteMode(false));
  $("#digNoteEditor")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ed = e.currentTarget;
    const text = $("#digNoteText")?.value.trim();
    if (!text) return toast("便签要写一句", "err");
    const data = await api("/api/dig/note", {
      method: "POST",
      body: JSON.stringify({ id: dig?.id, title: text, x: Number(ed.dataset.wx) || 120, y: Number(ed.dataset.wy) || 900 }),
    });
    if (data.dig) {
      dig = data.dig;
      setNoteMode(false);
      paintAll(false);
      toast("贴上了", "ok");
    } else toast(data.error || "没贴上", "err");
  });
  $("#digZoomIn")?.addEventListener("click", () => setZoom(zoom * 1.14));
  $("#digZoomOut")?.addEventListener("click", () => setZoom(zoom * 0.88));

  const wall = $("#digWall");
  let panDrag = null;
  wall?.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ev-card")) return;
    if (noteMode) {
      openNoteEditor(e.clientX, e.clientY);
      return;
    }
    if (e.target.closest("a")) return;
    if (selectedId) {
      selectedId = "";
      paintCards();
    }
    wall.setPointerCapture(e.pointerId);
    wall.classList.add("is-panning");
    panDrag = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
  });
  wall?.addEventListener("pointermove", (e) => {
    if (!panDrag) return;
    pan.x = panDrag.ox + (e.clientX - panDrag.x);
    pan.y = panDrag.oy + (e.clientY - panDrag.y);
    paintTransform();
  });
  const endPan = () => {
    panDrag = null;
    wall?.classList.remove("is-panning");
  };
  wall?.addEventListener("pointerup", endPan);
  wall?.addEventListener("pointercancel", endPan);
  wall?.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (noteMode) return;
      const box = wall.getBoundingClientRect();
      setZoom(zoom * (e.deltaY > 0 ? 0.9 : 1.1), { x: e.clientX - box.left, y: e.clientY - box.top });
    },
    { passive: false },
  );
  wall?.addEventListener("keydown", (e) => {
    if (e.target !== wall) return;
    if (e.key === "+" || e.key === "=") setZoom(zoom * 1.14);
    else if (e.key === "-" || e.key === "_") setZoom(zoom * 0.88);
    else if (e.key === "0") fitAll();
    else if (e.key === "Escape") {
      if (noteMode) setNoteMode(false);
      else if (selectedId) selectCard("");
    } else if (e.key === "ArrowRight") pan.x -= 60;
    else if (e.key === "ArrowLeft") pan.x += 60;
    else if (e.key === "ArrowDown") pan.y -= 60;
    else if (e.key === "ArrowUp") pan.y += 60;
    else return;
    paintTransform();
  });

  // 悬停一条绳：绳和两端的卡一起亮
  const svg = $("#digLines");
  const clearHot = () => {
    if (!hoverLn) return;
    svg?.querySelectorAll(".is-hot").forEach((n) => n.classList.remove("is-hot"));
    document.querySelectorAll(".ev-card.is-hot").forEach((n) => n.classList.remove("is-hot"));
    hoverLn = "";
  };
  svg?.addEventListener("mouseover", (e) => {
    const id = e.target?.dataset?.ln;
    if (!id || id === hoverLn) return;
    clearHot();
    hoverLn = id;
    svg.querySelectorAll(`[data-ln="${id}"]`).forEach((n) => {
      if (!n.classList.contains("hit")) n.classList.add("is-hot");
    });
  });
  svg?.addEventListener("mouseleave", clearHot);
}

async function render() {
  if (!currentUser) {
    const me = await api("/api/auth/me");
    if (!me.user) return renderGate();
    currentUser = me.user;
    document.body.classList.remove("gated");
    const shell = document.querySelector(".app");
    if (shell) shell.hidden = false;
    $("#gateRoot")?.remove();
  }
  paintUser();
  main.classList.remove("wide");
  const r = route();
  if (r.view === "dig") return renderDig();
  if (r.view === "engine") return renderEngine();
  if (r.view === "themes" && r.tab) return renderTheme(decodeURIComponent(r.tab));
  if (r.view === "themes") return renderThemes();
  if (r.view === "tasks" && r.tab && r.tab !== "platform") return renderTopic(decodeURIComponent(r.tab));
  if (r.view === "tasks") return renderTasks();
  if (r.view === "review") return renderReview();
  if (r.view === "settings") return renderSettings();
  return renderHot(r.tab);
}

window.addEventListener("hashchange", render);
render();
