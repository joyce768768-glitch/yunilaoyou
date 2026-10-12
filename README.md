<div align="center">

# 与你老友 · YLN

**把大佬请上桌，为你的决策答疑。**

一张圆桌，各领域顶级大脑同桌辩论；你抛出问题，TA 们观点对撞，替你把决策想透。
还可以走进「女娲工坊」，亲手蒸馏出属于你的专属老友。

[![CI](https://github.com/joyce768768-glitch/yunilaoyou/actions/workflows/ci.yml/badge.svg)](https://github.com/joyce768768-glitch/yunilaoyou/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-V0.1-5B6BC8)
![License](https://img.shields.io/badge/license-MIT-8F9BF5)
![Dependencies](https://img.shields.io/badge/dependencies-zero-4CC476)

</div>

---

## 这是什么

「与你老友」是一个 **纯前端、零依赖** 的 AI 圆桌群聊决策产品：

- **圆桌开桌** — 从老友库挑选几位「大佬」（乔布斯、马斯克、芒格、费曼、张一鸣……）组局，抛出你的问题，TA 们基于各自的思维内核展开多轮辩论；你可以随时插话，把话题拽回来。
- **女娲工坊捏老友** — 输入任意人物名，走完整的女娲蒸馏管线：六路采集 → 维基增强 → 蒸馏 → 三重验证，产出一个带心智模型、决策启发式、表达 DNA、盲区与诚实边界的结构化角色。
- **广场围观** — 公开圆桌直播与收官归档，热门大佬榜按「最热 / 最新」排行；把别人的老友加为好友，原作者获得 20 积分分成。
- **真友同桌** — 你的真实好友可以旁听身份加入圆桌，与 AI 大佬同场。
- **三端一体** — 手机端 APP、官网、管理后台在同一个浏览器里实时共享数据（用户、钱包、会员、Token 流水）。

## 目录结构

```
.
├── index.html              # 手机端 APP（圆桌 / 广场 / 老友 / 我的）
├── yln-core.js             # 唯一共享逻辑层（数据 · 钱包 · LLM · 女娲管线）
├── nuwa-minds.js           # 真女娲开源蒸馏资产（14 位 · MIT）
├── website/
│   ├── index.html          # 官网首页
│   ├── membership.html     # 会员注册 / 登录 / 付款
│   ├── orders.html         # 订单中心
│   ├── assets/             # 官网样式与逻辑
│   └── admin/              # 管理后台（用户 / 老友库 / Token 统计）
└── tests/
    └── run-tests.js        # 66 项零依赖测试
```

## 快速开始

### 1. 启动

本项目无构建、无依赖，任意静态服务器即可：

```bash
python3 -m http.server 8823
```

| 端 | 地址 |
|---|---|
| 手机端 APP | http://localhost:8823 |
| 官网 | http://localhost:8823/website/ |
| 管理后台 | http://localhost:8823/website/admin/ （演示账号 admin / admin888） |

> 请用 `http://` 访问，直接双击以 `file://` 打开会因跨域丢失维基增强等能力。

### 2. 配置 DeepSeek Key

所有 AI 能力（圆桌对白、女娲蒸馏、六路采集）走 DeepSeek API。Key **只保存在你本机的 localStorage**，不经过任何服务器、不入库：

打开浏览器控制台（三端同源共享存储，配一次全端生效）：

```js
localStorage.setItem('ds_api_key', 'sk-你的key')
```

刷新页面即生效。

### 3. 跑测试

```bash
node tests/run-tests.js
```

66 项零依赖测试：A 静态门禁 / B 官网 / C 后台三端数据流转 / D 女娲管线。失败返回非零退出码，可直接接入 CI。

## 架构

```
   手机端 index.html        官网 website/         后台 website/admin/
          └────────────────────┬────────────────────────┘
                     yln-core.js（唯一逻辑层）
        键名注册表 · 钱包 · 三端桥 · LLM 通道 · 女娲管线
        ────────────────────────────────────────────
                localStorage（同源共享 = 数据库）
```

- **yln-core.js 是唯一的业务逻辑与数据契约**：三端只做展示层，不各写一套逻辑；未来接真后端时，每个函数对应一个 API endpoint，前端零改动。
- **女娲管线 v2**：六路采集（著作 / 访谈 / 社媒 / 批评 / 决策 / 时间线，真实并行）→ M2-lite 维基增强 → 蒸馏 → 三重验证（跨域复现 / 生成力 / 排他性检验）。置信度三路均分；信息不足诚实标注「(模糊)」，不编造引文与数字。

## 安全说明

- 本仓库 **不含任何 API Key**。DeepSeek Key 只存在浏览器 localStorage，永不提交、不上传。
- 管理后台为演示用途的静态鉴权（admin/admin888），接真后端前请勿公网部署。
- 三端数据持久化在 localStorage，清除浏览器数据即重置。

## 许可证与致谢

本项目以 [MIT](./LICENSE) 许可证开源。

「真女娲」人物蒸馏资产（14 位角色，见 `nuwa-minds.js`）来自 [alchaincyf/nuwa-skill](https://github.com/alchaincyf/nuwa-skill)，原仓库以 MIT 许可证开源（Copyright (c) 2026 Huashu 花叔），依许可证要求在文件头部保留其版权声明。

## V0.1 版本说明

V0.1 是第一个对外版本，核心闭环全部打通：

- [x] 圆桌会话全生命周期（开桌 / 中途离席 / 跳过收官 / 正常收官）与本地实录回放
- [x] 女娲蒸馏管线 v2（六路采集 + 维基增强 + 三重验证）
- [x] 14 位官方蒸馏老友入库（置信度 95%）
- [x] 会员体系 4 档套餐 + 积分 / 老友券 / Token 流水
- [x] 三端（APP / 官网 / 后台）同源数据实时同步
- [x] 广场：直播圆桌 + 归档 + 热门大佬榜（最热 / 最新）
- [x] 真友：真实好友以旁听身份加入圆桌
