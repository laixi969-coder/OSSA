---
name: OSSA 内容经营台
domain: system
subject: 一份活
purpose: 每天打开先给约 10 条可选题（每条有推荐理由），人选中再变成一份活；高价值的可种成长期主题往下拆。不管账号。
owner: 蔡蔡
surface: desktop
structure:
  primary: feed
  secondary: pipeline
moment: 早上坐下第一件事，先选今天做什么

dials:
  cadence: 8
  input: 2
  depth: 7

roles:
  - { name: 内容员工, opens_daily: true, does: 看今日选题池、写一句话开工、选一份活或种成长期主题、再出拍法和稿 }
  - { name: 内容主管, opens_daily: false, does: 看全组没收完的活，不单独做一套后台 }

hook:
  text: "桌上还有 2 份活没收 · 今天选题池 10 条 · 先看「把一次做砸的事写成对照」"
  shape: imperative
  fields:
    - name: jobs.open_count
      reads: 桌上还有 2 份活没收
      writes: system
      source: 本机 tasks，stage 为 judge / need_evidence / adopted / making
      exists_today: true
      when: 选这个、改阶段、出稿时程序自己写
      day_one: 还没有进行中的活时，这条不出现，改说今天几个灵感
      stale: 以本机存储为准，不是外部数
    - name: pool.count
      reads: 今天选题池 10 条
      writes: derived
      from: 常青 + 案例 RSS + Newsletter RSS + 快报 + 热搜（热搜进池要过主题词，且最多 2 条）。没有种下的长期主题时不过滤，理由写弱。
      exists_today: true
      when: 打开首屏时扫一次（网页没有自己的定时器）
      day_one: 外部源全挂时仍出常青题，条数可以少于 10，不准编假题
      stale: 上次刷新 X 分钟前，标出来
    - name: pool.top.title
      reads: 先看「把一次做砸的事写成对照」
      writes: derived
      from: 选题池第一张；若有进行中的活，改说先把那份活收完
      exists_today: true
      when: 读时计算
      day_one: 先写一句话开工，或从常青题里挑一张
      stale: 用这次混出来的标题

cold_start:
  day_1: 热榜没起来也没关系。先写一句话开工，或从常青题里挑一张。
  day_2: 昨天选过一份活。今天灵感换了一批，进行中的活还在最上面。
  day_7: 这周收了几份活。热搜只贡献了其中一部分，常青和案例也有。
  re_entry: 离开几天了——直接看桌上的活和今天的灵感，不用补。

home:
  - hook
  - 进行中的活（最多 5 条，点一下回到那份活；没有就不占位）
  - 一句话开工（输入一句 + 开工，不经过热搜）
  - 今日选题池约 10 条：常青 + 案例/Newsletter + 快报 + 热搜至多 2。每条必须有推荐理由（来自这条本身，或和已种主题的关系）。不准十张同一句。点「换一批」必须换卡。
  - 每条两个动作：选这个（变成一份活）· 种成长期主题（不立刻拍）
  - 原料货架默认收起。灾难/事故/命案热搜可以进货架，不进选题池。

