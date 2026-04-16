# Agent Hub — 需求文档

> 日期：2026-03-30
> 状态：Draft
> 调研参考：[research/](research/) (架构、Contribution 类型、Gap 分析、安全模型、分发管线)

## 1. 背景与问题

### 现状

AionUI 设置页 > Agent > Local Agent 页，APP 启动时自动扫描本地已安装的 CLI backend（Claude Code、Opencode、iflow、Kimi 等），将检测到的 agent 展示在列表中供用户使用。

### 痛点

1. **路径发现失败**：部分用户将 CLI 安装在非默认路径，AcpDetector 的 `which` 命令扫描不到
2. **必须先装 CLI**：用户需要自行在终端安装 CLI backend（如 `npm install -g @anthropic-ai/claude-code`），APP 才能发现。对非技术用户门槛高
3. **不知道有哪些可用**：用户不知道 AionUI 支持哪些 agent backend，缺少发现入口

### 目标

构建 **Agent Hub**，在 Local Agent 页内展示所有可用 agent（内置 + 远程），用户可一键安装，降低使用门槛。

**一句话**：打开 APP → 看到所有可用 agent → 点 Install → 自动安装 → 可用。

---

## 2. 核心概念

### 2.1 Extension 与 Agent 的关系

Hub 中的每个 "Agent" 实际上是一个 **Extension**（包含 `contributes.acpAdapters`）。安装一个 agent = 安装一个 extension + 执行其 `onInstall` 钩子（通常是 `bun add -g <cli-package>`）。

```
Hub 中展示的 Agent ──── 对应 ──── 一个 Extension (aion-extension.json)
                                    └── contributes.acpAdapters
                                    └── lifecycle.onInstall → bun add -g <cli>
```

### 2.2 Extension 来源

| 来源     | 说明                                                                                    | 网络依赖 |
| -------- | --------------------------------------------------------------------------------------- | -------- |
| **内置** | 打包在 APP 资源目录中的 .tgz 包。确保核心 agent（Claude Code、Kimi 等）零网络可见       | 无       |
| **远程** | 从 GitHub `aionui/hub` 仓库拉取的 index.json 中，存在于远程但不在内置列表中的 extension | 需要网络 |

### 2.3 Extension 状态

一个 extension 在客户端有以下状态：

```mermaid
stateDiagram-v2
    not_installed --> installing
    installing --> installed
    installing --> install_failed
    installed --> uninstalling
    uninstalling --> not_installed
    install_failed --> not_installed : 重试
```

| 状态               | 含义                       | UI 展示                                     |
| ------------------ | -------------------------- | ------------------------------------------- |
| `not_installed`    | 未安装（仅在列表中可见）   | 显示 Install 按钮                           |
| `installing`       | 安装中（解压 + bun add）   | 显示 loading 状态                           |
| `installed`        | 已安装且可用               | 显示正常的 agent 配置界面（与现有样式一致） |
| `install_failed`   | 安装失败（bun add 出错等） | 显示 Retry 按钮 + 错误信息                  |
| `update_available` | 已安装但有新版可用         | 显示 Update 按钮                            |
| `uninstalling`     | 卸载中                     | 显示 loading 状态                           |

---

## 3. 数据模型

### 3.1 Hub Index (index.json)

