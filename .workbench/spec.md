---
name: OSSA 企业内容经营台
domain: system
subject: 选题
purpose: 让内容员工每天打开就知道今天做什么、凭什么做：看见热点，做成可拍的选题，带着拍法和稿去制作
owner: 企业内容组
surface: desktop
structure:
  primary: feed
  secondary: pipeline
moment: 早上坐下第一件事，找今天能拍的题

dials:
  cadence: 8
  input: 2
  depth: 7

roles:
  - { name: 内容员工, opens_daily: true, does: 看今日可做 3 条、钉借鉴、把一条热点做成选题（跟不跟 + 可拍的题 + 如何拍/如何写） }
  - { name: 内容主管, opens_daily: false, does: 看全组待判断和待补证的选题，不单独做一套后台 }

hook:
  text: "微博热榜第 1：「金鹿奖获奖名单」 · AI 快报 5 条新精选 · 今天先看混元 Hy4 那条"
  shape: imperative
  fields:
    - name: weibo.top.title
      reads: 微博热榜第 1：「金鹿奖获奖名单」
      writes: integration
      source: 本机 60s GET http://127.0.0.1:4399/v2/weibo
      exists_today: true
      when: 打开首屏时拉一次，后台每 30 分钟刷新
      day_one: 60s 没起来时不显示热榜数字，改说「先把本机 60s 跑起来」
      stale: 上次刷新 X 分钟前，标出来
    - name: aihot.selected_24h_count
      reads: AI 快报 5 条新精选
      writes: integration
      source: AIHOT GET /api/v1/items?mode=selected&window=24h
      exists_today: true
      when: 打开首屏时拉一次，后台每 30 分钟刷新
      day_one: AI 快报已经能看，先扫这几条
      stale: 上次刷新 X 分钟前，标出来，不要装成刚刚的
    - name: aihot.top_item.title
      reads: 今天先看混元 Hy4 那条
      writes: derived
      from: AIHOT 精选里 score 最高或第一条未读
      exists_today: true
      when: 读时计算
      day_one: 还没有「先看哪条」——打开 AI 快报点第一条
      stale: 用上次刷新的标题，旁注刷新时间

cold_start:
  day_1: 热榜和 AI 快报现在都能看。把数英 RSS 贴进数据引擎，营销情报开始进。
  day_2: 昨天钉了 1 条借鉴。今天微博第 1 换了，AI 快报又来了几条。
  day_7: 这周钉了 11 条借鉴，热榜和 AI 快报都有贡献。关注博主和低粉高赞还没接上的，空着就空着，别等它们才打开。
  re_entry: 离开几天了——直接看今天的必看 3 条，不用补。

home:
  - hook
  - 今日必看 3 条：标题 + 一句人话 + 来源 + 打开原文 + 做成选题
  - 六个频道就在这屏上切：平台热榜 · AI 快报 · 营销情报 · 科技圈 · 开源新品 · 对标账号；接不上的频道显示它自己的空状态，不拿假列表充
  - 最近钉过的借鉴（最多 5 条，点一下回到原文）