channels:
  - name: 今天
    type: today
    weight: primary
    does: 看今日选题池、写一句话开工、选这个变成一份活或种成长期主题；往下才是原料货架
    pages:
      - level: L1
        shows: 结论条 + 进行中的活 + 一句话开工 + 选题池（约 10 张，两列）。每张：标题、来源、推荐理由。原料货架 tab 在下，默认不打开热榜。
        filters: [来源]
        actions: [换一批, 开工, 选这个, 种成长期主题, 打开原文]
      - level: L2
        shows: 活页（见进行中的活 L2）
        actions: [跟, 不跟, 待补证, 选方向, 按格式出拍法和稿]
    tabs:
      - id: platform_hot
        name: 平台热榜
        shows: 双列实时热榜，条目标题 + 热度。这是货架，不是选题引擎。
        source: 60s API
        empty: 60s 没起来时写「本机 60s 还没开，默认地址 http://127.0.0.1:4399」。小红书热榜当前会报错，那一列留空并标明。
      - id: ai_brief
        name: AI 快报
        shows: 卡片列表，每条标题 + 摘要 + 来源时间
        source: AIHOT
        empty: 接不上时写「AIHOT 暂时连不上，稍后再刷」，不要编新闻。
      - id: marketing
        name: 营销情报
        shows: 图文卡片墙，只放案例和文章。数英全站 RSS 里的招聘频道一律丢掉。
        source: RSS（数英、Adweek、Communication Arts）
        empty: 一个源都没贴时：先贴数英 https://www.digitaling.com/rss。有源但只剩招聘时写「今天没有可看的案例或文章」。
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
        empty: 先在数据引擎贴对标链接。没有官方公开接口。这不是本产品的账号管理。

  - name: 进行中的活
    type: record
    weight: regular
    does: 把选中的灵感做成一份活：跟不跟、切哪几条、如何拍、如何写
    pages:
      - level: L1
        shows: 看板，列=待判断 / 待补证 / 已采纳 / 制作中 / 待复盘。卡片=一份活（切口标题 · 格式 · 有没有拍法和稿 · 从哪来）
        actions: [打开活页, 拖动改阶段]
      - level: L2
        shows: 活页，自上而下：这份活从哪来、做不做、深度扫描、1-3 个真不同的方向（Newsangle 在选定之后才跑）、金句、如何拍、如何写。方法全文来自 vendor/hiccai-newsangle/SKILL.md。证据不够或救不起来就写弱素材说明，不准硬编三条同质题。
        actions: [跟, 不跟, 待补证, 选一条方向, 按格式出拍法和稿, 改阶段]
    note: 处境是可选备注，不是进门问卷，更不是账号档案。没填也能开工，判断只看这份活本身。

  - name: 长期主题
    type: record
    weight: regular
    does: 把高价值话题种成一棵树：1 个主题 → 约 10 个子主题 → 约 20 个内容角度 → 格式 × 这一次拍给谁。叶子变成一份活。热点可以迁到树上，下次还长。
    pages:
      - level: L1
        shows: 主题卡片列表（名字 · 子主题数 · 还没做成活的叶子数 · 从哪条热/灵感种下）
        actions: [种一个, 打开主题]
      - level: L2
        shows: 一棵树。上层主题，中层子主题，下层角度。每个角度可标格式。点一片叶子 → 创建一份活。
        actions: [拆一次, 叶子变成活, 停用]
    note: 这不是账号档案。没种主题时选题池不过滤，理由写弱。拆树要密钥；没密钥交白卷，不准编 10×20。

  - name: 数据引擎
    type: record
    weight: regular
    does: 接源、改地址、贴 RSS、贴博主主页、放 API Key
    pages:
      - level: L1
        shows: 分组表单，不是表格：60s 实例地址 · AIHOT · RSS 列表 · 博主主页列表 · RedFox Key · Jina 是否启用
        actions: [保存, 测连通]

  - name: 月度复盘
    type: review
    weight: regular
    does: 回看这个月选了什么活、哪些做成了、哪些还停在待判断
    pages:
      - level: L1
        shows: 本月钉子 N · 活 M · 还停在待判断 K
    note: 还没选过活时，这页说「先选一份活，月底这儿才有得看」。

  - name: 设置
    type: knowledge
    weight: occasional
    does: 可选背景备注（不是账号档案）、姓名、大模型
    pages:
      - level: L1
        shows: 短表单分两块。一块是这次可能用得上的备注（行业/怎么说话/拍给谁/格式），明确写「不填也能开工」。一块是大模型：Base URL、API Key、对话模型、同步、测连通。默认 Agnes。没有密钥时选这个会说实话，不准编假题。

