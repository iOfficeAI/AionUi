# Sider 视觉设计规范

> 每次调整后实时更新此文件。
> 最后更新：2026-05-09（本轮 UX Polish 同步）

---

## 一、整体结构

```
┌─────────────────────────────────────────────────┐  Sider 250px
│  ┌──────┐                                       │
│  │  🔺  │  AionUi                               │  品牌区 py-16px（总高约 64px）
│  └──────┘  16px / semibold / text-t-primary     │
├─────────────────────────────────────────────────┤
│  [+] 新会话                              [≡]   │  固定导航 h-34px  Slot A
│  [🕐] 定时任务                                 │             h-34px  Slot A
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  分隔线
│                                                 │
│  团队                                  [▷][+]  │  L1 Label h-28px  Slot C
│    [icon] 团队A                                │  L2 Item  h-34px  Slot B
│    [icon] 团队B                                │
│                                                 │
│  定时任务                                [▷]   │  L1 Label h-28px  Slot C
│    [icon] 任务A                                │  L2 Item  h-34px  Slot B
│    [icon] 任务B                                │
│                                                 │
│  置顶                                    [▷]   │  L1 Label h-28px  Slot C
│    [icon] 对话X                    20小时      │  L2 Item  h-34px  Slot B
│                                                 │
│  项目                                    [▷]   │  L1 Label h-28px  Slot C
│    [📁] 项目文件夹A                            │  L2 Item  h-34px  Slot B
│          [icon] 对话Y                3天      │  L3 Item  h-34px  Slot B（缩进）
│    [📁] 项目文件夹B                            │  L2 Item  h-34px  Slot B
│                                                 │
│  对话                                    [▷]   │  L1 Label h-28px  Slot C
│    今天                                         │  L2 Sub-label h-24px  Slot C-sub
│      [icon] 对话Z                    2小时    │  L2 Item  h-34px  Slot B
│      [icon] 对话W                    5小时    │
│    昨天                                         │  L2 Sub-label h-24px  Slot C-sub
│      [icon] 对话X                    20小时   │  L2 Item  h-34px  Slot B
│                                                 │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  [⚙] 设置                                      │  底部 h-32px  Slot A-dim
└─────────────────────────────────────────────────┘

注意：
- [▷] 收起箭头在 label 右侧，默认隐藏，hover label 行时显示
- 团队 / 定时任务 / 置顶 / 项目 / 对话 是五个平级的 L1 Section
- 「项目」= 有工作区文件夹的对话；「对话」= 自由对话（无项目），内部按时间线分组
```

---

## 二、X 轴对齐基准线

```
0        8px     28px    36px                          242px
│        │       │       │                             │
│        ├─icon──┤←gap──→│  文字起点（所有 L1 item）    │
│        │ 20px  │  8px  │                             │
│                                                       │
│  团队                    [▷]                         │
│  12px→ label文字起点，▷ 在右侧 hover 显示             │
│                                                       │
│        [icon] 团队A       item 图标从 8px 起          │
│                                                       │
│        项目               L2 sub-label 从 16px 起    │
│  16px→ sub-label文字起点                              │
│                                                       │
│                [icon] 对话Y（项目内子项）              │
│        ←────36px────→                                │
│                子项图标从 36px 起 = 8+20+8            │
│                对齐父级（L1 item）文字基准线            │
```

---

## 三、三种 Slot 定义

### Slot A — NavEntry（固定导航行）

```
用于：新会话、定时任务入口、设置

h-34px  pl-10px  gap-8px  rd-8px
├─ [size-22px 容器]
│    └─ icon 16px（新会话 + 外框 size-22px rd-6px bg-aou-2 border，icon 14px）
├─ 文字区（flex-1）
│    14px / font-normal / text-t-primary（三行统一，全 sider 不加粗）
└─ 右侧 slot（可选）
     batch 图标按钮等

hover:  bg-fill-3
active: bg-fill-3（选中/激活态，与 hover 同色）
```

### Slot B — SectionItem（可点击列表项）

