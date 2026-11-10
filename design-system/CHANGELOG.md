# Changelog · 与你老友设计系统

格式：semver ｜ 每次变更同步 metadata.json 版本号 + git tag ds-vX.Y.Z

## [1.9.0] - 2026-11-01 方向A现状提纯：在册染色投影体系治理完成
- **semantic +3 词**（新词 → minor）：`--shadow-brand-hover`（site.css .btn-primary:hover 档，.22/.48→.24/.56 统一）、`--shadow-ink`（ink 染色两段）、`--shadow-stage`（舞台氛围晕 inset 220px）
- **品牌投影族 6 处吸附**（微差按 v1.8.0「裁决内统一代价」惯例归一）：index `.btn-primary`、`.chat-foot .send`（v1.7.0 在册项兑现）、`.brand-mark .logo`（#5343D4 吸收档染色，本轮新发现）；site.css `.btn-primary` rest+hover；membership `.big-ava`；setkey 按钮 rgba(108,92,231,.32)（=--primary #6C5CE7 染色，本轮新发现）→ `var(--shadow-brand)` / `var(--shadow-brand-hover)`
- **墨色投影族 3 处**：index `.stage::after`→`--shadow-stage`、`.set-ic`→`--shadow-ink`（.12→.10 统一）、website `.bub-m`→`--shadow-ink`
- **组件规格同步**：button.json v1.0.0→v1.1.0 对齐页面真相——primary bg `--bg-brand`→`--grad-primary`、rest 投影 `--sh-m`→inset 白高光×2+`var(--shadow-brand)`、hover 补 `var(--shadow-brand-hover)`+上浮（不换底色，`--bg-brand-hover` 仅 preview 自演示在用）
- **按先例保留**：inset 白高光按组件保留（v1.7.0）；avatar/气泡组件内染色阴影按组件保留（v1.1.0）
- **新发现登记（本轮不执行，待下轮裁决）**：
  - 大型面板展示投影（几何与 --shadow-brand 差异显著，统一会明显改长相）：index `.hero`（.20/.52 两段）、website `.ph-hero`（.5）、`.bigcta`（.55）、setkey `.card`（rgba(91,107,200,.14)，浏览器复核时发现——因 gitignore 漏盘）
  - 小件品牌外投影（几何各异）：`.f-card .tick` .4、`.tab.on` drop-shadow .35、`.step-label .num` .35、`.chip.on` .5、`.fb.u` .35、admin/orders `.bar-g .col`/.filters/.lg-mark/.nav-item .ic 等表单与图例件
  - state/氛围类 primary 染色（非投影，宜将来立 rgb 三通道 + α 档范式）：dashed 轨道/描边、hover 底 .035/.06、inset 环 .12~.28、text-stroke、radial 氛围
  - 组件内 ink 染色阴影（按 v1.1.0 组件保留先例）：avatar 族、mascot、sw、bub(peer)、pub-card、distill-bar、tabbar、website fic/faces/bar-m/mcard、site nav.scrolled/mobile-menu
  - 动画环染色：index pulse rgba(250,117,80,.5)（=coral 染色）、website featPulse rgba(242,109,109,.45)（#F26D6D 无族档）；`.end-chip` mint 染色投影 rgba(43,190,148,.45)（将来可立 --shadow-mint）
- **机检盲区（流水线改进项，待裁决）**：setkey.html 被 `.gitignore:15` 显式忽略，全局 Grep 与历次盘点（v1.8.0 263 hex、本轮勘察）均未覆盖——建议 snapshot.py R1 扫描加 `--no-ignore` 或建「ignore 但需体检」清单
- **浏览器复核完成**（v1.8.0「三必查」惯例兑现）：13 处收编点 computed box-shadow 逐一比对全匹配；admin `.btn-primary:hover` = .24/.56 + 上浮 -1.5px；5 页 overflowX=0；index/admin 截图目测正常；`.set-ic.nuwa-ic` 粉紫染色确认组件保留先例非回归
- 验证：snapshot 复核 dangling=0 r1=0 → **pass**

