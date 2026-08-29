import { describe, expect, test } from "bun:test";
import {
  cardIdFromUrl,
  classifyKind,
  classifyStance,
  hitsToCards,
  inferLinks,
  mergeDig,
  parseRssItems,
  queryKey,
} from "./dig";

const rss = `<?xml version="1.0"?><rss><channel>
<item><title>孙宇晨起诉要求退还彩礼 - 观察者网</title><link>https://example.com/a</link><pubDate>Thu, 27 Aug 2026 15:01:00 GMT</pubDate><description>报道摘要</description></item>
<item><title>景甜工作室声明回应</title><link>https://example.com/b</link><pubDate>Fri, 28 Aug 2026 08:00:00 GMT</pubDate></item>
<item><title>无链接废项</title><link></link></item>
</channel></rss>`;

describe("parse and classify", () => {
  test("RSS 只收有链接的条目", () => {
    const hits = parseRssItems(rss);
    expect(hits).toHaveLength(2);
    expect(hits[0].title.includes("观察者网")).toBe(false);
    expect(hits[0].sourceName).toContain("观察者");
  });

  test("回应和长文标不同立场", () => {
    expect(classifyStance({ title: "景甜工作室声明回应", url: "https://a.com" })).toBe("当事人回应");
    expect(classifyStance({ title: "我的女友景甜 6000字长文", url: "https://a.com" })).toBe("单方陈述");
    expect(classifyKind({ title: "相关表情包刷屏", url: "https://weibo.com/x" })).toBe("meme");
  });
});

describe("merge over time", () => {
  test("同一 url 更新时保住位置", () => {
    const first = hitsToCards(
      [{ title: "起诉彩礼", url: "https://news.example/a", publishedAt: "2026-08-27T00:00:00.000Z" }],
      "孙宇晨 景甜",
    );
    first[0].x = 120;
    first[0].y = 80;
    const prev = {
      id: "dig:1",
      query: "孙宇晨 景甜",
      queryKey: queryKey("孙宇晨 景甜"),
      status: "done" as const,
      startedAt: "",
      finishedAt: "",
      fetchedAt: "",
      cardCount: 1,
      linkCount: 0,
      newCount: 1,
      earliestAt: "",
      newestAt: "",
      cards: first,
      links: [],
      error: "",
      gaps: [],
    };
    const nextHits = hitsToCards(
      [
        { title: "起诉彩礼（续）", url: "https://news.example/a", publishedAt: "2026-08-27T00:00:00.000Z" },
        { title: "休战声明", url: "https://news.example/c", publishedAt: "2026-08-29T00:00:00.000Z" },
      ],
      "孙宇晨 景甜",
    );
    const merged = mergeDig(prev, nextHits);
    expect(merged.newCount).toBe(1);
    const kept = merged.cards.find((c) => c.url.includes("/a"));
    expect(kept?.x).toBe(120);
    expect(kept?.y).toBe(80);
    expect(kept?.isNew).toBe(false);
    expect(merged.cards.some((c) => c.title.includes("休战"))).toBe(true);
  });

  test("没有 url 的命中不上墙", () => {
    const cards = hitsToCards([{ title: "谣言", url: "" }], "随便");
    expect(cards).toHaveLength(0);
  });

  test("同一 url 生成稳定 id", () => {
    expect(cardIdFromUrl("https://Ex.com/a?utm_source=x")).toBe(cardIdFromUrl("https://ex.com/a"));
  });

  test("关系线连回更早的场", () => {
    const cards = hitsToCards(
      [
        { title: "孙宇晨起诉景甜", url: "https://n.example/1", publishedAt: "2026-08-27T00:00:00.000Z" },
        { title: "景甜工作室声明回应", url: "https://n.example/2", publishedAt: "2026-08-28T00:00:00.000Z" },
      ],
      "孙宇晨 景甜",
    );
    const links = inferLinks(cards);
    expect(links.some((l) => l.relation === "quote")).toBe(true);
  });
});
