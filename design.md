# Design — OSSA

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

## Genre
editorial (utilitarian workbench, not a marketing landing)

## Macrostructure family
- Marketing pages: Split Studio (about.html only)
- App pages: Workbench — left rail + desk
- 事件地图: Map / Diagram — cool grid wall, evidence materials, not cork, not warm stone.

## Theme
Newsprint. Cool paper, ink, one indigo mark. No oat, no brick, no cork.

- `--color-paper`   oklch(95.5% 0.006 250)
- `--color-paper-2` oklch(99% 0.003 250)
- `--color-ink`     oklch(18% 0.02 260)
- `--color-ink-2`   oklch(40% 0.018 260)
- `--color-rule`    oklch(78% 0.012 250 / 0.5)
- `--color-accent`  oklch(42% 0.14 255)
- `--color-focus`   oklch(42% 0.14 255)

## Typography
- Display: Songti SC, weight 600, style normal (mast, wordmark)
- Body: PingFang SC, weight 400
- Mono: SF Mono / ui-monospace (dates, counts only)
- Display tracking: -0.04em
- Type scale anchor: `--text-display` = clamp(1.75rem, 2vw + 1rem, 2.25rem)

## Spacing
4-point named scale. The values are in `tokens.css`. Pages must use named
tokens (`var(--space-md)`), never raw values — new rules only; existing
component CSS may keep px until a later pass.

## Motion
- Easings: `--ease-out` 0.16 1 0.3 1 · `--ease-in` 0.7 0 0.84 0
- Reveal pattern: one home-card rise; 事件地图 wall has none
- Reduced-motion fallback: opacity-only, ≤ 150 ms

## Microinteractions stance
- silent success (toast only when the effect is off-screen)
- hover delay 800 ms · focus delay 0 ms
- 事件地图: click a card to light its chain; drag still moves the card
- 看全场 fits the wall; no celebratory toasts

## CTA voice
- Primary CTA: filled indigo, 12px radius, verb first (选这个 / 开工 / 铺开)
- Secondary CTA: paper-3 fill, ink-2 text (打开原文 / 更新 / 钉借鉴)

## 事件地图 · 证据材质
六种证据，各有形，每种颜色与图钉：

| 种类 | 形态 | 宽度 | 行为 |
| --- | --- | --- | --- |
| news | 剪报：宋体标题、来源+日期双线、底部单边线 | 268 | 第一现场卡打靛蓝印章 |
| post | 社交帖卡：圆头像、平台名、引号正文 | 236 | 立场 chip 在标题下 |
| meme / image | 拍立得：白边、图为底、手写说明 | 200 | 卡片微旋 ±1.5° |
| derivative | 吊牌：顶部穿孔（圆环 + 内阴影）、虚线边框 | 200 | mono 小标签 |
| note | 便利贴：冷调蓝灰底、折角、左下斜角 | 180 | 用户自贴，旋转 -1.9° |
| gap | 缺口占位：虚线方框、写明「这一格没搜到」 | 320×70 | 不编假卡 |

卡片高度由 CSS 行数截断（h3 ≤ 3 行、p ≤ 3 行、note 5 行）保证版面数值稳定。
LANE_GEO（dig.ts）和 CARD_METRICS（app.js）必须同步：news 250 / post 220 /
visual 258 / derivative 226 / note 190。

## 事件地图 · 关系
- 关系 = 报道 / 引用 / 转发 / 二创 / 商业，五色（靛/绿/琥珀/紫/灰蓝）。
- 线绳：有垂坠的三次贝塞尔，控制点按距离 sag = clamp(22, dist*0.17, 84)。
  绳子从起点图钉往下垂，在终点图钉前向上插入，marker-end 三角指向上游。
- 中点挂关系胶囊（圆角矩形 + 文本），与绳子同行关系色。
- 选一条卡 → 命中链（线 + 两端卡）stroke 2.6，opacity 1；其余 0.07。
- 悬停一条线 → is-hot 高亮 + 两端卡 ev-deg 角标。

## 事件地图 · 传播链
- `inferLinks`（dig.ts）按时间遍历每条非便签，向上游（同题优先、离得近优先、当事人回应优先回单方陈述）连一条；
  上游不是源头时再补一条到源头，让图是网不是树。源头只做兜底，不再张张连它。
- 方向：from = 上游（更早）→ to = 下游（更晚），绳子方向就是传播方向。
- 每张卡最多 6 条出度，全图 ≤ 60 条。

## 事件地图 · 版面
- x = 时间（real），同一道内按时间切行：先按最小间距铺满一行，再把剩下的
  余量按相邻两卡的时间间隔分配 —— 时间挨得近的挨得紧、隔得久的拉得开。
  首张左对齐、末张右边缘收在墙宽上，**永不超出、永不重叠**。
- y = 道 + 行号（5 道按需几行累加，不再写死）。
- 整墙重排：`mergeDig` 后所有非 pinned 的卡都重排；用户拖过的卡（pinned）
  留在原地，其余绕开。最后 sweep 一遍兜底，**任何两块相交就整体下推**。
- 行底一条日期刻度（3-4 个真实日期 tick），不复用全局时间轴。
- 选全场（看全场）整墙 fit，最小 0.3；进场用 0.72 停在最早那批。

## 标题清洗
- 剥掉尾巴上的来源名：`- 观察者网` / `| 凤凰网` / `&nbsp;&nbsp; BBC`（BBC 中文、
  VOA、FT 这类只靠空白隔、没有分隔符）。`splitTitleSource(raw)` 一次拿到
  干净的标题和来源名 —— 取来源必须在剥尾巴之前。
- `unescapeXml` 解码 → `stripSourceTail` 剥尾巴 → `flatten` 收干 U+00A0，
  顺序不能反。

## Per-page allowances
- Marketing pages MAY use enrichment (Tier-A CSS art, Tier-B SVG, etc.).
- App pages MUST NOT use enrichment — function carries the page.
- 事件地图 MAY draw SVG strings, lane bands, pins, row date strips, gap boxes; no fake browser chrome.

## What pages MUST share
- The wordmark / logotype (OSSA · 活).
- The accent colour and its placement (≤ 5 % per viewport, except primary buttons).
- The display + body fonts.
- The CTA voice (button shape, border-radius, padding rhythm).
- Left rail navigation (N3).

## What pages MAY differ on
- 事件地图 is a full-bleed map; 今天 is a desk feed.
- Hero archetype — about.html only.
- Enrichment — only on marketing pages, only Tier-A or Tier-B.

## Exports
See `tokens.css` at the project root and `app/public/tokens.css`.
