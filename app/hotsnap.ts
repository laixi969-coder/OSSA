/**
 * 热榜历史快照：给 60s 的「此刻榜」补上回溯能力。
 * 每 30 分钟把各平台热榜整榜追加到 data/hotsnap/YYYY-MM-DD.jsonl（UTC 日期），
 * 检索时按查询词聚合出首现 / 末现 / 最好位次。只存观察记录，不存派生状态，
 * 追加式写入，坏了顶多丢当天半截。
 *
 * 快照是全实例共享的（热榜本来就是公共货架），不分工作区。
 */
import { appendFile, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { hitMatchesQuery } from "./dig";

const ROOT = join(import.meta.dir, "..");
export const HOT_DIR = join(ROOT, "data", "hotsnap");
export const HOT_RETAIN_DAYS = 30;

export type HotItem = { rank: number; title: string; url: string; hot?: number };

/** 检索结果：一个词条在这段时间里的完整注意力轨迹（摘要用）。 */
export type ArchiveHit = {
  platform: string;
  title: string;
  url: string;
  firstSeen: string;
  lastSeen: string;
  bestRank: number;
  hot: number;
  polls: number;
};

type Row = { t: string; p: string; rank: number; title: string; url: string; hot: number };

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})\.jsonl$/;

function dayPath(dir: string, day: Date): string {
  return join(dir, day.toISOString().slice(0, 10) + ".jsonl");
}

function shiftDay(day: Date, delta: number): Date {
  return new Date(day.getTime() + delta * 86400000);
}

/** 追加一次整榜观察。返回写入条数。 */
export async function appendSnapshot(
  dir: string,
  platform: string,
  items: HotItem[],
  t = new Date(),
): Promise<number> {
  const rows = items.filter((it) => it.title && it.url);
  if (!rows.length) return 0;
  await mkdir(dir, { recursive: true });
  const stamp = t.toISOString();
  const lines =
    rows
      .map((it) => JSON.stringify({ t: stamp, p: platform, rank: it.rank, title: it.title, url: it.url, hot: it.hot || 0 }))
      .join("\n") + "\n";
  await appendFile(dayPath(dir, t), lines, "utf8");
  return rows.length;
}

/** 清掉超出保留期的天文件，返回删除数。启动时跑一次即可。 */
export async function pruneOldSnapshots(dir: string, now = new Date(), retain = HOT_RETAIN_DAYS): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  const cutoff = shiftDay(now, -retain).getTime();
  let n = 0;
  for (const name of names) {
    const m = name.match(DAY_RE);
    if (!m) continue;
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (Number.isFinite(t) && t < cutoff) {
      try {
        await unlink(join(dir, name));
        n += 1;
      } catch {
        /* 删不掉就留着，下次再试 */
      }
    }
  }
  return n;
}

/**
 * 按查询词回溯历史快照：命中标题的词条聚合成一条，
 * 带首现（当 publishedAt 用）/ 末现 / 最好位次 / 观察次数。
 * 按末现时间倒序取前 limit 条。
 */
export async function searchArchive(
  dir: string,
  query: string,
  opts: { limit?: number; days?: number; now?: Date } = {},
): Promise<ArchiveHit[]> {
  const limit = opts.limit ?? 12;
  const days = opts.days ?? HOT_RETAIN_DAYS;
  const now = opts.now ?? new Date();
  const agg = new Map<string, ArchiveHit>();
  for (let i = 0; i < days; i++) {
    let text: string;
    try {
      text = await readFile(dayPath(dir, shiftDay(now, -i)), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line) continue;
      let row: Row;
      try {
        row = JSON.parse(line) as Row;
      } catch {
        continue;
      }
      if (!row?.title || !row?.url || !hitMatchesQuery(row.title, query)) continue;
      const key = `${row.p}|${row.url}`;
      const cur = agg.get(key);
      if (!cur) {
        agg.set(key, {
          platform: row.p,
          title: row.title,
          url: row.url,
          firstSeen: row.t,
          lastSeen: row.t,
          bestRank: row.rank,
          hot: row.hot || 0,
          polls: 1,
        });
      } else {
        if (row.t < cur.firstSeen) cur.firstSeen = row.t;
        if (row.t > cur.lastSeen) cur.lastSeen = row.t;
        if (row.rank < cur.bestRank) cur.bestRank = row.rank;
        cur.hot = Math.max(cur.hot, row.hot || 0);
        cur.polls += 1;
      }
    }
  }
  return [...agg.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1)).slice(0, limit);
}