```
用于：团队项、定时任务项、对话行、项目文件夹行

L1 item:  h-34px  pl-10px  gap-8px  rd-8px  ← +2px 光学校正（icon-park 图标内有留白）
L2 子项:  h-34px  pl-10px  gap-8px  rd-8px  ← ConversationRow 自身永远 pl-10px
          父级 wrapper 负责缩进 pl-40px（WorkspaceCollapse / CronJobSiderItem）
L3 子项:  h-34px  pl-10px  gap-8px  rd-8px  ← 同上，wrapper 负责更深缩进

dimIcon prop：只控制 icon 视觉 dim 效果（opacity + grayscale），不控制缩进。
缩进统一由父级 wrapper 的 pl 决定，ConversationRow 本身不感知自己在第几层。

hover:  bg-fill-3
选中:   bg-fill-3（统一，不加粗，不变色）
active按下: bg-fill-4

├─ [size-22px 容器]
│    └─ icon 16px
│         agent logo: img w-16px h-16px rounded-full
│         agent emoji: text-16px
│         子项 icon: opacity-55 grayscale-[0.3]（默认），hover 恢复
├─ 文字区（flex-1 truncate）
│    普通: 14px / font-normal / text-t-primary
│    选中: 14px / font-normal / text-t-primary（不加粗，靠背景色区分）
│    时间戳: 11px / text-t-tertiary / group-hover:hidden（有 pin 时不显示）
└─ 右侧 slot（hover 显示，默认隐藏）
     三点菜单: 三个 w-2px h-2px 圆点 / p-4px / rd-4px / hover:bg-fill-2
     badge:   w-18px h-18px rounded-full / text-10px / bg-danger-6 text-white
```

### Slot C — SectionLabel（section 标题行）

```
用于：
  L1 — 团队 / 定时任务 / 置顶 / 对话
  L2 — 项目 / 今天 / 昨天 / 更早（「对话」的子分组）

L1:  h-28px  pl-12px  gap-0  sticky top-0 z-10 bg-fill-2
L2:  h-24px  pl-16px  gap-0

布局：
├─ 文字（flex-1）
│    12px / font-normal / text-t-tertiary
│    L2 sub: 12px / font-normal / text-t-tertiary
├─ 右侧 slot（hover 整行时显示）
│    [▷] 收起箭头: icon 12px / text-t-tertiary
│         展开: rotate-90，收起: rotate-0
│         点击切换，hover label 行才显示
│    [+] 新建按钮（仅团队有）: icon 12px / h-18px w-18px / rd-4px
└─ 收起时：items 隐藏，label 行保留
```

---

## 四、图标尺寸规范

| 位置                        | 外层容器                                      | 图标实际大小                     |
| --------------------------- | --------------------------------------------- | -------------------------------- |
| 品牌区 Logo 黑块            | size-32px / rd-0.5rem（collapsed: size-24px） | SVG w-5.5 h-5.5 scale-140 居中   |
| 品牌文字 "AionUi"           | —                                             | 16px / semibold / text-t-primary |
| 新会话 + 外框               | size-22px / rd-6px / bg-aou-2 border          | icon 14px                        |
| 定时任务 icon 容器          | size-22px（无边框，纯占位对齐新会话）         | icon 16px                        |
| 所有 item 图标容器（统一）  | size-22px                                     | 16px                             |
| Agent logo（图片）          | size-22px 容器内                              | w-16px h-16px rounded-full       |
| Agent emoji                 | size-22px 容器内                              | text-16px                        |
| Section chevron（收起箭头） | 无容器                                        | 12px，右侧，hover 显示           |
| 右侧三点菜单图标            | p-4px rd-4px                                  | 16px                             |
| Section 右侧 + 号           | h-18px w-18px rd-4px                          | 12px                             |
| Badge                       | w-18px h-18px rounded-full                    | text-10px                        |

---

## 五、缩进层级