channels:
  - name: 近期热点
    type: today
    weight: primary
    does: 扫今日信号、钉借鉴、打开原文、把一条做成选题
    pages:
      - level: L1
        shows: 结论条 + 六个子频道切换 + 当前频道的卡片/双列榜单（不是一张大表）
        filters: [来源, 今天/24h/7天]
        actions: [刷新, 钉借鉴, 打开原文, 做成选题]
      - level: L2
        shows: 选题卡（见任务推进 L2）。热点不再单独做第三层详情。
        actions: [打开原文, 钉借鉴, 跟, 不跟, 待补证, 选出拍法和稿]
    tabs:
      - id: platform_hot
        name: 平台热榜
        shows: 双列实时热榜（微博热搜 / 知乎热榜等），条目标题 + 热度
        source: 60s API
        empty: 60s 没起来时写「本机 60s 还没开，默认地址 http://127.0.0.1:4399」。小红书热榜（/v2/rednote）当前会报错，那一列留空并标明，不要拿别的平台条目顶上。
      - id: ai_brief
        name: AI 快报
        shows: 卡片列表，每条标题 + 摘要 + 来源时间；默认 24h 精选
        source: AIHOT
        empty: 不会空。接不上时写「AIHOT 暂时连不上，稍后再刷」，不要编新闻。
      - id: marketing
        name: 营销情报
        shows: 图文卡片墙（标题、封面、来源标签、打开原文）
        source: RSS（数英、Adweek、Communication Arts；梅花网原生 RSS 没找到）
        empty: 一个源都没贴时：先贴数英 https://www.digitaling.com/rss
      - id: tech
        name: 科技圈
        shows: IT之家/少数派/36氪/V2EX + 60s IT 新闻卡片
        source: 免费 RSS + 本机 60s /v2/it-news
        empty: 源暂时拉不到时写实话，不编新闻。
      - id: open
        name: 开源新品
        shows: GitHub Trending + Hacker News + Product Hunt
        source: trending-collection 静态 JSON、本机 60s HN、Product Hunt RSS
        empty: 拉不到时标明，不拿假仓库充。
      - id: creators
        name: 对标账号
        shows: 按账号分组的最新笔记卡片
        source: 主页链接 + Jina
        empty: 先在数据引擎贴对标链接。没有官方公开接口。

  - name: 任务推进
    type: record
    weight: regular
    does: 把热点做成选题：跟不跟、拍哪几条、如何拍、如何写，再推进制作
    pages:
      - level: L1
        shows: 看板，列=待判断 / 待补证 / 已采纳 / 制作中 / 待复盘。卡片=选题（切口标题 · 格式 · 有没有拍法和稿 · 来自哪条热 · 谁做的）
        actions: [打开选题卡, 拖动改阶段]
      - level: L2
        shows: 选题卡，自上而下：原热点、处境摘要、跟/不跟/待补证、深度扫描（硬刺/节点/象征细节）、1-3 个真不同的爆款方向（类型/主语/逻辑/受众/情绪/转发语/平台风格/标题/Hook/可拍）、金句、如何拍、如何写。方法全文来自 vendor/hiccai-newsangle/SKILL.md，不得缩成口诀。证据不够或救不起来就写弱素材说明，不准硬编三条同质题。
        actions: [跟, 不跟, 待补证, 选一条题, 按格式出拍法和稿, 改阶段]
    note: 没有填写处境（赛道/人设/受众）时，选题卡顶部写「先去设置写清我们是谁」，生成结果标成弱判断，不装成已对过账号。

  - name: 数据引擎
    type: record
    weight: regular
    does: 接源、改地址、贴 RSS、贴博主主页、放 API Key
    pages:
      - level: L1
        shows: 分组表单，不是表格：60s 实例地址 · AIHOT（开箱，只显示是否通）· RSS 列表 · 博主主页列表 · RedFox Key · Jina 是否启用
        actions: [保存, 测连通]
    note: 视频左侧有这个名字，没演示内部。按「所有源的开关都在这」来做。

  - name: 月度复盘
    type: review
    weight: regular
    does: 回看这个月钉了什么、哪些热点做成了选题、哪些判断还停在待判断
    pages:
      - level: L1
        shows: 本月钉了 N 条 · 做成选题 M 条 · 还停在待判断的 K 条
    note: 没有钉过的借鉴时，这页说「先在近期热点钉 3 条，月底这儿才有得看」。

  - name: 设置
    type: knowledge
    weight: occasional
    does: 写清公司处境（赛道、人设、受众、主做格式），改姓名和刷新
    pages:
      - level: L1
        shows: 短表单分两块。一块是处境（不锁行业）。一块是大模型：Base URL、API Key、对话模型下拉、同步模型、测连通。默认 Agnes。没有密钥时做成选题会说实话，不准编假题。

entities:
  - name: Signal
    fields: [id, title, url, summary, cover_url, source_id, source_type, platform, published_at, fetched_at, heat, author_name, author_followers, like_count, read_at, pinned_at]
    written_by:
      { title: integration, url: integration, summary: integration, cover_url: integration,
        source_id: system, source_type: system, platform: integration,
        published_at: integration, fetched_at: system, heat: integration,
        author_name: integration, author_followers: integration, like_count: integration,
        read_at: system, pinned_at: system }
    relations: [Signal n-1 Source, Signal 1-n Pin]
  - name: Source
    fields: [id, type, name, endpoint, enabled, last_ok_at, last_error]
    written_by:
      { type: user, name: user, endpoint: user, enabled: user, last_ok_at: system, last_error: system }
    relations: [Source 1-n Signal]
  - name: Pin
    fields: [id, signal_id, note, created_at]
    written_by: { note: user, created_at: system }
    relations: [Pin n-1 Signal, Pin 1-1 Task]
  - name: Task
    fields: [id, title, stage, verdict, pin_id, signal, format, topic_ideas, selected_index, no_signal, follow_reason, evidence, drafts, note, by, last_moved_at, created_at, error]
    written_by:
      { title: derived, stage: user, verdict: user, selected_index: user, format: user, note: user,
        topic_ideas: system, no_signal: system, follow_reason: system, evidence: system, drafts: system,
        last_moved_at: system, created_at: system, by: user, error: system }
    relations: [Task n-1 Pin]
    note: stage 取值 judge / need_evidence / adopted / making / review / skipped。旧值 idea→judge、writing/ready→making、done→review。
  - name: Situation
    fields: [niche, persona, audience, formats]
    written_by: { niche: user, persona: user, audience: user, formats: user }
    note: 存在 settings 里，一台公司一份。formats 默认 short_video + xhs。
  - name: Query
    fields: [id, prompt, answer, created_at]
    written_by: { prompt: user, answer: system, created_at: system }