entities:
  - name: Inspiration
    fields: [id, title, url, summary, cover_url, origin, source_name, published_at, fetched_at, heat, why, do]
    written_by:
      { title: derived, url: integration, summary: integration, cover_url: integration,
        origin: system, source_name: integration, published_at: integration, fetched_at: system,
        heat: integration, why: derived, do: derived }
    relations: [Inspiration 0-1 Job]
    note: 产品上叫选题池条目。origin 取值 evergreen / case / news / newsletter / hot / custom。热搜进池最多 2 条且过主题词。why 是推荐理由，必须来自这条本身或和已种主题的关系。
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
    relations: [Pin n-1 Signal]
  - name: Job
    fields: [id, title, stage, verdict, pin_id, signal, format, topic_ideas, selected_index, no_signal, follow_reason, evidence, drafts, note, by, last_moved_at, created_at, error, origin]
    written_by:
      { title: derived, stage: user, verdict: user, selected_index: user, format: user, note: user,
        topic_ideas: system, no_signal: system, follow_reason: system, evidence: system, drafts: system,
        last_moved_at: system, created_at: system, by: user, error: system, origin: system }
    relations: [Job 0-1 Pin, Job 0-1 Theme]
    note: 存储里仍叫 tasks，产品上叫一份活。stage 取值 judge / need_evidence / adopted / making / review / skipped。
  - name: Theme
    fields: [id, title, from_pool_id, status, subthemes, planted_at]
    written_by: { title: user, from_pool_id: system, status: user, subthemes: system, planted_at: system }
    relations: [Theme 1-n Subtheme, Theme 0-n Job]
    note: 长期主题。status=active/paused。不是账号。
  - name: Subtheme
    fields: [id, theme_id, title, angles]
    written_by: { title: derived, angles: system }
    relations: [Subtheme n-1 Theme, Subtheme 1-n Angle]
  - name: Angle
    fields: [id, subtheme_id, title, format_hint, audience_hint, job_id]
    written_by: { title: derived, format_hint: derived, audience_hint: derived, job_id: system }
    relations: [Angle n-1 Subtheme, Angle 0-1 Job]
  - name: Notes
    fields: [niche, voice, audience, formats]
    written_by: { niche: user, voice: user, audience: user, formats: user }
    note: 存在 settings 里。不是账号档案，不是进门问卷。存储字段仍用 persona 表示 voice。formats 含 short_video / xhs / wechat / short_drama / bilibili / ad。
  - name: Query
    fields: [id, prompt, answer, created_at]
    written_by: { prompt: user, answer: system, created_at: system }

depends_on:
  - field: 小红书热榜
    source: 本机 60s /v2/rednote
    exists_today: false
    until_then: 本机用 Bun 跑 vendor/60s，端口 4399，不用 Docker。微博/知乎/抖音/B站/头条/百度热榜能用；小红书热榜返回 500。平台热榜页这一列标明「小红书热榜暂时读不到」。
  - field: 梅花网案例
    source: 梅花网原生 RSS
    exists_today: false
    until_then: 营销情报先用数英 / Adweek / Communication Arts。梅花网 /rss 是 404。
  - field: 关注博主最新笔记
    source: 小红书官方公开接口
    exists_today: false
    until_then: 没有官方接口。第一版只收主页链接，读失败就标明风控。这不是账号管理。
  - field: 低粉高赞笔记
    source: RedFox API
    exists_today: false
    until_then: 需要 API Key，本机没有。低粉高赞页不要显示任何爆款卡片。
  - field: 选题生成所用模型
    source: Agnes chat completions（https://apihub.agnes-ai.com/v1），密钥来自设置或 AGNES_API_KEY
    exists_today: false
    until_then: 没密钥就交白卷。证据只用这份活本身，不得写成趋势。图/视频接口以后用，这一步只用文本。
  - field: YouTube 公开内容
    source: 频道公开 RSS 或官方 API
    exists_today: false
    until_then: 第一刀选题池不进 YouTube。没有稳定源不准在首屏冒充有数。
  - field: TrendRadar / newsnow 云端热榜
    source: sansan0/TrendRadar 所依赖的 newsnow API
    exists_today: false
    until_then: 热榜继续用本机 60s。不把 TrendRadar 整仓搬进 OSSA（GPL-3.0、Docker、推送）。只借「主题词过滤 + 同一热词跨时段出现」的方法，自己在选题池里做。

mvp:
  - 今日选题池（约 10 条，每条有推荐理由；常青 + 案例/RSS + 快报 + 至多 2 条热搜）
  - 一句话开工
  - 选这个 → 一份活；种成长期主题
  - Newsangle 在选定之后（跟不跟 + 1-3 条方向）
  - 选定方向后再出如何拍 / 如何写（短视频 / 小红书 / 公众号）
  - 数据引擎
  - 设置里的可选备注和大模型
