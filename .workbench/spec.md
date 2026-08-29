---
name: OSSA 内容经营台
domain: system
subject: 一份活
purpose: 每天打开先给当下大家都在谈的几场（每场说清大家正在怎么写），人选中再变成一份活；点进去才出不同切入点。高价值的可种成长期主题往下拆。不管账号。
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
  - { name: 内容员工, opens_daily: true, does: 看今日几场讨论、写一句话开工、选一场变成活或种成长期主题、点进去再出切入点和拍写；需要时打开一场的事件地图 }
  - { name: 内容主管, opens_daily: false, does: 看全组没收完的活，不单独做一套后台 }

hook:
  text: "桌上还有 2 份活没收 · 今天 4 场可进 · 先看这场在吵什么"
  shape: imperative
  fields:
    - name: jobs.open_count
      reads: 桌上还有 2 份活没收
      writes: system
      source: 本机 tasks，stage 为 judge / need_evidence / adopted / making
      exists_today: true
      when: 选这个、改阶段、出稿时程序自己写
      day_one: 还没有进行中的活时，这条不出现，改说今天几场可进
      stale: 以本机存储为准，不是外部数
    - name: pool.count
      reads: 今天 4 场可进
      writes: derived
      from: 热搜（最多 2，小红书/抖音/B站）+ 讨论（知乎/微博）+ 刷屏案例，外加 21 天内节点。常青只在场不足时开工，不当题。热搜是场的证据，理由写弱。过主题词；没种主题不过滤。有认的领域时往这边偏，不硬清空。首屏不跑大模型，不把热搜标题改成可发稿。
      exists_today: true
      when: 打开首屏时扫一次（网页没有自己的定时器）
      day_one: 外部源全挂时仍出常青开工卡，场数可以少于 3，不准编假场
      stale: 上次刷新 X 分钟前，标出来
    - name: pool.top.title
      reads: 先看这场在吵什么
      writes: derived
      from: 选题池第一场的原题；若有进行中的活，改说先把那份活收完
      exists_today: true
      when: 读时计算
      day_one: 先写一句话开工，或从常青题里挑一张
      stale: 用这次混出来的标题

cold_start:
  day_1: 热榜没起来也没关系。先写一句话开工，或从常青题里挑一张。
  day_2: 昨天选过一份活。今天换了一批场，进行中的活还在最上面。
  day_7: 这周收了几份活。热搜只贡献了其中一部分，常青和案例也有。
  re_entry: 离开几天了——直接看桌上的活和今天的灵感，不用补。

home:
  - hook
  - 进行中的活（最多 5 条，点一下回到那份活；没有就不占位）
  - 一句话开工（输入一句 + 开工，不经过热搜）
  - 今日选题池 3～5 场：热搜（最多 2）+ 讨论 + 案例，临近节点另加。卡片写这场在吵什么、大家正在怎么写、为什么现在有量。标题保持原题，禁止改成「这件事我只讲一句」。点「选这个」是进场；切入点在选定之后才出。常青只在场不足时出现。点「换一批」必须换卡。
  - 每条两个动作：选这个（变成一份活）· 种成长期主题（不立刻拍）
  - 原料货架默认收起。灾难/事故/命案热搜可以进货架，不进选题池。