## [1.8.0] - 2026-10-31 裸值收编裁决（A-E 清单）全量执行：snapshot dangling=0 r1=0 → pass
- **primitive +4 色档 +2 渐变词**（新词 → minor）：
  - `--ink-frame: #494170`（phone 边框描边，B 区；与 ink/ink-2 均不等值故入档）
  - `--pink-bright: #FF9DC0` / `--primary-violet: #C192F5`（nu-m 渐变 stop，A 区"新色先入阶"）
  - `--sun-dark: #B47716`（admin 登录提示深金文字，sun-soft 底上保对比；同值 website 浮标 2 处一并吸附）
  - `--grad-progress`（进度条 shimmer，index distill-bar / website bar-m 2 处复用，#7A6BFF 已归并 primary-300）
  - `--grad-nu`（website nu-m 卡装饰渐变，stop 全色阶引用）——原拟名 --grad-aura-*，执行时按"用途命名"原则细化
- **A 区·aura 氛围渐变 stop var 化**：index `.stage` 4 处 + site.css `.aurora` 4 处（#FFEFE0→coral-soft / #E7E3FF→primary-soft / #E2F5EE→mint-soft / #FFF3E6→coral-soft，几何参数留页面）；`.stage` 底色 #F7F1E6→sun-soft
- **B 区·phone 边框**：index `.phone` / website `.phone-m` 的 border #262050→ink-deep、描边 #494170→ink-frame
- **C 区·setkey.html 全量吸附零豁免**：背景渐变 3 stop→primary-softer/primary-soft/sky-soft；#3a3f6e→ink；#8b90b8→ink-2；#dcdff5→primary-200；#f8f9ff→primary-softer；#8f9bf5→primary-300；#2e9e56→semantic `--status-success`（全站首个 semantic 直消费点）
- **D 区·SVG/图标色全收编零值级豁免**（执行时复核全部可吸附，优于原豁免建议）：logo 三圆 #FFF7EA/#FFB930/#FF8FB8→sun-softer/sun/pink（5 页 7 处）；功能图标 stroke/fill 18 处按 mergeMap 吸附；无档 3 值入族吸附（#8A5AC8·#7A58C0→primary，#E89B00→sun）
- **E 区·admin 接线**：
  - admin.html 补 link tokens.css + semantic.css（此前仅私有 admin.css）
  - admin.css 摘除私有 :root（与主站重复/漂移：--line rgba→暖米实色、--r-xl 22→28、--primary-deep #5647D6→#4B42C6、--grad-primary 第三 stop、阴影/动效刻度，全部对齐主站一处真相）
  - 悬空 var 修复 5 词：admin.js `var(--bg2)`×4→`var(--surface-2)`（原悬空致 background 整条失效透明底）、`var(--acc)`×2→`var(--primary)`；website/index.html `var(--grad)`→`var(--grad-primary)`（v1.5.1 已登记死引用，本次兑现）；index.html `var(--ink-1)`×3→`var(--ink)`；index.html/preview `var(--deep,#302C63)`→`var(--ink)`
  - admin.css 残余裸值：#fff×9→text-invert/surface、.st.ban #8A85B5/#EFEDF8→ink-2/primary-softer、alt 柱 #FFC98F/#FBB03B→sun-light/sun、#B47716→sun-dark
- **index.html 深扫补收**（首轮裁决清单外，snapshot 复扫逼出）：CSS 区 40+ 处（hero/vip-card/w-hero/rank 领奖台/summary-card/prof 卡等渐变与文字色全吸附，#4A3F63→ink-frame 等）；JS 区 AVA_C/MANUAL_PALETTES/hues/colors 数组及蒸馏 UI 内联样式改 'var(--xxx)' 字符串（项目已有 JS 消费 var 先例）
- **whitelist.json 新建**（R2 形式化落地）：varLines 扩展数据注入口键名（CSS 形式 --c1/--c2/--tint + JS 形式 c1/c2/tint/deep——角色库个性化配色为内容资产，不吸附以免丢失角色个性）；files 豁免 website/admin/admin.js（管理台 JS 数据色：头像池/图表调色板/状态映射，snapshot JS key:value 跳过不覆盖数组/三元/参数形式）；thirdPartyColors 空（无第三方规定色）
- **tokens.json mergeMap 补录** v1.8.0 段（41 条新吸附映射）
- 验证：snapshot dangling=0 r1=0 → **pass**；浏览器三必查待人工确认项：官网导航高/首屏 padding/主 CTA 渐变、主站 phone 壳、admin 登录页与面板（私有 :root 摘除后圆角/阴影/动效刻度对齐主站，视觉微差为裁决内统一代价）