```
10px     → 品牌区 Logo 左边缘、L1 item 图标起点（pl-10px，+2px 光学校正）
12px     → L1 Section label 文字起点（含 chevron）
16px     → L2 Sub-label 文字起点
40px     → L1 item 文字起点 = 10(pl) + 22(icon容器) + 8(gap)  ← 统一基准线
40px     → L1 item 文字起点 = L2 子项图标起点（wrapper pl-30px + 子项自身 pl-10px = 40px）
70px     → L2 item 文字起点 = L3 子项图标起点（wrapper pl-60px + 子项自身 pl-10px = 70px）

规律：子项 wrapper pl = 父级文字起点 - 10px（减去子项自身的 pl-10px）


注意：pl-10px 是视觉校正值，不是逻辑对齐值。
icon-park 图标 SVG 内部有约 2px 留白，视觉重心偏右，
所以 pl-10px 比数学基准 pl-8px 多 2px，视觉上才真正对齐。
修改任何 item 的左边距时必须以 pl-10px 为基准，不能改回 pl-8px。
```

---

## 六、组件对应关系（重构目标）

```
现在的组件                           →  重构后            Slot
───────────────────────────────────────────────────────────────
SiderToolbar（新会话行）             →  <SiderNavEntry />      A
SiderScheduledEntry（定时任务入口）   →  <SiderNavEntry />      A
SiderFooter（设置行）                →  <SiderNavEntry dim />  A

TeamSiderSection header             →  <SiderSectionLabel />  C  L1
CronJobSiderSection header          →  <SiderSectionLabel />  C  L1
GroupedHistory 置顶 / 对话           →  <SiderSectionLabel />  C  L1
GroupedHistory 项目 / 今天 / 昨天    →  <SiderSectionLabel />  C  L2 sub

SiderItem（团队项）                  →  <SiderItem />          B  L1
CronJobSiderItem（任务项）           →  <SiderItem />          B  L1
ConversationRow（对话行，自由）      →  <SiderItem />          B  L1
ConversationRow（对话行，项目内）    →  <SiderItem indent />   B  L2
WorkspaceCollapse（项目文件夹）      →  <SiderItem folder />   B  L1
```

---

## 七、已确认决策

- [x] 收起箭头紧跟在 label **文字右侧**（不是行的最右），hover 才显示；右侧操作按钮（如 +）用 ml-auto 推到最右
- [x] 团队 / 定时任务 / 置顶 / 项目 / 对话 五个 L1 Section 完全平级
- [x] 「项目」独立 L1，内容是文件夹 → 对话（两层）
- [x] 「对话」独立 L1，内容是时间线（今天/昨天）→ 自由对话
- [x] Section 收起后 label 行保留，items 隐藏

## 八、回归测试检查项

> 每次修改后必须对照此列表人工验证，防止改坏已稳定的部分。

| 检查项                      | 预期效果                                                                          |
| --------------------------- | --------------------------------------------------------------------------------- |
| 品牌区 Logo 对齐            | Logo 黑块左边缘与「新会话」`+` 外框左边缘对齐（均从 10px 开始）                   |
| 新会话文字对齐              | 「新」字与「定」字左对齐                                                          |
| 所有 L1 item 图标对齐       | 团队/定时任务/对话行图标左边缘在同一垂直线                                        |
| Section label chevron       | hover label 行才显示，紧跟文字右侧，点击收起/展开                                 |
| 项目子项缩进                | 子对话图标从 40px，由 WorkspaceCollapse wrapper pl-30px + 子项自身 pl-10px = 40px |
| 定时任务子项缩进            | 同上，CronJobSiderItem wrapper pl-30px + 子项自身 pl-10px = 40px                  |
| ConversationRow selected 态 | bg-fill-3，无加粗，rd-8px                                                         |
| 设置行权重                  | 与新会话/定时任务相同：14px medium text-t-primary h-34px                          |
| 所有 item hover/selected    | 统一 bg-fill-3，不使用蓝色透明 primary 色                                         |
| collapsed 侧边栏            | Logo 缩为 size-20px，item 只显示图标居中                                          |
| 深色模式                    | section label bg-fill-2 sticky 背景无穿透                                         |

## 九、待定项

- [ ] 定时任务：固定导航的「入口行」和滚动区的「section」同名，需要区分命名或视觉处理
- [ ] 「对话」这个 L1 label 是否显式显示，还是直接从「项目」「今天」开始