由 CI 从 `iOfficeAI/AionHub` 仓库自动生成，客户端拉取此文件获取可用 extension 列表。

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-04-01T13:20:39.067Z",
  "extensions": {
    "aionext-auggie": {
      "name": "aionext-auggie",
      "displayName": "Augment Code",
      "version": "1.0.0",
      "description": "Integrates Augment Code as an ACP adapter in AionUi.",
      "author": "Aionui Official",
      "engines": {
        "aionui": "^1.0.0"
      },
      "hubs": ["acpAdapters"],
      "dist": {
        "tarball": "dist/aionext-auggie.zip",
        "integrity": "sha512-F7Lyl3J3T/e4kkOoADUxw9YPuI5ljeIGiJOb1RQOvm4KztCgpB+hUyBECan+1T4exikU5F9ry9wEssJUGvW/nw==",
        "unpackedSize": 549
      }
    },
    "aionext-claude": {
      "name": "aionext-claude",
      "displayName": "Claude Code",
      "version": "1.0.0",
      "description": "Integrates Anthropic's Claude Code CLI as an ACP adapter in AionUi.",
      "author": "Aionui Official",
      "engines": {
        "aionui": "^1.0.0"
      },
      "hubs": ["acpAdapters"],
      "dist": {
        "tarball": "dist/aionext-claude.zip",
        "integrity": "sha512-7QLD1yaIrvBrYRvPNliUQW+kY8cBYMz5lkIvpMUeO4gduJ1Zj7b4KxmPkHifwMLvNCXkkBV1iZYDTyOFOiWp5A==",
        "unpackedSize": 571
      }
    }
  },
  "metadata": {
    "totalExtensions": 2,
    "generatedBy": "Aion Extension Builder v1.0.0",
    "repository": "https://github.com/iOfficeAI/AionHub/"
  }
}
```

extension 的唯一标识由 `name` 字段定义.
`displayName` 是 UI 展示名称，
`description` 是简短描述，
`dist` 包含安装包的路径和完整性校验信息，
`engines.aionui` 定义了兼容的 AionUI 版本范围，
`hubs` 定义了 extension 的分类标签（本期筛选包含 "acpAdapters" 的项）。

### 3.2 安装状态推导

安装状态不额外持久化，从已有数据源实时推导：

```
判断 Hub extension 的展示状态:

  extension 目录不存在 (~/.aionui/extensions/aionext-xxx/)
    → not_installed (显示 Install)

  extension 目录存在 + CLI 已检测到 (AcpDetector)
    → installed (显示已安装样式)

  extension 目录存在 + CLI 未检测到
    → install_failed (显示 Retry)
       错误信息从 extension-states.json 的 installError 字段读取

  Hub index 中 dist.integrity ≠ 已安装 extension 的 integrity
    → update_available (显示 Update)
```

**数据源**:

| 状态信号           | 数据来源                                         | 说明           |
| ------------------ | ------------------------------------------------ | -------------- |
| extension 是否存在 | `ExtensionLoader` 扫描 `~/.aionui/extensions/`   | 已有能力       |
| CLI 是否可用       | `AcpDetector` 扫描 `which <command>`             | 已有能力       |
| 启用/禁用          | `extension-states.json`（`statePersistence.ts`） | 已有能力       |
| 安装错误信息       | `extension-states.json` 新增 `installError` 字段 | 唯一需要扩展的 |
| 是否有更新         | 对比 Hub index integrity 与本地 manifest         | 启动时计算     |

---

## 4. UI 需求

### 4.1 Local Agent 页布局

**现有布局保持不变**，在页面右上角新增一个 **「+」按钮**：

```
┌──────────────────────────────────────────┐
│ Local Agent                          [+] │  ← 右上角 "+" 按钮
│                                          │
│ Detected Agents                          │
│   ├── Gemini (内置, 有设置入口)          │
│   ├── Claude Code (已检测)               │
│   └── Opencode (已检测)                  │
├──────────────────────────────────────────┤
│ Custom Agents                            │
│   ├── [+ Add Custom Agent]               │
│   └── My Agent (用户配置的)              │
└──────────────────────────────────────────┘
```

点击 **[+]** 出现下拉菜单：

```
┌──────────────────┐
│ 从 Hub 中添加    │  → 打开 Hub 弹窗 (见 4.2)
│ 导入             │  → (TBD)
└──────────────────┘
```

### 4.2 Hub 弹窗

点击「从 Hub 中添加」后弹出 Hub 弹窗，列出所有可用 extension（来自内置 + 远程 index.json）：

```
┌─────────────────────────────────────────────────────┐
│  Agent Hub                                     [✕]  │
│                                                     │
│  ┌────────────────────────────────────────────────┐ │
│  │ [icon] Claude Code                    [已安装] │ │
│  │        Anthropic Claude Code agent             │ │
│  ├────────────────────────────────────────────────┤ │
│  │ [icon] Kimi                           [安装]   │ │
│  │        Moonshot Kimi agent                     │ │
│  ├────────────────────────────────────────────────┤ │
│  │ [icon] Opencode                       [更新]   │ │
│  │        Open source coding agent                │ │
│  ├────────────────────────────────────────────────┤ │
│  │ [icon] iflow                          [重试]   │ │
│  │        iflow agent                             │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

每个 extension 项展示：**icon + displayName + description + 操作按钮**。

### 4.3 Hub 弹窗 — Extension 项状态

