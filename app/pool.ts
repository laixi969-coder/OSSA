export type FieldOrigin = "hot" | "talk" | "case" | "node" | "evergreen" | "custom" | "news" | "tech";

export type PoolItem = {
  title: string;
  summary?: string;
  why?: string;
  execOpen?: string;
  origin?: FieldOrigin;
  originLabel?: string;
  line?: string;
  [key: string]: unknown;
};

export const ORIGIN_LABEL: Record<FieldOrigin, string> = {
  hot: "热搜",
  talk: "讨论",
  case: "案例",
  node: "节点",
  evergreen: "常青",
  custom: "自己说的",
  news: "快报",
  tech: "科技",
};

export const FIELD_LINE: Record<FieldOrigin, string> = {
  hot: "场 · 热搜",
  talk: "场 · 讨论",
  case: "场 · 案例",
  node: "场 · 节点",
  evergreen: "开工 · 常青",
  custom: "自己说的",
  news: "场 · 快报",
  tech: "场 · 科技",
};

const EVERGREEN: Array<{ title: string; open: string; do: string; why: string }> = [
  { title: "今天我看见的这件事，别人不在场", open: "我在现场。下面只讲我看见的，不讲热搜授权过的。", do: "现场", why: "没流量也能做，靠你看见了什么" },
  { title: "那个被问了十遍的问题，今天一次答完", open: "这个问题我被问了十遍。今天只答一次，你听完就能用。", do: "答疑", why: "搜索和提问比热搜更稳" },
  { title: "我把一次做砸的事写成对照", open: "上次我把这件事做砸了。对照今天，代价是具体的。", do: "复盘", why: "对照比口号有画面" },
  { title: "行业人人都这么说，我反过来讲", open: "这句默认的话我先不信。反过来讲，经不经得起追问你自己听。", do: "反常识", why: "反转本身就是切口" },
  { title: "别人刚做成的，我只拆这一处", open: "我不跟热度。别人做成了，我只拆能搬走的那一处结构。", do: "拆方法", why: "方法可迁移，热度不可复制" },
  { title: "我改一个变量，把前后结果拍给你看", open: "同一件事，我只改一个变量。过程比结论更可跟。", do: "实验", why: "过程比结论更可跟" },
  { title: "你会的那一步，我拆成外人能跟的", open: "卡在门口的人不是笨，是没人把这一步拆开。我拆给你。", do: "教程", why: "步骤本身就是内容" },
  { title: "客户原话说完，我只往下扩这一句", open: "这句话不是我编的。原话在先，我只往下扩你听得懂的部分。", do: "原话", why: "证据在对方嘴里" },
  { title: "写给三年前的自己：最容易走错的那一步", open: "三年前的我，最容易在这一步走错。今天只写这一步，和一个补救。", do: "书信", why: "时间差就是戏剧" },
  { title: "同一件事，我写成短视频、小红书、公众号三版", open: "不是三个身份。同一件事，三种格式，你对号拿走。", do: "改写", why: "格式跟这份活走，不跟人设走" },
];

export function clampFieldWant(n: number): number {
  const raw = Number(n);
  if (raw >= 3 && raw <= 5) return raw;
  return 5;
}

export function skipAsHomeHot(title: string) {
  return /遇难|死亡|地震|泥石流|空难|溃坝|爆炸|伤亡|受灾|救援|灾区|山洪|洪水|杀害|杀人|遇害|身亡|事故|触电|人祸|招聘会|遗体|火化/.test(
    title,
  );
}

export function fieldCopy(
  origin: FieldOrigin,
  item: { title?: string; summary?: string; why?: string; execOpen?: string },
): { title: string; open: string; line: string; why: string } {
  const title = String(item.title || "").trim();
  if (origin === "evergreen") {
    const open = String(item.execOpen || item.why || "").trim();
    return { title, open, line: FIELD_LINE.evergreen, why: String(item.why || open) };
  }
  if (origin === "hot") {
    const open = "现在有讨论量。大家都在写，写法多半是复述这句标题。进场后再换刀，热搜不是选题。";
    return { title, open, line: FIELD_LINE.hot, why: open };
  }
  if (origin === "talk") {
    const open = "这是正在发生的讨论。大家都在答原题。进场后换一个主语再答。";
    return { title, open, line: FIELD_LINE.talk, why: open };
  }
  if (origin === "case") {
    const open = "成品正在被转。大家都在拆结果。进场后只搬走能用的那一处结构。";
    return { title, open, line: FIELD_LINE.case, why: open };
  }
  if (origin === "node") {
    const open =
      String(item.why || item.summary || "").trim() ||
      "日子到了会挤成一场讨论。提前占位，不跟当天的人挤同一句话。";
    return { title, open, line: FIELD_LINE.node, why: open };
  }
  const open = String(item.summary || item.why || title).trim();
  return { title, open, line: FIELD_LINE[origin] || "场", why: String(item.why || open) };
}

export function pickEvergreen(n: number, batch = 0): PoolItem[] {
  const day = Math.floor(Date.now() / 86400000);
  const start = (day + batch * 2) % EVERGREEN.length;
  const out: PoolItem[] = [];
  const used = new Set<string>();
  for (let i = 0; out.length < n && i < EVERGREEN.length * 2; i++) {
    const row = EVERGREEN[(start + i) % EVERGREEN.length];
    if (used.has(row.title)) continue;
    used.add(row.title);
    out.push({
      title: row.title,
      summary: row.open,
      why: row.why,
      do: row.do,
      execOpen: row.open,
      origin: "evergreen",
      source: "常青",
    });
  }
  return out;
}

export function mixFields(input: {
  hot: PoolItem[];
  talk: PoolItem[];
  cases: PoolItem[];
  nodes?: PoolItem[];
  want: number;
  batch?: number;
}): PoolItem[] {
  const want = clampFieldWant(input.want);
  const batch = Math.max(0, Number(input.batch || 0) || 0);
  const used = new Set<string>();
  const out: PoolItem[] = [];
  const keyOf = (title: string) => title.replace(/\s+/g, "").slice(0, 22);

  const take = (item: PoolItem | undefined, origin: FieldOrigin) => {
    if (!item?.title) return;
    const key = keyOf(item.title);
    if (used.has(key)) return;
    used.add(key);
    const copy = fieldCopy(origin, item);
    out.push({
      ...item,
      id: item.id || `${origin}:${copy.title}`,
      origin,
      originLabel: ORIGIN_LABEL[origin],
      title: copy.title,
      execOpen: copy.open,
      why: copy.why,
      line: copy.line,
      summary: item.summary || item.title,
    });
  };

  const pools: Array<{ origin: FieldOrigin; items: PoolItem[]; cap: number }> = [
    { origin: "hot", items: input.hot || [], cap: 2 },
    { origin: "talk", items: input.talk || [], cap: 2 },
    { origin: "case", items: input.cases || [], cap: 2 },
  ];

  let round = 0;
  while (out.length < want && round < 8) {
    for (const pool of pools) {
      const taken = out.filter((x) => x.origin === pool.origin).length;
      if (taken >= pool.cap) continue;
      take(pool.items[round + batch], pool.origin);
      if (out.length >= want) break;
    }
    round += 1;
  }

  const nodes = input.nodes || [];
  let nodeAdded = 0;
  for (let i = batch; i < nodes.length && nodeAdded < 2; i++) {
    const before = out.length;
    take(nodes[i], "node");
    if (out.length > before) nodeAdded += 1;
  }

  if (out.length < 3) {
    pickEvergreen(5, batch).forEach((item) => {
      if (out.length >= 3) return;
      take(item, "evergreen");
    });
  }

  return out;
}
