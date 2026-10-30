---
name: yln-design-system
description: 为「与你老友」项目编写、修改或审查任何 UI/前端代码（HTML/CSS/页面/组件）时必须遵守的设计系统消费规则。触发词：与你老友、老友、yln、该项目任何页面与样式工作。
---

# 与你老友 · 设计系统消费规则 v1.4.0

## 资产地图（唯一真相源）

```
design-system/
├── tokens/tokens.css     primitive 层: 47 色位 + 字阶/圆角/阴影/动效刻度
├── tokens/semantic.css   semantic 层: 42 角色词 + --grad-brand
├── tokens/tokens.json    机器读本(含归并映射)
├── components/*.json     7 份组件规格(slot+六态+规则)
├── preview/index.html    可视化管理站: python3 -m http.server 8899 → /design-system/preview/
└── CHANGELOG.md          版本档案
```

## 五条铁律（可机检，违反即返工）

**R1 · 禁裸值**
页面 `<style>` 与 `style=` 中禁止出现颜色字面量（`#xxx`/`rgb()`，白名单：仅 avatar `--c1/--c2` 与 bubble `--tint` 注入处）。机检：`grep -rE '#[0-9a-fA-F]{3,8}' --include='*.html' .` 应只命中 tokens 文件与注入白名单。

**R2 · 只消费语义层**
组件/页面样式禁止直引 primitive（`--primary`、`--ink-2`、`--coral` 等），必须用角色词：`--bg-brand`、`--text-secondary`、`--status-error`。例外白名单：渐变注入（`--c1/--c2` 限同 family 两档）、`--tint`（限各 family soft 档）。

**R3 · 一色一义**
`status-success/warning/error/info` 只表达对应反馈；`accent-affection`(pink) 专属情感场景（喜欢/亲密/礼物）；禁止错位使用（如 mint 表错误、purple 表警告）。装饰性用色必须引用角色词。

**R4 · 六态强制**
任何可交互元素必须声明 `rest/hover/active/focus/disabled`，异步操作加 `loading`。focus 统一 `--ring-focus`；禁用统一 `opacity: var(--state-disabled-opacity)`；按压缩放 `.9~.96` 配 `var(--spring)`。

**R5 · 一切走刻度**
`font-size` 只许 `var(--type-*)`；`border-radius` 只许 `var(--r-*)`（含 36px 容器级 `--r-2xl`，仅 sheet/大模态）；阴影只许 `var(--sh-*)` 或组件规格内注明出处；时长只许 `var(--dur-*)` + `var(--ease/--spring)`。

## 准入闸（新增任何 token/词/组件前，先答三问）

1. 是**角色**还是**外观**？（外观词滚回 primitive）
2. 词表已有**同义词**吗？（合并，不新增）
3. 能由现有值**派生**吗？（能派生不新增）

流程：提案 → 人审（用户裁决）→ 录入词表 → CHANGELOG 记 minor → 管理站可见。

## 版本纪律（semver）

| 变更类型 | 版本 | 例子 |
|---|---|---|
| patch | 值微调，不换词 | hover 从 -8% 调 -9% |
| minor | 新增 token/词/组件 | 补 `--r-2xl` |
| major | 删词/改绑定/结构变更 | `text-muted` 改指 ink-4 |

每次变更：CHANGELOG.md 必记 + metadata.json 版本号同步 + `git tag ds-vX.Y.Z`。

## 常见任务 Playbook

**加页面**：link 两个 token 文件 → 全部样式用角色词 → 交互元素过六态自检 → 交付前跑 R1 机检。
**加组件**：先写 `components/xx.json`（slot+六态+token 引用）→ 人审 → 实现 → 录入管理站画廊。
**改主题色**：只改 `tokens.css` 基色 → 管理站编辑器先行预览 → 导出写回。

## 迁移期特别条款（第⑥期已完成，条款留档）

- 新写/新改代码：R1~R5 立即强制
- 存量代码：暂不返工，随第⑥期接线统一收编
- 已知存量 bug（接线时修复）：self 气泡圆角未镜像；`--r-m/--r-l` 历史悬空引用（已在 tokens.css 补定义，页面摘内联后自动生效）

## 接线守则（v1.5.1 教训入规）

- 摘除任何变量定义前，必须先跑**悬空引用审计**：收集全部 `var(--x)` 引用 − 收集全部定义 = 0 才允许摘除（脚本见 CHANGELOG v1.5.1；注意变量盘点输出可能截断，审计以"引用侧"为准而非"定义侧"）
- 接线后必须浏览器验证：固定导航高度、首屏 padding、主 CTA 渐变背景为必查项（这些是悬空 var 最先击中的位置）

## 遗留裁决记录（v1.4.0 人审通过）

1. list-row 标题 14px → 归 `--type-lead`(15px)：46 次主流档，14px 仅 3 例收敛
2. sheet 36px 圆角 → 补 `--r-2xl`，容器级专用，不进入卡片/按钮
3. self 气泡 = `--grad-brand` + 白字 + 镜像尾向 `20px 6px 20px 20px`（取证自 `.msg.user .bub`）