later:
  - 长期主题拆树（1 → 10 子主题 → 20 角度 → 叶子变活）
  - 同一份活上一次出多格式（飞轮下游，不上画布）
  - Newsletter 当作 RSS 贴进数据引擎
  - 关注博主
  - 低粉高赞
  - 搜索内容
  - 月度复盘深化（哪些判断对了）

visual: 浅底编辑部，侧栏窄、主区像早报。标题就用「先选项，再拍写」。卡片有封面的用封面，热榜用双列清单。不要后台蓝，不要仪表盘大数字墙。

seam:
  type: none
  why: 这是自己用的台子，钱不在这一页上收

excluded:
  - 做成 App / 推送 / 角标：这是网页
  - 登录、租户、计费
  - 在没接到源的频道里塞假热榜、假爆款
  - 一键生成 20 个万能标题、和这份活无关的空灵感
  - 把热搜写成「正在爆发、必须跟」
  - 单独再开一个「AI 写作」页——写和拍都挂在这份活上
  - 视频没演示的发布、排期、一键发小红书
  - 账号模块：不建号、不切号、不档案、不进门问卷「你是谁」
  - 选题只从热搜长出来
  - 把没流量的创作者只推向「行业支柱题」
  - 营销情报里放招聘、跳槽、求职信息
  - 把 content-flywheel 的节点画布搬进 OSSA
  - 把口播稿设成唯一母体
  - 把 sansan0/TrendRadar 或 joyce677/TrendRadar 整仓搬进 OSSA（GPL-3.0、Docker、手机推送）
  - 用 newsnow 云端 API 顶替本机 60s
  - 进门用「内容主题」当人设问卷

deferred:
  - TikHub / 作品评论全量采样：第一期证据就是这份活本身，薄就交白卷
  - 完整内容生产台（分镜、发布）
  - 自己养一套小红书爬虫：等有稳定源或 key 再做，不在第一版硬爬
  - 把先觉整站搬进来：只搬判断记录和初稿结构，不搬 Next.js / 登录 / TikHub
  - YouTube 官方接口 / 稳定频道爬取
  - 本机 cron 定时扫（网页打开时扫一次；真要定时另说）
  - TrendRadar 当并列服务：只有确认不碰 Docker、不把 GPL 代码拷进 OSSA 时才考虑

evidence:
  video: /Users/caiwenbin/Desktop/8月28日.mp4
  duration_s: 218
  product_on_screen: Media OS 个人内容经营台（本地 127.0.0.1:4319）
  title_on_screen: 借鉴借鉴，只是借鉴
  nav_on_screen: [近期热点, 任务推进, 数据引擎, 月度复盘]
  tabs_on_screen: [平台热榜, AI快报, 营销情报, 关注博主, 低粉高赞, 搜索内容]
  revision: 选题池 10 条 + 长期主题树；TrendRadar 只借过滤方法不搬仓
---

## 这个台子是给谁的

蔡蔡。地产营销和品牌做了二十年，现在用 AI 把提案、小红书、视频一条链做出来。也给内容创作者、自媒体、企业内容组用——但对象不是「某类人」，是**这一份活**。

不管账号。不建号、不切号、不档案。进门不问「你是谁」。一个人可能有多个号、多个 IP，系统不去管。

创作者不止拍视频：公众号文字、小红书图文、短视频，都是这份活上的格式，不是身份。

## 每天怎么用

早上坐下，打开这一页。

最上面一句已经告诉你：桌上还有几份活没收；今天选题池几条。进行中的活排在最前。下面一句话就能开工。再下面约 10 张选题卡，每张有推荐理由。热搜最多两张，且要过已种主题词；没种主题就不过滤，理由写弱。

点「选这个」变成一份活。点「种成长期主题」不立刻拍，以后拆成子主题和角度。Newsangle 仍在选定一份活之后才跑。拍法和稿在选定方向之后才出。同一份活以后可以一次出短视频 / 小红书 / 公众号，不必先写口播。

热搜还在，降到原料货架。热闹不等于选题。一个热点跟完可以留在主题树上。

离开几天再回来，先看桌上的活和今天的池子，不用补。网页打开时扫一次，没有自己的闹钟。