channels:
  - name: 今天
    type: today
    weight: primary
    does: 看今日选题池、写一句话开工、选这个变成一份活或种成长期主题；往下才是原料货架
    pages:
      - level: L1
        shows: 结论条 + 进行中的活 + 一句话开工 + 选题池（3～5 场 + 临近节点，两列）。每张：这场原题、来源（场 · 热搜/讨论/案例/节点）、大家正在怎么写。原料货架 tab 在下，默认不打开热榜。
        filters: [来源]
        actions: [换一批, 开工, 选这个, 种成长期主题, 事件地图, 打开原文]
      - level: L2
        shows: 活页（见进行中的活 L2）
        actions: [跟, 不跟, 待补证, 选方向, 按格式出拍法和稿]
    tabs:
      - id: platform_hot
        name: 平台热榜
        shows: 三列，默认小红书 / 抖音 / B站。这是舞台。微博可切，不作为进门。
        source: 60s API
        empty: 60s 没起来时写「本机 60s 还没开」。某一列读不到就标明，不要用别的平台顶上。
      - id: cases
        name: 案例
        shows: 别人刚做成的：数英等图文卡片。只放案例和文章，招聘丢掉。默认是营销圈成品，不是美妆/职场专区。
        source: RSS（数英、Adweek、Communication Arts；group=marketing）
        empty: 一个源都没贴时：先贴数英 https://www.digitaling.com/rss。你领域的案例源也去数据引擎贴，不要等产品开一格美妆或职场。
      - id: talk
        name: 讨论
        shows: 双列，默认知乎 + 微博。问题本身就是选题。
        source: 60s 知乎 / 微博
        empty: 读不到就标明。
      - id: nodes
        name: 节点
        shows: 未来 60 天里值得做内容的日子（开学、节气、中秋、国庆、双11、春节等）。派生，不是爬来的新闻。
        source: 本机日历
        empty: 不会空。没有即将到来的节点时写「近两个月没有大节点，先做常青。」
      - id: subscribe
        name: 订阅
        shows: 你自己贴的 RSS + AI 快报。科技、开源、newsletter、行业媒体都进这里，不按领域拆格。
        source: RSS（group 不是 marketing）+ AIHOT
        empty: 去数据引擎贴你自己领域的 RSS。美妆贴美妆源，地产贴地产源。
      - id: creators
        name: 对标
        shows: 按主页贴的对标更新。是你认的人，不是产品给你的行业榜。不是账号管理。
        source: 主页链接 + Jina
        empty: 先在数据引擎贴对标链接。没有官方公开接口。

  - name: 事件地图
    type: tool
    weight: regular
    does: 输入任意网络事件，把公开新闻、社交讨论、图片、热梗和衍生品铺成可拖的证据墙；用图钉和线绳标报道、引用、转发、二创、商业关系。同一主题再搜是补新卡、不推倒重来。不是进门首页，不是判决墙。
    pages:
      - level: L1
        shows: 无限画布，证据地图。顶栏：任意事件输入（占位「孙宇晨 景甜」，可改成任何公开事件）+ 铺开 + 更新。结论条=N 张证据 · 新到 M 张 · 最早/最晚日期 · 上次搜于何时。卡片可拖。种类=新闻简报 / 社交帖子 / 表情包 / 图片 / 便签 / 衍生品。线绳=报道 / 引用 / 转发 / 二创 / 商业。时间从左到右。再搜时旧卡位置保留，新卡补在时间轴右侧。
        filters: [卡片种类, 关系种类]
        actions: [铺开, 更新, 拖卡片, 拉线, 钉便签, 打开原文, 选这个变成活]
      - level: L2
        shows: 单张证据。原文链接、时间、来源、摘要、关键词、图。标明是报道、单方陈述、当事人回应还是二创。诉讼和感情纠纷不下结论。
        actions: [打开原文, 选这个变成活, 种成主题, 钉便签]
    note: 查询词任意公开事件，不写死某一桩。点铺开才搜。再点更新=同一场补新证据，不抹掉已拖位置和便签。某类源挂了墙上留空并标明。不准用假卡充墙。从选题池点「事件地图」时，输入框带入这场原题。

  - name: 进行中的活
    type: record
    weight: regular
    does: 把选中的灵感做成一份活：跟不跟、切哪几条、如何拍、如何写
    pages:
      - level: L1
        shows: 看板，列=待判断 / 待补证 / 已采纳 / 制作中 / 待复盘。卡片=一份活（切口标题 · 格式 · 有没有拍法和稿 · 从哪来）
        actions: [打开活页, 拖动改阶段]
      - level: L2
        shows: 活页，自上而下：这份活从哪来、做不做、深度扫描、1-3 个真不同的方向（Newsangle 在选定之后才跑）、金句、如何拍、如何写。方法全文来自 vendor/hiccai-newsangle/SKILL.md。标题、Hook、口播、正文必须能直接照搬；提纲、策略、可以考虑，作废重出。证据不够或救不起来就写弱素材说明，不准硬编三条同质题。
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
        shows: 短表单分两块。一块是这次可能用得上的备注（行业最多 1–3 个、怎么说话、拍给谁、格式），明确写「不填也能开工」。行业不是货架格子，是选题池/案例/订阅的滤镜。一块是大模型：Base URL、API Key、对话模型、同步、测连通。默认 Agnes。没有密钥时选这个会说实话，不准编假题。

