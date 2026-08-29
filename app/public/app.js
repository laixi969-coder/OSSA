const $ = (sel, root = document) => root.querySelector(sel);
const main = $("#main");
const toastEl = $("#toast");

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2800);
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) data.error = "请求失败";
  return data;
}

function esc(s) {
  return String(s || "")
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
  return `<img class="${cls}" src="${esc(coverSrc(url))}" alt="" onerror="this.remove()">`;
}

function route() {
  const hash = location.hash.replace(/^#/, "") || "/hot";
  const [path, query] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  return { view: parts[0] || "hot", tab: parts[1] || "", query: new URLSearchParams(query || "") };
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
  toast("已钉成借鉴");
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
  { id: "weibo", name: "微博" },
  { id: "zhihu", name: "知乎" },
  { id: "douyin", name: "抖音" },
  { id: "bili", name: "B站" },
  { id: "toutiao", name: "头条" },
  { id: "baidu", name: "百度" },
  { id: "quark", name: "夸克" },
  { id: "hacker-news", name: "HN" },
  { id: "rednote", name: "小红书" },
];

function actionsHtml(item) {
  const open = item.url
    ? `<a class="btn ghost" href="${esc(item.url)}" target="_blank" rel="noopener">打开原文</a>`
    : "";
  const pin = item.url ? `<button class="btn ghost" data-pin>钉借鉴</button>` : "";
  return `<div class="actions">
    <button class="btn" data-topic>选这个</button>
    <button class="btn ghost" data-plant>种成长期主题</button>
    ${open}
    ${pin}
  </div>`;
}

function bindCard(el, item) {
  el.querySelector("[data-pin]")?.addEventListener("click", () => pinItem(item));
  el.querySelector("[data-topic]")?.addEventListener("click", () => toTopic(item));
  el.querySelector("[data-plant]")?.addEventListener("click", () => plantTheme(item));
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
  toast(data.already ? "这棵已经在了，重新激活" : "已种成长期主题，不立刻拍");
}

async function renderHot(tab) {
  setNav("hot");
  main.innerHTML = `<p class="kicker">OSSA</p>
    <h1 class="mast">先选项，再拍写</h1>
    <p class="sub">系统给建议，你来选。选中的才是一份活。</p>
    <div class="hook cold">正在拉今天的选题池…</div>`;

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
      (item) => `<article>
        ${coverHtml(item.cover)}
        <div class="pad">
        <div class="line">${esc(item.line || item.originLabel || item.do || "")}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.why || (item.summary || "").slice(0, 90))}</p>
        ${actionsHtml(item)}
        </div>
      </article>`,
    )
    .join("");

  const tabs = [
    ["platform", "平台热榜"],
    ["ai", "AI 快报"],
    ["marketing", "营销情报"],
    ["tech", "科技圈"],
    ["open", "开源新品"],
    ["creators", "对标账号"],
  ]
    .map(
      ([id, name]) =>
        `<a href="#/hot/${id}" class="${tab === id ? "on" : ""}">${name}</a>`,
    )
    .join("");

  main.innerHTML = `
    <p class="kicker">${esc(home.companyName || "OSSA")} · 不管账号</p>
    <h1 class="mast">先选项，再拍写</h1>
    <p class="sub">约 10 条可选题，每条有理由。选这个才变成活；种成主题不立刻拍。</p>
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
    <div class="section-label">今日选题池${home.themeFilterOn ? " · 已按长期主题筛过热搜" : ""}</div>
    <div class="must">${must || `<div class="empty"><p>${esc(home.coldStart)}</p></div>`}</div>
    ${pins ? `<div class="section-label">最近钉过的借鉴</div><div class="pins">${pins}</div>` : ""}
    <div class="section-label">原料货架 · 点开再看，热搜不是进门画面</div>
    <div class="tabs">${tabs}</div>
    <div id="pane"></div>
  `;
  $("#refresh")?.addEventListener("click", () => {
    sessionStorage.setItem("ossa-batch", String(batch + 1));
    render();
  });
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
    pane.innerHTML = `<div class="empty"><h2>原料先收着</h2><p>先在上面选一张，或写一句话开工。热搜、快报、案例点开对应的格再看。</p></div>`;
    return;
  }
  if (tab === "platform") return renderPlatform(pane);
  if (tab === "ai") return renderAi(pane);
  if (tab === "marketing") return renderRss(pane);
  if (tab === "tech") return renderBundle(pane, "/api/tech", "科技圈暂时拉不到");
  if (tab === "open") return renderBundle(pane, "/api/open", "开源与新品暂时拉不到");
  if (tab === "creators") {
    pane.innerHTML = `<div class="empty"><h2>先贴对标账号的主页链接</h2><p>没有官方公开接口。去数据引擎贴链接。读失败会标明，不会装成没更新。</p><a class="btn" href="#/engine">去数据引擎</a></div>`;
  }
}

