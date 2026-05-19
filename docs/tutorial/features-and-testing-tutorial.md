# AionUi 功能清单与使用测试教程

> 适用于 AionUi v1.9.x，最后更新：2025-05-09

---

## 目录

- [一、功能清单](#一功能清单)
  - [1.1 AI 对话](#11-ai-对话)
  - [2.2 多 Agent 支持](#22-多-agent-支持)
  - [1.3 MCP 扩展市场](#13-mcp-扩展市场)
  - [1.4 团队协作 (Team)](#14-团队协作-team)
  - [1.5 定时任务 (Cron)](#15-定时任务-cron)
  - [1.6 桌面宠物 (Pet)](#16-桌面宠物-pet)
  - [1.7 WebUI 远程访问](#17-webui-远程访问)
  - [1.8 设置系统](#18-设置系统)
  - [1.9 技能市场 (Skills Hub)](#19-技能市场-skills-hub)
  - [1.10 工作区 (Workspace)](#110-工作区-workspace)
- [二、环境准备与安装](#二环境准备与安装)
- [三、使用教程](#三使用教程)
  - [3.1 启动应用](#31-启动应用)
  - [3.2 首次配置](#32-首次配置)
  - [3.3 开始对话](#33-开始对话)
  - [3.4 切换 Agent](#34-切换-agent)
  - [3.5 使用 MCP 工具](#35-使用-mcp-工具)
  - [3.6 创建团队](#36-创建团队)
  - [3.7 配置定时任务](#37-配置定时任务)
  - [3.8 启用桌面宠物](#38-启用桌面宠物)
  - [3.9 WebUI 模式](#39-webui-模式)
- [四、测试教程](#四测试教程)
  - [4.1 单元测试](#41-单元测试)
  - [4.2 集成测试](#42-集成测试)
  - [4.3 E2E 测试](#43-e2e-测试)
  - [4.4 基准测试](#44-基准测试)
  - [4.5 契约测试](#45-契约测试)
  - [4.6 代码质量检查](#46-代码质量检查)
  - [4.7 i18n 验证](#47-i18n-验证)
  - [4.8 完整 CI 模拟](#48-完整-ci-模拟)
- [五、开发调试](#五开发调试)
- [六、常见问题](#六常见问题)

---

## 一、功能清单

### 1.1 AI 对话

核心功能 —— 与各种 AI 模型进行实时对话。

| 功能              | 说明                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| **多轮对话**      | 支持上下文连续对话，自动管理消息历史                                   |
| **Markdown 渲染** | 完整支持 GFM、LaTeX 公式 (KaTeX)、Mermaid 图表                         |
| **代码高亮**      | 基于 Monaco Editor / CodeMirror 的语法高亮                             |
| **流式输出**      | 实时显示 AI 回复，支持 SSE 流式传输                                    |
| **对话管理**      | 创建、重命名、删除、搜索对话                                           |
| **文件附件**      | 支持上传文件作为对话上下文                                             |
| **对话预览**      | Preview 面板实时预览内容                                               |
| **ACP 协议**      | 通过 Agent Client Protocol 与 Agent 交互，支持心跳、指标采集、错误处理 |

### 1.2 多 Agent 支持

AionUi 支持同时接入多种 AI Agent 后端：

| Agent            | 说明                            | 配置入口                       |
| ---------------- | ------------------------------- | ------------------------------ |
| **AionRS**       | 内置核心 Agent，基于 AionCLI    | AionrsSettings                 |
| **Gemini**       | Google Gemini 模型接入          | GeminiSettings                 |
| **Custom Agent** | 自定义 Agent（OpenAI 兼容 API） | AgentSettings / CustomSettings |
| **Remote Agent** | 远程 Agent 服务                 | RemoteSettings                 |
| **OpenClaw**     | 开源 Agent 接入                 | —                              |
| **NanoBot**      | 轻量级 Agent                    | —                              |

每个 Agent 支持：

- 独立的 API Key / Endpoint 配置
- 模型选择（GPT-4、Claude、Gemini 等）
- 系统提示词 (System Prompt) 自定义
- 助手 (Assistant) 预设管理

### 1.3 MCP 扩展市场

Model Context Protocol (MCP) 是 AionUi 的核心扩展机制：

| 功能             | 说明                                     |
| ---------------- | ---------------------------------------- |
| **扩展发现**     | 浏览和搜索 MCP 扩展市场                  |
| **一键安装**     | 从 Hub 安装 MCP 服务端扩展               |
| **生命周期管理** | 启用 / 禁用 / 卸载扩展                   |
| **内置 MCP**     | 预装常用工具（文件系统、浏览器、终端等） |
| **沙箱隔离**     | 扩展运行在沙箱环境中，保障安全           |
| **协议解析**     | 支持 stdio / SSE 等多种 MCP 传输协议     |
| **调试工具**     | `bun run debug:mcp` 查看 MCP 状态        |

### 1.4 团队协作 (Team)

多 Agent 协作完成复杂任务：

| 功能             | 说明                                      |
| ---------------- | ----------------------------------------- |
| **创建团队**     | 配置多个 Agent 角色，分配职责             |
| **团队仓库**     | Team Repository 管理 Agent 配置和共享资源 |
| **MCP 共享**     | 团队级别的 MCP 工具共享                   |
| **提示词库**     | 团队级 Prompt 模板管理                    |
| **生命周期**     | 团队创建 → 运行 → 暂停 → 销毁             |
| **白名单**       | 控制哪些 Agent 可以加入团队               |
| **Agent 间通信** | 团队内 Agent 消息传递                     |

### 1.5 定时任务 (Cron)

自动化任务调度：

| 功能            | 说明                            |
| --------------- | ------------------------------- |
| **Cron 表达式** | 标准 Cron 语法定义执行计划      |
| **任务管理**    | 创建、启用 / 禁用、删除定时任务 |
| **执行历史**    | 查看任务运行结果和日志          |
| **Agent 绑定**  | 将定时任务绑定到指定 Agent      |

### 1.6 桌面宠物 (Pet)

趣味性桌面助手功能（仅桌面版）：

| 功能           | 说明                           |
| -------------- | ------------------------------ |
| **宠物开关**   | 启用 / 禁用桌面宠物            |
| **尺寸调节**   | 调整宠物窗口大小（默认 280px） |
| **免打扰模式** | 开启后宠物不弹出通知           |
| **执行确认**   | Agent 执行操作前需要用户确认   |

### 1.7 WebUI 远程访问

脱离桌面客户端，通过浏览器使用：

| 模式             | 命令                        | 说明                   |
| ---------------- | --------------------------- | ---------------------- |
| **本地 WebUI**   | `bun run webui`             | 本地浏览器访问         |
| **远程 WebUI**   | `bun run webui:remote`      | 允许远程访问（需认证） |
| **生产模式本地** | `bun run webui:prod`        | 使用生产配置           |
| **生产模式远程** | `bun run webui:prod:remote` | 生产配置 + 远程访问    |

WebUI 特性：

- 内嵌 Express WebServer，支持认证、WebSocket、速率限制
- 独立部署模式：`bun run server:start` / `bun run server:start:remote`
- 密码重置：`bun run server:resetpass`

### 1.8 设置系统

完整的配置管理，分类清晰：

| 设置项           | 说明                                         |
| ---------------- | -------------------------------------------- |
| **System**       | 系统级配置（语言、主题、数据目录、自动更新） |
| **Display**      | 显示偏好（字号、紧凑模式、侧边栏行为）       |
| **Mode**         | 模式切换（桌面模式 / WebUI 模式）            |
| **Agent**        | Agent 全局配置                               |
| **AionRS**       | AionRS Agent 专属设置                        |
| **Gemini**       | Gemini Agent 专属设置                        |
| **Custom**       | 自定义 OpenAI 兼容 Agent 设置                |
| **Assistant**    | 助手预设管理                                 |
| **WebUI**        | WebUI 服务端口、认证、远程访问配置           |
| **Pet**          | 桌面宠物设置                                 |
| **Capabilities** | 功能开关（实验性功能）                       |
| **Skills Hub**   | 技能市场                                     |
| **Extensions**   | MCP 扩展管理                                 |

### 1.9 技能市场 (Skills Hub)

预置和安装 AI 技能模板：

| 功能         | 说明                       |
| ------------ | -------------------------- |
| **技能浏览** | 发现可用技能               |
| **一键安装** | 安装技能到本地             |
| **技能管理** | 查看、更新、卸载已安装技能 |
| **内置技能** | 随应用发布的默认技能集     |

### 1.10 工作区 (Workspace)

| 功能           | 说明                           |
| -------------- | ------------------------------ |
| **工作区切换** | 在不同项目 / 上下文间快速切换  |
| **上下文管理** | 每个工作区独立的对话历史和配置 |

---

## 二、环境准备与安装

### 2.1 系统要求

| 要求         | 最低版本                                |
| ------------ | --------------------------------------- |
| **Node.js**  | >= 22 < 25                              |
| **Bun**      | >= 1.2 (推荐最新版)                     |
| **操作系统** | macOS 12+ / Windows 10+ / Ubuntu 20.04+ |

### 2.2 克隆与安装

```bash
# 克隆仓库
git clone https://github.com/iOfficeAI/AionUi.git
cd AionUi

# 安装依赖（使用 bun，更快）
bun install

# 如果 bun 不可用，也可用 npm
npm install
```

### 2.3 验证安装

```bash
# 检查 TypeScript 编译
bunx tsc --noEmit

# 运行代码质量检查
bun run lint
bun run format:check

# 运行测试
bun run test
```

---

## 三、使用教程

### 3.1 启动应用

#### 桌面模式（开发）

```bash
bun run start
```

启动后自动打开 Electron 桌面窗口。

#### 多实例模式

```bash
bun run start:multi
```

允许多个 AionUi 实例同时运行（调试用）。

#### CLI 模式

```bash
bun run cli
```

以 CLI 模式启动，不打开 GUI。

### 3.2 首次配置

1. **启动应用** → 进入引导页面 (Guid Page)
2. **选择语言** → 在 System 设置中选择界面语言（中文 / English / 日本語 等）
3. **配置 Agent** → 进入 Settings → 选择一个 Agent 后端
4. **输入 API Key** → 在对应 Agent 设置中填入 API Key
5. **开始使用** → 返回主界面开始对话

### 3.3 开始对话

1. 点击左侧边栏 **"新建对话"** 按钮
2. 在底部输入框输入消息
3. 按 `Enter` 发送，`Shift+Enter` 换行
4. AI 回复实时流式显示
5. 支持：
   - 📎 上传文件附件
   - 🛠 选择 MCP 工具
   - 🔄 重新生成回复
   - ✏️ 编辑已发送消息
   - 📋 复制代码块
   - 🔍 对话搜索

### 3.4 切换 Agent

1. 打开 **Settings** → 选择 Agent 标签页
2. 可选后端：
   - **AionRS** — 内置 Agent（需要 AionCLI 二进制）
   - **Gemini** — Google Gemini（需要 Google API Key）
   - **Custom** — OpenAI 兼容 API（需要 Endpoint + API Key）
3. 保存配置后，新建对话将使用选定的 Agent

### 3.5 使用 MCP 工具

1. 打开 **Settings → Extensions**
2. 浏览扩展市场，安装需要的 MCP 扩展
3. 安装后扩展自动启用
4. 在对话中，Agent 可以调用已启用的 MCP 工具
5. 调试 MCP：

```bash
# 列出所有 MCP 服务
bun run debug:mcp:list

# 验证 MCP 配置
bun run debug:mcp:validate

# 交互式调试
bun run debug:mcp
```

### 3.6 创建团队

1. 点击左侧边栏 **"Team"** 图标
2. 点击 **"创建团队"**
3. 配置团队成员：
   - 添加 Agent 角色
   - 分配职责 / System Prompt
   - 配置共享 MCP 工具
4. 启动团队 → Agent 开始协作
5. 可以暂停 / 恢复 / 销毁团队

### 3.7 配置定时任务

1. 点击左侧边栏 **"Cron"** 图标
2. 点击 **"新建任务"**
3. 填写：
   - 任务名称
   - Cron 表达式（如 `0 9 * * 1-5` = 工作日早9点）
   - 要执行的 Prompt
   - 绑定的 Agent
4. 启用任务 → 按计划自动执行
5. 查看执行历史和结果

### 3.8 启用桌面宠物

1. 打开 **Settings → Pet**
2. 开启 **宠物开关**
3. 调整：
   - 窗口尺寸（100~500px）
   - 免打扰模式
   - 执行确认开关
4. 宠物出现在桌面上，可与 AI 交互

### 3.9 WebUI 模式

#### 开发模式

```bash
# 本地访问
bun run webui

# 远程访问（允许局域网/外网连接）
bun run webui:remote
```

#### 独立服务器部署

```bash
# 构建服务器
bun run build:server

# 启动服务器（开发）
bun run server:start

# 启动服务器（生产）
bun run server:start:prod

# 远程访问模式
bun run server:start:remote
bun run server:start:prod:remote
```

#### 密码管理

```bash
# 重置密码（开发）
bun run server:resetpass

# 重置密码（生产）
bun run server:resetpass:prod
```

---

## 四、测试教程

### 4.1 单元测试

单元测试位于 `tests/unit/`，按模块组织：

```
tests/unit/
├── bridge/       # IPC Bridge 测试
├── channels/     # 通信通道测试
├── chat/         # 聊天逻辑测试
├── common/       # 公共工具测试
├── extensions/   # 扩展系统测试
├── platform/     # 平台适配测试
├── process/      # 主进程测试
├── renderer/     # 渲染进程测试
└── webserver/    # Web 服务器测试
```

#### 运行所有单元测试

```bash
bun run test
```

#### 监听模式（开发时推荐）

```bash
bun run test:watch
```

#### 查看覆盖率

```bash
bun run test:coverage
```

#### 运行指定测试文件

```bash
# 运行某个目录下的测试
bunx vitest run tests/unit/bridge

# 运行单个文件
bunx vitest run tests/unit/chat/chat-message.test.ts

# 按文件名模式匹配
bunx vitest run -t "conversation"
```

### 4.2 集成测试

集成测试位于 `tests/integration/`：

```bash
# 运行所有集成测试
bun run test:integration

# 运行 i18n 打包验证
bun run test:packaged:i18n

# 运行 Bun 打包验证
bun run test:packaged:bun
```

### 4.3 E2E 测试

E2E 测试基于 Playwright，位于 `tests/e2e/`：

```
tests/e2e/
├── features/           # 按功能分类的测试
│   ├── assistants/     # 助手功能测试
│   ├── conversations/  # 对话功能测试
│   │   ├── acp/        # ACP 协议测试
│   │   ├── aionrs/     # AionRS Agent 测试
│   │   ├── custom/     # 自定义 Agent 测试
│   │   ├── gemini/     # Gemini Agent 测试
│   │   ├── other/      # 其他 Agent 测试
│   │   └── remote/     # 远程 Agent 测试
│   ├── pet/            # 宠物功能测试
│   ├── previews/       # 预览功能测试
│   ├── remote/         # 远程访问测试
│   │   ├── channels/   # 远程通道测试
│   │   └── webui/      # WebUI 测试
│   ├── settings/       # 设置功能测试
│   │   ├── about/
│   │   ├── display/
│   │   ├── llm_providers/
│   │   ├── skills/
│   │   └── system/
│   ├── teams/          # 团队功能测试
│   └── workspaces/     # 工作区测试
├── helpers/            # 测试辅助工具
└── specs/              # 测试规格
    ├── team-create.e2e.ts
    ├── team-agent-lifecycle.e2e.ts
    ├── team-whitelist.e2e.ts
    └── team-communication.e2e.ts
```

#### 运行所有 E2E 测试

```bash
bun run test:e2e
```

#### 运行指定 E2E 测试

```bash
# ACP 对话测试
bun run test:e2e:conv:acp

# 团队功能测试
bun run test:e2e:team

# 团队创建测试
bun run test:e2e:team:create

# 团队生命周期测试
bun run test:e2e:team:lifecycle

# 团队白名单测试
bun run test:e2e:team:whitelist

# 团队通信测试
bun run test:e2e:team:comm
```

### 4.4 基准测试

性能基准测试位于 `tests/bench/`：

```bash
# 运行所有 Vitest 基准测试
bun run bench

# 运行数据库基准测试（Bun test）
bun run test:bun

# 生成基准报告
bun run bench:report

# 启动性能基准测试
bun run bench:startup

# 运行完整基准测试（含启动时间）
bun run bench:full
```

### 4.5 契约测试

确保 API 契约一致性：

```bash
bun run test:contract
```

### 4.6 代码质量检查

```bash
# Lint 检查（只读）
bun run lint

# Lint 自动修复
bun run lint:fix

# 格式检查（只读）
bun run format:check

# 格式自动修复
bun run format

# TypeScript 类型检查
bunx tsc --noEmit
```

### 4.7 i18n 验证

```bash
# 生成 i18n 类型定义
bun run i18n:types

# 检查 i18n 完整性
node scripts/check-i18n.js
```

两个命令都必须无错误通过，才能提交 PR。

### 4.8 完整 CI 模拟

在提交 PR 之前，运行完整的 CI 检查：

```bash
# 一次性安装 prek
npm install -g @j178/prek

# 运行完整 CI 检查（只读，不自动修复）
prek run --from-ref origin/main --to-ref HEAD
```

如果有问题，先自动修复：

```bash
bun run lint:fix
bun run format
bun run test
bun run i18n:types
node scripts/check-i18n.js
```

然后重新运行 `prek` 验证。

---

## 五、开发调试

### 性能调试

```bash
# 开启性能监控启动
bun run debug:perf

# 生成性能报告
bun run debug:perf:report
```

### 自定义 Agent 调试

```bash
bun run debug:custom-agent
```

### 打包与分发

```bash
# 构建但不打包
bun run package

# 打包当前平台
bun run dist

# 打包指定平台
bun run dist:mac        # macOS
bun run dist:win        # Windows
bun run dist:linux      # Linux (deb)

# 多架构打包
bun run build-mac       # macOS arm64 + x64
bun run build-win       # Windows arm64 + x64
bun run build-deb       # Linux deb
```

---

## 六、常见问题

### Q1: 启动时 AionRS 二进制找不到？

AionRS 依赖 AionCLI 二进制文件。检查：

1. 是否已安装 AionCLI
2. 二进制路径是否在 PATH 中
3. 在 AionRS 设置中手动指定路径

### Q2: 如何使用 OpenAI / Claude 等模型？

1. 进入 Settings → Custom Agent
2. 填写 API Endpoint（如 `https://api.openai.com/v1`）
3. 填写 API Key
4. 选择模型（如 `gpt-4o`、`claude-3-opus`）
5. 保存后新建对话即可使用

### Q3: MCP 扩展安装后不生效？

1. 运行 `bun run debug:mcp:list` 查看已注册的 MCP 服务
2. 运行 `bun run debug:mcp:validate` 验证配置
3. 检查扩展是否已启用（Settings → Extensions）
4. 重启应用

### Q4: WebUI 远程访问安全吗？

远程模式默认需要认证。建议：

- 使用强密码
- 启用 HTTPS（生产部署）
- 使用 `--remote` 标志时确保网络环境安全
- 生产环境使用 `server:start:prod:remote`

### Q5: 测试报错 "database" 相关？

数据库测试依赖 better-sqlite3。确保：

1. `bun install` 成功编译了 native 模块
2. 数据库目录有写权限
3. 运行 `bun run test:bun` 检查数据库驱动

### Q6: 如何贡献代码？

1. Fork 仓库
2. 创建功能分支
3. 编写代码 + 测试
4. 运行 `bun run lint:fix && bun run format`
5. 运行 `bun run test` 确保测试通过
6. 运行 `prek run --from-ref origin/main --to-ref HEAD`
7. 提交 PR（遵循 `<type>(<scope>): <subject>` 格式）

---

> 📖 更多详细信息请参阅项目文档：
>
> - [架构概览](docs/architecture/overview.md)
> - [贡献指南](CONTRIBUTING.md)
> - [文件结构规范](docs/contributing/file-structure.md)
> - [PR 自动化流程](docs/contributing/pr-automation.md)