entities:
  - name: Inspiration
    fields: [id, title, url, summary, cover_url, origin, source_name, published_at, fetched_at, heat, why, do]
    written_by:
      { title: derived, url: integration, summary: integration, cover_url: integration,
        origin: system, source_name: integration, published_at: integration, fetched_at: system,
        heat: integration, why: derived, do: derived }
    relations: [Inspiration 0-1 Job]
    note: 产品上叫选题池条目。origin 取值 evergreen / case / news / newsletter / hot / talk / node / custom。热搜进池最多 2 条且过主题词。why 写这场大家正在怎么写，不是可发稿。
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
    note: 存在 settings 里。不是账号档案，不是进门问卷。存储字段仍用 persona 表示 voice。niche 最多拆成 1–3 个领域词；空着则用已种长期主题名顶上，仍不超过 3 个。有领域只偏置，不硬过滤。formats 含 short_video / xhs / wechat / short_drama / bilibili / ad / live。live=直播场次，拍写加载 app/live-method.md（从 LiveStream-Agent-Studio 抽出的方法，不搬仓）。
  - name: Query
    fields: [id, prompt, answer, created_at]
    written_by: { prompt: user, answer: system, created_at: system }
  - name: Dig
    fields: [id, query, status, started_at, finished_at, fetched_at, card_count, link_count, new_count, earliest_at, newest_at]
    written_by:
      { query: user, status: system, started_at: system, finished_at: system, fetched_at: system,
        card_count: derived, link_count: derived, new_count: derived, earliest_at: derived, newest_at: derived }
    relations: [Dig 1-n EvidenceCard, Dig 1-n EvidenceLink]
    note: 一场事件地图按 query 归一后复用。status=idle/running/done/failed。占位词「孙宇晨 景甜」，可换成任何事件。再搜是迭代：new_count 是这次新到的张数。没搜过不显示 0。
  - name: EvidenceCard
    fields: [id, dig_id, kind, title, url, source_name, published_at, summary, keywords, image_url, stance, x, y, created_at, first_seen_at, last_seen_at]
    written_by:
      { kind: system, title: integration, url: integration, source_name: integration, published_at: integration,
        summary: integration, keywords: derived, image_url: integration, stance: derived,
        x: user, y: user, created_at: system, first_seen_at: system, last_seen_at: system }
    relations: [EvidenceCard n-1 Dig]
    note: kind=news/post/meme/image/note/derivative。stance=报道/单方陈述/当事人回应/二创。x,y 初次按时间铺，人拖过的更新时保留。first_seen_at / last_seen_at 用来标新到。便签 kind=note。没有 url 的卡不准进墙，便签除外。旧卡这次没搜到也不删，标过期即可。
  - name: EvidenceLink
    fields: [id, dig_id, from_id, to_id, relation, note, created_at]
    written_by: { relation: derived, note: user, created_at: system }
    relations: [EvidenceLink n-1 Dig, EvidenceLink n-1 EvidenceCard]
    note: relation=report/quote/repost/remix/business。标不清就先不连，不要为了墙好看硬连。

depends_on:
  - field: 小红书热榜
    source: 本机 60s /v2/rednote
    exists_today: false
    until_then: 本机用 Bun 跑 vendor/60s，端口 4399，不用 Docker。创作主场默认小红书/抖音/B站。小红书热榜若再报错，那一列留空并标明，不要用微博顶上。
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
  - field: 事件地图公开检索
    source: 公开网页检索（新闻站、社交公开页、图片检索）。不是小红书登录爬虫，不是付费数据商。
    exists_today: true
    until_then: 任意公开事件都可查。点铺开才搜，点更新补新卡。搜到的才上墙。某类搜不到就空着。不准用假卡。占位词不是剧本。

