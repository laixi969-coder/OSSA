import { join } from "node:path";
import {
  AGNES_BASE,
  AGNES_CHAT_MODEL,
  FALLBACK_MODELS,
  EMPTY_SCAN,
  generateBrief,
  generateDraft,
  listRemoteModels,
  llmConfig,
  pingLlm,
  type ContentFormat,
  type DraftPack,
  type LlmModel,
  type NewsScan,
  type Situation,
  type TopicIdea,
} from "./topic";

const ROOT = join(import.meta.dir, "..");
const PUBLIC = join(import.meta.dir, "public");
const STORE = join(ROOT, "data", "store.json");
const PORT = Number(process.env.PORT || 4319);

type RssFeed = { id: string; name: string; url: string; enabled: boolean; group?: string };
type Settings = {
  sixtyBase: string;
  mustReadCount: number;
  refreshMinutes: number;
  lowFanFollowers: number;
  lowFanLikes: number;
  jinaEnabled: boolean;
  redfoxKey: string;
  agnesKey: string;
  xaiKey?: string;
  llmBaseUrl: string;
  llmModel: string;
  llmModels: LlmModel[];
  operatorName: string;
  companyName: string;
  niche: string;
  persona: string;
  audience: string;
  formats: ContentFormat[];
  rssFeeds: RssFeed[];
  creators: { id: string; name: string; url: string }[];
};
type Pin = {
  id: string;
  title: string;
  url: string;
  source: string;
  summary: string;
  cover: string;
  by: string;
  createdAt: string;
};
type TaskStage = "judge" | "need_evidence" | "adopted" | "making" | "review" | "skipped";
type Task = {
  id: string;
  title: string;
  stage: TaskStage;
  verdict: "" | "follow" | "skip" | "need_evidence";
  pinId: string;
  note: string;
  fromTitle: string;
  by: string;
  lastMovedAt: string;
  createdAt: string;
  signal: { title: string; url: string; source: string; summary: string; cover: string };
  format: ContentFormat;
  topicIdeas: TopicIdea[];
  selectedIndex: number | null;
  noSignal: boolean;
  noSignalReason: string;
  followReason: string;
  evidence: { limitations: string[]; collectedAt: string };
  drafts: Partial<Record<ContentFormat, DraftPack>>;
  error: string;
  scan: NewsScan;
  goldLine: string;
};
type Theme = {
  id: string;
  title: string;
  fromTitle: string;
  fromUrl: string;
  origin: string;
  summary: string;
  status: "active" | "paused";
  plantedAt: string;
  by: string;
};
type Store = { settings: Settings; pins: Pin[]; tasks: Task[]; themes: Theme[] };

const DEFAULT_FEEDS: RssFeed[] = [
  { id: "digitaling", name: "数英", url: "https://www.digitaling.com/rss", enabled: true, group: "marketing" },
  { id: "adweek", name: "Adweek", url: "https://www.adweek.com/feed/", enabled: true, group: "marketing" },
  { id: "commarts", name: "Communication Arts", url: "https://www.commarts.com/feed", enabled: true, group: "marketing" },
  { id: "sspai", name: "少数派", url: "https://sspai.com/feed", enabled: true, group: "tech" },
  { id: "36kr", name: "36氪", url: "https://36kr.com/feed", enabled: true, group: "tech" },
  { id: "ithome", name: "IT之家", url: "https://www.ithome.com/rss/", enabled: true, group: "tech" },
  { id: "v2ex", name: "V2EX", url: "https://www.v2ex.com/index.xml", enabled: true, group: "tech" },
  { id: "producthunt", name: "Product Hunt", url: "https://www.producthunt.com/feed", enabled: true, group: "open" },
];

const STAGE_MAP: Record<string, TaskStage> = {
  idea: "judge",
  writing: "making",
  ready: "making",
  done: "review",
};

function blankTask(): Pick<
  Task,
  | "verdict"
  | "signal"
  | "format"
  | "topicIdeas"
  | "selectedIndex"
  | "noSignal"
  | "noSignalReason"
  | "followReason"
  | "evidence"
  | "drafts"
  | "error"
  | "scan"
  | "goldLine"
> {
  return {
    verdict: "",
    signal: { title: "", url: "", source: "", summary: "", cover: "" },
    format: "short_video",
    topicIdeas: [],
    selectedIndex: null,
    noSignal: false,
    noSignalReason: "",
    followReason: "",
    evidence: { limitations: [], collectedAt: "" },
    drafts: {},
    error: "",
    scan: { ...EMPTY_SCAN },
    goldLine: "",
  };
}

function migrateTask(raw: Task & { stage?: string }): Task {
  const stage = (STAGE_MAP[raw.stage || ""] || raw.stage || "judge") as TaskStage;
  const base = blankTask();
  return {
    ...base,
    ...raw,
    stage,
    topicIdeas: raw.topicIdeas || [],
    scan: raw.scan || base.scan,
    goldLine: raw.goldLine || "",
  };
}

function llmOf(settings: Settings, override: { apiKey?: string; baseUrl?: string; model?: string } = {}) {
  const incoming = (override.apiKey || "").trim();
  const storeKey = incoming && incoming !== "••••" ? incoming : settings.agnesKey || "";
  return llmConfig({
    envKey: process.env.AGNES_API_KEY || "",
    storeKey,
    base: override.baseUrl || settings.llmBaseUrl,
    model: override.model || settings.llmModel,
  });
}

function situationOf(settings: Settings): Situation {
  const formats = (settings.formats || []).filter(Boolean) as ContentFormat[];
  return {
    niche: settings.niche || "",
    persona: settings.persona || "",
    audience: settings.audience || "",
    formats: formats.length ? formats : ["short_video", "xhs", "wechat"],
  };
}