## [1.7.0] - 2026-10-27 四项待人审提案全部裁决通过并执行
- **semantic v1.1.0 → v1.2.0**（+2 词）：`--icon-faint: var(--ink-4)`（极弱图标/占位图形；核查发现原始 #B7B2D9 已在 v1.0.0 归并进 --ink-4，值差 2/255 不可感知，无需新增 primitive 色位）；`--shadow-brand`（品牌投影两段，primary-600 染色字面量，与 sh 组风格一致，染色体系整体治理仍为遗留项）
- **#B7B2D9 收编**：index.html `.f-more` color → `var(--icon-faint)`
- **self 气泡投影收编**：`.msg.user .bub` box-shadow 两段 → `var(--shadow-brand)`（inset 白高光按组件保留）
- **tick 渐变统一**：`.f-card .tick` 两停渐变 → `var(--grad-brand)`
- **#FF9A68 收编**（核查发现已归并 `--coral-light` #FF9A76，沿用 v1.0.0 人审归并）：`.f-card .new-tag` / `.plan .tag` / `.fab` 三处 → `var(--coral-light)`
- 组件规格同步：friend-card.json → v1.0.1、chat-bubble.json → v1.1.1（shadow 引用 --shadow-brand）
- 管理站同步：阴影 demo 新增 --shadow-brand 展示块；语义区计数 42 → 44
- **管理站画廊整体升级（浏览器验证 7/7 PASS）**：版本头 → v1.7.0；Avatar 画廊新增（FIELD_ICON v2 七领域活体角标，JS 与产品同源）；Chat Bubble demo 重写（peer 50% 白混无描边 + self 品牌渐变 + --shadow-brand，与 v1.1.1 规格一致）；新增 Friend Card 画廊（横版卡 + NEW 徽标 + sel 点击切换 + f-more 64×64 命中区，复核确认 toggle 可逆且 stopPropagation 防穿透生效）；avatar CSS 同步产品 4 段阴影 + --eg 眼距 + 腮红
- 仍在册（不等值近似值，未动）：.btn-primary 投影 rgba(86,71,214,.22/.48)、.chat-foot .send 投影 .24/.45 —— 各组件微差值，与 ink 阴影字面量同列染色体系治理项

## [1.6.0] - 2026-10-27 本轮 UI 优化收编（头像工程 + 气泡 + 老友卡）
- **新增组件规格 `friend-card.json` v1.0.0**：老友卡收编——静息态灰描边删除（1.5px 透明占位防跳变）、f-more 档案卡命中区 64×64（padding 19 + margin -19 + background-clip:content-box，视觉 26px 不变）、档案卡 icon v2、sel 选中态、tick/new-tag 装饰件落档
- **chat-bubble.json → v1.1.0**：peer 底色定稿 tint 50% 白混公式（color-mix，浓度只改百分比一处）；发丝内描边删除；self 镜像圆角修复落档（v1.4.0 裁决兑现，原 CSS 漏分号致 radius 整条失效）
- **avatar.json → v1.1.0**：角标升级 FIELD_ICON v2 领域 SVG（七领域，stroke=c.deep）；渲染口收编为 `avaHTML(id,size,badge)` 三参唯一口——角标自动注入，调用点禁手传（O13 机检守卫）；四 variant（default/real/grid/detail）+ 详情 92px 档角标 23px
- **页面裸值收编 2 处**（等值核对后才换）：`.bub` 白混 `#fff` → `var(--surface)`（fallback `var(--bg-surface)`）；`.f-more` 底色 `rgba(108,92,231,.09)` → `var(--bg-brand-soft)`（叠白近似 98%+）
- **待人审提案**：① `#B7B2D9`（f-more 图标色）≠ --icon-muted #A9A5CD → 建议新词 `--icon-faint` 或调 ink-3 ② self 气泡品牌投影三段 rgba(86,71,214,…) → 建议 `--shadow-brand` ③ friend-card tick 两停渐变（primary-300→primary）是否统一为 --grad-brand ④ new-tag `#FF9A68` 裸值收编
- 白名单不动：avatar --c1/--c2、bubble --tint、JS 角色定制色数据