async function renderPlatform(pane) {
  pane.innerHTML = `<div class="hot-board">
    <section class="col">
      <header><strong>左列</strong><select id="left">${PLATFORMS.map((p) => `<option value="${p.id}" ${p.id === "weibo" ? "selected" : ""}>${p.name}</option>`).join("")}</select></header>
      <div id="leftList" class="rank"></div>
    </section>
    <section class="col">
      <header><strong>右列</strong><select id="right">${PLATFORMS.map((p) => `<option value="${p.id}" ${p.id === "zhihu" ? "selected" : ""}>${p.name}</option>`).join("")}</select></header>
      <div id="rightList" class="rank"></div>
    </section>
  </div>`;

  async function fill(sel, target) {
    const platform = $(sel).value;
    const box = $(target);
    box.innerHTML = `<p style="padding:16px;color:var(--ink-3)">正在拉 ${PLATFORMS.find((p) => p.id === platform)?.name}…</p>`;
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
  $("#left").addEventListener("change", () => fill("#left", "#leftList"));
  $("#right").addEventListener("change", () => fill("#right", "#rightList"));
  await Promise.all([fill("#left", "#leftList"), fill("#right", "#rightList")]);
}

async function renderAi(pane) {
  pane.innerHTML = `<p style="color:var(--ink-3)">正在拉 AI 快报…</p>`;
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
  pane.innerHTML = `<p style="color:var(--ink-3)">正在拉…</p>`;
  const data = await api(path);
  if (!data.ok) {
    pane.innerHTML = `<div class="empty"><h2>${esc(emptyText)}</h2><p>${esc(data.error || "")}</p></div>`;
    return;
  }
  pane.innerHTML = `<div class="cards"></div>`;
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
  pane.innerHTML = `<p style="color:var(--ink-3)">正在拉营销情报…</p>`;
  const data = await api("/api/rss?group=marketing");
  if (!data.ok) {
    pane.innerHTML = `<div class="empty"><h2>营销情报还没稿</h2><p>${esc(data.error)}</p><a class="btn" href="#/engine">去数据引擎</a></div>`;
    return;
  }
  pane.innerHTML = `<p class="muted" style="margin:0 0 12px">只看案例和文章。招聘、跳槽信息不进这一格。</p><div class="cards"></div>`;
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
    <p class="sub">接上了，原料货架才有今天的数。测不通就说实话，不要填假榜。</p>
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
        <h2>营销 RSS</h2>
        <div class="field">
          <label for="rss">每行一个：名字 | 地址。少数派 / 36氪 / IT之家 / V2EX / Product Hunt 已预置。</label>
          <textarea id="rss" rows="5">${esc(
            (s.rssFeeds || []).map((f) => `${f.name} | ${f.url}`).join("\n"),
          )}</textarea>
        </div>
      </section>
      <section class="block">
        <h2>关注博主主页</h2>
        <div class="field">
          <label for="creators">每行一个链接。没有官方接口，第一版只收链接。</label>
          <textarea id="creators" rows="4">${esc((s.creators || []).map((c) => c.url).join("\n"))}</textarea>
        </div>
      </section>
      <section class="block">
        <h2>RedFox Key</h2>
        <div class="field">
          <label for="redfox">低粉高赞用。没有就留空。</label>
          <input id="redfox" type="password" value="${esc(s.redfoxKey)}" autocomplete="off" />
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
          group: old?.group || "marketing",
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
}

const FORMATS = [
  ["short_video", "短视频"],
  ["xhs", "小红书图文"],
  ["wechat", "公众号"],
  ["short_drama", "短剧"],
  ["bilibili", "B站"],
  ["ad", "广告"],
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
    ${titles ? `<p class="draft-k">拟定标题</p><ol class="title-list">${titles}</ol>` : ""}
    ${hooks ? `<p class="draft-k">口播 / Hook</p><ol class="title-list">${hooks}</ol>` : ""}
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
      <h2>如何拍</h2>
      <p class="draft-k">开头 / 钩子</p><p>${esc(pack.shoot?.hook || "")}</p>
      <p class="draft-k">结构</p><p>${esc(pack.shoot?.structure || "")}</p>
      <p class="draft-k">结尾</p><p>${esc(pack.shoot?.ending || "")}</p>
      ${pack.shoot?.shots ? `<p class="draft-k">画面</p><p>${esc(pack.shoot.shots)}</p>` : ""}
    </section>
    <section class="block">
      <h2>如何写</h2>
      ${titles ? `<p class="draft-k">备选标题</p><ol class="title-list">${titles}</ol>` : ""}
      <p class="draft-k">开头</p><p>${esc(pack.write?.opening || "")}</p>
      <p class="draft-k">正文 / 口播</p><pre class="draft-body">${esc(pack.write?.body || "")}</pre>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </section>
  </div>`;
}

async function renderTopic(id) {
  setNav("tasks");
  main.innerHTML = `<p class="kicker">选题卡</p><p class="sub">正在打开…</p>`;
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
    ${t.error ? `<div class="banner warn">${esc(t.error)}</div>` : ""}

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
      <p class="muted">先选一份活，再出方向。三个方向必须不同。点选一条，下面才是切口、标题、Hook 和可拍细节。</p>
      ${
        t.topicIdeas?.length
          ? `<div class="ideas">${t.topicIdeas.map((idea, i) => ideaCard(idea, i, i === (t.selectedIndex ?? 0))).join("")}</div>${ideaDetail(selected)}`
          : `<p class="muted">没有可切的方向。${t.noSignal ? "证据不够，或素材按方法救不起来。" : "生成失败的话，补密钥后再从灵感里选一次。"}</p>`
      }
    </section>

    <section class="block">
      <h2>如何拍 / 如何写</h2>
      <p class="muted">先选定上面一条方向，再出稿。按这份活的格式出，不按身份。短视频、小红书、公众号都挂在这里。</p>
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
    <p class="sub">从灵感里选出来的。卡片上能看出切了哪条、有没有拍法和稿。</p>
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
    <h1 class="mast" style="font-size:28px">全组这个月钉了什么</h1>
    ${
      n
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
    <form class="engine" id="setForm">
      <section class="block">
        <h2>这次可能用得上的背景</h2>
        <p class="muted" style="margin-bottom:12px">不填也能开工。这不是账号档案，不管你有几个号。判断默认只看这一份活。</p>
        <div class="field"><label for="company">公司 / 组名（可选）</label><input id="company" value="${esc(s.companyName || "")}" /></div>
        <div class="field"><label for="who">我的名字（钉子会记上，可选）</label><input id="who" value="${esc(s.operatorName || "")}" placeholder="例如 小周" /></div>
        <div class="field"><label for="niche">这一次相关的行业或主题（可选）</label><input id="niche" value="${esc(s.niche || "")}" placeholder="不锁行业。有就写，没有就空着" /></div>
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
        <p class="muted" style="margin-bottom:12px">选题、如何拍、如何走这里。默认 Agnes。Key 只存在本机，不要发到对话框。</p>
        <div class="field"><label for="llmBase">Base URL</label><input id="llmBase" value="${esc(s.llmBaseUrl || "https://apihub.agnes-ai.com/v1")}" /></div>
        <div class="field"><label for="llmKey">API Key</label><input id="llmKey" type="password" value="${esc(s.agnesKey || "")}" autocomplete="off" placeholder="${s.hasAgnesKey ? "已保存，留空不改" : "在这里贴"}" /></div>
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
        <div class="field"><label for="n">选题池条数（8～10）</label><input id="n" type="number" min="8" max="10" value="${s.mustReadCount >= 8 ? s.mustReadCount : 10}" /></div>
        <div class="field"><label for="r">刷新间隔（分钟）</label><input id="r" type="number" min="5" max="180" value="${s.refreshMinutes}" /></div>
        <div class="field"><label for="f">低粉阈值 · 粉丝低于</label><input id="f" type="number" value="${s.lowFanFollowers}" /></div>
        <div class="field"><label for="l">低粉阈值 · 单篇赞高于</label><input id="l" type="number" value="${s.lowFanLikes}" /></div>
        <button class="btn" type="submit">保存</button>
      </section>
    </form>
  `;
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
    toast("已保存");
  });
  $("#syncModels")?.addEventListener("click", syncModels);
  $("#pingLlm")?.addEventListener("click", pingLlm);
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
    <p class="sub">这不是账号。高价值的话题种在这儿。拆成子主题是下一步；现在可以从一棵树上开工。</p>
    <form class="start" id="plantForm">
      <label class="sr" for="plantLine">种一个主题</label>
      <input id="plantLine" maxlength="80" placeholder="一句话种一个主题，比如：德芙联名翻车怎么讲" autocomplete="off" />
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
    <div class="banner">拆成 10 个子主题、20 个角度是下一步。现在可以从这开工，变成一份活。</div>
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

async function render() {
  const r = route();
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