function publicSettings(settings: Settings) {
  return {
    ...settings,
    redfoxKey: settings.redfoxKey ? "••••" : "",
    agnesKey: settings.agnesKey ? "••••" : "",
    xaiKey: undefined,
    hasAgnesKey: Boolean((process.env.AGNES_API_KEY || settings.agnesKey || "").trim()),
    llmFromEnv: Boolean((process.env.AGNES_API_KEY || "").trim()),
    llmBaseUrl: settings.llmBaseUrl || AGNES_BASE,
    llmModel: settings.llmModel || AGNES_CHAT_MODEL,
    llmModels: settings.llmModels?.length ? settings.llmModels : FALLBACK_MODELS,
  };
}

async function readStore(): Promise<Store> {
  const store = JSON.parse(await Bun.file(STORE).text()) as Store;
  store.settings.operatorName = store.settings.operatorName || "";
  store.settings.companyName = store.settings.companyName || "内容组";
  store.settings.agnesKey = store.settings.agnesKey || store.settings.xaiKey || "";
  store.settings.xaiKey = "";
  store.settings.llmBaseUrl = store.settings.llmBaseUrl || AGNES_BASE;
  store.settings.llmModel = store.settings.llmModel || AGNES_CHAT_MODEL;
  store.settings.llmModels = store.settings.llmModels?.length ? store.settings.llmModels : FALLBACK_MODELS;
  store.settings.niche = store.settings.niche || "";
  store.settings.persona = store.settings.persona || "";
  store.settings.audience = store.settings.audience || "";
  store.settings.formats =
    store.settings.formats?.length ? store.settings.formats : ["short_video", "xhs", "wechat"];
  store.settings.rssFeeds = store.settings.rssFeeds || [];
  store.tasks = (store.tasks || []).map(migrateTask);
  store.themes = store.themes || [];
  for (const feed of DEFAULT_FEEDS) {
    if (!store.settings.rssFeeds.some((f) => f.url === feed.url || f.id === feed.id)) {
      store.settings.rssFeeds.push(feed);
    } else {
      store.settings.rssFeeds = store.settings.rssFeeds.map((f) =>
        f.url === feed.url || f.id === feed.id ? { ...feed, ...f, group: f.group || feed.group } : f,
      );
    }
  }
  return store;
}

async function writeStore(store: Store) {
  await Bun.write(STORE, JSON.stringify(store, null, 2));
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function decodeXml(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      try {
        return code ? String.fromCodePoint(code) : _;
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 16));
      } catch {
        return _;
      }
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .trim();
}

function cleanRssTitle(title: string) {
  return title.replace(/^(文章频道|项目频道|招聘频道)\s*[-—–]\s*/, "").trim();
}

function isJobListing(item: { title?: string; url?: string }) {
  const title = item.title || "";
  const url = item.url || "";
  if (/digitaling\.com\/jobs\b/i.test(url)) return true;
  if (/\/jobs\/\d+/i.test(url)) return true;
  if (/(^|\s)招聘频道\s*[-—–]/.test(title)) return true;
  if (/(诚聘|急聘|招聘启事|投递简历)/.test(title)) return true;
  return false;
}

function isPromoJunk(item: { title?: string; url?: string }) {
  const title = item.title || "";
  const url = item.url || "";
  if (/sfsdata\.com\/commarts\/subscribe/i.test(url)) return true;
  if (/last call|professional discount|subscribe now/i.test(title)) return true;
  return false;
}

function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}

