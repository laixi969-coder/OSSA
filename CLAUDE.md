# OSSA — 企业内容经营台

这是一个**电脑浏览器里打开的内容经营台**，给企业内容员工用：每天打开，先告诉你今天做什么、凭什么做。一台实例一个公司，员工在设置里写自己的名字，钉子和选题全组共享。不做登录、租户、计费。

## 真源

- 产品定义只认一份：`.workbench/spec.md`
- 改产品（模块、数据从哪来、首屏那句话）先改 spec，再改页面
- 本文件只写工作约定，不写界面

## 现在做到哪

- 已完成：工作台定义（spec）
- 已完成：第一版页面（近期热点 + 数据引擎）
- 已完成：热点做成选题（跟不跟、Newsangle 切口/标题/Hook、如何拍/如何写）
- 热榜服务：本机 Bun 跑 `vendor/60s`，不用 Docker

## 目录

```
OSSA/
├── CLAUDE.md              ← 本文件
├── .workbench/spec.md     ← 产品定义
├── app/                   ← 我们的工作台（页面 + 本地服务）
│   ├── server.ts
│   ├── topic.ts           ← 选题简报 + 拍法/文稿（调 Agnes）
│   ├── newsangle.ts       ← 加载并执行 hiccai-newsangle 方法原文
│   └── public/            ← index.html / styles.css / app.js
├── data/store.json        ← 钉子、选题、源配置（本机，不进密钥仓库）
└── vendor/
    ├── 60s/               ← 上游热榜服务，不改它的业务逻辑
    └── hiccai-newsangle/  ← 爆点猎手方法原文，不改 SKILL.md
```

`vendor/` 只放别人的仓库。要换版本就重新拉，不要在里面做我们自己的功能。

密钥（RedFox Key、Agnes Key）只存在 `data/store.json` 或本机环境变量 `AGNES_API_KEY`，不要写进代码、不要 commit、不要发在聊天里。用户在设置页自己贴。没有密钥时做成选题必须说实话，不准编假题。

大模型在设置页配置：Base URL、API Key、对话模型、同步 `/models`、测连通。默认 Agnes `https://apihub.agnes-ai.com/v1` + `agnes-2.5-flash`。选题只用对话模型；图/视频模型会出现在同步列表里，这一步还不调用。

## 怎么打开

两个服务都要在。**不用 Docker。**

1. 热榜（端口 4399），若还没开：

```bash
cd /Users/caiwenbin/OSSA/vendor/60s && PORT=4399 bun run bun.ts
```

2. 工作台（端口 4319）：

```bash
cd /Users/caiwenbin/OSSA && bun run app/server.ts
```

浏览器打开：http://127.0.0.1:4319

## 数据源底线

首屏数字必须有真实来源。来源接不上时，显示 spec 里的空状态句子，不准填假数据充场面。

当前能用 / 不能用，以 spec 的 `depends_on` 为准。

## 验证

改完定义或实现后，至少确认：

1. 没接数据时，首屏说的是动作句，不是「暂无数据」或 0
2. 已接上的源（本机 60s 热榜、AIHOT、数英 RSS、Adweek RSS）能拉到今天的条目
3. 没接上的源（60s 的小红书热榜、关注博主、低粉高赞）不会在首屏冒充有数
4. 没填处境、没密钥时，「做成选题」给出动作句，不编三条假题
5. 设置页大模型可同步列表、测连通；浏览器强制不缓存 js/css，避免还显示旧的 xAI 文案
6. 有密钥时，从一条真实热点能进选题卡，看到跟不跟和可拍的题；再点出拍法和稿
