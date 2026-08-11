# Extension 系统深度调研

> 日期：2026-03-30 (初版) · 2026-03-31 (更新: 沙箱 bug 修复)
> 目的：深度调研 AionUI Extension 系统现状，为 Agent Hub / Assistant Hub / MCP Hub / Skill Hub 等市场化建设提供基础

## 文档索引

| 文档                                                 | 内容                                           |
| ---------------------------------------------------- | ---------------------------------------------- |
| [architecture.md](architecture.md)                   | 整体架构图、初始化管线、生命周期流程           |
| [contribution-types.md](contribution-types.md)       | Contribution 类型速查 (含冗余分析)             |
| [security-model.md](security-model.md)               | 安全模型评估（沙箱、权限、路径安全）           |
| [sandbox-architecture.md](sandbox-architecture.md)   | Sandbox 架构详解（Host/Worker 通信、事件路由） |
| [gap-analysis.md](gap-analysis.md)                   | Hub 市场化方案、LobeHub 对比、Gap 分析         |
| [distribution-pipeline.md](distribution-pipeline.md) | 分发管线方案（包格式、签名、下载机制）         |

## 核心结论

### 现状定性：当前 Extension = Extension Kit

当前的 `aion-extension.json` 允许一个扩展同时声明 10 种 contribution 类型。这本质上是一个 **Extension Kit** 而非原子 Extension。例如 `hello-world-extension` 同时贡献了 acpAdapters、mcpServers、assistants、agents、skills、themes、settingsTabs 七种类型。

### Hub 市场化的核心问题

> **Hub 需要按 contribution 粒度展示和发现，但安装/分发仍然以 Extension 为单位。**
>
> 这两件事可以解耦。

不需要重构 manifest 结构或引入分层模型。保持单一 manifest 格式，Hub 按 `contributes` 的实际内容自动推导分类：

```
contributes.assistants 非空  → 出现在 Assistant Hub
contributes.mcpServers 非空  → 出现在 MCP Hub
contributes.skills 非空      → 出现在 Skill Hub
contributes.acpAdapters 非空 → 出现在 Agent Hub
...
```

一个 Extension 可以出现在多个 Hub 中，但安装单位始终是 Extension。就像 VS Code Extension 可以同时贡献 language support + linter + snippets，出现在多个分类里，但安装的是同一个包。

### agents 是冗余 contribution 类型

`agents` 与 `assistants` 使用完全相同的 Schema (`ExtAssistantSchema`)，共用同一个转换函数 (`convertAssistant`)，唯一区别是输出带 `_kind: 'agent'` 标记。目前既没有功能差异，也没有 UI 差异。

**清理建议：**

1. 将 `agents` 标记为 deprecated，manifest 里的 `agents` 当作 `assistants` 的别名处理
2. 最终移除 `agents` 相关的独立 IPC 通道、registry 缓存、resolver 调用

详见 [contribution-types.md](contribution-types.md) 中的冗余分析。

### Manifest 市场化元数据

不需要 `category` 字段（由 `contributes` 自动推导），只需补充：

```jsonc
{
  "tags": ["feishu", "bot", "channel"], // 搜索/筛选
  "screenshots": ["preview1.png"], // Hub 详情页
  "readme": "README.md", // Hub 详情页内容
}
```

`category` 后续如有需要可随时以 optional 字段加入，向后兼容无成本。

## Extension 系统概览

Extension 系统是 AionUI 的插件化基础设施，允许第三方通过声明式 manifest (`aion-extension.json`) 向 AionUI 贡献多种能力类型。系统横跨 Electron 主进程、渲染进程和 Worker Thread 三层。

### Manifest 结构 (`aion-extension.json`)

```
aion-extension.json
├── name          (kebab-case, 2-64 chars, 不可用 aion-/internal-/builtin-/system- 前缀)
├── displayName
├── version       (semver)
├── description?, author?, icon?, homepage?
├── apiVersion?   (^semver, API 兼容性声明)
├── engine?       { aionui: "^x.y.z" }
├── dependencies? { extName: "^x.y.z" }
├── i18n?         { localesDir, defaultLocale }
├── lifecycle?    { onInstall, onActivate, onDeactivate, onUninstall }
├── permissions?  { storage, network, shell, filesystem, clipboard, activeUser, events }
└── contributes
    ├── acpAdapters[]      → Agent 连接适配器 (cli/stdio/websocket/http)
    ├── mcpServers[]       → MCP 服务器 (stdio/sse/http/streamable_http)
    ├── assistants[]       → 助手预设 (含 contextFile、models、skills)
    ├── agents[]           → [冗余, 待废弃] 结构同 assistants
    ├── skills[]           → Skill 文件 (markdown)
    ├── themes[]           → CSS 主题 (含 cover 图)
    ├── channelPlugins[]   → 消息渠道插件 (entryPoint + duck-typing)
    ├── webui              → WebUI 贡献 (apiRoutes, staticAssets, wsHandlers*, middleware*)
    ├── settingsTabs[]     → 设置页 Tab (HTML in iframe, 支持位置锚定)
    └── modelProviders[]   → 模型提供商配置
```

### 关键文件索引

| 文件                                          | 行数              | 职责                                                     |
| --------------------------------------------- | ----------------- | -------------------------------------------------------- |
| `src/process/extensions/types.ts`             | 522               | Manifest Zod Schema + 所有类型定义                       |
| `src/process/extensions/ExtensionLoader.ts`   | 163               | 扫描目录、加载/解析/验证 manifest                        |
| `src/process/extensions/ExtensionRegistry.ts` | 459               | 核心 Singleton, 初始化管线, 启用/禁用, contribution 缓存 |
| `src/process/extensions/resolvers/*.ts`       | 10 个             | 每种 contribution 的解析逻辑                             |
| `src/process/extensions/resolvers/utils/*.ts` | 5 个              | 依赖解析、引擎校验、环境变量、文件引用、入口点           |
| `src/process/extensions/lifecycle/*.ts`       | 4 个              | 生命周期钩子、事件总线、状态持久化、热重载               |
| `src/process/extensions/sandbox/*.ts`         | 5 个              | Worker 沙箱、权限分析、路径安全、扩展存储                |
| `src/process/extensions/protocol/*.ts`        | 2 个              | aion-asset:// 协议、iframe UI 通信桥                     |
| `src/process/bridge/extensionsBridge.ts`      | 265               | IPC Bridge, 16 个通道                                    |
| `src/common/adapter/ipcBridge.ts`             | ~120 行(ext 部分) | IPC 类型定义                                             |

### 成熟度结论

- Extension 系统的核心架构（Loader → Registry → Resolvers → Lifecycle → IPC）已经 production-ready。
- Worker Thread 沙箱的消息路由已修复（PR [#1991](https://github.com/iOfficeAI/AionUi/pull/1991)：Worker→Host RPC、事件转发、storage API），但 `createSandbox()` 尚未被实际调用（ChannelPlugin 和 Lifecycle hooks 仍在主进程裸跑，待迁移）。
- 市场化所需的**分发链路**（远程安装、包格式、签名验证、市场 Registry）和**安全执行**（权限强制、沙箱隔离接入）是两个需要从零建设的方向。