mvp:
  - 今日选题池（3～5 场 + 临近节点；热搜最多 2；常青只在场不足时开工）
  - 一句话开工
  - 选这个 → 一份活；种成长期主题
  - Newsangle 在选定之后（跟不跟 + 1-3 条方向）
  - 选定方向后再出如何拍 / 如何写（短视频 / 小红书 / 公众号 / 直播场次）
  - 直播场次方法（app/live-method.md）：认对象、拆场次、编一场、复盘。没有录屏也按循环出稿，缺证据标待补证。不搬 LiveStream-Agent-Studio。
  - 数据引擎
  - 设置里的可选备注和大模型
  - 公开说明页 /about.html + llms.txt（SEO / GEO）
  - 事件地图：任意事件可查 + 公开检索铺证据墙（可拖；更新时合并旧卡；假卡不准进墙）
later:
  - 长期主题拆树（1 → 10 子主题 → 20 角度 → 叶子变活）
  - 同一份活上一次出多格式（飞轮下游，不上画布）
  - Newsletter 当作 RSS 贴进数据引擎
  - 关注博主
  - 低粉高赞
  - 月度复盘深化（哪些判断对了）
  - 用户贴录屏 / 逐字稿 / 分钟表之后，按场次方法真切三列事件、对齐流量。转写用设置里已有的模型，不锁阿里云。
  - 对标格子读「最近一场」当原料（贴主页，不接蝉妈妈）

visual: 浅底暖石编辑部，侧栏炭色、主区早报。无衬线。登录左右分栏：左静物图+口号，右表单，不居中。选题池两列不对称。关于页不对称分栏，不做成营销站。跟随系统深浅色。标题「先选项，再拍写」靠字重和字距，不大吼。不要后台蓝、不要紫光、不要仪表盘大数字墙。

seam:
  type: none
  why: 这是自己用的台子，钱不在这一页上收

excluded:
  - 做成 App / 推送 / 角标：这是网页
  - 租户计费、结账、付款页：钱不在这一页上收
  - 进门问卷、验证邮箱、找回密码（本机不发信）
  - 在没接到源的频道里塞假热榜、假爆款、假证据卡
  - 一键生成 20 个万能标题、和这份活无关的空灵感
  - 把建议写成方案大纲、拍摄策略、「可以考虑」「第一段讲xx」；交给创作者的句子必须能直接发、直接念、直接贴
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
  - 按选题领域给货架开格子（美妆 / 职场 / 母婴 / 地产……）；领域是滤镜（设置行业 + 已种主题，最多 1–3 个），靠订阅、对标、长期主题覆盖
  - 把 LiveStream-Agent-Studio 整仓搬进 OSSA（Windows 专用、蝉妈妈、DashScope/OSS、快抖录制、电商货盘、主播库）
  - 做成直播运营台或主播发现后台；对象仍是一份活，不是一场直播、一个主播
  - 把工作台 SPA（/）拿去给搜索引擎当官网：那一页是工具，noindex；可被检索的是 /about.html
  - 把事件地图做成进门首页或吃瓜判决墙：它是工具页，不下结论、不替法院定性
  - 为了墙好看编假卡、硬连线；搜不到的类型必须空着

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
  revision: 选题池选场；事件地图接任意公开事件，更新时合并不推墙
---

## 这个台子是给谁的

蔡蔡。地产营销和品牌做了二十年，现在用 AI 把提案、小红书、视频一条链做出来。也给内容创作者、自媒体、企业内容组用——但对象不是「某类人」，是**这一份活**。

不管账号。不建号、不切号、不档案。进门不问「你是谁」。一个人可能有多个号、多个 IP，系统不去管。

创作者不止拍视频：公众号文字、小红书图文、短视频，都是这份活上的格式，不是身份。

## 每天怎么用

早上坐下，打开这一页。

