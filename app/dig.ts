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
};

export type RawHit = {
  title: string;
  url: string;
  publishedAt?: string;
  sourceName?: string;
  summary?: string;
  imageUrl?: string;
};

const KIND_Y: Record<CardKind, number> = {
  news: 88,
  post: 292,
  meme: 496,
  image: 496,
  derivative: 700,
  note: 904,
};

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

export function unescapeXml(text: string): string {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRssItems(xml: string): RawHit[] {
  const blocks = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const out: RawHit[] = [];
  for (const block of blocks) {
    const title = unescapeXml(pickTag(block, "title"));
    const url = unescapeXml(pickTag(block, "link") || pickTag(block, "guid"));
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;
    const publishedAt = parseTime(pickTag(block, "pubDate") || pickTag(block, "dc:date"));
    const sourceName =
      unescapeXml(pickTag(block, "source")) ||
      titleSource(title) ||
      hostName(url);
    const summary = unescapeXml(pickTag(block, "description")).slice(0, 180);
    const imageUrl = mediaUrl(block);
    out.push({ title: stripSourceSuffix(title), url, publishedAt, sourceName, summary, imageUrl });
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

function titleSource(title: string): string {
  const m = title.match(/\s[-–—|]\s*([^-–—|]{2,24})$/);
  return m ? m[1].trim() : "";
}

function stripSourceSuffix(title: string): string {
  return title.replace(/\s*[-–—|]\s*[^-–—|]{2,24}$/, "").replace(/[-–—]\s*$/, "").trim() || title;
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
    cards.push({
      id,
      kind: classifyKind(hit),
      title: hit.title.slice(0, 80),
      url,
      sourceName: hit.sourceName || hostName(url) || "公开网页",
      publishedAt: hit.publishedAt || "",
      summary: (hit.summary || hit.title).slice(0, 160),
      keywords: keywordsOf(hit.title, query),
      imageUrl: hit.imageUrl || "",
      stance: classifyStance(hit),
      x: 0,
      y: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      isNew: true,
    });
  }
  return cards;
}

export function layoutCards(cards: EvidenceCard[]): EvidenceCard[] {
  const dated = cards
    .map((c, i) => ({ i, t: Date.parse(c.publishedAt) || Date.parse(c.firstSeenAt) || i }))
    .sort((a, b) => a.t - b.t);
  const times = dated.map((d) => d.t);
  const minT = times[0] || Date.now();
  const maxT = times[times.length - 1] || minT;
  const span = Math.max(maxT - minT, 36 * 3600 * 1000);
  const kindIndex: Record<string, number> = {};
  return cards.map((card) => {
    if (card.x || card.y) return card;
    const t = Date.parse(card.publishedAt) || Date.parse(card.firstSeenAt) || minT;
    const idx = kindIndex[card.kind] || 0;
    kindIndex[card.kind] = idx + 1;
    return {
      ...card,
      x: Math.round(72 + ((t - minT) / span) * 1880 + (idx % 3) * 18),
      y: KIND_Y[card.kind] + Math.floor(idx / 8) * 168 + (idx % 2) * 12,
    };
  });
}

export function inferLinks(cards: EvidenceCard[]): EvidenceLink[] {
  const sorted = [...cards].filter((c) => c.kind !== "note").sort((a, b) => {
    const ta = Date.parse(a.publishedAt) || Date.parse(a.firstSeenAt) || 0;
    const tb = Date.parse(b.publishedAt) || Date.parse(b.firstSeenAt) || 0;
    return ta - tb;
  });
  const first = sorted[0];
  if (!first) return [];
  const links: EvidenceLink[] = [];
  const used = new Set<string>();
  const add = (from: EvidenceCard, to: EvidenceCard, relation: LinkRelation) => {
    if (from.id === to.id) return;
    const key = `${from.id}>${to.id}:${relation}`;
    if (used.has(key) || links.length >= 24) return;
    used.add(key);
    links.push({ id: `ln:${from.id}:${to.id}:${relation}`, fromId: from.id, toId: to.id, relation });
  };
  for (const card of sorted.slice(1)) {
    if (card.stance === "当事人回应") add(card, first, "quote");
    else if (card.kind === "meme" || card.kind === "derivative" || card.stance === "二创") add(card, first, "remix");
    else if (/起诉|律师|彩礼|转账|代孕|代币|meme/.test(`${card.title}${card.summary}`)) add(card, first, "business");
    else if (card.kind === "news") add(card, first, "report");
  }
  return links;
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