depends_on:
  - field: 小红书热榜
    source: 本机 60s /v2/rednote
    exists_today: false
    until_then: 本机用 Bun 跑 vendor/60s，端口 4399，不用 Docker。微博/知乎/抖音/B站/头条/百度热榜能用；小红书热榜返回 500（上游结构变了）。平台热榜页这一列标明「小红书热榜暂时读不到」，不要用别的平台顶。
  - field: 梅花网案例
    source: 梅花网原生 RSS
    exists_today: false
    until_then: 营销情报先用数英 / Adweek / Communication Arts。梅花网 /rss 是 404。
  - field: 关注博主最新笔记
    source: 小红书官方公开接口
    exists_today: false
    until_then: 没有官方接口。视频做法是 Jina 读主页 + 专门小号防风控。第一版只收主页链接，读失败就标明风控，不装成没更新。
  - field: 低粉高赞笔记
    source: RedFox API（视频黄条写了 RedFox 新站日更）
    exists_today: false
    until_then: 需要 API Key，本机没有。低粉高赞页不要显示任何爆款卡片。
  - field: 任务推进 / 数据引擎 / 月度复盘的内部页面
    source: 视频演示
    exists_today: true
    until_then: 任务推进已升级为选题卡 + 看板。没有模型密钥时，做成选题会说明缺密钥，不编假题。
  - field: 选题生成所用模型
    source: Agnes chat completions（https://apihub.agnes-ai.com/v1），密钥来自设置或 AGNES_API_KEY
    exists_today: false
    until_then: 没密钥就交白卷。证据只用这条热点本身（标题/摘要/来源），不得把一次热点写成「正在上升/已到高峰」。图/视频接口以后用，选题这一步只用文本。

mvp:
  - 近期热点（平台热榜 + AI 快报 + 营销情报）
  - 数据引擎（60s 默认本机 4399，再贴 RSS）
  - 设置处境（赛道 / 人设 / 受众 / 主做格式）
  - 热点做成选题（跟不跟 + 1-3 条可拍的题）
  - 选题卡上的如何拍 / 如何写
later:
  - 关注博主
  - 低粉高赞
  - 搜索内容
  - 月度复盘深化（哪些判断对了）

visual: 浅底编辑部，侧栏窄、主区像早报。标题就用「借鉴借鉴，只是借鉴」。卡片有封面的用封面，热榜用双列清单。不要后台蓝，不要仪表盘大数字墙。

seam:
  type: none
  why: 这是自己用的台子，钱不在这一页上收

excluded:
  - 做成 App / 推送 / 角标：这是网页
  - 登录、租户、计费
  - 在没接到源的频道里塞假热榜、假爆款
  - 一键生成 20 个万能标题、和这条热无关的「今日灵感」
  - 把热搜写成「正在爆发、必须跟」
  - 单独再开一个「AI 写作」页——写和拍都挂在这条选题上
  - 视频没演示的发布、排期、一键发小红书

deferred:
  - TikHub / 作品评论全量采样：第一期证据就是这条热点，薄就交白卷
  - 完整内容生产台（分镜、发布）
  - 自己养一套小红书爬虫：等有稳定源或 key 再做，不在第一版硬爬

evidence:
  video: /Users/caiwenbin/Desktop/8月28日.mp4
  duration_s: 218
  product_on_screen: Media OS 个人内容经营台（本地 127.0.0.1:4319）
  title_on_screen: 借鉴借鉴，只是借鉴
  nav_on_screen: [近期热点, 任务推进, 数据引擎, 月度复盘]
  tabs_on_screen: [平台热榜, AI快报, 营销情报, 关注博主, 低粉高赞, 搜索内容]
---

## 这个台子是给谁的

蔡蔡。地产营销和品牌做了二十年，现在用 AI 把提案、小红书、视频一条链做出来。视频里那个人给自己做了个「社媒工作台」：早上打开，看热榜、看 AI 谁说了什么、看营销案例、看关注的博主、看低粉却高赞的笔记，目的就一个——**借鉴借鉴，只是借鉴**。

我们做同一个东西，放在 OSSA。不是做给「内容创作者人群」的产品，是蔡蔡自己每天要开的那一页。

