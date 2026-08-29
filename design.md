# Design — OSSA

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

## Genre
editorial (utilitarian workbench, not a marketing landing)

## Macrostructure family
- Marketing pages: Split Studio (about.html only)
- App pages: Workbench — left rail + desk
- 事件地图: Map / Diagram — cool grid wall, time × kind. Not cork, not warm stone.

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

## Per-page allowances
- Marketing pages MAY use enrichment (Tier-A CSS art, Tier-B SVG, etc.).
- App pages MUST NOT use enrichment — function carries the page.
- 事件地图 MAY draw SVG strings and lane bands; no fake browser chrome.

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