## 为什么是这几个频道

- **今天**是每天落地的地方。选题池在上，货架在下。
- **进行中的活**是看板。点进去是活页。
- **长期主题**是树，不是账号。叶子变成活。
- **数据引擎**是所有源的开关。Newsletter 就是 RSS。
- **月度复盘**给这周、这个月一个交代。
- **设置**放大模型和可选备注。备注不是进门问卷。

故意没做的：账号、一键发小红书、团队权限、手机 App。

## 已经想过但没做的

- 作者那台免费演示（Cloudflare）：不走。热榜已经改成本机 60s。
- 小红书热榜：60s 的 /v2/rednote 现在报错，这一列先空着。
- 关注博主、低粉高赞进第一版主路径：频道留着，空状态说真话。
- 梅花网：原生 RSS 没找到，先用数英、Adweek、Communication Arts。
- 完整的内容生产台（分镜、发布）：另一次的事。
- 把先觉整站搬进来：不搬 Next.js / 登录 / TikHub。
- content-flywheel 的节点画布：不搬。只借「一份内容多格式」放在活页下游。
- sansan0 / joyce677 的 TrendRadar：不整仓搬进。热榜继续本机 60s。只借主题词过滤。GPL-3.0、Docker、飞书/微信推送都不进 OSSA。
- YouTube 官方接口：第一刀不做。

## 给实现方（不熟悉本规范的 AI 或开发，照这段做即可）

- **这是一个网页**（电脑浏览器里打开），不是 App。没有推送，所以首屏最上面那条 hook 是唯一让人明天还回来的东西——它是整页最重要的一行，不要缩成卡片标题，不要塞进顶部问候栏。
- **首屏按 home 的顺序从上到下排**，第一行是 hook。进行中的活在灵感卡上面。一句话开工在灵感卡上面。原料货架在灵感卡下面。
- **hook 里每个数字都在 hook.fields 里标了来源。** 允许出现在 hook 里的是进行中的活数量、今天灵感数量、先看哪一张。没有进行中的活时，不要写「0 份活」，直接改说今天几个灵感。
- **选题池约 10 条，必须混源。** 常青至少 2 张。热搜最多 2 张且过主题词（没种主题则不过滤）。每条有推荐理由，不准十张同一句。外部源全挂时仍出常青，不准编假题。
- **「选这个」才创建一份活。「种成长期主题」不创建活。** 一句话开工走选这个同一条路径，来源标成 custom。
- **Newsangle 在选定之后。** 首屏灵感卡不要跑大模型。点选这个以后才生成跟不跟和 1-3 个方向。如何拍 / 如何写必须先选定方向。
- **不管账号。** 不要做账号列表、切换、档案。设置里的行业 / 说话方式 / 拍给谁是可选备注，文案必须写「不填也能开工」。
- **格式按这份活，不按身份。** 短视频、小红书图文、公众号文字都挂在这份活上。不要把口播设成唯一母体，不要上节点画布。
- **长期主题不是账号。** 没种主题时选题池照出。拆树没密钥就交白卷。
- **不要接入 TrendRadar / newsnow 云端顶替 60s。** 不要做手机推送。
- **depends_on 里的字段现在还没有可用数据。** 别在首屏显示它，也别显示 0，按 until_then 那一行处理。
- **数据库照 entities 建。** 存储可以继续用 tasks 字段名，界面叫一份活。
- **channels 就是左侧主导航。** `weight: primary` 的「今天」是默认落地页。近期热点六个子频道变成同一 L1 上的原料货架 tab。
- **空数据时显示 cold_start.day_1，或该 tab 自己的 empty 句子。** 那是一个动作，不是「暂无数据」。**不要塞假的热榜或假爆款。**
- **roles 就当一个人在用。** 不要做登录权限系统。
- **第一版只做 mvp。** later 的可以在导航留位，点进去是空状态。
- **没有模型密钥时选这个给出动作句，不要编三条假题。**
- **不得把一次采样写成趋势。**
- **视觉按 visual 那一行。** 标题「先选项，再拍写」是产品态度。
- **页面主体形态是信息流 / 早报**，不是监控大屏，也不是后台表格。