| 状态               | 按钮文案      | 按钮行为                            | 备注                   |
| ------------------ | ------------- | ----------------------------------- | ---------------------- |
| `not_installed`    | **安装**      | 触发安装流程 (见 5.2)               |                        |
| `installing`       | **安装中...** | 禁用，显示 loading spinner          |                        |
| `installed`        | **已安装**    | 禁用（灰色），无操作                | 主页 Detected 中可配置 |
| `install_failed`   | **重试**      | 重新触发安装流程 (见 5.5)           | 旁边显示错误信息摘要   |
| `update_available` | **更新**      | 触发更新流程 (见 5.4)，覆盖已有版本 |                        |

### 4.4 安装后的展示

从 Hub 安装成功后，agent 的 CLI 已可用，AcpDetector 重新扫描后会检测到它。此时：

- **主页 Detected Agents**：新安装的 agent 出现在列表中，样式与现有 Detected Agent **完全一致**（icon + name + 设置入口）。用户无法区分"通过 Hub 安装"和"本地已有"——它们看起来一样、用起来一样
- **Hub 弹窗**：该 extension 的按钮切换为「已安装」（灰色禁用）

Hub 只改变了"agent 从哪来"，不改变"已安装 agent 长什么样"。

### 4.5 Hub 与 Detected 的关系

Hub 弹窗和主页 Detected Agents 是两个独立视图，数据来源不同：

| 视图                     | 数据来源                   | 职责         |
| ------------------------ | -------------------------- | ------------ |
| **Hub 弹窗**             | Hub index (内置 + 远程)    | 发现 + 安装  |
| **主页 Detected Agents** | AcpDetector 扫描本地 CLI   | 使用 + 配置  |
| **主页 Assistants**      | ConfigStorage `assistants` | 保持现有不变 |

**状态联动**：Hub 弹窗中某 extension 的安装状态，通过 AcpDetector 检测结果推导。如果 extension 的 `contributes.acpAdapters[].cliCommand` 在本地 CLI 中已检测到，则标记为 `installed`。

---

## 5. 核心流程

### 5.1 APP 启动 — 加载流程

```
APP 启动
  │
  ├── 1. ExtensionLoader 扫描 ~/.aionui/extensions/ (现有逻辑)
  │      → 得到已安装 extension 列表
  │
  ├── 2. AcpDetector 扫描本地 CLI (现有逻辑不变)
  │      → 主页 Detected Agents 直接渲染
  │
  ├── 3. 异步: 尝试从 GitHub 拉取 remote-index.json
  │      ├── 成功 → 缓存到内存
  │      └── 失败 → 忽略 (静默, 不报错)
  │
  └── 4. 读取内置 bundled-index.json (APP 资源目录)
         → 与远程 index 合并, Hub 数据就绪
         → 用户打开 Hub 弹窗时渲染
```

### 5.2 安装 Extension

```
用户点击 Install
  │
  ├── 1. 状态 → installing, UI 显示 loading
  │
  ├── 2. 获取 .tgz 包
  │      ├── 内置 extension → 从 APP 资源目录读取
  │      └── 非内置 extension → 从 GitHub 下载
  │
  ├── 3. 验证 integrity (SHA-512 SRI)
  │      └── 失败 → 状态 → install_failed, 记录错误
  │
  ├── 4. 解压到临时目录
  │      └── ~/.aionui/extensions/.tmp/aionext-xxx/
  │
  ├── 5. 校验 aion-extension.json 合法性
  │      └── 失败 → 清理临时目录, 状态 → install_failed
  │
  ├── 6. 原子移动到正式目录
  │      └── .tmp/aionext-xxx/ → ~/.aionui/extensions/aionext-xxx/
  │
  ├── 7. 执行 onInstall 钩子 (如 bun add -g @anthropic-ai/claude-code)
  │      ├── 成功 → 继续
  │      └── 失败 → 保留 extension 目录, 状态 → install_failed, 记录错误
  │         (不回滚解压, 方便 Retry 时跳过解压直接重试 bun add)
  │
  ├── 8. 执行 onActivate 钩子
  │
  ├── 9. 触发 ExtensionRegistry 热重载
  │      └── 新 agent 注册到系统
  │
  └── 10. 状态自动推导为 installed (目录存在 + CLI 检测到)
          UI 切换为已安装样式
```

### ~~5.3 卸载 Extension~~

> (先不做卸载功能，后续版本再加)

