# 文件与目录结构

本规范适用于整个 Electron 项目的文件与目录组织。

## 仓库根目录

### 根目录规则

- **README 翻译版本**应放在 `docs/readme/`，不能放在根目录。根目录只保留主 `readme.md`（GitHub 约定）
- **指南文档**（部署、测试、WebUI、CDP 等）放在 `docs/guides/`
- **贡献者文档**（开发环境、代码风格、文件结构、PR 工作流）放在 `docs/contributing/`
- **架构文档**放在 `docs/architecture/`（研究记录放在 `docs/architecture/research/`）
- **功能规格、PRD 和设计草案**放在 `docs/specs/`（产品团队维护的正式 PRD 放在 `docs/prds/`）
- **配置文件**（`tsconfig.json`、`package.json` 等）保留在根目录，这是 Node.js/Electron 生态约定
- **新文档**应放在合适的 `docs/` 子目录，而不是项目根目录

### 当前根目录清理目标

| 操作                              | 文件                               |
| --------------------------------- | ---------------------------------- |
| 将 README 翻译移至 `docs/readme/` | `readme_{ch,es,jp,ko,pt,tr,tw}.md` |

## 项目布局（`src/`）

GEAUi 是一个多进程 Electron 应用，包含三个核心层：**渲染进程**、**主进程**和 **Preload/共享层**。

### 目标结构

```
src/
├── renderer/          # 渲染层——React UI，不使用 Node.js API
├── process/           # 主进程层——所有 Node.js/Electron 业务
│   ├── bridge/        #   IPC 处理器
│   ├── services/      #   业务逻辑
│   ├── database/      #   SQLite
│   ├── task/          #   Agent/任务管理
│   ├── agent/         #   AI 平台连接
│   ├── channels/      #   多渠道消息
│   ├── extensions/    #   插件系统
│   ├── webserver/     #   WebUI 服务器
│   ├── worker/        #   后台 Worker（fork）
│   └── i18n/          #   主进程国际化
├── common/            # 共享层——跨进程类型、Adapter 和工具
├── preload.ts         # IPC Bridge——主进程 ↔ 渲染进程之间的 contextBridge
└── index.ts           # 主进程入口
```

### 当前结构

所有主进程模块现在都位于 `src/process/`。`src/` 根目录只包含三个核心层（`renderer/`、`process/`、`common/`）、入口文件（`index.ts`、`preload.ts`）以及环境类型声明（`types.d.ts`）。

## 目录命名——按进程采用两套约定

本项目横跨两个生态系统，各自遵循自己的约定：

| 范围                            | 目录命名                         | 原因                                                            |
| ------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| **Renderer**（`src/renderer/`） | 组件/模块目录使用 **PascalCase** | React 生态——目录名即组件名                                      |
| **其他所有位置**                | 使用**小写**                     | Node.js 生态                                                    |
| **分类目录**（所有位置）        | 使用**小写**                     | `components/`、`hooks/`、`utils/`、`services/` 是分类而不是实体 |
| **平台目录**（Renderer 页面内） | 使用**小写**                     | 镜像 `src/process/agent/<platform>/` 的命名，保持跨进程一致     |

### 快速判断

> “这个目录是否位于 `src/renderer/` 内，并且表示一个具体组件或功能模块，而不是分类？”
>
> **是** → PascalCase；**否** → 小写。
>
> **例外**：平台目录（`acp/`、`codex/`、`gemini/`、`nanobot/`、`openclaw/`）即使位于 Renderer 内也始终使用小写，以匹配 `src/process/agent/`。

### Renderer 示例

```
src/renderer/
├── components/              # 分类 → 小写
│   ├── SettingsModal/       # 组件 → PascalCase
│   └── EmojiPicker/         # 组件 → PascalCase
├── pages/                   # 分类 → 小写
│   ├── settings/            # 顶级页面 → 小写（路由段）
│   │   ├── CssThemeSettings/   # 功能模块 → PascalCase
│   │   └── McpManagement/      # 功能模块 → PascalCase
│   └── conversation/        # 顶级页面 → 小写
│       ├── GroupedHistory/  # 功能模块 → PascalCase
│       ├── Workspace/       # 功能模块 → PascalCase
│       ├── acp/             # 平台目录 → 小写（镜像 src/agent/acp/）
│       └── components/      # 分类 → 小写
└── hooks/                   # 分类 → 小写
```

### 非 Renderer 示例

```
src/process/services/cron/              # 小写
src/process/agent/acp/                  # 小写
src/process/channels/plugins/dingtalk/  # 小写
```

## 文件命名——所有位置使用同一约定

| 内容             | 约定                            | 示例                                  |
| ---------------- | ------------------------------- | ------------------------------------- |
| React 组件、类   | PascalCase                      | `SettingsModal.tsx`、`CronService.ts` |
| Hook             | 带 `use` 前缀的 camelCase       | `useTheme.ts`、`useCronJobs.ts`       |
| 工具、辅助函数   | camelCase                       | `formatDate.ts`、`cronUtils.ts`       |
| 入口文件         | `index.ts` / `index.tsx`        | 基于目录的模块必须使用                |
| 配置、类型、常量 | camelCase                       | `types.ts`、`constants.ts`            |
| 样式             | kebab-case 或 `Name.module.css` | `chat-layout.css`                     |

