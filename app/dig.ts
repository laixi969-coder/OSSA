export type CardKind = "news" | "post" | "meme" | "image" | "note" | "derivative";
export type Stance = "报道" | "单方陈述" | "当事人回应" | "二创";
export type LinkRelation = "report" | "quote" | "repost" | "remix" | "business";

export type EvidenceCard = {
  id: string;
  kind: CardKind;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string;
  summary: string;
  keywords: string[];
  imageUrl: string;
  stance: Stance;
  x: number;
  y: number;
  firstSeenAt: string;
  lastSeenAt: string;
  isNew?: boolean;
  stale?: boolean;
  /** 用户手拖过位置。整墙重排时钉住不动，其余卡绕开它。 */
  pinned?: boolean;
};

export type EvidenceLink = {
  id: string;
  fromId: string;
  toId: string;
  relation: LinkRelation;
};

export type Dig = {
  id: string;
  query: string;
  queryKey: string;
  status: "idle" | "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string;
  fetchedAt: string;
  cardCount: number;
  linkCount: number;
  newCount: number;
  earliestAt: string;
  newestAt: string;
  cards: EvidenceCard[];
  links: EvidenceLink[];
  error: string;
  gaps: string[];
  /** 画布世界尺寸，前端按它撑开世界，不再写死 2400×1400。 */
  bounds?: { w: number; h: number };
};

export type RawHit = {
  title: string;
  url: string;
  publishedAt?: string;
  sourceName?: string;
  summary?: string;
  imageUrl?: string;
};

// 卡片宽度按种类；泳道高度按道（meme 和 image 同道）。
// 前端渲染用同一组数（app/public/app.js · CARD_METRICS），改一处要改两边。
const LANE: Record<CardKind, { w: number }> = {
  news: { w: 268 },
  post: { w: 236 },
  meme: { w: 200 },
  image: { w: 200 },
  derivative: { w: 200 },
  note: { w: 180 },
};
const LANE_OF: Record<CardKind, string> = {
  news: "news",
  post: "post",
  meme: "visual",
  image: "visual",
  derivative: "derivative",
  note: "note",
};
// 高度取自实测：文字行数被 CSS 截断后卡片就这么高，改了截断规则要跟着改。
const LANE_GEO: Record<string, { h: number }> = {
  news: { h: 250 },
  post: { h: 220 },
  visual: { h: 258 },
  derivative: { h: 226 },
  note: { h: 190 },
};
const LANE_ORDER = ["news", "post", "visual", "derivative", "note"];
const WALL_X0 = 88;
const WALL_SPAN = 2400;
const COL_GAP = 28;
const ROW_GAP = 20;
const LANE_PAD = 44;

function timeOf(c: EvidenceCard): number {
  return Date.parse(c.publishedAt) || Date.parse(c.firstSeenAt) || 0;
}

export function normalizeQuery(raw: string): string {
  return String(raw || "").replace(/\s+/g, " ").trim();
}

export function queryKey(raw: string): string {
  return normalizeQuery(raw).toLowerCase();
}

export function canonicalUrl(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    u.hash = "";
    [...u.searchParams.keys()].forEach((k) => {
      if (/^(utm_|spm|oc|ved|usg|clid)/i.test(k)) u.searchParams.delete(k);
    });
    u.hostname = u.hostname.toLowerCase();
    let out = u.toString();
    if (out.endsWith("/") && u.pathname === "/") out = out.slice(0, -1);
    return out;
  } catch {
    return s;
  }
}

export function cardIdFromUrl(url: string): string {
  const key = canonicalUrl(url) || url;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `ev:${(h >>> 0).toString(16)}`;
}