```
用户点击 Uninstall (更多菜单中)
  │
  ├── 1. 确认弹窗: "确定卸载 Claude Code?"
  │
  ├── 2. 状态 → uninstalling
  │
  ├── 3. 执行 onDeactivate 钩子
  │
  ├── 4. 执行 onUninstall 钩子 (如 bun remove -g @anthropic-ai/claude-code)
  │      └── 失败 → 仅 warn 日志, 不阻塞卸载
  │
  ├── 5. 删除 ~/.aionui/extensions/aionext-xxx/ 目录
  │
  ├── 6. 触发 ExtensionRegistry 热重载
  │
  └── 7. 状态自动推导为 not_installed (目录不存在)
         UI 切换回 Install 按钮
```

### 5.4 更新 Extension

```
APP 更新后首次启动
  │
  ├── 对比新内置版本与已安装版本
  │   (内置 index 中的 dist.integrity 与已安装 extension 的 integrity 对比)
  │
  ├── 如果不同 → 标记为 update_available
  │   └── UI 显示 Update 按钮
  │
  └── 用户点击 Update
      └── 执行安装流程 (5.2), 覆盖现有目录
```

### 5.5 重试安装

```
用户点击 Retry (在 install_failed 状态)
  │
  ├── 检查 ~/.aionui/extensions/aionext-xxx/ 是否已存在
  │   ├── 存在 → 跳过解压, 直接从步骤 7 (onInstall) 开始
  │   └── 不存在 → 从步骤 2 开始完整安装
  │
  └── 后续同安装流程
```

---

## 6. 技术架构

### 6.1 GitHub 仓库 (AionHub)

> (拆另外仓库, 比如 `iOfficeAI/AionHub`，专门存放 Hub 相关的 extension 和构建脚本)

```
AionHub/
├── extensions/
│   ├── aionext-claude/
│   │   ├── aion-extension.json
│   │   ├── icon.png
│   │   └── README.md
│   ├── aionext-opencode/
│   ├── aionext-kimi/
│   └── ...
├── dist/                            ← CI 自动生成
│   ├── index.json                   ← 客户端拉取的远程索引
│   ├── aionext-claude.tgz      ← 打包后的 extension
│   ├── aionext-opencode.tgz
│   └── ...
├── scripts/
│   └── build.ts                     ← 扫描 extensions/ → 打包 .tgz → 生成 index.json
└── .github/
    └── workflows/
        └── build.yml                ← PR merge → build → commit dist/
```

### 6.2 APP 资源目录

```
AionUI.app/Contents/Resources/
└── hub/
    ├── index.json                   ← 构建 APP 时从 aionui/hub 的 dist/ 复制
    ├── aionext-claude.tgz           ← 内置 extension (bundled: true)
    ├── aionext-kimi.tgz
    └── aionext-opencode.tgz
```

### 6.3 用户数据目录

```
~/.aionui/
├── extensions/                      ← 已安装的 extension
│   ├── aionext-claude/
│   │   ├── aion-extension.json
│   │   └── ...
│   ├── aionext-kimi/
│   └── .tmp/                        ← 安装过程的临时目录
├── cache/                           ← 下载缓存 (非内置 extension)
│   └── aionext-qwen.tgz
└── extension-states.json            ← 已有文件, 新增 installError 字段
```

### 6.4 新增 IPC 通道

| 通道                     | 方向          | 输入               | 输出                       | 用途                           |
| ------------------------ | ------------- | ------------------ | -------------------------- | ------------------------------ |
| `hub.get-extension-list` | renderer→main | void               | `HubExtensionItem[]`       | 获取 Hub 弹窗的 extension 列表 |
| `hub.install`            | renderer→main | `{ name: string }` | `IBridgeResponse`          | 安装 extension                 |
| `hub.uninstall`          | renderer→main | `{ name: string }` | `IBridgeResponse`          | 卸载 extension                 |
| `hub.retry-install`      | renderer→main | `{ name: string }` | `IBridgeResponse`          | 重试安装                       |
| `hub.check-updates`      | renderer→main | void               | `{ name: string }[]`       | 检查可更新的 extension         |
| `hub.update`             | renderer→main | `{ name: string }` | `IBridgeResponse`          | 更新 extension                 |
| `hub.state-changed`      | main→renderer | —                  | `{ name, status, error? }` | 安装/卸载状态变更推送          |