## 进程边界规则

**违反这些规则会导致运行时崩溃。**

| 进程                                | 可以使用                   | 不可使用                       |
| ----------------------------------- | -------------------------- | ------------------------------ |
| **Main**（`src/process/`）          | Node.js、Electron Main API | DOM API、React                 |
| **Renderer**（`src/renderer/`）     | DOM API、React、浏览器 API | Node.js API、Electron Main API |
| **Worker**（`src/process/worker/`） | Node.js API                | DOM API、Electron API          |

跨进程通信必须通过：

- Main ↔ Renderer：经由 `src/preload.ts` 和 `src/process/bridge/*.ts` 使用 IPC
- Main ↔ Worker：经由 `src/process/worker/WorkerProtocol.ts` 使用 fork 协议

## 主进程命名

| 类型       | 模式                  | 示例                              |
| ---------- | --------------------- | --------------------------------- |
| Bridge     | `<domain>Bridge.ts`   | `cronBridge.ts`、`webuiBridge.ts` |
| Service    | `<Name>Service.ts`    | `CronService.ts`、`McpService.ts` |
| Interface  | `I<Name>Service.ts`   | `IConversationService.ts`         |
| Repository | `<Name>Repository.ts` | `SqliteConversationRepository.ts` |

## Service 可测试性规则

### 纯逻辑与 IO 分离

Service 必须将**纯逻辑**与 **IO 操作**分开：

- **纯逻辑**（数据转换、验证、格式化）→ 独立函数，不导入 `fs`/`db`/`net`
- **IO 操作**（读取文件、查询数据库、HTTP 调用）→ Service 类或 Repository 中的轻量包装
- Service 方法应通过参数接收 IO 结果，而不是在内部直接执行 IO

### 依赖注入

依赖外部资源（数据库、文件系统、其他 Service）的 Service 和 Bridge 应通过构造函数或函数参数接收依赖：

```typescript
// ❌ 难以测试——必须模拟整个模块
import { db } from '@process/database';
function getConversation(id: string) {
  return db.query('SELECT * FROM conversations WHERE id = ?', id);
}

// ✅ 易于测试——注入依赖
function getConversation(repo: IConversationRepository, id: string) {
  return repo.findById(id);
}
```

现有代码使用直接导入时，可以使用 `vi.mock()`。新代码优先使用参数注入。

## 测试文件映射

测试文件必须与被测源文件对应：

| 源文件                                       | 测试文件                                        |
| -------------------------------------------- | ----------------------------------------------- |
| `src/process/services/CronService.ts`        | `tests/unit/cronService.test.ts`                |
| `src/process/bridge/fsBridge.ts`             | `tests/unit/fsBridge.test.ts`                   |
| `src/renderer/utils/chat/latexDelimiters.ts` | `tests/unit/latexDelimiters.test.ts`            |
| `src/renderer/hooks/ui/useAutoScroll.ts`     | `tests/unit/useAutoScroll.dom.test.ts`          |
| `src/process/extensions/ExtensionLoader.ts`  | `tests/unit/extensions/extensionLoader.test.ts` |

当 `tests/unit/` 的直接子项超过 10 个时，按源代码结构分组到子目录（例如 `tests/unit/extensions/`）。新增的含逻辑源文件应加入 `vitest.config.ts` 的 `coverage.include`。

## 目录大小限制

单个目录的直接子项（文件和子目录）不得超过 **10** 个。接近该限制时，应按职责将内容拆分到子目录。

## UI 组件库与图标标准

- **组件库**：`@arco-design/web-react`。所有新 UI 应优先使用 Arco 组件。
- **图标库**：`@icon-park/react`。所有图标必须来自该库。
- **交互元素不得使用原生 HTML**：不要使用原生 `<button>`、`<input>`、`<select>`、`<textarea>`、`<modal>` 等，应使用相应的 Arco 组件（`Button`、`Input`、`Select`、`Modal` 等）。
- **可以使用布局标签**：可以自由使用 `<div>`、`<span>`、`<section>`、`<nav>`、`<main>` 以及其他纯布局/语义标签。

## CSS 约定

- **优先使用 UnoCSS 工具类**：简单样式使用原子类（`flex items-center gap-8px`）。
- **复杂或可复用样式**：必须使用 **CSS Modules**（`ComponentName.module.css`）。组件样式不允许使用普通 `.css` 文件。
- **只使用语义颜色 Token**：使用 `uno.config.ts` 中的颜色（例如 `text-t-primary`、`bg-base`、`border-b-base`）或 CSS 变量。**禁止硬编码颜色值**（例如 `#86909C`、`rgb(0,0,0)`）。例外：`src/renderer/pages/settings/CssThemeSettings/presets/` 下的主题预设文件可以硬编码，因为它们本身负责定义主题 Token。
- **禁止内联样式**：除动态计算值（例如计算得到的宽度、位置）外，不使用 `style={{}}`。
- **Arco 样式覆盖**：使用 `:global(.arco-xxx)` 并与组件的 CSS Module 放在一起，不使用全局覆盖文件。
- **全局样式**：只能位于 `src/renderer/styles/`（主题、重置和基础布局）。不得直接在 `src/renderer/` 根目录放置 CSS 文件。