/** 只解实体。U+00A0 保留不动——「&nbsp;&nbsp;BBC」这种尾巴要靠它才认得出。 */
function decodeEntities(text: string): string {
  let t = String(text || "");
  // 双重 / 三重编码保护：反复解到干净（少数 RSS 会出现 &amp;amp; 这种）。
  for (let i = 0; i < 3 && /&[#\w]+;/.test(t); i++) {
    t = t
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, "\u00A0")
      .replace(/&#160;/g, "\u00A0")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&amp;/g, "&")
      .replace(/<[^>]+>/g, " ");
  }
  return t.replace(/[ \t\r\n\f\v]+/g, " ").trim();
}

/** 收干空白：U+00A0 一并归成普通空格，不留不换行空格给排版添乱。 */
function flatten(t: string): string {
  return t.replace(/[\s\u00A0]+/g, " ").trim();
}

/** 解码 + 剥掉尾巴上的来源名。界面上要显示的文本都走这个。 */
export function unescapeXml(text: string): string {
  return flatten(stripSourceTail(decodeEntities(text)));
}

/**
 * 一次拿到「干净的标题」和「尾巴上的来源名」。
 * 顺序要紧：来源名必须在剥尾巴之前取，剥完就取不到了。
 */
export function splitTitleSource(raw: string): { title: string; source: string } {
  const decoded = decodeEntities(raw);
  return { title: flatten(stripSourceTail(decoded)), source: titleSource(decoded) };
}

export function parseRssItems(xml: string): RawHit[] {
  const blocks = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const out: RawHit[] = [];
  for (const block of blocks) {
    const ts = splitTitleSource(pickTag(block, "title"));
    const url = unescapeXml(pickTag(block, "link") || pickTag(block, "guid"));
    if (!ts.title || !url || !/^https?:\/\//i.test(url)) continue;
    const publishedAt = parseTime(pickTag(block, "pubDate") || pickTag(block, "dc:date"));
    const sourceName = unescapeXml(pickTag(block, "source")) || ts.source || hostName(url);
    const summary = unescapeXml(pickTag(block, "description")).slice(0, 180);
    const imageUrl = mediaUrl(block);
    out.push({ title: ts.title, url, publishedAt, sourceName, summary, imageUrl });
  }
  return out;
}

function pickTag(block: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  return block.match(re)?.[1] || "";
}

function mediaUrl(block: string): string {
  const m =
    block.match(/url=["'](https?:\/\/[^"']+)["']/i) ||
    block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  return m?.[1] || "";
}

/** 空白 = 普通空白、U+00A0，以及还没解码的 &nbsp; / &#160; 字面量。 */
const WS = "(?:\\s|&nbsp;|&#160;)";
/** 尾巴上的来源名：两个以上空白 + 2–20 字的短词。BBC / VOA / FT 这类只靠空白隔，没有分隔符。 */
const TITLE_TAIL_RE = new RegExp(`${WS}{2,}([\\w·&.\\u4e00-\\u9fff]{2,20})\\s*$`, "i");

function titleSource(title: string): string {
  // "标题 - 观察者网" / "标题 | 凤凰网" / "标题&nbsp;&nbsp;BBC"
  const m = title.match(/\s[-–—|]\s*([^-–—|]{2,24})$/) || title.match(TITLE_TAIL_RE);
  return m ? m[1].trim() : "";
}

/**
 * 剥掉标题尾巴上的来源名。
 * 两类写法：带分隔符的「- 观察者网 / | 凤凰网」，和只靠空白隔开的「&nbsp;&nbsp;BBC」。
 */
export function stripSourceTail(title: string): string {
  const t = String(title || "");
  return (
    t
      .replace(/\s*[-–—|]\s*[^-–—|]{2,24}\s*$/, "")
      .replace(TITLE_TAIL_RE, "")
      .replace(/[-–—]\s*$/, "")
      .trim() || t.trim()
  );
}

function hostName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function parseTime(raw: string): string {
  const t = Date.parse(String(raw || "").trim());
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString();
}

export function classifyKind(hit: RawHit): CardKind {
  const hay = `${hit.title} ${hit.url} ${hit.sourceName || ""}`.toLowerCase();
  if (/表情包|梗图|meme/.test(hay)) return "meme";
  if (/代币|二创|同人|恶搞|鬼畜|meme币|memecoin/.test(hay)) return "derivative";
  if (/weibo|zhihu|xiaohongshu|douyin|twitter|x\.com|facebook/.test(hay)) return "post";
  if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(hit.url)) return "image";
  return "news";
}

export function classifyStance(hit: RawHit): Stance {
  const hay = `${hit.title} ${hit.summary || ""}`;
  if (/声明|回应|工作室|不会为钱/.test(hay)) return "当事人回应";
  if (/长文|自述|我的女友|纯属虚构|亲笔/.test(hay)) return "单方陈述";
  if (/表情包|二创|梗|代币|恶搞/.test(hay)) return "二创";
  return "报道";
}

export function keywordsOf(title: string, query: string): string[] {
  const extra = normalizeQuery(query).split(" ").filter((w) => w.length >= 2);
  const fromTitle = title.match(/[\u4e00-\u9fff]{2,6}|[A-Za-z]{3,12}/g) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of [...extra, ...fromTitle]) {
    const k = w.toLowerCase();
    if (seen.has(k) || out.length >= 6) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

export function hitsToCards(hits: RawHit[], query: string, now = new Date().toISOString()): EvidenceCard[] {
  const used = new Set<string>();
  const cards: EvidenceCard[] = [];
  for (const hit of hits) {
    const url = canonicalUrl(hit.url);
    if (!url || !hit.title) continue;
    const id = cardIdFromUrl(url);
    if (used.has(id)) continue;
    used.add(id);
    // 所有入口（RSS / Google News / Bing / 社交）的标题都在这里过一遍：
    // 先剥尾巴上的来源名，再定来源、关键词。来源名丢了就用域名兜底。
    const ts = splitTitleSource(hit.title);
    const title = ts.title.slice(0, 80);
    cards.push({
      id,
      kind: classifyKind({ ...hit, title }),
      title,
      url,
      sourceName: hit.sourceName || ts.source || hostName(url) || "公开网页",
      publishedAt: hit.publishedAt || "",
      summary: stripSourceTail(hit.summary || hit.title).slice(0, 160),
      keywords: keywordsOf(title, query),
      imageUrl: hit.imageUrl || "",
      stance: classifyStance({ ...hit, title }),
      x: 0,
      y: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      isNew: true,
    });
  }
  return cards;
}

/**
 * 版面：横着是时间，竖着分道。
 * 一道一行放不下就换行；每一行内部按该行的时间跨度等比铺开，
 * 行底另有一条日期刻度说明这一行的真实起止。
 *
 * 关键：整墙重排，不是只排新卡。用户拖过的卡（pinned）留在原地，
 * 其余全部重排；最后 sweep 一遍，任何两块相交就整体下推，保证零重叠。
 */
export function layoutCards(cards: EvidenceCard[]): EvidenceCard[] {
  const widthOf = (c: EvidenceCard) => (LANE[c.kind] || LANE.news).w;
  const pinned = cards.filter((c) => c.pinned && (c.x || c.y));
  const free = cards.filter((c) => !(c.pinned && (c.x || c.y))).sort((a, b) => timeOf(a) - timeOf(b));

  // 1) 按道分组，道内按时间切行
  const lanes = new Map<string, EvidenceCard[]>();
  for (const card of free) {
    const lane = LANE_OF[card.kind] || "news";
    const list = lanes.get(lane) || [];
    list.push(card);
    lanes.set(lane, list);
  }

  const blocks: EvidenceCard[][] = pinned.map((c) => [c]);
  let y = 96;
  for (const lane of LANE_ORDER) {
    const list = lanes.get(lane);
    if (!list || !list.length) continue;
    const step = (LANE_GEO[lane] || LANE_GEO.news).h + ROW_GAP;
    const rows: EvidenceCard[][] = [];
    let row: EvidenceCard[] = [];
    let used = 0;
    for (const card of list) {
      const w = widthOf(card);
      const need = row.length ? used + COL_GAP + w : w;
      if (row.length && need > WALL_SPAN) {
        rows.push(row);
        row = [];
        used = 0;
      }
      row.push(card);
      used = row.length === 1 ? w : used + COL_GAP + w;
    }
    if (row.length) rows.push(row);
    rows.forEach((r, i) => {
      placeRow(r, WALL_SPAN);
      r.forEach((c) => {
        c.y = y + i * step;
      });
      blocks.push(r);
    });
    y += rows.length * step + LANE_PAD;
  }

  // 2) sweep：块按 y 从上往下走，撞上就整体下推，直到互不重叠
  sweepDown(blocks);
  return cards;
}

/** 块 = 一整行（或一张 pinned 卡）。整块一起挪，行内相对位置不乱。 */
function sweepDown(blocks: EvidenceCard[][]): void {
  const rectOf = (c: EvidenceCard) => ({
    x: c.x,
    y: c.y,
    w: (LANE[c.kind] || LANE.news).w,
    h: (LANE_GEO[LANE_OF[c.kind] || "news"] || LANE_GEO.news).h,
  });
  const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const order = [...blocks].sort((p, q) => Math.min(...p.map((c) => c.y)) - Math.min(...q.map((c) => c.y)));
  const placed: Rect[] = [];
  for (const block of order) {
    let guard = 0;
    while (guard++ < 200) {
      const rects = block.map(rectOf);
      const clash = placed.find((p) => rects.some((r) => hits(r, p)));
      if (!clash) break;
      const top = Math.min(...block.map((c) => c.y));
      const push = clash.y + clash.h + ROW_GAP - top;
      block.forEach((c) => {
        c.y += Math.max(push, 8);
      });
    }
    block.forEach((c) => placed.push(rectOf(c)));
  }
}

type Rect = { x: number; y: number; w: number; h: number };

/** 画布世界尺寸，前端按它撑开世界，不再写死。 */
export function wallBounds(cards: EvidenceCard[]): { w: number; h: number } {
  let w = WALL_X0 + WALL_SPAN + 120;
  let h = 320;
  for (const card of cards) {
    const lane = LANE_OF[card.kind] || "news";
    w = Math.max(w, card.x + (LANE[card.kind] || LANE.news).w + 80);
    h = Math.max(h, card.y + (LANE_GEO[lane] || LANE_GEO.news).h + 80);
  }
  return { w: Math.round(w), h: Math.round(h) };
}

/**
 * 一行之内：先按最小间距铺满，再把剩下的余量按「相邻两卡的时间间隔」分配出去。
 * 时间挨得近的就挨得紧，隔得久的就拉得开——疏密是时间本身，不是随手排的。
 * 这样首张左对齐、末张右边缘收在墙宽上，任何时候都不超出、不互相压住。
 */
function placeRow(row: EvidenceCard[], spanWidth: number): void {
  if (!row.length) return;
  const widthOf = (c: EvidenceCard) => (LANE[c.kind] || LANE.news).w;
  const n = row.length;
  const minTotal = row.reduce((s, c) => s + widthOf(c), 0) + (n - 1) * COL_GAP;
  const slack = Math.max(spanWidth - minTotal, 0);

  const ts = row.map(timeOf);
  const gaps: number[] = [];
  for (let i = 1; i < n; i++) gaps.push(Math.max(ts[i] - ts[i - 1], 0));
  const gapSum = gaps.reduce((a, b) => a + b, 0);

  const xs = [WALL_X0];
  let x = WALL_X0;
  for (let i = 1; i < n; i++) {
    const share = gapSum > 0 ? (gaps[i - 1] / gapSum) * slack : slack / (n - 1);
    x += widthOf(row[i - 1]) + COL_GAP + share;
    xs.push(x);
  }
  // 取整后仍守住最小间距，别让舍入把两张卡蹭在一起。
  for (let i = 0; i < n; i++) {
    const floorX = i === 0 ? WALL_X0 : row[i - 1].x + widthOf(row[i - 1]) + COL_GAP;
    row[i].x = Math.round(Math.max(xs[i], floorX));
  }
}


const BUSINESS_RE = /起诉|律师|彩礼|转账|代孕|代币|索赔|赔偿|法院|判决|和解|meme/i;

/** 从时间上更早的卡里挑上游。同题优先、离得近优先。源头只做兜底，不再张张都连它。 */
function pickUpstream(
  earlier: EvidenceCard[],
  card: EvidenceCard,
  origin: EvidenceCard,
  outCount: Map<string, number>,
): EvidenceCard | null {
  const ct = timeOf(card);
  const mine = new Set(card.keywords || []);
  let best: EvidenceCard | null = null;
  let bestScore = -Infinity;
  for (const up of earlier) {
    if ((outCount.get(up.id) || 0) >= 6) continue;
    const theirs = new Set(up.keywords || []);
    let overlap = 0;
    for (const k of mine) if (theirs.has(k)) overlap += 1;
    const gapHours = Math.max(0, (ct - timeOf(up)) / 3600000);
    let score = overlap * 3 + (up.id === origin.id ? 1.5 : 0) - Math.min(gapHours / 72, 4);
    if (card.stance === "当事人回应" && up.stance === "单方陈述") score += 2.5;
    if ((card.kind === "meme" || card.kind === "derivative") && up.kind === "news") score += 1;
    if (up.sourceName && up.sourceName === card.sourceName) score -= 1;
    if (score > bestScore) {
      bestScore = score;
      best = up;
    }
  }
  return best || origin;
}

function sameStory(a: EvidenceCard, b: EvidenceCard): boolean {
  const A = new Set(a.keywords || []);
  const B = new Set(b.keywords || []);
  if (!A.size || !B.size) return false;
  let n = 0;
  for (const k of A) if (B.has(k)) n += 1;
  return n / Math.min(A.size, B.size) >= 0.6 && a.sourceName !== b.sourceName;
}

/**
 * 传播链，不是星形。from = 上游（更早）→ to = 下游（更晚），绳子方向就是传播方向。
 */
export function inferLinks(cards: EvidenceCard[]): EvidenceLink[] {
  const sorted = [...cards].filter((c) => c.kind !== "note").sort((a, b) => timeOf(a) - timeOf(b));
  if (sorted.length < 2) return [];
  const origin = sorted[0];
  const links: EvidenceLink[] = [];
  const seen = new Set<string>();
  const outCount = new Map<string, number>();

  const add = (from: EvidenceCard, to: EvidenceCard, relation: LinkRelation) => {
    if (!from || !to || from.id === to.id) return;
    const key = `${from.id}>${to.id}`;
    if (seen.has(key)) return;
    if ((outCount.get(from.id) || 0) >= 6) return;
    seen.add(key);
    outCount.set(from.id, (outCount.get(from.id) || 0) + 1);
    links.push({ id: `ln:${from.id}:${to.id}`, fromId: from.id, toId: to.id, relation });
  };

  for (let i = 1; i < sorted.length; i++) {
    const card = sorted[i];
    const upstream = pickUpstream(sorted.slice(0, i), card, origin, outCount);
    if (!upstream || upstream.id === card.id) continue;
    let relation: LinkRelation = "report";
    if (card.stance === "当事人回应") relation = "quote";
    else if (card.kind === "meme" || card.kind === "derivative" || card.stance === "二创") relation = "remix";
    else if (BUSINESS_RE.test(`${card.title}${card.summary}`)) relation = "business";
    else if (sameStory(card, upstream)) relation = "repost";
    add(upstream, card, relation);
    // 上游不是源头时再补一条到源头，让图是网不是纯树。
    if (upstream.id !== origin.id) add(origin, card, "report");
  }
  return links.slice(0, 60);
}

export function mergeDig(prev: Dig | null | undefined, incoming: EvidenceCard[], now = new Date().toISOString()): {
  cards: EvidenceCard[];
  newCount: number;
} {
  const oldMap = new Map((prev?.cards || []).map((c) => [c.id, c]));
  const seen = new Set<string>();
  const cards: EvidenceCard[] = [];
  let newCount = 0;
  for (const card of incoming) {
    const old = oldMap.get(card.id);
    seen.add(card.id);
    if (old) {
      cards.push({
        ...card,
        x: old.x,
        y: old.y,
        pinned: old.pinned,
        firstSeenAt: old.firstSeenAt || card.firstSeenAt,
        lastSeenAt: now,
        isNew: false,
        stale: false,
        summary: card.summary || old.summary,
        imageUrl: card.imageUrl || old.imageUrl,
      });
    } else {
      newCount += 1;
      cards.push({ ...card, isNew: true, stale: false, firstSeenAt: now, lastSeenAt: now, x: 0, y: 0 });
    }
  }
  for (const old of prev?.cards || []) {
    if (seen.has(old.id)) continue;
    cards.push({ ...old, isNew: false, stale: old.kind !== "note" });
  }
  return { cards: layoutCards(cards), newCount };
}

export function summarizeDig(query: string, cards: EvidenceCard[], links: EvidenceLink[], extra: Partial<Dig> = {}): Dig {
  const dated = cards.map((c) => c.publishedAt).filter(Boolean).sort();
  return {
    id: extra.id || `dig:${Date.now()}`,
    query: normalizeQuery(query),
    queryKey: queryKey(query),
    status: extra.status || "done",
    startedAt: extra.startedAt || new Date().toISOString(),
    finishedAt: extra.finishedAt || new Date().toISOString(),
    fetchedAt: extra.fetchedAt || new Date().toISOString(),
    cardCount: cards.length,
    linkCount: links.length,
    newCount: extra.newCount || cards.filter((c) => c.isNew).length,
    earliestAt: dated[0] || "",
    newestAt: dated[dated.length - 1] || "",
    cards,
    links,
    error: extra.error || "",
    gaps: extra.gaps || [],
    bounds: wallBounds(cards),
  };
}

export function queryTokens(query: string): string[] {
  return normalizeQuery(query)
    .split(/[\s,，、]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function hitMatchesQuery(title: string, query: string): boolean {
  const tokens = queryTokens(query);
  if (!tokens.length) return false;
  const hay = title.toLowerCase();
  return tokens.some((t) => hay.includes(t.toLowerCase()));
}

async function fetchText(url: string, timeout = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) OSSA-Dig/1.0",
        Accept: "application/rss+xml, application/xml, text/html, */*",
      },
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

export async function searchGoogleNews(query: string): Promise<RawHit[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  const xml = await fetchText(url);
  return parseRssItems(xml);
}

export async function searchBingNews(query: string): Promise<RawHit[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=zh-CN`;
  const xml = await fetchText(url);
  return parseRssItems(xml);
}

export async function collectHits(query: string, extras: RawHit[] = []): Promise<{ hits: RawHit[]; gaps: string[] }> {
  const gaps: string[] = [];
  const [google, bing] = await Promise.all([searchGoogleNews(query), searchBingNews(query)]);
  if (!google.length) gaps.push("新闻检索有一路没回来");
  const hits = [...google, ...bing, ...extras];
  const used = new Set<string>();
  const unique: RawHit[] = [];
  for (const hit of hits) {
    const key = canonicalUrl(hit.url) || hit.title;
    if (!key || used.has(key)) continue;
    used.add(key);
    unique.push(hit);
  }
  return { hits: unique.slice(0, 36), gaps };
}

export async function runDig(query: string, prev?: Dig | null, extras: RawHit[] = []): Promise<Dig> {
  const q = normalizeQuery(query);
  const startedAt = new Date().toISOString();
  if (!q) {
    return summarizeDig("", [], [], {
      status: "failed",
      startedAt,
      error: "先写一个公开事件",
      gaps: [],
    });
  }
  const { hits, gaps } = await collectHits(q, extras);
  const incoming = hitsToCards(hits, q, startedAt);
  const merged = mergeDig(prev, incoming, startedAt);
  const links = inferLinks(merged.cards);
  const missingKinds = (["news", "post", "meme", "derivative"] as CardKind[]).filter(
    (k) => !merged.cards.some((c) => c.kind === k),
  );
  const kindGaps = missingKinds.map((k) => {
    if (k === "news") return "这一轮新闻不够";
    if (k === "post") return "公开社交原帖这一轮没搜到";
    if (k === "meme") return "表情包/热梗这一轮没搜到";
    return "衍生品这一轮没搜到";
  });
  return summarizeDig(q, merged.cards, links, {
    id: prev?.id || `dig:${Date.now()}`,
    status: merged.cards.length ? "done" : "failed",
    startedAt,
    newCount: prev ? merged.newCount : merged.cards.length,
    error: merged.cards.length ? "" : "公开源这一轮没搜到。换个更具体的事件名再试。",
    gaps: [...gaps, ...kindGaps],
  });
}
