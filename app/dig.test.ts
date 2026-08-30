import { describe, expect, test } from "bun:test";
import {
  cardIdFromUrl,
  classifyKind,
  classifyStance,
  hitsToCards,
  layoutCards,
  inferLinks,
  mergeDig,
  parseRssItems,
  queryKey,
  repairDigText,
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
  // 版面是机器排的，每次合并整墙重排。只有用户拖过（pinned）的卡才钉住不动。
  test("拖过的卡更新后仍在原位，机器排的会重排", () => {
    const first = hitsToCards(
      [{ title: "起诉彩礼", url: "https://news.example/a", publishedAt: "2026-08-27T00:00:00.000Z" }],
      "孙宇晨 景甜",
    );
    first[0].x = 120;
    first[0].y = 80;
    first[0].pinned = true;
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
    expect(kept?.pinned).toBe(true);
    expect(kept?.isNew).toBe(false);
    expect(merged.cards.some((c) => c.title.includes("休战"))).toBe(true);
  });

  // 回归：以前只有新卡参与排版，老卡坐标被无视 → 新卡直接压在老卡上。
  test("补进新卡后整墙不重叠", () => {
    const first = hitsToCards(
      [
        { title: "起诉彩礼", url: "https://news.example/a", publishedAt: "2026-08-27T00:00:00.000Z" },
        { title: "独家对话", url: "https://news.example/b", publishedAt: "2026-08-27T06:00:00.000Z" },
      ],
      "孙宇晨 景甜",
    );
    const prev = {
      id: "dig:2",
      query: "孙宇晨 景甜",
      queryKey: queryKey("孙宇晨 景甜"),
      status: "done" as const,
      startedAt: "",
      finishedAt: "",
      fetchedAt: "",
      cardCount: 2,
      linkCount: 0,
      newCount: 2,
      earliestAt: "",
      newestAt: "",
      cards: layoutCards(first),
      links: [],
      error: "",
      gaps: [],
    };
    const more = hitsToCards(
      [
        { title: "起诉彩礼", url: "https://news.example/a", publishedAt: "2026-08-27T00:00:00.000Z" },
        { title: "独家对话", url: "https://news.example/b", publishedAt: "2026-08-27T06:00:00.000Z" },
        { title: "景甜方回应", url: "https://news.example/d", publishedAt: "2026-08-27T00:30:00.000Z" },
        { title: "表情包刷屏", url: "https://news.example/e", publishedAt: "2026-08-28T00:00:00.000Z" },
        { title: "周边上架", url: "https://news.example/f", publishedAt: "2026-08-29T00:00:00.000Z" },
      ],
      "孙宇晨 景甜",
    );
    const cards = mergeDig(prev, more).cards;
    expect(cards).toHaveLength(5);
    const rect = (c: (typeof cards)[number]) => ({ x: c.x, y: c.y, w: 268, h: 250 });
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = rect(cards[i]);
        const b = rect(cards[j]);
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  test("没有 url 的命中不上墙", () => {
    const cards = hitsToCards([{ title: "谣言", url: "" }], "随便");
    expect(cards).toHaveLength(0);
  });

  test("热榜词条贯通到卡片并按 post 上墙", () => {
    const cards = hitsToCards(
      [{ title: "孙宇晨 景甜", url: "https://s.weibo.com/weibo?q=x", sourceName: "微博热搜", summary: "热搜第 3 位", hotEntry: true }],
      "孙宇晨 景甜",
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("post");
    expect(cards[0].hotEntry).toBe(true);
    expect(cards[0].publishedAt).toBe("");
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

describe("repair legacy text", () => {
  const base = {
    id: "ev:x",
    url: "https://n.example/1",
    sourceName: "观察者",
    publishedAt: "2026-08-27T00:00:00.000Z",
    keywords: [],
    imageUrl: "",
    stance: "报道" as const,
    x: 0,
    y: 0,
    firstSeenAt: "",
    lastSeenAt: "",
  };
  const card = (over: Partial<typeof base> & { kind: string; title: string; summary: string }) =>
    ({ ...base, ...over }) as unknown as Parameters<typeof repairDigText>[0]["cards"][number];

  test("清掉标题来源尾巴和摘要里的 nbsp 复读", () => {
    const dig = {
      cards: [
        card({
          kind: "news",
          title: "热搜第一！孙宇晨起诉要求退还3000万彩礼，景甜方回应-观察者网",
          summary: "热搜第一！孙宇晨起诉要求退还3000万彩礼，景甜方回应-观察者网 &nbsp;&nbsp; 观察者",
        }),
      ],
    } as unknown as Parameters<typeof repairDigText>[0];
    expect(repairDigText(dig)).toBe(true);
    expect(dig.cards[0].title).toBe("热搜第一！孙宇晨起诉要求退还3000万彩礼，景甜方回应");
    expect(dig.cards[0].summary).toBe("");
  });

  test("多故事块摘要只留第一段，真摘要在解码后保留", () => {
    const dig = {
      cards: [
        card({
          kind: "news",
          title: "孙宇晨发布长文回应",
          summary: "孙宇晨发布长文回应 &nbsp;&nbsp; 中华网 孙宇晨承认部分内容不实 &nbsp;&nbsp; 新浪新闻",
        }),
        card({
          kind: "news",
          title: "事件仍在发酵",
          summary: "多方仍在等待进一步消息 &nbsp;&nbsp; 联合早报",
        }),
      ],
    } as unknown as Parameters<typeof repairDigText>[0];
    repairDigText(dig);
    expect(dig.cards[0].summary).toBe("");
    expect(dig.cards[1].summary).toBe("多方仍在等待进一步消息");
  });

  test("干净卡与便签不动，没改就返回 false", () => {
    const clean = card({ kind: "news", title: "正常标题", summary: "一句正常摘要" });
    const note = card({ kind: "note", title: "我觉得 这事没完", summary: "" });
    const dig = { cards: [clean, note] } as unknown as Parameters<typeof repairDigText>[0];
    expect(repairDigText(dig)).toBe(false);
    expect(clean.summary).toBe("一句正常摘要");
    expect(note.title).toBe("我觉得 这事没完");
  });
});
