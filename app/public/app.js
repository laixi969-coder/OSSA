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
  return { view: parts[0] || "hot", tab: parts[1] || "platform", query: new URLSearchParams(query || "") };
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
  if (!item?.title) return toast("这条没有标题，做不成选题");
  toast("正在做成选题…");
  const data = await api("/api/topics", {
    method: "POST",
    body: JSON.stringify({
      title: item.title,
      url: item.url || "",
      source: item.source || item.kind || "",
      summary: item.summary || item.line || "",
      cover: item.cover || "",
    }),
  });
  if (!data.task?.id) return toast(data.error || "没做成");
  if (data.error) toast(data.error);
  else toast("选题卡已生成");
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
  return `<div class="actions">
    <button class="btn" data-topic>做成选题</button>
    ${open}
    <button class="btn ghost" data-pin>钉借鉴</button>
  </div>`;
}

function bindCard(el, item) {
  el.querySelector("[data-pin]")?.addEventListener("click", () => pinItem(item));
  el.querySelector("[data-topic]")?.addEventListener("click", () => toTopic(item));
}

async function renderHot(tab) {
  setNav("hot");
  main.innerHTML = `<p class="kicker">OSSA 内容经营台</p>
    <h1 class="mast">今天做什么，凭什么做</h1>
    <p class="sub">给内容组用。先给可做的三条，再给热榜。热闹不等于选题。</p>
    <div class="hook cold">正在拉今天的数…</div>`;

  const home = await api("/api/home");
  const pins = (home.pins || [])
    .map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>`)
    .join("");

  const must = (home.must || [])
    .map(
      (item) => `<article>
        ${coverHtml(item.cover)}
        <div class="pad">
        <div class="line">${esc(item.do || item.line || item.source || "")}</div>
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
    <p class="kicker">${esc(home.companyName || "内容组")} · OSSA</p>
    <h1 class="mast">今天做什么，凭什么做</h1>
    <p class="sub">给企业内容员工用。看见热，做成自己的题，带着拍法和稿去拍。</p>
    <div class="hook ${home.hookReady ? "" : "cold"}">${esc(home.hook || home.coldStart)}</div>
    <div class="meta-row">
      <span>${esc(timeAgo(home.fetchedAt))}</span>
      <button type="button" id="refresh">刷新</button>
    </div>
    <div class="must">${must || `<div class="empty"><p>${esc(home.coldStart)}</p></div>`}</div>
    ${pins ? `<div class="section-label">最近钉过的借鉴</div><div class="pins">${pins}</div>` : ""}
    <div class="tabs">${tabs}</div>
    <div id="pane"></div>
  `;
  $("#refresh")?.addEventListener("click", () => render());
  main.querySelectorAll(".must article").forEach((el, i) => bindCard(el, home.must[i]));
  await renderTab(tab || "platform");
}

async function renderTab(tab) {
  const pane = $("#pane");
  if (!pane) return;
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
    box.innerHTML = `<ol class="rank">${data.items
      .map(
        (it, i) => `<li>
          <span class="n num">${it.rank}</span>
          <a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
          <span class="heat num">${it.heat ? Math.round(it.heat).toLocaleString("zh-CN") : ""}</span>
          <button type="button" class="btn ghost tiny" data-topic-i="${i}">做成选题</button>
        </li>`,
      )
      .join("")}</ol>`;
    box.querySelectorAll("[data-topic-i]").forEach((btn) => {
      btn.addEventListener("click", () => toTopic(data.items[Number(btn.dataset.topicI)]));
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
  pane.innerHTML = `<div class="cards"></div>`;
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
    <p class="sub">接上了，热点页才有今天的数。测不通就说实话，不要填假榜。</p>
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
  ["xhs", "小红书"],
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
    ? `${s.niche || ""} · ${s.persona || ""} · ${s.audience || ""}`
    : "处境还没写。先去设置写清我们是谁，否则这是弱判断。";

  main.innerHTML = `
    <p class="kicker"><a href="#/tasks">选题看板</a> · ${esc(STAGE_NAME[t.stage] || t.stage)}</p>
    <h1 class="mast" style="font-size:28px">${esc(t.title)}</h1>
    <p class="sub">${esc(t.by || "未署名")} · 来自「${esc(t.signal?.title || t.fromTitle || "")}」</p>
    <div class="banner ${situationFilled(s) ? "" : "warn"}">${esc(sitLine)}</div>
    ${t.error ? `<div class="banner warn">${esc(t.error)}</div>` : ""}

    <section class="block">
      <h2>这条热是什么</h2>
      <p>${esc(t.signal?.title || t.fromTitle || "")}</p>
      <p class="muted">${esc(t.signal?.source || "")} ${t.signal?.summary ? " · " + esc(t.signal.summary) : ""}</p>
      <div class="actions">
        ${t.signal?.url ? `<a class="btn ghost" href="${esc(t.signal.url)}" target="_blank" rel="noopener">打开原文</a>` : ""}
      </div>
    </section>

    <section class="block">
      <h2>我们拍不拍</h2>
      <p>${esc(t.followReason || (!t.error && t.noSignalReason) || "看完可拍的题，再决定。")}</p>
      ${t.noSignal && !t.error ? `<p class="muted">${esc(t.noSignalReason || "这条先别押。")}</p>` : ""}
      <div class="actions" id="verdict">
        <button class="btn ${t.verdict === "follow" ? "" : "ghost"}" data-v="follow">跟</button>
        <button class="btn ghost" data-v="need_evidence">待补证</button>
        <button class="btn ghost" data-v="skip">不跟</button>
      </div>
      ${(t.evidence?.limitations || []).length ? `<ul class="limits">${t.evidence.limitations.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    </section>

    ${scanHtml(t.scan, t.goldLine)}

    <section class="block">
      <h2>爆款方向</h2>
      <p class="muted">三个方向必须不同。点选一条，下面是完整切口、标题、Hook 和可拍细节。</p>
      ${
        t.topicIdeas?.length
          ? `<div class="ideas">${t.topicIdeas.map((idea, i) => ideaCard(idea, i, i === (t.selectedIndex ?? 0))).join("")}</div>${ideaDetail(selected)}`
          : `<p class="muted">没有可拍的题。${t.noSignal ? "证据不够、处境不合，或素材按方法救不起来。" : "生成失败的话，补处境或密钥后再从热点做一次。"}</p>`
      }
    </section>

    <section class="block">
      <h2>如何拍 / 如何写</h2>
      <p class="muted">先选定上面一条题，再选出稿。按格式出，挂在这条选题上。</p>
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
    <p class="kicker">任务推进</p>
    <h1 class="mast" style="font-size:28px">组里的选题</h1>
    <p class="sub">从热点做成题。卡片上能看出选了哪条切口、有没有拍法和稿。</p>
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
        : `<p style="color:var(--ink-3);font-size:12px">还没有。从近期热点做成选题。</p>`
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
            <article class="pad-card"><div class="line">选题</div><h3 class="num">${m}</h3><p>已经做成选题的</p></article>
            <article class="pad-card"><div class="line">还停在待判断</div><h3 class="num">${k}</h3><p>还没拍板</p></article>
          </div>`
        : `<div class="empty"><h2>先在近期热点钉 3 条</h2><p>月底这儿才有得看。</p><a class="btn" href="#/hot">去近期热点</a></div>`
    }
  `;
}

async function renderSettings() {
  setNav("settings");
  const state = await api("/api/state");
  const s = state.settings;
  main.innerHTML = `
    <p class="kicker">设置</p>
    <h1 class="mast" style="font-size:28px">先写清我们是谁</h1>
    <form class="engine" id="setForm">
      <section class="block">
        <h2>公司处境</h2>
        <p class="muted" style="margin-bottom:12px">每家自己填，不限行业。选题、拍法、文稿对着这份处境。不填也能做成选题，只是判断更弱。</p>
        <div class="field"><label for="company">公司 / 组名</label><input id="company" value="${esc(s.companyName || "")}" /></div>
        <div class="field"><label for="who">我的名字（钉子会记在组里）</label><input id="who" value="${esc(s.operatorName || "")}" placeholder="例如 小周" /></div>
        <div class="field"><label for="niche">赛道</label><input id="niche" value="${esc(s.niche || "")}" placeholder="你们做什么就写什么，美妆、教育、B2B、餐饮都行" /></div>
        <div class="field"><label for="persona">人设</label><input id="persona" value="${esc(s.persona || "")}" placeholder="这个账号怎么说话" /></div>
        <div class="field"><label for="audience">拍给谁</label><input id="audience" value="${esc(s.audience || "")}" placeholder="谁会看、为谁做内容" /></div>
        <div class="field">
          <label>主做格式</label>
          <div class="checks" id="fmtChecks">
            ${FORMATS.map(
              ([id, name]) =>
                `<label class="check"><input type="checkbox" value="${id}" ${(s.formats || ["short_video", "xhs"]).includes(id) ? "checked" : ""}/> ${name}</label>`,
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
        <div class="field"><label for="n">可做条数</label><input id="n" type="number" min="1" max="6" value="${s.mustReadCount}" /></div>
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
      formats: formats.length ? formats : ["short_video", "xhs"],
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

async function render() {
  const r = route();
  if (r.view === "engine") return renderEngine();
  if (r.view === "tasks" && r.tab && r.tab !== "platform") return renderTopic(decodeURIComponent(r.tab));
  if (r.view === "tasks") return renderTasks();
  if (r.view === "review") return renderReview();
  if (r.view === "settings") return renderSettings();
  return renderHot(r.tab === "hot" ? "platform" : r.tab);
}

window.addEventListener("hashchange", render);
render();