最上面一句已经告诉你：桌上还有几份活没收；今天几场可进。进行中的活排在最前。下面一句话就能开工。再下面 3～5 场当下的讨论（热搜最多两张，外加临近节点）。每张写这场在吵什么、大家正在怎么写；标题保持原题。热搜过已种主题词；没种主题就不过滤，理由写弱。

点「选这个」是进这场，变成一份活。点「种成长期主题」不立刻拍，以后拆成子主题和角度。Newsangle 仍在选定一场之后才跑，出 2～3 个真不一样的切入点。拍法和稿在选定方向之后才出。同一份活以后可以一次出短视频 / 小红书 / 公众号，不必先写口播。

热搜是场的证据，也留在原料货架。热闹不等于选题，跟榜那句话不是切入点。一个热点跟完可以留在主题树上。

要看一场是怎么传开的，点「事件地图」，或打开左侧事件地图。顶栏填任意公开事件（占位可以是「孙宇晨 景甜」）。点铺开；过一阵点更新，新报道补上来，已拖过的卡不动。搜不到的类型空着。这页不下判决。从一张证据也能「选这个」变成一份活。

离开几天再回来，先看桌上的活和今天的池子，不用补。网页打开时扫一次，没有自己的闹钟。

## 为什么是这几个频道

- **今天**是每天落地的地方。选题池在上，货架在下。
- **进行中的活**是看板。点进去是活页。
- **长期主题**是树，不是账号。叶子变成活。领域落在这棵树上和设置备注里，不落在货架格子上。
- **数据引擎**是所有源的开关。Newsletter 就是 RSS。创作者自己领域的源从这里贴。
- **月度复盘**给这周、这个月一个交代。
- **设置**放大模型和可选备注。备注不是进门问卷。
- **事件地图**是带着词去找的工具，不是货架第七格。进门仍是今天。墙只铺公开结果。默认主题是查询词，不是剧本。

故意没做的：账号、一键发小红书、团队权限、手机 App、把事件地图做成进门或判决墙。

## 原料货架为什么是这六格

货架按创作者**找选题时在干什么**切，不按选题领域切。

领域会很多：美妆、职场、母婴、地产、数码、情感……产品一开「美妆格」就会漏掉另外 80%。领域覆盖靠四件事：设置里认的 1–3 个行业词、你贴的订阅、你贴的对标、你种的长期主题。认了领域，选题池往这边偏，不把别的格子改成美妆/职场专区。

创作者找选题只有六种活，不多不少：

1. **平台热榜** — 舞台上今天在吵什么
2. **案例** — 别人刚做成什么样（可拆的成品）
3. **讨论** — 人在问什么、吵什么（问题即选题）
4. **节点** — 日子到了没有（可预期的内容场）
5. **订阅** — 我认的源出了什么
6. **对标** — 我认的人发了什么

故意并掉、不开新格的：AI快报 / 科技 / 开源（进订阅）；低粉高赞（没源，本质是案例切片）；搜索不再开空壳货架格——带着词去找的事放在事件地图；美妆 / 职场 / 地产等垂直领域（那是用户的源和树，不是产品的格子）。

默认货会偏营销案例和科技快报，那是冷启动填充，不是把用户定义成科技创作者。贴了自己的源，那些才是你的货。

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
- 事件地图用假卡充场面、把单方长文写成已证实事实：不做。搜不到就空着。

## 给实现方（不熟悉本规范的 AI 或开发，照这段做即可）