## Renderer 根目录——标准布局

Renderer 根目录最多包含 **3 个入口文件 + 7 个目录，共 10 项**。

```
src/renderer/
├── index.html      # Vite HTML 入口
├── main.tsx        # React 挂载和应用引导
├── types.d.ts      # 环境类型声明
├── pages/          # 页面级模块（业务代码放在这里）
├── components/     # 跨多个页面使用的共享 UI 组件
├── hooks/          # 共享 React Hook（支持业务域子目录）
├── context/        # 全局 React Context
├── services/       # 客户端 Service 和 i18n
├── utils/          # 工具函数、类型和常量
├── styles/         # 全局样式和主题配置
└── assets/         # 静态资源——Vite 解析为带哈希的 URL
```

**不应放在 Renderer 根目录的内容：**

- CSS 文件 → 移至 `styles/`
- 组件文件（`.tsx`）→ 移至 `components/` 或 `pages/`
- 单文件目录（内部只有一个文件）→ 合并到相关目录

## Renderer 组件规则

- 能自包含时使用**单文件**；包含子组件/Hook 时使用**目录**
- 基于目录的组件必须提供 `index.tsx` 入口
- **单文件目录规则**：只包含一个文件的目录应合并到父目录或相关目录
- 页面私有代码保留在 `pages/<PageName>/`；只有出现第二个使用方时才移动到共享位置

### `src/renderer/components/` 结构

`components/` 用于跨多个页面共享的组件，分为两层：

**固定层：**

- `base/`——不含业务逻辑的通用 UI 原语，也是唯一固定子目录。这里的组件不得依赖应用特定 Context 或领域逻辑。

**业务层：**

- 按**业务域**创建子目录，使用小写命名（分类目录规则）
- 同一业务域存在 **≥ 2** 个共享组件时创建领域子目录
- 同一领域只有一个组件时，可以暂时保留在 `components/` 根目录，直到出现第二个组件

**约束：**

- `components/` 根目录的直接子项（文件和目录）不得超过 **10** 个
- 只有**一个**页面使用的组件必须放在 `pages/<PageName>/components/`，不能放在这里

```
src/renderer/components/
├── base/           # UI 原语——AionModal、AionSelect、FlexFullContainer 等
├── chat/           # 会话/消息领域（示例，不是完整列表）
├── agent/          # Agent 选择/配置领域
├── settings/       # 设置领域
├── layout/         # 窗口框架和布局
├── media/          # 文件预览、图片查看器
└── index.ts        # 公共导出（可选）
```

> 上面的业务子目录列表仅供说明。应根据需要按相同规则创建新领域。

### `src/renderer/hooks/`——按业务域分组

当 `hooks/` 的直接子项超过 10 个时，按业务域将 Hook 分组到子目录。无法归入明确领域的通用 Hook 保留在根目录。根目录必须保持 ≤ 10 个直接子项。

```
hooks/
├── agent/          # Agent/模型相关
├── chat/           # 聊天/消息输入
├── file/           # 文件/工作区
├── mcp/            # MCP 相关
├── ui/             # 通用 UI 交互
├── system/         # 系统级（深链、通知、主题等）
└── index.ts        # 公共导出（可选）
```

> 领域名称仅为建议。应根据需要按相同模式创建新领域。

### `src/renderer/utils/`——按业务域分组

遵循与 `hooks/` 相同的原则。当 `utils/` 的直接子项超过 10 个时，按领域分组到子目录。根目录必须保持 ≤ 10 个直接子项。

```
utils/
├── file/           # 文件处理
├── workspace/      # 工作区工具
├── chat/           # 聊天/消息工具
├── model/          # 模型/Agent 工具
├── theme/          # 主题/样式工具
├── ui/             # 通用 UI 工具
└── ...             # 根目录中未分组的工具
```

### 页面模块结构

```
PageName/                  # PascalCase
├── index.tsx              # 入口（必需）
├── components/            # 小写（分类）
├── hooks/                 # 小写（分类）
├── contexts/              # 小写（分类）
├── utils/                 # 小写（分类）
├── types.ts
└── constants.ts
```

### 页面级目录命名

页面模块（例如 `pages/conversation/`）中存在三类子目录：

| 类型                                      | 约定       | 示例                                                 |
| ----------------------------------------- | ---------- | ---------------------------------------------------- |
| **分类目录**（标准职责）                  | 小写       | `components/`、`hooks/`、`context/`、`utils/`        |
| **功能模块**（业务功能）                  | PascalCase | `GroupedHistory/`、`Workspace/`、`Preview/`          |
| **平台目录**（镜像 `src/process/agent/`） | 小写       | `acp/`、`codex/`、`gemini/`、`nanobot/`、`openclaw/` |

平台目录是 PascalCase 规则的例外。它们使用小写，以保持与 `src/process/agent/<platform>/` 的跨进程命名一致。