### 6.5 主要模块

| 模块              | 层            | 职责                                                |
| ----------------- | ------------- | --------------------------------------------------- |
| `HubIndexManager` | main process  | 加载内置 index + 拉取远程 index + 合并 + 缓存       |
| `HubInstaller`    | main process  | 下载/解压/验证/安装/卸载 extension 的完整流程       |
| `HubStateManager` | main process  | 管理 extension-hub-states.json 的读写               |
| `hubBridge.ts`    | main process  | IPC 通道注册，对接 HubIndexManager 和 HubInstaller  |
| `useHubModal`     | renderer hook | Hub 弹窗状态管理 + 通过 IPC 获取列表 + 监听状态变更 |

### 6.6 远程 Index 拉取策略

```
拉取 remote-index.json
  ├── 优先: GitHub Raw
  │   https://raw.githubusercontent.com/aionui/hub/main/dist/index.json
  │
  ├── 备选: jsDelivr CDN
  │   https://cdn.jsdelivr.net/gh/aionui/hub@main/dist/index.json
  │
  ├── 超时: 5s (不阻塞 APP 启动)
  ├── 重试: 1 次
  │
  └── 失败: 静默忽略, 仅用内置 index
```

非内置 extension 的 .tgz 下载同理，优先 GitHub Raw 备选 jsDelivr。

---

## 7. Hub 弹窗列表与状态推导

Hub 弹窗展示的列表独立于主页 Detected Agents，两者数据来源不同但通过 AcpDetector 结果联动：

```typescript
// 伪代码 — Hub 弹窗列表构建
const hubAgents = hubIndexManager.getAgentList(); // 内置 + 远程
const detectedAgents = acpDetector.getDetectedAgents();

// 推导每个 Hub extension 的安装状态
for (const hubAgent of hubAgents) {
  const cliCommand = hubAgent.contributes.acpAdapters[0]?.cliCommand;
  const extDir = `~/.aionui/extensions/${hubAgent.name}/`;

  if (!fs.existsSync(extDir)) {
    hubAgent.status = 'not_installed';
  } else if (detectedAgents.some((d) => d.cliCommand === cliCommand)) {
    hubAgent.status = 'installed';
  } else if (hubAgent.installError) {
    hubAgent.status = 'install_failed';
  }

  // 更新检查 (对比 integrity)
  if (hubAgent.status === 'installed' && hubAgent.dist.integrity !== localManifest.integrity) {
    hubAgent.status = 'update_available';
  }
}

// Hub 弹窗直接渲染 hubAgents
// ┌── Agent Hub 弹窗 ─────────────┐
// │  hubAgents (各种状态)          │
// └────────────────────────────────┘

// 主页不变，AcpDetector 结果直接渲染
// ┌── Detected Agents ─────────────┐
// │  detectedAgents (现有逻辑)     │
// ├── Custom Agents ───────────────┤
// │  customAgents (现有逻辑)       │
// └────────────────────────────────┘
```

---

## 8. 范围外 (P0 不做)

| 项                              | 原因                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- |
| 社区自由上传                    | 前期不开放，等审核环节设计好再开放                                              |
| 复杂版本管理                    | Aion 统一维护最新版，跟随 APP 更新                                              |
| Sigstore 签名                   | 来源可信（官方仓库），P0 仅做 SHA-512 完整性校验                                |
| 沙箱权限执行                    | 依赖沙箱基建完善，属于 Extension 系统整体演进                                   |
| Skill Hub / MCP Hub / Theme Hub | 架构设计已支持多 Hub（index.json 的 `hubs` 字段），但 UI 和安装流程后续逐步开放 |
| Extension 搜索/筛选             | 初期 agent 数量少 (<30)，列表直接展示足够                                       |
| 评分/下载量/评论                | 需服务端支持                                                                    |
| 非内置 extension 的 Update      | P0 只支持跟随 APP 更新的内置 extension 更新                                     |

## 9. 后续规划

| 阶段   | 内容                                             |
| ------ | ------------------------------------------------ |
| **P1** | Skill Hub、MCP Hub 开放（UI 复用，index 已支持） |
| **P2** | Sigstore 签名 + 社区提交 PR 审核流程             |
| **P3** | Theme Hub、Channel Hub、Assistant Hub            |
| **P4** | 沙箱权限执行 + 评分/统计系统                     |
