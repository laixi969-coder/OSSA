import { describe, expect, test } from "bun:test";
import { clampFieldWant, fieldCopy, mixFields, skipAsHomeHot } from "./pool";

const item = (title: string, extra: Record<string, unknown> = {}) => ({ title, ...extra });

describe("fieldCopy", () => {
  test("热搜保持原题，不改成可发稿", () => {
    const copy = fieldCopy("hot", item("某明星官宣结婚"));
    expect(copy.title).toBe("某明星官宣结婚");
    expect(copy.title.includes("这件事我只讲一句")).toBe(false);
    expect(copy.open.includes("复述")).toBe(true);
    expect(copy.line).toBe("场 · 热搜");
  });

  test("讨论和案例也保持原题", () => {
    expect(fieldCopy("talk", item("为什么加班越来越难拒绝")).title).toBe("为什么加班越来越难拒绝");
    expect(fieldCopy("case", item("某品牌把售后做成了内容")).title).toBe("某品牌把售后做成了内容");
    expect(fieldCopy("case", item("某品牌")).open.includes("拆结果")).toBe(true);
  });
});

describe("mixFields", () => {
  test("热搜最多 2 张", () => {
    const hot = ["一", "二", "三", "四"].map((t) => item(t));
    const out = mixFields({
      hot,
      talk: [item("知乎问1")],
      cases: [item("案例1")],
      want: 5,
    });
    expect(out.filter((x) => x.origin === "hot")).toHaveLength(2);
  });

  test("混进讨论和案例，不把热搜标题改写成稿", () => {
    const out = mixFields({
      hot: [item("抖音第一"), item("B站第一")],
      talk: [item("知乎在问这件事")],
      cases: [item("数英刚发的案例")],
      want: 5,
    });
    const origins = out.map((x) => x.origin);
    expect(origins).toContain("hot");
    expect(origins).toContain("talk");
    expect(origins).toContain("case");
    expect(out.some((x) => String(x.title).startsWith("这件事我只讲一句"))).toBe(false);
    expect(out.find((x) => x.title === "抖音第一")?.line).toBe("场 · 热搜");
  });

  test("临近节点在场之外另加", () => {
    const out = mixFields({
      hot: [item("热1"), item("热2")],
      talk: [item("问1"), item("问2")],
      cases: [item("案1")],
      nodes: [item("中秋"), item("国庆")],
      want: 5,
    });
    expect(out.filter((x) => x.origin === "node").map((x) => x.title)).toEqual(["中秋", "国庆"]);
    expect(out.length).toBeGreaterThan(5);
  });

  test("场不足时用常青补到 3 张", () => {
    const out = mixFields({ hot: [item("仅一条热搜")], talk: [], cases: [], want: 5 });
    expect(out.length).toBe(3);
    expect(out.filter((x) => x.origin === "evergreen").length).toBe(2);
  });

  test("场够了不加常青", () => {
    const out = mixFields({
      hot: [item("热1"), item("热2")],
      talk: [item("问1")],
      cases: [item("案1")],
      want: 4,
    });
    expect(out.every((x) => x.origin !== "evergreen")).toBe(true);
    expect(out).toHaveLength(4);
  });

  test("换一批会换到后面的场", () => {
    const hot = [item("热A"), item("热B"), item("热C"), item("热D")];
    const a = mixFields({ hot, talk: [], cases: [], want: 3, batch: 0 });
    const b = mixFields({ hot, talk: [], cases: [], want: 3, batch: 1 });
    expect(a.map((x) => x.title)).not.toEqual(b.map((x) => x.title));
  });
});

describe("pool guards", () => {
  test("灾难热搜不进池", () => {
    expect(skipAsHomeHot("西藏泥石流已致7人遇难")).toBe(true);
    expect(skipAsHomeHot("某明星官宣结婚")).toBe(false);
  });

  test("场数只认 3 到 5", () => {
    expect(clampFieldWant(10)).toBe(5);
    expect(clampFieldWant(3)).toBe(3);
    expect(clampFieldWant(1)).toBe(5);
  });
});