function rssCover(chunk: string, desc: string) {
  const media =
    chunk.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)/i) ||
    chunk.match(/<enclosure[^>]+url=["']([^"']+)/i) ||
    desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  const url = media ? media[1].trim() : "";
  if (!url) return "";
  if (/\/logo\/|avatar|_100\.(jpg|png|webp)/i.test(url)) {
    const all = [...desc.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
    return all.find((u) => !/\/logo\/|_100\.(jpg|png|webp)/i.test(u)) || url;
  }
  return url;
}

function parseRss(xml: string, sourceName: string) {
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  return chunks.slice(0, 40).map((chunk, i) => {
    const title = tag(chunk, "title") || "无标题";
    const link = tag(chunk, "link") || tag(chunk, "guid");
    const desc = tag(chunk, "description") || tag(chunk, "content:encoded");
    const date = tag(chunk, "pubDate") || tag(chunk, "dc:date");
    const text = decodeXml(desc.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").slice(0, 180);
    return {
      id: `rss:${sourceName}:${i}:${link.slice(0, 80)}`,
      title,
      url: link,
      summary: text,
      cover: rssCover(chunk, desc),
      source: sourceName,
      publishedAt: date,
      heat: 0,
    };
  });
}

const IMG_HOSTS = [
  "digitaling.com",
  "zhimg.com",
  "aihot.virxact.com",
  "adweek.com",
  "commarts.com",
  "bcebos.com",
  "byteimg.com",
  "sinaimg.cn",
  "xhscdn.com",
  "xiaohongshu.com",
  "qpic.cn",
  "qq.com",
  "wp.com",
  "cloudfront.net",
];

function hostAllowed(host: string) {
  const h = host.toLowerCase();
  return IMG_HOSTS.some((s) => h === s || h.endsWith("." + s));
}

async function proxyImage(raw: string) {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return new Response("bad protocol", { status: 400 });
  }
  if (!hostAllowed(target.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(target.toString(), {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) {
      return new Response("img fail", { status: 502 });
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("img fail", { status: 502 });
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url: string, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "OSSA-MediaOS/1.0" },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

async function sixty(store: Store, path: string) {
  const base = store.settings.sixtyBase.replace(/\/$/, "");
  return fetchJson(`${base}${path}`);
}

type InspirationOrigin = "hot" | "case" | "news" | "tech" | "evergreen" | "custom";

type SignalItem = {
  id: string;
  rank: number;
  title: string;
  url: string;
  summary: string;
  cover: string;
  heat: number;
  source: string;
  publishedAt: string;
  kind?: string;
  why?: string;
  do?: string;
  origin?: InspirationOrigin;
  originLabel?: string;
  matchedTheme?: string;
};

function whyDo(kind: string) {
  const map: Record<string, { why: string; do: string }> = {
    weibo: { why: "今天很多人在搜，适合做态度或解释", do: "跟热点" },
    zhihu: { why: "问题本身就是选题", do: "答疑向" },
    douyin: { why: "短视频正在推这个，适合做口播或切片", do: "跟热点" },
    bili: { why: "B站在传，适合做稍长一点的讲解", do: "做讲解" },
    toutiao: { why: "资讯流在推，适合做跟进", do: "跟进解读" },
    baidu: { why: "搜索意图明确，适合做攻略或辟谣", do: "答疑向" },
    quark: { why: "夸克热榜上的大众议题，适合做解释", do: "跟热点" },
    hn: { why: "海外极客在传，适合做差异化解读", do: "翻译解读" },
    marketing: { why: "行业刚出的案例，适合拆结构和话术", do: "拆案例" },
    aihot: { why: "工具圈在讨论，适合做教学或立场", do: "做教程" },
    tech: { why: "科技媒体在报，适合做跟进解读", do: "跟进解读" },
    github: { why: "开源圈今天涨得快，适合点评或试用", do: "评测" },
    product: { why: "新品上架，适合做首发体验", do: "评测" },
    evergreen: { why: "不靠热搜也能开工，靠你看见了什么、被问了什么", do: "常青" },
  };
  return map[kind] || { why: "值得看一眼，再决定做不做", do: "先看" };
}

const ORIGIN_LABEL: Record<InspirationOrigin, string> = {
  hot: "热搜",
  case: "案例",
  news: "快报",
  tech: "科技",
  evergreen: "常青",
  custom: "自己说的",
};

const EVERGREEN: Array<{ title: string; summary: string; do: string; why: string }> = [
  { title: "把今天亲眼看到的一件事讲清楚", summary: "你在场，别人不在场。不需要热搜来授权。", do: "现场", why: "没流量也能做，靠你看见了什么" },
  { title: "回答那个被问了十遍的问题", summary: "私信、评论、当面反复出现的，就是常青题。", do: "答疑", why: "搜索和提问比热搜更稳" },
  { title: "把一次做砸的事写成对照", summary: "失败比成功好拍，因为代价是具体的。", do: "复盘", why: "对照比口号有画面" },
  { title: "把一个默认说法反过来讲", summary: "行业里人人都这么说的那句，往往经不起追问。", do: "反常识", why: "反转本身就是切口" },
  { title: "拆一条别人刚做成的案例，只拆方法不跟热度", summary: "学结构，不学热搜。", do: "拆方法", why: "方法可迁移，热度不可复制" },
  { title: "做一次前后对比实验，把过程公开", summary: "同一件事，改一个变量，拍下结果。", do: "实验", why: "过程比结论更可跟" },
  { title: "把一个专业动作拆成外行人能跟的步骤", summary: "你会的那一步，别人卡在门口。", do: "教程", why: "步骤本身就是内容" },
  { title: "把一句客户原话扩成一篇或一条", summary: "原话比你编的人设更真。", do: "原话", why: "证据在对方嘴里" },
  { title: "写给三年前的自己：当时最容易走错的那一步", summary: "一封信，一个坑，一个补救。", do: "书信", why: "时间差就是戏剧" },
  { title: "同一件事，短视频、小红书、公众号三种写法", summary: "不是三个身份，是同一份活的三种格式。", do: "改写", why: "格式跟这份活走，不跟人设走" },
];

function markOrigin(items: SignalItem[], origin: InspirationOrigin): SignalItem[] {
  return items.map((item) => ({ ...item, origin, originLabel: ORIGIN_LABEL[origin] }));
}

function skipAsHomeHot(title: string) {
  return /遇难|死亡|地震|泥石流|空难|溃坝|爆炸|伤亡|受灾|救援|灾区|山洪|洪水|杀害|杀人|遇害|身亡|事故|触电|人祸|招聘会/.test(title);
}

function themeGroups(themes: Theme[]) {
  return (themes || [])
    .filter((t) => t.status !== "paused" && t.title)
    .map((t) => ({
      title: t.title,
      needles: [t.title, ...t.title.split(/[\s，。、·/|]+/)].map((s) => s.trim()).filter((s) => s.length >= 2),
    }));
}

function matchTheme(text: string, groups: ReturnType<typeof themeGroups>) {
  if (!groups.length) return "";
  const hay = text.toLowerCase();
  for (const g of groups) {
    if (g.needles.some((n) => hay.includes(n.toLowerCase()))) return g.title;
  }
  return "";
}

function withThemeMatch(items: SignalItem[], groups: ReturnType<typeof themeGroups>) {
  return items.map((item) => ({
    ...item,
    matchedTheme: matchTheme(`${item.title} ${item.summary || ""}`, groups),
  }));
}

function oneLiner(item: SignalItem) {
  const hit = item.matchedTheme ? `和长期主题「${item.matchedTheme}」有关。` : "";
  if (item.origin === "evergreen" && item.why) return hit + item.why;
  const sum = (item.summary || "").replace(/\s+/g, " ").trim();
  if (sum.length >= 8) return (hit + sum).slice(0, 100);
  if (item.origin === "hot") {
    const short = (item.title || "").slice(0, 16);
    return `${hit}热搜在谈「${short}」。热闹不等于选题。`;
  }
  if (hit) return hit + "看完再决定做不做。";
  return item.why || "还没有长期主题，这条先按它本身值不值得看。";
}

function pickEvergreen(n: number, batch = 0): SignalItem[] {
  const day = Math.floor(Date.now() / 86400000);
  const start = (day + batch * 2) % EVERGREEN.length;
  const out: SignalItem[] = [];
  const used = new Set<string>();
  for (let i = 0; out.length < n && i < EVERGREEN.length * 2; i++) {
    const row = EVERGREEN[(start + i) % EVERGREEN.length];
    if (used.has(row.title)) continue;
    used.add(row.title);
    out.push(
      stamp("evergreen", {
        id: `ever:${row.title}`,
        rank: 0,
        title: row.title,
        url: "",
        summary: row.summary,
        cover: "",
        heat: 0,
        source: "常青",
        publishedAt: "",
        why: row.why,
        do: row.do,
      }),
    );
  }
  return markOrigin(out, "evergreen").map((item) => {
    const row = EVERGREEN.find((x) => x.title === item.title);
    return row ? { ...item, why: row.why, do: row.do } : item;
  });
}

function mixInspirations(
  pools: Array<{ origin: InspirationOrigin; items: SignalItem[]; cap: number }>,
  want: number,
  batch = 0,
): SignalItem[] {
  const used = new Set<string>();
  const out: SignalItem[] = [];
  const keyOf = (title: string) => title.replace(/\s+/g, "").slice(0, 22);
  const take = (item: SignalItem | undefined, origin: InspirationOrigin) => {
    if (!item?.title || out.length >= want) return;
    const key = keyOf(item.title);
    if (used.has(key)) return;
    used.add(key);
    out.push({
      ...item,
      origin,
      originLabel: ORIGIN_LABEL[origin],
      why: oneLiner({ ...item, origin }),
    });
  };
  pickEvergreen(3, batch).forEach((item) => take(item, "evergreen"));
  let round = 0;
  while (out.length < want && round < 8) {
    for (const pool of pools) {
      const taken = out.filter((x) => x.origin === pool.origin).length;
      if (taken >= pool.cap) continue;
      take(pool.items[round + batch], pool.origin);
      if (out.length >= want) break;
    }
    round++;
  }
  if (out.length < Math.min(5, want)) {
    pickEvergreen(7, batch + 1).forEach((item) => take(item, "evergreen"));
  }
  return out.slice(0, want);
}

function stamp(kind: string, item: SignalItem): SignalItem {
  const w = whyDo(kind);
  return { ...item, kind, why: w.why, do: w.do };
}

function itemsFromSixty(platform: string, parsed: { code?: number; data?: unknown; message?: string }) {
  const data = parsed?.data;
  if (platform === "ai-news") {
    const news = (data as { news?: Array<Record<string, string>> })?.news || [];
    const items = news.map((row, i) =>
      stamp("aihot", {
        id: `sixty:ai:${i}:${row.title || ""}`,
        rank: i + 1,
        title: String(row.title || ""),
        url: String(row.link || ""),
        summary: String(row.detail || ""),
        cover: "",
        heat: 0,
        source: String(row.source || "AI 新闻"),
        publishedAt: String(row.date || ""),
      }),
    );
    return { ok: items.length > 0, error: items.length ? "" : "今天还没有 AI 新闻", items };
  }
  if (platform === "daily60s") {
    const pack = data as { news?: string[]; link?: string; cover?: string; image?: string };
    const news = pack?.news || [];
    const items = news.map((title, i) =>
      stamp("weibo", {
        id: `sixty:60s:${i}`,
        rank: i + 1,
        title: title,
        url: String(pack.link || ""),
        summary: "",
        cover: String(pack.cover || pack.image || ""),
        heat: 0,
        source: "60秒读世界",
        publishedAt: "",
      }),
    );
    return { ok: items.length > 0, error: items.length ? "" : "早报还没出", items };
  }
  if (!Array.isArray(data)) {
    return { ok: false, error: parsed?.message || "热榜读不到", items: [] as SignalItem[] };
  }
  const kindMap: Record<string, string> = {
    "hacker-news": "hn",
    "it-news": "tech",
    "ai-news": "aihot",
    daily60s: "weibo",
  };
  const kind = kindMap[platform] || platform;
  const items = data.map((row: Record<string, unknown>, i: number) =>
    stamp(kind, {
      id: `hot:${platform}:${i}:${String(row.title || "").slice(0, 40)}`,
      rank: i + 1,
      title: String(row.title || ""),
      url: String(row.link || row.url || ""),
      summary: String(row.detail || row.desc || row.description || ""),
      cover: String(row.cover || ""),
      heat: Number(row.hot_value || row.score || 0),
      source: platform,
      publishedAt: String(row.created || ""),
    }),
  );
  return { ok: true, error: "", items };
}

function mapHot(platform: string, raw: unknown) {
  return itemsFromSixty(platform, raw as { code?: number; data?: unknown; message?: string });
}

async function githubTrending() {
  const r = await fetchJson("https://cdn.jsdelivr.net/gh/Hyraze/trending-collection@main/api/daily/all.json");
  if (!r.ok) return { ok: false, error: "GitHub 趋势暂时拉不到", items: [] as SignalItem[] };
  try {
    const data = JSON.parse(r.body) as { items?: Array<Record<string, string>> };
    const items = (data.items || []).map((row, i) =>
      stamp("github", {
        id: `gh:${row.url || i}`,
        rank: i + 1,
        title: String(row.title || ""),
        url: String(row.url || ""),
        summary: `${row.description || ""} ${row.added_stars || ""}`.trim(),
        cover: "",
        heat: Number(String(row.stars || "0").replace(/[^\d]/g, "")) || 0,
        source: `GitHub · ${row.language || ""}`.trim(),
        publishedAt: "",
      }),
    );
    return { ok: items.length > 0, error: "", items };
  } catch {
    return { ok: false, error: "GitHub 趋势暂时拉不到", items: [] as SignalItem[] };
  }
}

async function aihotItems() {
  const r = await fetchJson("https://aihot.virxact.com/api/v1/items?mode=selected&window=24h&limit=20");
  if (!r.ok) return { ok: false, error: "AIHOT 暂时连不上，稍后再刷", items: [] as unknown[] };
  try {
    const data = JSON.parse(r.body) as {
      items?: Array<Record<string, unknown>>;
    };
    const items = (data.items || []).map((row, i) => {
      const links = (row.links || {}) as Record<string, string>;
      return stamp("aihot", {
        id: `aihot:${String(row.id || i)}`,
        rank: i + 1,
        title: String(row.title || ""),
        url: String(links.aihot || links.story || links.original || ""),
        summary: String(row.summary || row.reason || ""),
        cover: "",
        source: String((row.source as { name?: string } | undefined)?.name || "AIHOT"),
        publishedAt: String(row.publishedAt || row.discoveredAt || ""),
        heat: Number(row.score || 0),
      });
    });
    return { ok: true, error: "", items };
  } catch {
    return { ok: false, error: "AIHOT 暂时连不上，稍后再刷", items: [] as unknown[] };
  }
}

async function rssItems(store: Store, group?: string) {
  const feeds = store.settings.rssFeeds.filter(
    (f) => f.enabled && f.url && (!group || f.group === group),
  );
  if (!feeds.length) {
    return {
      ok: false,
      error: "先贴数英 https://www.digitaling.com/rss",
      items: [] as unknown[],
    };
  }
  const settled = await Promise.all(
    feeds.map(async (feed) => {
      const r = await fetchJson(feed.url, 15000);
      if (!r.ok) return { feed: feed.name, items: [] as ReturnType<typeof parseRss> };
      return { feed: feed.name, items: parseRss(r.body, feed.name) };
    }),
  );
  const kind = group === "open" ? "product" : group === "tech" ? "tech" : "marketing";
  let items = settled.flatMap((s) => s.items.map((it) => stamp(kind, it as SignalItem)));
  items = items.filter((it) => !isJobListing(it));
  if (group === "marketing") {
    items = items
      .filter((it) => !isPromoJunk(it))
      .map((it) => ({ ...it, title: cleanRssTitle(it.title) }))
      .sort((a, b) => Number(/\/projects\//i.test(b.url)) - Number(/\/projects\//i.test(a.url)));
  }
  if (!items.length) {
    return {
      ok: false,
      error:
        group === "marketing"
          ? "今天的营销源里没有可看的案例或文章。招聘信息不会放进来。"
          : "RSS 源还在，只是今天还没拉到稿。去数据引擎测一下连通。",
      items: [],
    };
  }
  return { ok: true, error: "", items };
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

async function staticFile(pathname: string) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = Bun.file(join(PUBLIC, rel));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  const ext = rel.split(".").pop() || "html";
  const headers: Record<string, string> = { "Content-Type": MIME[ext] || "application/octet-stream" };
  if (ext === "js" || ext === "css" || ext === "html") headers["Cache-Control"] = "no-store";
  return new Response(file, { headers });
}

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path === "/api/state" && req.method === "GET") {
        const store = await readStore();
        return json({
          settings: publicSettings(store.settings),
          hasRedfoxKey: Boolean(store.settings.redfoxKey),
          pins: store.pins,
          tasks: store.tasks,
          themes: store.themes,
        });
      }

      if (path === "/api/settings" && req.method === "POST") {
        const store = await readStore();
        const body = (await req.json()) as Partial<Settings> & { redfoxKey?: string };
        const next: Settings = {
          ...store.settings,
          ...body,
          rssFeeds: body.rssFeeds || store.settings.rssFeeds,
          creators: body.creators || store.settings.creators,
        };
        if (body.redfoxKey === "••••" || body.redfoxKey === undefined) {
          next.redfoxKey = store.settings.redfoxKey;
        }
        const incomingKey = body.agnesKey ?? body.xaiKey;
        if (incomingKey === "••••" || incomingKey === undefined) {
          next.agnesKey = store.settings.agnesKey;
        } else {
          next.agnesKey = incomingKey;
        }
        next.xaiKey = "";
        if (body.formats) {
          next.formats = body.formats.length ? body.formats : ["short_video", "xhs", "wechat"];
        }
        next.llmBaseUrl = (body.llmBaseUrl || store.settings.llmBaseUrl || AGNES_BASE).replace(/\/$/, "");
        next.llmModel = body.llmModel || store.settings.llmModel || AGNES_CHAT_MODEL;
        next.llmModels = body.llmModels?.length ? body.llmModels : store.settings.llmModels;
        store.settings = next;
        await writeStore(store);
        return json({ ok: true });
      }

      if (path === "/api/ping-60s") {
        const store = await readStore();
        const r = await sixty(store, "/health");
        return json({
          ok: r.ok && r.body.trim() === "ok",
          status: r.status,
          base: store.settings.sixtyBase,
          hint: r.ok ? "热榜服务通了" : "本机 60s 还没开，默认地址 http://127.0.0.1:4399",
        });
      }

      if (path === "/api/hot") {
        const store = await readStore();
        const platform = url.searchParams.get("platform") || "weibo";
        const route: Record<string, string> = {
          weibo: "/v2/weibo",
          zhihu: "/v2/zhihu",
          douyin: "/v2/douyin",
          bili: "/v2/bili",
          toutiao: "/v2/toutiao",
          baidu: "/v2/baidu/hot",
          quark: "/v2/quark",
          "hacker-news": "/v2/hacker-news/top",
          "it-news": "/v2/it-news",
          "ai-news": "/v2/ai-news",
          daily60s: "/v2/60s",
          rednote: "/v2/rednote",
        };
        const p = route[platform];
        if (!p) return json({ ok: false, error: "未知平台", items: [] }, 400);
        const r = await sixty(store, p);
        if (!r.ok) {
          const hint =
            platform === "rednote"
              ? "小红书热榜暂时读不到"
              : "本机 60s 还没开，默认地址 http://127.0.0.1:4399";
          return json({ ok: false, error: hint, items: [] });
        }
        try {
          return json(mapHot(platform, JSON.parse(r.body)));
        } catch {
          return json({ ok: false, error: "热榜返回不是数字，稍后再刷", items: [] });
        }
      }

      if (path === "/api/img") {
        const u = url.searchParams.get("u") || "";
        return proxyImage(u);
      }

      if (path === "/api/aihot") {
        const store = await readStore();
        const [aihot, sixtyAi] = await Promise.all([aihotItems(), sixty(store, "/v2/ai-news")]);
        let extra: SignalItem[] = [];
        if (sixtyAi.ok) {
          try {
            extra = mapHot("ai-news", JSON.parse(sixtyAi.body)).items;
          } catch {
            extra = [];
          }
        }
        const items = [...aihot.items, ...extra];
        return json({
          ok: items.length > 0,
          error: items.length ? "" : aihot.error,
          items,
        });
      }

      if (path === "/api/rss") {
        const store = await readStore();
        const group = url.searchParams.get("group") || undefined;
        return json(await rssItems(store, group));
      }

      if (path === "/api/open") {
        const store = await readStore();
        const [gh, hnRaw, ph] = await Promise.all([
          githubTrending(),
          sixty(store, "/v2/hacker-news/top"),
          rssItems(store, "open"),
        ]);
        let hn: SignalItem[] = [];
        if (hnRaw.ok) {
          try {
            hn = mapHot("hacker-news", JSON.parse(hnRaw.body)).items;
          } catch {
            hn = [];
          }
        }
        const items = [...gh.items, ...hn, ...ph.items];
        return json({
          ok: items.length > 0,
          error: items.length ? "" : "开源与新品暂时拉不到",
          items,
        });
      }

      if (path === "/api/tech") {
        const store = await readStore();
        const [itRaw, rss] = await Promise.all([sixty(store, "/v2/it-news"), rssItems(store, "tech")]);
        let it: SignalItem[] = [];
        if (itRaw.ok) {
          try {
            it = mapHot("it-news", JSON.parse(itRaw.body)).items;
          } catch {
            it = [];
          }
        }
        const items = [...it, ...rss.items];
        return json({
          ok: items.length > 0,
          error: items.length ? "" : "科技圈暂时拉不到",
          items,
        });
      }

      if (path === "/api/home") {
        const store = await readStore();
        const batch = Math.max(0, Number(url.searchParams.get("batch") || 0) || 0);
        const [weiboRaw, aihot, rss] = await Promise.all([
          sixty(store, "/v2/weibo"),
          aihotItems(),
          rssItems(store, "marketing"),
        ]);
        let weibo = { ok: false, error: "", items: [] as SignalItem[] };
        if (weiboRaw.ok) {
          try {
            weibo = mapHot("weibo", JSON.parse(weiboRaw.body));
          } catch {
            weibo = { ok: false, error: "热榜返回异常", items: [] };
          }
        } else {
          weibo = { ok: false, error: "本机 60s 还没开，默认地址 http://127.0.0.1:4399", items: [] };
        }
        const wantRaw = Number(store.settings.mustReadCount || 10);
        const want = wantRaw >= 8 && wantRaw <= 10 ? wantRaw : 10;
        const groups = themeGroups(store.themes || []);
        let hotPool = weibo.items.filter((it) => !skipAsHomeHot(it.title));
        if (groups.length) {
          hotPool = hotPool.filter((it) => matchTheme(`${it.title} ${it.summary || ""}`, groups));
        }
        const cases = withThemeMatch(markOrigin(rss.items, "case"), groups).sort(
          (a, b) => Number(Boolean(b.matchedTheme)) - Number(Boolean(a.matchedTheme)),
        );
        const news = withThemeMatch(markOrigin(aihot.items, "news"), groups);
        const hots = withThemeMatch(markOrigin(hotPool, "hot"), groups);
        const inspirations = mixInspirations(
          [
            { origin: "case", items: cases, cap: 4 },
            { origin: "news", items: news, cap: 2 },
            { origin: "hot", items: hots, cap: 2 },
          ],
          want,
          batch,
        ).map((item) => ({
          ...item,
          line: `${item.originLabel || ORIGIN_LABEL[item.origin || "evergreen"]} · ${item.do || ""}`,
        }));

        const OPEN = new Set(["judge", "need_evidence", "adopted", "making"]);
        const openJobs = store.tasks
          .filter((t) => OPEN.has(t.stage))
          .sort((a, b) => (a.lastMovedAt < b.lastMovedAt ? 1 : -1))
          .slice(0, 5)
          .map((t) => ({
            id: t.id,
            title: t.title,
            stage: t.stage,
            origin: t.signal?.source || t.fromTitle || "",
          }));

        const hookParts: string[] = [];
        if (openJobs.length) {
          hookParts.push(`桌上还有 ${openJobs.length} 份活没收`);
          hookParts.push(`先把「${openJobs[0].title.slice(0, 18)}${openJobs[0].title.length > 18 ? "…" : ""}」收完`);
        } else if (inspirations.length) {
          hookParts.push(`今天选题池 ${inspirations.length} 条`);
          hookParts.push(`先看「${inspirations[0].title.slice(0, 18)}${inspirations[0].title.length > 18 ? "…" : ""}」`);
        }
        const planted = (store.themes || []).filter((t) => t.status !== "paused").length;
        if (planted) hookParts.push(`已种 ${planted} 个长期主题`);
        const coldStart = "热榜没起来也没关系。先写一句话开工，或从常青题里挑一张。";

        return json({
          fetchedAt: new Date().toISOString(),
          hook: hookParts.join(" · ") || coldStart,
          hookReady: inspirations.length > 0,
          coldStart,
          inspirations,
          must: inspirations,
          jobs: openJobs,
          pins: store.pins.slice(0, 5),
          themes: (store.themes || []).filter((t) => t.status !== "paused").slice(0, 8),
          themeFilterOn: groups.length > 0,
          weiboOk: weibo.ok,
          aihotOk: aihot.ok,
          rssOk: rss.ok,
          operatorName: store.settings.operatorName,
          companyName: store.settings.companyName,
        });
      }

      if (path === "/api/themes" && req.method === "POST") {
        const store = await readStore();
        const body = (await req.json()) as Partial<Theme> & { id?: string; status?: Theme["status"] };
        if (body.id) {
          store.themes = store.themes.map((t) =>
            t.id === body.id ? { ...t, status: body.status || t.status, title: body.title || t.title } : t,
          );
          await writeStore(store);
          return json({ ok: true, theme: store.themes.find((t) => t.id === body.id) });
        }
        const title = (body.title || "").trim();
        if (!title) return json({ ok: false, error: "没有标题，种不成主题" }, 400);
        const existed = store.themes.find((t) => t.title === title);
        if (existed) {
          store.themes = store.themes.map((t) => (t.title === title ? { ...t, status: "active" as const } : t));
          await writeStore(store);
          return json({ ok: true, theme: store.themes.find((t) => t.title === title), already: true });
        }
        const theme: Theme = {
          id: `theme:${Date.now()}`,
          title,
          fromTitle: body.fromTitle || title,
          fromUrl: body.fromUrl || "",
          origin: body.origin || "custom",
          summary: body.summary || "",
          status: "active",
          plantedAt: new Date().toISOString(),
          by: store.settings.operatorName || "未署名",
        };
        store.themes = [theme, ...store.themes];
        await writeStore(store);
        return json({ ok: true, theme });
      }

      if (path === "/api/pins" && req.method === "POST") {
        const store = await readStore();
        const body = (await req.json()) as Omit<Pin, "id" | "createdAt">;
        const pin: Pin = {
          id: `pin:${Date.now()}`,
          title: body.title,
          url: body.url,
          source: body.source,
          summary: body.summary || "",
          cover: body.cover || "",
          by: store.settings.operatorName || "未署名",
          createdAt: new Date().toISOString(),
        };
        store.pins = [pin, ...store.pins.filter((p) => p.url !== pin.url)].slice(0, 80);
        await writeStore(store);
        return json({ ok: true, pin });
      }

      if (path.startsWith("/api/pins/") && req.method === "DELETE") {
        const id = decodeURIComponent(path.slice("/api/pins/".length));
        const store = await readStore();
        store.pins = store.pins.filter((p) => p.id !== id);
        await writeStore(store);
        return json({ ok: true });
      }

      if (path === "/api/tasks" && req.method === "POST") {
        const store = await readStore();
        const body = (await req.json()) as Partial<Task> & { id?: string };
        if (body.id) {
          store.tasks = store.tasks.map((t) => {
            if (t.id !== body.id) return t;
            const next = { ...t, lastMovedAt: new Date().toISOString() };
            if (body.stage) next.stage = body.stage;
            if (body.note !== undefined) next.note = body.note;
            if (body.verdict) {
              next.verdict = body.verdict;
              if (body.verdict === "follow") next.stage = next.stage === "judge" ? "adopted" : next.stage;
              if (body.verdict === "skip") next.stage = "skipped";
              if (body.verdict === "need_evidence") next.stage = "need_evidence";
            }
            if (body.selectedIndex !== undefined) next.selectedIndex = body.selectedIndex;
            if (body.format) next.format = body.format;
            if (typeof body.selectedIndex === "number" && next.topicIdeas[body.selectedIndex]) {
              next.title = next.topicIdeas[body.selectedIndex].title;
            }
            return next;
          });
          await writeStore(store);
          return json({ ok: true, task: store.tasks.find((t) => t.id === body.id) });
        }
        const task: Task = {
          ...blankTask(),
          id: `task:${Date.now()}`,
          title: body.title || "未命名选题",
          stage: "judge",
          pinId: body.pinId || "",
          note: body.note || "",
          fromTitle: body.fromTitle || "",
          by: store.settings.operatorName || "未署名",
          lastMovedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        store.tasks = [task, ...store.tasks];
        await writeStore(store);
        return json({ ok: true, task });
      }

      if (path === "/api/topics" && req.method === "POST") {
        const store = await readStore();
        const body = (await req.json()) as {
          title?: string;
          url?: string;
          source?: string;
          summary?: string;
          cover?: string;
        };
        if (!body.title) return json({ ok: false, error: "没有标题，做不成选题" }, 400);
        const pin: Pin = {
          id: `pin:${Date.now()}`,
          title: body.title,
          url: body.url || "",
          source: body.source || "",
          summary: body.summary || "",
          cover: body.cover || "",
          by: store.settings.operatorName || "未署名",
          createdAt: new Date().toISOString(),
        };
        if (pin.url) store.pins = [pin, ...store.pins.filter((p) => p.url !== pin.url)].slice(0, 80);

        const sit = situationOf(store.settings);
        const llm = llmOf(store.settings);
        const signal = {
          title: body.title,
          url: body.url || "",
          source: body.source || "",
          summary: body.summary || "",
          cover: body.cover || "",
        };
        const priorTitles = store.tasks.flatMap((t) => t.topicIdeas.map((i) => i.title)).slice(0, 20);
        let briefError = "";
        let brief = {
          noSignal: false,
          noSignalReason: "",
          followReason: "",
          verdictHint: "follow" as const,
          topicIdeas: [] as TopicIdea[],
          evidenceLimitations: [] as string[],
          scan: { ...EMPTY_SCAN },
          goldLine: "",
        };
        if (!llm.configured) {
          briefError = "还没有模型密钥。去设置 → 大模型里贴 API Key。没有密钥不会编假题。";
          brief.noSignal = true;
          brief.noSignalReason = briefError;
        } else {
          try {
            brief = await generateBrief({
              apiKey: llm.apiKey,
              model: llm.model,
              base: llm.base,
              situation: sit,
              signal,
              priorTitles,
            });
          } catch (err) {
            briefError = err instanceof Error ? err.message : "选题生成失败";
            brief.noSignal = true;
            brief.noSignalReason = briefError;
          }
        }
        const picked = brief.topicIdeas[0];
        const task: Task = {
          ...blankTask(),
          id: `task:${Date.now()}`,
          title: picked?.title || body.title,
          stage: brief.noSignal ? "judge" : "judge",
          pinId: pin.url ? pin.id : "",
          fromTitle: body.title,
          by: store.settings.operatorName || "未署名",
          lastMovedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          signal,
          format: sit.formats[0] || "short_video",
          topicIdeas: brief.topicIdeas,
          selectedIndex: brief.topicIdeas.length ? 0 : null,
          noSignal: brief.noSignal,
          noSignalReason: brief.noSignalReason,
          followReason: brief.followReason,
          evidence: { limitations: brief.evidenceLimitations, collectedAt: new Date().toISOString() },
          error: briefError,
          scan: brief.scan || { ...EMPTY_SCAN },
          goldLine: brief.goldLine || "",
        };
        store.tasks = [task, ...store.tasks];
        await writeStore(store);
        return json({
          ok: !briefError,
          error: briefError,
          task,
          situationFilled: Boolean(sit.niche || sit.persona || sit.audience),
        });
      }

      if (path.startsWith("/api/topics/") && path.endsWith("/draft") && req.method === "POST") {
        const id = decodeURIComponent(path.slice("/api/topics/".length, -"/draft".length).replace(/\/$/, ""));
        const store = await readStore();
        const task = store.tasks.find((t) => t.id === id);
        if (!task) return json({ ok: false, error: "找不到这条选题" }, 404);
        const body = (await req.json().catch(() => ({}))) as { format?: ContentFormat };
        const format = body.format || task.format || "short_video";
        const idea =
          (typeof task.selectedIndex === "number" ? task.topicIdeas[task.selectedIndex] : null) ||
          task.topicIdeas[0];
        if (!idea) return json({ ok: false, error: "还没有可拍的题。先判断跟不跟。" }, 400);
        const llm = llmOf(store.settings);
        if (!llm.configured) {
          return json({ ok: false, error: "还没有模型密钥。去设置里的大模型一栏贴 API Key。" }, 400);
        }
        try {
          const draft = await generateDraft({
            apiKey: llm.apiKey,
            model: llm.model,
            base: llm.base,
            situation: situationOf(store.settings),
            signal: task.signal,
            idea,
            format,
          });
          store.tasks = store.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  format,
                  drafts: { ...t.drafts, [format]: draft },
                  stage: t.stage === "judge" || t.stage === "adopted" ? "making" : t.stage,
                  lastMovedAt: new Date().toISOString(),
                  error: "",
                }
              : t,
          );
          await writeStore(store);
          return json({ ok: true, task: store.tasks.find((t) => t.id === id) });
        } catch (err) {
          const message = err instanceof Error ? err.message : "拍法和稿生成失败";
          return json({ ok: false, error: message }, 500);
        }
      }

      if (path.startsWith("/api/topics/") && req.method === "GET") {
        const id = decodeURIComponent(path.slice("/api/topics/".length));
        const store = await readStore();
        const task = store.tasks.find((t) => t.id === id);
        if (!task) return json({ ok: false, error: "找不到这条选题" }, 404);
        return json({ ok: true, task, settings: publicSettings(store.settings) });
      }

      if (path === "/api/llm/models" && req.method === "POST") {
        const store = await readStore();
        const body = (await req.json().catch(() => ({}))) as { baseUrl?: string; apiKey?: string };
        const llm = llmOf(store.settings, { apiKey: body.apiKey, baseUrl: body.baseUrl });
        if (!llm.configured) return json({ ok: false, error: "先填 API Key", models: FALLBACK_MODELS }, 400);
        const listed = await listRemoteModels(llm.apiKey, llm.base);
        store.settings.llmBaseUrl = llm.base;
        store.settings.llmModels = listed.models;
        if (!listed.models.some((m) => m.id === store.settings.llmModel) && listed.models[0]) {
          const chat = listed.models.find((m) => m.kind === "chat");
          if (chat) store.settings.llmModel = chat.id;
        }
        await writeStore(store);
        return json({
          ok: listed.ok,
          error: listed.error,
          models: listed.models,
          model: store.settings.llmModel,
          hint: listed.ok ? `已同步 ${listed.models.length} 个模型` : listed.error,
        });
      }

      if (path === "/api/llm/ping" && req.method === "POST") {
        const store = await readStore();
        const body = (await req.json().catch(() => ({}))) as { baseUrl?: string; apiKey?: string; model?: string };
        const llm = llmOf(store.settings, { apiKey: body.apiKey, baseUrl: body.baseUrl, model: body.model });
        if (!llm.configured) return json({ ok: false, hint: "先填 API Key" }, 400);
        const result = await pingLlm(llm.apiKey, llm.base, llm.model);
        if (result.ok) {
          store.settings.llmBaseUrl = llm.base;
          store.settings.llmModel = llm.model;
          await writeStore(store);
        }
        return json(result);
      }

      if (!path.startsWith("/api/")) return staticFile(path);
      return json({ error: "unknown" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "server error";
      return json({ ok: false, error: message }, 500);
    }
  },
});

console.log(`OSSA Media OS  http://127.0.0.1:${PORT}`);