- **这是一个网页**（电脑浏览器里打开），不是 App。没有推送，所以首屏最上面那条 hook 是唯一让人明天还回来的东西——它是整页最重要的一行，不要缩成卡片标题，不要塞进顶部问候栏。
- **首屏按 home 的顺序从上到下排**，第一行是 hook。进行中的活在灵感卡上面。一句话开工在灵感卡上面。原料货架在灵感卡下面。
- **hook 里每个数字都在 hook.fields 里标了来源。** 允许出现在 hook 里的是进行中的活数量、今天几场可进、先看哪一场。没有进行中的活时，不要写「0 份活」，直接改说今天几场。
- **选题池选场，不选热搜标题。** 3～5 场来自热搜（最多 2，小红书/抖音/B站）+ 讨论（知乎/微博）+ 刷屏案例，临近 21 天节点另加。常青只在场不足时开工，不当题。过主题词（没种主题则不过滤）。有认的领域时往这边偏。首屏不跑大模型。卡片标题保持原题，下面写大家正在怎么写（通常是复述标题），禁止「这件事我只讲一句」「可以去做」「适合做态度」。外部源全挂时仍出常青开工卡，不准编假场。
- **可执行闸门。** 闸门管的是选定之后的方向/拍写，不管选题池卡片。方向里的标题/Hook、拍写里的开头/口播/正文，必须能照搬。出现「可以考虑」「不妨」「第一段讲」「拍摄方案」就作废重出。做不到成片文件，但字必须能直接用。
- **领域不是货架 tab。** 不要加美妆格、职场格。设置里的行业备注文案必须写「最多 1 到 3 个，不填也能开工」。
- **「选这个」才创建一份活。「种成长期主题」不创建活。** 一句话开工走选这个同一条路径，来源标成 custom。
- **Newsangle 在选定之后。** 首屏不跑大模型。点选这个是进场，之后才生成跟不跟和 2-3 个真不一样的切入点。如何拍 / 如何写必须先选定方向。
- **不管创作账号。** 不要做小红书/抖音号列表、切换、档案。工作台登录是为了把每个人的活隔开，不是人设。设置里的行业 / 说话方式 / 拍给谁是可选备注，文案必须写「不填也能开工」。
- **登录门。** 邮箱 + 密码 + 验证码。密码可点小眼睛查看/关闭。每人一份工作区，互相看不见。进门不问行业。没有结账。验证码、限流、蜜罐防机器人。密钥仍只存在本机各自的工作区。超级管理员邮箱写死为 `66445039@qq.com`：用这个邮箱注册即管理员，密码自己设，不进代码、不进仓库。其他人拿不到管理员的工作区，界面也不展示管理员身份。
- **格式按这份活，不按身份。** 短视频、小红书图文、公众号文字、直播场次都挂在这份活上。直播场次出拍写时必须加载 `app/live-method.md` 全文。不要把口播设成唯一母体，不要上节点画布，不要做成主播后台。
- **长期主题不是账号。** 没种主题时选题池照出。拆树没密钥就交白卷。
- **不要接入 TrendRadar / newsnow 云端顶替 60s。** 不要做手机推送。
- **depends_on 里的字段现在还没有可用数据。** 别在首屏显示它，也别显示 0，按 until_then 那一行处理。
- **数据库照 entities 建。** 存储可以继续用 tasks 字段名，界面叫一份活。
- **channels 就是左侧主导航。** `weight: primary` 的「今天」是默认落地页。事件地图是工具页，不是进门。原料货架六个 tab 是逛法（舞台 / 案例 / 讨论 / 节点 / 订阅 / 对标），不是选题领域。不要再加美妆格、职场格，也不要把事件地图塞进货架当第七格。
- **事件地图 L1 是无限画布证据墙**，不是表格。任意公开事件都可查。顶栏输入 + 铺开 + 更新。更新按 url 合并：旧卡位置和便签保留，新卡标「新到」，没再搜到的旧卡不删。结论条读张数、新到、最早/最晚、上次搜于何时；没搜过不显示 0。某类源挂了留空。不准编假卡。stance 标报道/单方陈述/当事人回应/二创。诉讼不下结论。有链接才上墙（便签除外）。
- **事件地图不改今天的 hook。** 今天仍说桌上的活和几场可进。
- **空数据时显示 cold_start.day_1，或该 tab 自己的 empty 句子。** 那是一个动作，不是「暂无数据」。**不要塞假的热榜或假爆款。**
- **roles 就当一个人在用。** 不要做登录权限系统。
- **第一版只做 mvp。** later 的可以在导航留位，点进去是空状态。
- **没有模型密钥时选这个给出动作句，不要编三条假题。**
- **不得把一次采样写成趋势。**
- **视觉按 visual 那一行。** 标题「先选项，再拍写」是产品态度。
- **页面主体形态是信息流 / 早报**，不是监控大屏，也不是后台表格。
