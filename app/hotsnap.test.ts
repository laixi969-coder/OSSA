import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSnapshot, pruneOldSnapshots, searchArchive, type HotItem } from "./hotsnap";

const dir = await mkdtemp(join(tmpdir(), "hotsnap-test-"));
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const items = (titles: string[]): HotItem[] =>
  titles.map((title, i) => ({ rank: i + 1, title, url: `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`, hot: 100 - i }));

describe("hot snapshot archive", () => {
  test("跨天聚合：首现 / 末现 / 最好位次", async () => {
    const day1 = new Date("2026-08-27T02:00:00.000Z");
    const day2 = new Date("2026-08-28T14:00:00.000Z");
    await appendSnapshot(dir, "weibo", items(["孙宇晨 景甜", "别的新闻"]), day1);
    // 第二天位次升到第 2
    await appendSnapshot(dir, "weibo", items(["别的新闻", "孙宇晨 景甜"]), day2);

    const hits = await searchArchive(dir, "孙宇晨 景甜", { now: day2 });
    expect(hits).toHaveLength(1);
    const h = hits[0];
    expect(h.platform).toBe("weibo");
    expect(h.firstSeen).toBe("2026-08-27T02:00:00.000Z");
    expect(h.lastSeen).toBe("2026-08-28T14:00:00.000Z");
    expect(h.bestRank).toBe(1);
    expect(h.polls).toBe(2);
  });

  test("查不到的词返回空；limit 生效", async () => {
    const now = new Date("2026-08-28T20:00:00.000Z");
    expect(await searchArchive(dir, "完全无关的词", { now })).toHaveLength(0);
    await appendSnapshot(dir, "zhihu", items(["尼泊尔山洪情况一", "尼泊尔山洪情况二", "尼泊尔山洪情况三"]), now);
    const hits = await searchArchive(dir, "尼泊尔山洪", { now, limit: 2 });
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.platform === "zhihu")).toBe(true);
  });

  test("过期天文件被清掉", async () => {
    await appendSnapshot(dir, "douyin", items(["旧词条"]), new Date("2026-07-01T00:00:00.000Z"));
    const n = await pruneOldSnapshots(dir, new Date("2026-08-28T00:00:00.000Z"), 30);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await searchArchive(dir, "旧词条", { now: new Date("2026-08-28T00:00:00.000Z") })).toHaveLength(0);
  });
});