## [1.5.1] - 2026-10-22 接线回归修复（悬空 var 引用）
- 症状：官网"在线体验"按钮/hero 卡/大 CTA 背景变透明，导航高与首屏 padding-top 丢失
- 根因：摘除 site.css :root 时漏收 `--grad-primary`(×9) 与 `--nav-h`(×5)——引用未定义时整条声明失效回退初始值（background→transparent, padding→0）
- 修复：tokens.css 补收 `--nav-h:76px`（布局尺寸）与 `--grad-primary`（渐变资产，以色阶引用重写：140° primary-300→primary 48%→primary-deep）；浏览器验证 4 项全过
- **教训（已入 SKILL.md 接线守则）**：摘除任何变量定义前，必须先跑"悬空引用审计"（被引用集合 − 已定义集合 = 0 才允许摘除）；变量盘点输出被截断是本次漏收的成因
- 另发现既有死引用 `--grad`×1（website/index.html .mcard .em，HEAD 起就未定义，非本次回归），留作卡片图标底色决策项

## [1.5.0] - 2026-10-20 接线（单一真相源闭环）
- 5 页面 link tokens.css + semantic.css；摘除 index.html 与 site.css 的重复 :root（34 变量上收单源）
- 约 150 处裸 hex 收编为 var() 引用；3 处品牌渐变统一 `--grad-brand`
- 修复 self 气泡尾向（镜像 20px 6px 20px 20px，第5期裁决）
- **勘误 v1.0.0**：圆角刻度改回线上声明值 12/16/22/28——原"22 处悬空引用"判断系多变量同行书写导致漏检，作废；裸值 10/14/18 留作后续治理项
- 已批准的有值差变更：`#ffb930`→`--sun`(#FBB03B) 8 处；渐变中点 52%→55%（亚像素）
- 白名单不动：avatar `--c1/--c2`、bubble `--tint`、JS 角色定制色数据（c1/c2/tint/deep）
- 遗留治理项：① 字号 px 未入 `type-*`（改字级影响排版图，需视觉评审专场）② rgba(ink,α) 阴影字面量 ③ JS 角色定制色板未入词表

## [1.4.0] - 2026-10-20 规则与版本
- 新增 `SKILL.md` 消费规则（五条铁律 R1~R5 + 准入闸 + 版本纪律 + playbook）
- 裁决补录 `--r-2xl: 36px`（容器级圆角，仅 sheet/大模态）
- 修正 `chat-bubble.json` self 变体：`--grad-brand` + 白字（取证自页面）
- 记录存量 bug：self 气泡圆角未镜像（迁移期修复）
- 新增本 CHANGELOG

## [1.3.0] - 2026-10-20 可视化管理站
- 新增 `preview/index.html`：色阶画廊/语义配对/字阶圆角阴影/活组件矩阵/Token 实时编辑器
- 浏览器验证 6 项通过

## [1.2.0] - 2026-10-20 组件层
- 新增 7 份组件规格：button/chat-bubble/avatar/chip/tab-bar/list-row/bottom-sheet
- 语义层补录 `--grad-brand`（chip 选中态收编）→ v1.1.1

## [1.1.0] - 2026-10-20 语义层
- 新增 `semantic.css`：42 个角色词，全层零 hex
- 五色定岗：primary=品牌 mint=成功 sun=警告 coral=错误 pink=情感 sky=信息
- 交互状态派生规则入层（hover -8%L / active -14%L / disabled op.4）

## [1.0.0] - 2026-10-20 Primitive 收编
- 从 5 页面 4125 行收编：263 hex → 47 色位，8 把色阶 + 字阶/间距/圆角/阴影/动效刻度
- 归并决策（人审通过）：sun 归并 #ffb930、字号并档至 8 档、r-s 定 10px
- 修复历史悬空引用：补录 `--r-m`/`--r-l` 定义
