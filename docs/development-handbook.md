# AionUi / POUNDING 项目开发手册

> 最后更新: 2025-07-09
>
> 本文档基于对前端仓库 `AionUi`（品牌名 POUNDING）及后端 `AionCore` 的完整代码分析编写，
> 用于后续开发工作的上下文参考。

---

## 1. 项目概述

| 项目       | 信息                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------- |
| **名称**   | AionUi (品牌名: **POUNDING**)                                                                     |
| **版本**   | 2.0.2                                                                                             |
| **许可证** | Apache-2.0                                                                                        |
| **上游**   | [iOfficeAI/AionUi](https://github.com/iOfficeAI/AionUi)                                           |
| **描述**   | 免费、开源的 AI Agent 协作客户端。内置 Agent、多平台 LLM、多 Agent、远程访问、24/7 自动化定时任务 |
| **后端**   | AionCore (Rust), `/Users/halo/Documents/AionCore-main`，版本 v0.1.7                               |

---

## 2. 技术栈

### 前端 (本项目)

| 层面              | 技术                                       | 说明                                                                    |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| **语言**          | TypeScript 5.8 (strict mode)               | 整个前端全量 TS                                                         |
| **桌面框架**      | Electron 37 + electron-vite 5              | 三进程架构 (main/preload/renderer)                                      |
| **UI 框架**       | React 19 + react-router-dom 7              | SPA 多页面路由                                                          |
| **UI 组件库**     | **@arco-design/web-react** 2.66            | 禁止使用原生 HTML 交互元素                                              |
| **图标库**        | **@icon-park/react** 1.4                   | 全部图标必须来自此库                                                    |
| **CSS**           | **UnoCSS** (原子类优先) + CSS Modules      | 语义化颜色 token，禁止硬编码色值                                        |
| **构建工具**      | Vite 6 + electron-vite 5                   | 三通道独立构建                                                          |
| **状态/数据获取** | SWR 2.3 + i18next + react-i18next          | 缓存优先的数据获取                                                      |
| **i18n**          | i18next                                    | 8 语言 (zh-CN/en-US/ja-JP/zh-TW/ko-KR/tr-TR/ru-RU/uk-UA)，20 个业务模块 |
| **包管理器**      | **bun** (workspaces)                       | 替代 npm/yarn                                                           |
| **代码质量**      | **oxlint** (lint) + **oxfmt** (format)     | 替代 ESLint + Prettier                                                  |
| **测试**          | **Vitest 4** (单元) + **Playwright** (E2E) | 覆盖率目标 ≥ 80%                                                        |
| **桌面打包**      | **electron-builder** 26                    | macOS (dmg) + Windows (nsis) + Linux (deb)                              |
| **错误监控**      | **Sentry** (Electron + Vite plugin)        | Source Map 上传                                                         |
| **桌面数据库**    | better-sqlite3                             | 本地存储                                                                |
| **MCP**           | @modelcontextprotocol/sdk 1.20             | 内建 MCP 服务器                                                         |

### 后端 (AionCore，独立仓库)

| 层面           | 技术                              |
| -------------- | --------------------------------- |
| **语言**       | Rust 2024 edition                 |
| **Web 框架**   | Axum 0.8                          |
| **异步运行时** | Tokio (full)                      |
| **数据库**     | SQLite (sqlx async)               |
| **认证**       | JWT + CSRF (Double Submit Cookie) |
| **实时通信**   | WebSocket + 事件广播              |
| **架构**       | Cargo workspace，20 个 crate      |

---

## 3. 项目结构总览

```
AionUi/
├── package.json               # 根 workspace，版本号 2.0.2
├── bun.lock                   # bun 锁文件
├── tsconfig.json              # 全局 TS 配置（strict mode）
├── uno.config.ts              # UnoCSS 配置，语义化颜色 token
├── vitest.config.ts           # Vitest 配置（双环境：node + jsdom）
├── playwright.config.ts       # E2E 配置
├── justfile                   # 开发快捷命令（456 行）
├── .oxlintrc.json             # oxlint 规则
│
├── packages/
│   ├── desktop/               # ★ 主 Electron 桌面包
│   │   ├── electron.vite.config.ts  # 三通道构建配置
│   │   ├── electron-builder.yml     # 打包配置
│   │   └── src/
│   │       ├── index.ts            # Main 进程入口
│   │       ├── types.d.ts          # 全局类型
│   │       ├── preload/            # Preload 层 (IPC 桥)
│   │       │   └── main.ts         # contextBridge 注入
│   │       ├── process/            # ★ Main 进程 (Node.js API)
│   │       │   ├── bridge/         #   IPC 处理
│   │       │   ├── services/       #   业务逻辑
│   │       │   ├── backend/        #   AionCore 后端管理
│   │       │   ├── pet/            #   桌面宠物
│   │       │   └── utils/          #   工具函数
│   │       ├── renderer/           # ★ Renderer 进程 (React UI)
│   │       │   ├── main.tsx        #   React mount
│   │       │   ├── index.html      #   HTML 入口
│   │       │   ├── pages/          #   页面模块
│   │       │   ├── components/     #   共享组件
│   │       │   ├── hooks/          #   共享 Hooks
│   │       │   ├── context/        #   React Context
│   │       │   ├── services/       #   客户端服务 + i18n
│   │       │   ├── utils/          #   工具函数
│   │       │   ├── styles/         #   全局样式
│   │       │   └── assets/         #   静态资源
│   │       └── common/             # ★ 共享层 (跨进程)
│   │           ├── adapter/        #   适配器
│   │           ├── api/            #   API 客户端
│   │           ├── chat/           #   聊天核心
│   │           ├── config/         #   配置管理
│   │           ├── types/          #   类型定义
│   │           └── utils/          #   工具函数
│   │
│   ├── web-host/              # Web 托管（无 Electron）
│   │   └── src/
│   │       ├── index.ts           # startWebHost() 入口
│   │       ├── backend-launcher.ts # AionCore 启动/停止
│   │       └── static-server.ts    # 静态文件服务
│   │
│   ├── web-cli/               # WebUI CLI（独立二进制）
│   │   ├── bin/aionui-web.js      # 命令行入口
│   │   └── src/index.ts           # CLI 逻辑
│   │
│   └── shared-scripts/        # 共享构建脚本
│       └── src/
│           └── prepare-aioncore.js
│
├── mobile/                    # React Native (Expo) 移动端
│   ├── app/(tabs)/            # Tab 页面
│   └── src/                   # 组件、服务、工具
│
├── tests/
│   ├── unit/                  # 单元测试
│   ├── integration/           # 集成测试
│   └── e2e/                   # Playwright E2E
│
├── scripts/                   # 构建/CI/发布脚本
├── docs/                      # 文档
├── resources/                 # 桌面图标、宣传图
├── public/                    # PWA/头部宠物 SVG
├── examples/                  # 扩展示例
└── .gitignored:
    ├── node_modules/
    ├── dist/
    ├── out/
    └── coverage/
```

---

## 4. 核心架构 — 三进程模型

本项目是一个 **Electron 多进程** 应用，三个进程有严格的边界：

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer 进程 (React)                      │
│  packages/desktop/src/renderer/                              │
│  ● React 19, Arco Design, UnoCSS                            │
│  ● 可访问: DOM, React, Web API                               │
│  ● 禁止: Node.js API, Electron API                          │
│  ● 端口: 5173 (Vite HMR)                                    │
└──────────────────┬──────────────────────────────────────────┘
                   │ IPC (contextBridge)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Preload 层                                 │
│  packages/desktop/src/preload/main.ts                       │
│  ● contextBridge.exposeInMainWorld('electronAPI', {...})    │
│  ● 注入: emit(), on(), getPathForFile(), etc.               │
│  ● ADAPTER_BRIDGE_EVENT_KEY 统一通信                        │
└──────────────────┬──────────────────────────────────────────┘
                   │ IPC (ipcMain/ipcRenderer)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Main 进程 (Node.js)                         │
│  packages/desktop/src/process/                               │
│  ● 可访问: Node.js, Electron main APIs                       │
│  ● 禁止: DOM, React, 任何浏览器 API                          │
│  ● 职责: IPC bridge, AionCore 后端管理, DB, 自动更新         │
│  ● 子模块: bridge/, services/, backend/, pet/, utils/        │
└─────────────────────────────────────────────────────────────┘
```

**跨进程通信规则**（越界会导致运行时崩溃）：

| 通信方向                 | 方式                  | 文件                                      |
| ------------------------ | --------------------- | ----------------------------------------- |
| Main ↔ Renderer          | IPC via contextBridge | `preload/main.ts` ↔ `process/bridge/*.ts` |
| Main ↔ Worker            | fork 协议             | `process/worker/WorkerProtocol.ts`        |
| Renderer ↔ AionCore 后端 | HTTP REST + WebSocket | `api/client.ts` + `api/ws.ts`             |

---

## 5. 分层详解

### 5.1 Common 层 (`packages/desktop/src/common/`)

跨 Main 和 Renderer 进程共享的代码：

```
common/
├── adapter/        # IPC 桥接适配 (ipcBridge, httpBridge, apiModelMapper, teamMapper)
├── api/            # API 客户端 (AI 平台连接: OpenAI, Anthropic, AWS Bedrock)
├── chat/           # 聊天核心逻辑 (approval, slash commands, document, imageGen)
├── config/         # 配置管理 (storage, configKeys, i18n-config, sentryConfig)
├── platform/       # 平台服务抽象 (Electron/Node 平台差异)
├── types/          # 跨进程类型定义 (agent, channel, team, provider, office)
├── update/         # 自动更新模型
└── utils/          # 共享工具函数 (appConfig, platformAuth, urlValidation, ...)
```

### 5.2 Main 进程 (`process/`)

| 目录        | 职责                      | 关键文件                                                                       |
| ----------- | ------------------------- | ------------------------------------------------------------------------------ |
| `bridge/`   | IPC 处理器暴露给 Renderer | `applicationBridge.ts`, `updateBridge.ts`, `webuiBridge.ts`, `dialogBridge.ts` |
| `services/` | 业务逻辑后端              | `database/` (SQLite), `autoUpdaterService.ts`, `i18n/`                         |
| `backend/`  | AionCore 后端进程管理     | `binaryResolver.ts` (解析后端二进制路径)                                       |
| `pet/`      | 桌面宠物系统              | `petStateMachine.ts`, `petManager.ts`, `petEventBridge.ts`                     |
| `utils/`    | Main 进程工具             | `mainWindowLifecycle.ts`, `tray.ts`, `zoom.ts`, `ensureAdminUser.ts`           |

### 5.3 Renderer 进程 (`renderer/`)

**页面路由** (`pages/`):

| 路由        | 页面            | 说明                                       |
| ----------- | --------------- | ------------------------------------------ |
| `/`         | `guid/`         | 智能引导页 (Agent 选择/快速输入)           |
| `/chat`     | `conversation/` | 对话页 (多平台聊天、预览、工作区)          |
| `/settings` | `settings/`     | 设置页 (Agent/Assistant/AI 模型/主题/扩展) |
| `/team`     | `team/`         | 团队协作页                                 |
| `/cron`     | `cron/`         | 定时任务管理                               |
| `/login`    | `login/`        | 登录页                                     |

**Renderer 页面模块**（以 conversation 页为例）：

```
pages/conversation/
├── index.tsx                      # 入口
├── components/                    # 页面私有组件
├── hooks/                         # 页面私有 Hooks
├── utils/                         # 页面私有工具
├── Messages/                      # 消息渲染模块 (Feature module)
├── GroupedHistory/                # 对话历史分组 (Feature module)
├── Workspace/                     # 工作区 (Feature module)
├── Preview/                       # 文件预览 (Feature module)
├── platforms/                     # 各AI平台聊天实现
│   ├── acp/                       # ACP Agent 协议
│   ├── aionrs/                    # AionRS 协议
│   ├── gemini/                    # Google Gemini
│   ├── nanobot/                   # NanoBot
│   ├── openclaw/                  # OpenClaw
│   └── remote/                    # 远程 Agent
└── utils/
```

**工具类分组** (`utils/`)：

```
utils/
├── file/          # base64, diffUtils, download, fileSelection, fileType, messageFiles
├── workspace/     # workspace.ts, workspaceEvents.ts, workspaceHistory.ts
├── chat/          # autoTitle, latexDelimiters, skillSuggestParser, timeline, thinkTagFilter
├── model/         # agentLogo, agentModes, modelCapabilities, modelPlatforms, errorDetection
├── theme/         # customCssProcessor, themeCssSync
├── ui/            # clipboard, createContext, focus, HOC, ModalHOC, siderTooltip
└── telemetry/     # sentry.ts
```

### 5.4 已支持的 AI 平台

| 平台                    | 协议                       | UI 组件位置                                      |
| ----------------------- | -------------------------- | ------------------------------------------------ |
| **ACP Agent**           | `@agentclientprotocol/sdk` | `pages/conversation/platforms/acp/`              |
| **AionRS**              | 内部协议                   | `pages/conversation/platforms/aionrs/`           |
| **Google Gemini**       | `@google/genai`            | `pages/conversation/platforms/gemini/`           |
| **OpenAI / Claude**     | openai 协议                | `common/api/` (ClientFactory, ProtocolConverter) |
| **AWS Bedrock**         | `@aws-sdk/client-bedrock`  | `common/api/`                                    |
| **NanoBot**             | 内部                       | `pages/conversation/platforms/nanobot/`          |
| **OpenClaw**            | 内部                       | `pages/conversation/platforms/openclaw/`         |
| **Remote Agent**        | WebSocket                  | `pages/conversation/platforms/remote/`           |
| **Codex (Claude Code)** | 自动检测                   | `pages/settings/AgentSettings/`                  |

内置 Agent 检测框架可自动检测 16+ 个 CLI Agent（Claude Code, Codex, Qwen Code, Kiro, Hermes Agent, Snow CLI, Cursor Agent 等）并提供统一界面。

### 5.5 Renderer 构建拆分

`electron.vite.config.ts` 中的 `manualChunks` 策略：

| Chunk 名           | 包含依赖                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| `vendor-react`     | react, react-dom                                                            |
| `vendor-arco`      | @arco-design/web-react                                                      |
| `vendor-markdown`  | react-markdown, remark-\*, rehype-\*, unified, mdast-\*, hast-\*, micromark |
| `vendor-highlight` | react-syntax-highlighter, refractor, highlight.js                           |
| `vendor-editor`    | monaco-editor, @monaco-editor, codemirror, @codemirror                      |
| `vendor-katex`     | katex                                                                       |
| `vendor-icons`     | @icon-park                                                                  |
| `vendor-diff`      | diff2html                                                                   |

---

## 6. 后端 — AionCore (Rust)

**位置**: `/Users/halo/Documents/AionCore-main`
**版本**: v0.1.7

### Crate 层次结构

20 个 crate 分 4 层，依赖严格单向：

```
┌─────────────────────────────────────┐
│           aionui-app (二进制入口)     │  ← Composition
├────────┬────────┬────────┬──────────┤
│conver- │channel │  team  │ ...domain│  ← Domain (10+ crates)
│ sation │        │        │          │
├────────┴────────┴────────┴──────────┤
│ aionui-auth    aionui-realtime      │  ← Capability
│ aionui-runtime (子进程、bun 解析)   │
├─────────────────────────────────────┤
│ aionui-common   aionui-db           │  ← Foundation
│ aionui-api-types aionui-assets      │
└─────────────────────────────────────┘
```

**Domain crate 标准结构**（每个 Domain crate 必须遵循）：

- `lib.rs` — 模块导出，无业务逻辑
- `routes.rs` — 导出 `domain_routes(state) -> Router`，Handler 只做请求/响应转换
- `service.rs` — 纯业务逻辑，不得 import axum
- `state.rs` — `#[derive(Clone)] RouterState` 持有 Arc-wrapped 依赖

**前后端通信**: HTTP REST API + WebSocket 实时事件

- 路由前缀: `/api/`
- API 类型定义集中放在 `aionui-api-types` crate（零 HTTP 框架依赖）
- WebSocket 事件格式: `domain.camelCaseAction`
- 响应格式: `ApiResponse<T>` (成功) / `ErrorResponse` (失败)

---

## 7. POUNDING vs 上游 — 关键差异

本项目是 [iOfficeAI/AionUi](https://github.com/iOfficeAI/AionUi) 的 **fork 改进版**，采用"基线层 + 品牌覆盖层"模式：

| 层面             | 上游 (iOfficeAI) | 本分支 (POUNDING)                      |
| ---------------- | ---------------- | -------------------------------------- |
| **品牌名**       | AionUi           | **POUNDING**                           |
| **后端**         | aioncore (JS)    | **AionCore** (Rust, v0.1.7)            |
| **后端发布源**   | GitHub Release   | **腾讯 COS** 分发                      |
| **自动更新**     | GitHub Releases  | **自定义 COS 更新链路**                |
| **配置文件注入** | `AIONUI_*` 变量  | `AIONUI_*` + `POUNDING_*`              |
| **内置 Skills**  | 上游默认         | **预装/定制 skills**                   |
| **模型托管**     | 标准             | **零配置模型接入**                     |
| **桌面账户**     | 标准             | **受管 CLI 安装/卸载**                 |
| **i18n 语言**    | 多语言           | **额外支持 uk-UA**                     |
| **AI 平台**      | 标准             | **RAG、OpenClaw、本地 Agent**          |
| **发布仓库**     | iOfficeAI/AionUi | **halojerry/AionUi-2.0.2-dev-a3881e2** |

### 同步策略

```
sync/upstream-<tag> 分支 → 保护层审查 → 验证 → 合并 main
```

**保护区文件**（上游改动需人工确认，不得直接覆盖）：

- 品牌名 / Logo / 文案 / 图标
- 自动更新地址、COS 分发路径
- `AIONUI_*` / `POUNDING_*` 配置注入
- 预装 skills / builtin assets / MCP 约定
- 前端与 AionCore 后端联动

关键保护区文件清单：

| 文件                                                             | 保护原因            |
| ---------------------------------------------------------------- | ------------------- |
| `packages/desktop/src/process/backend/binaryResolver.ts`         | AionCore 发现逻辑   |
| `packages/shared-scripts/src/prepare-aioncore.js`                | AionCore 准备脚本   |
| `scripts/prepareAioncore.js`                                     | COS 下载 & 版本解析 |
| `scripts/resolveAioncoreVersion.js`                              | 版本号解析          |
| `packages/desktop/electron-builder.yml`                          | 打包产物布局        |
| `packages/desktop/src/process/bridge/index.ts`                   | 桌面账户桥接        |
| `packages/desktop/src/common/types/agent/managedCliInstaller.ts` | 受管 CLI 安装       |

---

## 8. 开发工作流程

### 快速开始

```bash
# 安装依赖
bun install

# 开发模式 (Electron 桌面)
bun start

# WebUI 模式 (浏览器, 无 Electron)
bun run webui

# WebUI 带远程访问
bun run webui:remote

# 启动第二个调试实例（与已有实例并存）
bun run start:multi

# WebUI 生产模式
bun run webui:prod
```

### 日常开发循环

```bash
# 自动修复 lint
bun run lint:fix

# 自动格式化
bun run format

# 类型检查
bunx tsc --noEmit

# 运行测试
bun run test

# 生成 i18n 类型 (改 i18n 后必须执行)
bun run i18n:types
node scripts/check-i18n.js
```

**完整检测流程**（推荐 commit 前）：

```bash
bun run lint:fix
bun run format
bunx tsc --noEmit
bun run test
```

### 提交流程

```bash
just push                              # lint → format-check → typecheck → test → git push
just push -u origin feat/branch        # 同上，带额外 git push 参数
```

> `just push` 使用 `--quiet` 模式运行 lint，仅错误态导致失败。现有大量 lint **warnings** 不表示失败。

### PR 前严格检查（可选）

```bash
npm install -g @j178/prek
prek run --from-ref origin/main --to-ref HEAD
```

`prek` 只读，报告不修复。发现问题后运行 `bun run lint:fix` 等自动修复。

### 构建与打包

```bash
bun run package          # 构建到 out/ (main + preload + renderer)
bun run dist             # 当前平台打包
bun run dist:mac         # macOS dmg + zip
bun run dist:win         # Windows nsis + zip
bun run dist:linux       # Linux deb
bun run build-mac:arm64  # macOS Apple Silicon 专用
bun run build-mac:x64    # macOS Intel 专用
```

---

## 9. 测试体系

### 测试命令

```bash
bun run test              # 全部测试
bun run test:coverage     # 带覆盖率报告
bun run test:watch        # 监听模式
bun run test:e2e          # Playwright E2E
bun run test:integration  # 集成测试
bun run test:contract     # 契约测试
bun run bench             # 基准测试
```

### 测试结构 (Vitest 双环境)

| 环境    | 匹配模式                               | 适用场景                |
| ------- | -------------------------------------- | ----------------------- |
| `node`  | `tests/unit/**/*.test.ts` (不含 `dom`) | 纯逻辑、utils、services |
| `jsdom` | `tests/unit/**/*.dom.test.ts(x)`       | React 组件、hooks       |

### E2E (Playwright)

- 配置: `playwright.config.ts`
- 用例: `tests/e2e/specs/` (功能性)
- 专用用例: `tests/e2e/cases/` (团队协作等复杂流程)

### 测试文件映射

测试文件必须镜像源文件路径：

```
packages/desktop/src/process/services/CronService.ts
  → tests/unit/cronService.test.ts

packages/desktop/src/renderer/utils/chat/latexDelimiters.ts
  → tests/unit/latexDelimiters.test.ts

packages/desktop/src/renderer/hooks/ui/useAutoScroll.ts
  → tests/unit/useAutoScroll.dom.test.ts
```

---

## 10. 代码规范

### 目录结构

| 规则                       | 说明                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| **每目录 ≤ 10 子项**       | 超出时按职责拆分子目录                                           |
| **Renderer 组件/功能目录** | PascalCase (`SettingsModal/`, `GroupedHistory/`)                 |
| **Renderer 分类目录**      | lowercase (`components/`, `hooks/`, `utils/`)                    |
| **Renderer 平台目录**      | lowercase (`acp/`, `gemini/`) — 与 `src/process/agent/` 命名一致 |
| **非 Renderer**            | 全 lowercase                                                     |
| **单文件目录禁止**         | 仅 1 文件的目录应合并到父级或关联目录                            |

### 文件命名

| 类型       | 约定                            | 示例                              |
| ---------- | ------------------------------- | --------------------------------- |
| React 组件 | PascalCase                      | `Button.tsx`, `SettingsModal.tsx` |
| Hooks      | camelCase + `use` 前缀          | `useTheme.ts`                     |
| 工具函数   | camelCase                       | `formatDate.ts`                   |
| 入口文件   | `index.ts(x)`                   | 目录模块必需                      |
| 样式文件   | kebab-case 或 `Name.module.css` | `chat-layout.css`                 |
| 类型/常量  | camelCase                       | `types.ts`, `constants.ts`        |

### UI 约束

| 规则          | 说明                     | 例外                                                    |
| ------------- | ------------------------ | ------------------------------------------------------- |
| **组件库**    | `@arco-design/web-react` | 禁止 `<button>`, `<input>`, `<select>` 等原生交互元素   |
| **图标库**    | `@icon-park/react`       | 所有图标必须来自此库                                    |
| **CSS 优先**  | UnoCSS 原子类            | 复杂样式用 CSS Modules (`ComponentName.module.css`)     |
| **颜色**      | 语义化 token             | `text-t-primary`, `bg-base`, `border-b-base` — 无硬编码 |
| **行内样式**  | 禁止 `style={{}}`        | 动态计算值除外                                          |
| **Arco 覆盖** | CSS Module `:global()`   | 不写入全局覆盖文件                                      |

### 语义化颜色 Token (UnoCSS)

| Token                                       | CSS 变量             | 用途                 |
| ------------------------------------------- | -------------------- | -------------------- |
| `text-t-primary`                            | `--text-primary`     | 主要文字             |
| `text-t-secondary`                          | `--text-secondary`   | 次要文字             |
| `bg-base`                                   | `--bg-base`          | 主背景               |
| `bg-1` ~ `bg-10`                            | `--bg-1` ~ `--bg-10` | 各级背景             |
| `bg-hover`                                  | `--bg-hover`         | 悬停背景             |
| `bg-active`                                 | `--bg-active`        | 激活背景             |
| `border-b-base`                             | `--bg-base`          | 边框                 |
| `color-primary/success/warning/danger/info` | 语义色               | 状态提示、按钮、标签 |

### TypeScript 约束

| 规则             | 说明                                            |
| ---------------- | ----------------------------------------------- |
| **strict mode**  | 已启用                                          |
| **禁止 `any`**   | 使用 `unknown` 替代                             |
| **禁止隐式返回** | 函数必须显式 return                             |
| **路径别名**     | `@/*`, `@process/*`, `@renderer/*`, `@common/*` |
| **优先 `type`**  | 禁止使用 `interface` (oxlint 配置)              |
| **未使用参数**   | 前缀 `_`                                        |
| **注释**         | 全英文；公开函数使用 JSDoc                      |

### i18n 约束

- 所有用户可见文本必须使用 i18n key，禁止硬编码字符串
- 键命名: `module:keyName` (如 `settings:webui.starting`)
- JSON 文件: `renderer/services/i18n/locales/{lang}/{module}.json`

---

## 11. i18n 多语言架构

**配置文件**: `packages/desktop/src/common/config/i18n-config.json`

| 字段     | 值                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基准语言 | `en-US`                                                                                                                                                                     |
| 回退语言 | `en-US`                                                                                                                                                                     |
| 支持语言 | `zh-CN`, `en-US`, `ja-JP`, `zh-TW`, `ko-KR`, `tr-TR`, `ru-RU`, `uk-UA`                                                                                                      |
| 业务模块 | 20 个: common, agentMode, update, login, fileSelection, preview, conversation, settings, messages, mcp, acp, codex, tools, google, cron, starOffice, guid, agent, team, pet |

**i18n 位置**: `packages/desktop/src/renderer/services/i18n/locales/{lang}/{module}.json`

**类型生成**: `scripts/generate-i18n-types.js` → 生成 `i18n-keys.d.ts`

**开发流程**:

1. 在各语言 JSON 中添加 key（确保所有语言翻译完整）
2. 代码中使用 `t('module:key')`
3. 运行 `bun run i18n:types` 生成类型定义
4. 运行 `node scripts/check-i18n.js` 验证一致性

---

## 12. AionCore 后端集成

后端由前端 **Main 进程** 自动管理：

```
Main 进程启动 (index.ts)
  └─ configureChromium() → app 初始化
  └─ binaryResolver.ts → 查找 AionCore 二进制 (resources/bundled-aioncore/)
       └─ 启动 AionCore 子进程 (HTTP + WebSocket)
            └─ Renderer 通过 api/client.ts (REST) + api/ws.ts (WebSocket) 连接
```

**关键集成文件**:

| 文件                                                     | 职责                                          |
| -------------------------------------------------------- | --------------------------------------------- |
| `packages/desktop/src/process/backend/binaryResolver.ts` | 后端二进制发现、版本校验                      |
| `packages/shared-scripts/src/prepare-aioncore.js`        | 后端准备工作（复制资源等）                    |
| `scripts/prepareAioncore.js`                             | COS 下载 & 版本解析入口                       |
| `scripts/resolveAioncoreVersion.js`                      | 版本号解析                                    |
| `packages/web-host/src/backend-launcher.ts`              | 后端生命周期管理 (startBackend / stopBackend) |
| `packages/web-cli/bin/aionui-web.js`                     | Web UI CLI 入口（独立二进制发布）             |
| `packages/web-cli/src/index.ts`                          | CLI 主逻辑 (startWebHost Orchestration)       |

**后端二进制配送方式**:

- 桌面版: `resources/bundled-aioncore/` 目录内预制各平台二进制
- WebUI 版: 从 COS CDN 下载 (`scripts/prepareAioncore.js`)

---

## 13. 关键文件索引

| 文件                                                         | 用途                                          |
| ------------------------------------------------------------ | --------------------------------------------- |
| `package.json`                                               | 总版本号 2.0.2，aioncoreVersion: v0.1.7       |
| `packages/desktop/electron.vite.config.ts`                   | 三通道构建配置 (main/preload/renderer)        |
| `packages/desktop/electron-builder.yml`                      | 打包/签名/发布配置                            |
| `packages/desktop/src/index.ts`                              | Main 进程入口（Sentry 初始化、app lifecycle） |
| `packages/desktop/src/preload/main.ts`                       | Preload IPC 桥                                |
| `packages/desktop/src/renderer/main.tsx`                     | React 挂载入口                                |
| `packages/desktop/src/renderer/components/layout/Router.tsx` | 应用路由                                      |
| `packages/desktop/src/common/config/storage.ts`              | 持久化配置                                    |
| `packages/desktop/src/common/config/i18n-config.json`        | i18n 配置                                     |
| `packages/desktop/src/process/bridge/index.ts`               | IPC 桥统一入口                                |
| `packages/web-host/src/index.ts`                             | WebHost 入口 (startWebHost)                   |
| `packages/web-cli/src/index.ts`                              | WebUI CLI 入口                                |
| `justfile`                                                   | 456 行快捷命令                                |
| `uno.config.ts`                                              | UnoCSS 语义颜色 token 定义                    |
| `vitest.config.ts`                                           | 双环境测试配置                                |
| `.oxlintrc.json`                                             | oxlint 规则配置                               |

### 关键文档索引

| 文档                                    | 内容                                   |
| --------------------------------------- | -------------------------------------- |
| `docs/contributing/file-structure.md`   | 完整目录规范（层级、命名、边界规则）   |
| `docs/contributing/development.md`      | 开发指南（环境、命令、流程）           |
| `docs/guides/upstream-sync-strategy.md` | 上游同步策略（303 行完整策略）         |
| `docs/prds/remote/webui/webui.md`       | WebUI 功能规范（522 行完整 PRD）       |
| `docs/contributing/pr-automation.md`    | PR 自动化系统说明                      |
| `docs/guides/webui.md`                  | WebUI 部署指南                         |
| `docs/guides/deploy-server.md`          | 服务器部署指南                         |
| `docs/guides/hub-testing.md`            | Hub 测试指南                           |
| `CONTRIBUTING.md`                       | 贡献指南（中文版: CONTRIBUTING.zh.md） |

---

## 14. WebUI 与 CLI 部署模式

### WebUI 模式（无 Electron）

```
bun run webui          # 开发模式 (tsx)
bun run webui:prod     # 生产模式
bun run webui:remote   # 启用远程访问
```

WebUI 通过两个包提供服务：

| 包                 | 职责                             |
| ------------------ | -------------------------------- |
| `@aionui/web-host` | 后端启动 + 静态文件代理          |
| `@aionui/web-cli`  | CLI 入口 + 管理员密码 + 产物交付 |

**工作流**:

1. `web-cli` 解析 CLI 参数
2. 调用 `web-host.startWebHost()`
3. `web-host` 启动 AionCore 后端 + 静态文件服务 (serve-handler)
4. Web 浏览器通过 `localhost:{port}` 访问 SPA

**端口**:

- 生产: 25808 (递增上限 25818)
- 开发: 25809 (递增上限 25819)

### 独立二进制发布

`bun run pack-web-cli` → `bun build --compile` → 单文件二进制 `aionui-web`
包含: SPA 静态资源 + 启动逻辑，发布到 GitHub Release + COS

---

## 15. 特别注意事项

### 版本管理

- **根 `package.json`** 的 `version` 字段是**真实版本号**（当前 2.0.2）
- `packages/desktop/package.json` 是 workspace 内部占位符（固定 `"0.0.0"`）— **不得用于 UI 显示**
- 通过 `electron.vite.config.ts` 中的 `__APP_VERSION__` 注入真实版本到渲染进程
- 后端版本通过 `package.json` → `aioncoreVersion` 字段指定（当前 `v0.1.7`）

### tree-sitter 原生二进制

打包时被排除（`electron-builder.yml`），仅保留 WASM 版本，避免 macOS 签名问题。

### WebUI 端口竞争

端口被占时自动 `port + 1` 递增，上限 `DEFAULT_PORT + 10`。CLI/环境变量指定端口超出范围时不触发递增，直接报错。

### 品牌名区分

- UI 中产品名称为 **"POUNDING"**
- 包名、npm workspace、目录结构仍沿用 `AionUi`
- GitHub 仓库名: `halojerry/AionUi-2.0.2-dev-a3881e2`
- Sentry `serverName`: `pounding-desktop`
- 环境变量品牌: `AIONUI_BRAND_NAME` (默认 `POUNDING`)

### 设备/远程服务启停

WebUI 服务启停采用 fire-and-forget 模式：

- UI 先行更新状态 → toast 提示 → 异步调用 IPC
- 启动超时（3 秒）时乐观置为运行中

### 配置项

- `process.env.AIONUI_MULTI_INSTANCE=1` — 启用多实例模式
- 所有 Sentry/POUNDING 配置通过 `electron.vite.config.ts` 的 `define` 注入
- 渲染进程可通过 `window.__backendPort` 获取后端端口（preload 注入）

---

## 16. 贡献指南快速参考

### Commit 格式

```
<type>(<scope>): <subject>
```

类型: `feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `style` / `perf`

**禁止**: AI 签名（Co-Authored-By、Generated with 等）

### PR 流程

1. 创建分支 → 开发 → 提交
2. `just push`（自动运行质量检查）
3. 可选: `prek run --from-ref origin/main --to-ref HEAD`（完整 CI 检查）
4. 创建 Pull Request
5. 通过 Review 后合并

### 常用快捷命令（justfile）

```bash
just dev              # bun run start (Electron 开发)
just webui            # bun run webui
just webui-remote     # bun run webui:remote
just webui-prod       # bun run webui:prod
just cli              # bun run cli
just lint             # bun run lint
just typecheck        # tsc --noEmit
just test             # vitest run
just push             # 完整提交检测 + git push
just clean            # 清理构建产物
```