视频里跟的博主是写代码的。蔡蔡跟的应该是他的对标：地产、豪宅、品牌、营销。同一个台子，换名单。

## 每天怎么用

早上坐下，打开这一页。

最上面一句已经告诉你：今天可做几条、组里还有几个选题待判断。下面三张必看卡，每张一句人话。觉得能用就钉成借鉴；要拍，点「做成选题」——系统用公司处境判断跟不跟，给出 1–3 条能开机的题，再出如何拍、如何写。

设置里一次性写清：我们是谁、拍给谁、主做短视频还是小红书。不填也能生成，但会标明这是弱判断。

离开几天再回来，直接看今天的三张卡，不用补。

## 为什么是这几个频道

视频左侧就是这四个：近期热点、任务推进、数据引擎、月度复盘。近期热点里六个子频道也按视频原样保留。

- **近期热点**是每天落地的地方。六个子频道是六种信号，不是六个产品。
- **任务推进**是选题工作台：待判断 / 待补证 / 已采纳 / 制作中 / 待复盘。卡片点进去是选题卡，不是空白备注。
- **数据引擎**是所有源的开关。没有它，接源会散落在设置里，第二天找不到。
- **月度复盘**是给这周、这个月一个交代：钉了什么、哪些热做成了题。
- **设置**放处境、姓名、密钥和刷新。处境是选题能对上这个公司的前提。

故意没做的：一键发小红书、团队权限、手机 App。视频这集没在做那些，我们也不做。

## 已经想过但没做的

- 作者那台免费演示（Cloudflare）：不走。热榜已经改成本机 60s。
- 小红书热榜：60s 的 /v2/rednote 现在报错，这一列先空着。
- 关注博主、低粉高赞进第一版主路径：一个靠风控敏感的主页读取，一个要收费 API Key。频道留着，空状态说真话。
- 梅花网：视频点名了，原生 RSS 没找到，先用数英、Adweek、Communication Arts。
- 完整的内容生产台（分镜、发布）：另一次的事，记在 deferred。
- 把先觉整站搬进来：只搬判断记录和初稿结构，不搬 Next.js / 登录 / TikHub。

## 给实现方（不熟悉本规范的 AI 或开发，照这段做即可）

- **这是一个网页**（电脑浏览器里打开），不是 App。没有推送，所以首屏最上面那条 hook 是唯一让人明天还回来的东西——它是整页最重要的一行，不要缩成卡片标题，不要塞进顶部问候栏。
- **首屏按 home 的顺序从上到下排**，第一行是 hook。
- **hook 里每个数字都在 hook.fields 里标了来源。** 现在允许出现在 hook 里的是本机 60s 微博热榜、AIHOT、以及派生的「先看哪条」。`writes: system` 的字段是程序在动作发生时自己写的（钉借鉴、标记已读、拖任务），不要做成要人填的表单项。
- **depends_on 里的字段现在还没有可用数据。** 别在首屏显示它，也别显示 0，按 until_then 那一行处理。
- **数据库照 entities 建。** written_by 决定哪些字段有输入框、哪些是程序写的、哪些是接口写的。
- **channels 就是左侧主导航。** `weight: primary` 的「近期热点」是默认落地页，视觉上明显重于其他。
  - 每个模块的页面按 pages 建：L1 是模块首页，L2 是单条详情。**没有 L3 的就只做两层。**
  - **`shows` 那句话定了这一屏长什么样**——写「双列热榜」「卡片墙」「看板」就按那个做，不要六个频道六张一样的表。
  - 近期热点的六个子频道是 **同一 L1 上的 tab**，不是左侧再开六个模块。
- **空数据时显示 cold_start.day_1，或该 tab 自己的 empty 句子。** 那是一个动作，不是「暂无数据」。**不要塞假的热榜或假爆款。**
- **roles 就一个：蔡蔡。** 不要做登录权限系统。
- **第一版只做 mvp。** later 的可以在导航留位，点进去是空状态，不要先做完再发现源没有。
- **「做成选题」是热点上的主动作。** 打开后进入任务推进 L2 选题卡。没有模型密钥时展示动作句，不要编三条假题。
- **如何拍 / 如何写按设置里的主做格式出。** 短视频给前 3 秒和口播；小红书给封面、首句和正文。挂在这条选题上，不另开写作页。
- **不得把一次热点采样写成趋势。** 证据块必须写明这是这一条热，不是时间序列。
- **视觉按 visual 那一行。** 标题「借鉴借鉴，只是借鉴」是产品态度，不是装饰，留在近期热点页头。
- **页面主体形态是信息流 / 早报**，不是监控大屏，也不是后台表格。
