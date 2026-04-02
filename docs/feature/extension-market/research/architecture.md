# Extension 系统 — 架构详解

> 日期：2026-03-30
> 关联：[README.md](README.md) · [contribution-types.md](contribution-types.md) · [security-model.md](security-model.md) · [gap-analysis.md](gap-analysis.md)

## 1. 整体架构图

```mermaid
block-beta
  columns 3

  block:renderer["Renderer Process (UI)"]:3
    columns 3
    ExtPage["ExtensionSettingsPage\n/settings/ext/:tabId"]
    ExtTab["ExtSettingsTabContent\n(SettingsModal 内嵌)"]
    Hooks["React Hooks\nusePresetAssistantInfo\nuseMcpServers\nuseAssistantList\nuseExtI18n"]
    iframe["Extension UI\n(sandboxed iframe)"]
    webview["External URL\n(Electron webview)"]
    space
  end

  space ipc["IPC Bridge\n16 channels\nextensionsBridge.ts"] space

  block:main["Main Process"]:3
    columns 3

    block:registry["ExtensionRegistry (Singleton)"]:3
      columns 2
      Loader["ExtensionLoader\n扫描: env → local → appdata\n去重: first wins"]
      Caches["Contribution 缓存\nacpAdapters · mcpServers\nassistants · agents · skills\nthemes · channelPlugins\nwebuiContribs · settingsTabs\nmodelProviders · extI18n"]
    end

    block:lifecycle["Lifecycle"]:1
      LifecycleMod["lifecycle.ts\nactivate / deactivate\ninstall / uninstall"]
      EventBus["ExtensionEventBus\n6 系统事件\next:ext 通信"]
      StatePersist["statePersistence\nextension-states.json\n原子写入"]
      HotReload["hotReload\nfs.watch + 1s debounce\n原子 Registry 替换"]
    end

    block:sandbox["Sandbox"]:1
      SandboxHost["SandboxHost\nWorker Thread 管理\n结构化消息传递"]
      Permissions["permissions.ts\n声明式分析\nrisk level 分类"]
      PathSafety["pathSafety.ts\n路径遍历防护"]
    end

    block:protocol["Protocol"]:1
      AssetProto["aion-asset://\n本地资产 URL 协议"]
      UIProto["ExtensionUIBridge\niframe ↔ main\npostMessage 桥接"]
    end
  end

  ExtPage --> ipc
  ExtTab --> ipc
  Hooks --> ipc
  ipc --> registry

  style renderer fill:#e8f4fd,stroke:#4a90d9
  style main fill:#f0f7e8,stroke:#6ab04c
  style registry fill:#fff3e0,stroke:#f5a623
  style lifecycle fill:#fce4ec,stroke:#e57373
  style sandbox fill:#f3e5f5,stroke:#ba68c8
  style protocol fill:#e0f2f1,stroke:#4db6ac
  style ipc fill:#fff9c4,stroke:#fdd835
```

## 2. 初始化管线

```mermaid
flowchart TD
  Start([应用启动]) --> LoadAll["ExtensionLoader.loadAll()"]

  subgraph scan["目录扫描 (优先级递减)"]
    S1["1. AIONUI_EXTENSIONS_PATH\n环境变量 (可多路径)"]
    S2["2. ~/.aionui/extensions/\n用户目录"]
    S3["3. appdata/extensions/\n应用数据目录"]
    S1 --> S2 --> S3
  end

  LoadAll --> scan
  scan --> ParseManifest

  subgraph ParseManifest["Manifest 解析"]
    P1["读取 aion-extension.json"]
    P2["stripJsonComments\n(支持 JSONC)"]
    P3["resolveFileRefs\n($file: 引用展开)"]
    P4["resolveEnvInObject\n(${env:VAR} 模板替换)"]
    P5["ExtensionManifestSchema.safeParse\n(Zod 校验)"]
    P1 --> P2 --> P3 --> P4 --> P5
  end

  ParseManifest --> Dedup["去重: 同名扩展 first-seen wins"]
  Dedup --> EngineCheck["filterByEngineCompatibility\nAionUI 版本 + API 版本 (semver)"]
  EngineCheck --> DepCheck["validateDependencies\n缺失 / 版本不匹配 / 循环依赖"]
  DepCheck --> TopoSort["sortByDependencyOrder\n拓扑排序"]
  TopoSort --> LoadStates["loadPersistedStates\n从 extension-states.json 恢复"]
  LoadStates --> LifecycleLoop

  subgraph LifecycleLoop["逐扩展生命周期"]
    Check{"enabled?"}
    Check -- 否 --> Skip[跳过]
    Check -- 是 --> NeedInstall{"首次安装\n或版本升级?"}
    NeedInstall -- 是 --> OnInstall["onInstall()"]
    NeedInstall -- 否 --> OnActivate["onActivate()"]
    OnInstall --> OnActivate
    OnActivate --> UpdateState["更新 state\ninstalled=true\nlastVersion=当前"]
  end

  LifecycleLoop --> SaveStates["savePersistedStates\n原子写入 (write .tmp → rename)"]
  SaveStates --> Resolve["resolveContributions"]

  subgraph Resolve["Contribution 解析"]
    direction TB
    SyncBatch["同步 Resolver (串行)\nacpAdapters → mcpServers → skills\n→ themes → channelPlugins → webui\n→ settingsTabs → modelProviders"]
    AsyncBatch["异步 Resolver (Promise.all 并行)\nassistants ∥ agents ∥ i18n"]
    SyncBatch --> AsyncBatch
  end

  Resolve --> Done([Registry 初始化完成])

  style scan fill:#e3f2fd
  style ParseManifest fill:#fff3e0
  style LifecycleLoop fill:#fce4ec
  style Resolve fill:#e8eaf6
```

> **Resolve 策略说明:** 每个 resolver 遍历所有 enabled extensions（按 contribution 类型聚合，不是按扩展逐个解析）。同步 resolver 串行执行（因为 `resolveThemes` 用 `readFileSync`，`resolveChannelPlugins` 用 `eval('require')`）；异步 resolver 用 `Promise.all` 并行（因为 `resolveAssistants` / `resolveAgents` 用 `fs.readFile`，`resolveExtensionI18n` 读 locale JSON）。

## 3. 生命周期状态机

```mermaid
stateDiagram-v2
  [*] --> Discovered : ExtensionLoader 扫描发现

  Discovered --> EngineFiltered : 引擎不兼容
  EngineFiltered --> [*]

  Discovered --> DepFiltered : 依赖缺失/不满足
  DepFiltered --> [*]

  Discovered --> NewExtension : 无持久化状态记录

  state NewExtension {
    [*] --> DefaultEnabled : enabled=true (默认)
    DefaultEnabled --> FirstInstall : needsInstallHook → isFirstInstall=true
    FirstInstall --> RunOnInstall : lifecycle.onInstall()
    RunOnInstall --> RunOnActivate : lifecycle.onActivate()
    RunOnActivate --> Active
  }

  Discovered --> RestoreState : 从 extension-states.json 恢复

  state RestoreState {
    [*] --> CheckEnabled
    CheckEnabled --> WasDisabled : enabled=false
    CheckEnabled --> WasEnabled : enabled=true
    WasEnabled --> CheckUpgrade
    CheckUpgrade --> VersionUpgrade : lastVersion != currentVersion
    CheckUpgrade --> NormalActivate : 版本未变
    VersionUpgrade --> RunInstallHook : lifecycle.onInstall()
    RunInstallHook --> RunActivateHook : lifecycle.onActivate()
    NormalActivate --> RunActivateHook
    RunActivateHook --> Active
  }

  state Active {
    [*] --> Enabled
    Enabled --> Resolving : resolveContributions
    Resolving --> Serving : contributions 注入系统
  }

  Active --> Disabled : disableExtension(name)<br/>onDeactivate() → saveStates → re-resolve
  Disabled --> Active : enableExtension(name)<br/>onActivate() → saveStates → re-resolve
  WasDisabled --> Disabled

  note right of Active
    热重载: fs.watch 检测 manifest 变化
    → debounce 1s → hotReload()
    → 新 Registry 完整初始化
    → 原子替换 singleton
    → emit REGISTRY_RELOADED
  end note
```

## 4. IPC 通道清单

Extension 系统通过 `extensionsBridge.ts` 暴露 16 个 IPC 通道：

### 4.1 只读查询 (11 个)

| 通道                                     | 输入         | 输出                                     | 用途                                         |
| ---------------------------------------- | ------------ | ---------------------------------------- | -------------------------------------------- |
| `extensions.get-themes`                  | void         | `ICssTheme[]`                            | CSS 主题                                     |
| `extensions.get-loaded-extensions`       | void         | `IExtensionInfo[]`                       | 扩展列表 (name, version, enabled, riskLevel) |
| `extensions.get-assistants`              | void         | `Record<string, unknown>[]`              | 助手预设                                     |
| `extensions.get-agents`                  | void         | `Record<string, unknown>[]`              | Agent 预设                                   |
| `extensions.get-acp-adapters`            | void         | `Record<string, unknown>[]`              | ACP 适配器                                   |
| `extensions.get-mcp-servers`             | void         | `Record<string, unknown>[]`              | MCP 服务器                                   |
| `extensions.get-skills`                  | void         | `Array<{ name, description, location }>` | Skill 文件                                   |
| `extensions.get-settings-tabs`           | void         | `IExtensionSettingsTab[]`                | 设置 Tab                                     |
| `extensions.get-webui-contributions`     | void         | `IExtensionWebuiContribution[]`          | WebUI 路由/资产                              |
| `extensions.get-agent-activity-snapshot` | void         | `IExtensionAgentActivitySnapshot`        | Agent 活动快照 (3s TTL 缓存)                 |
| `extensions.get-ext-i18n-for-locale`     | `{ locale }` | `Record<string, unknown>`                | 扩展 i18n 翻译                               |

### 4.2 管理操作 (4 个)

| 通道                         | 输入                | 输出                            | 用途     |
| ---------------------------- | ------------------- | ------------------------------- | -------- |
| `extensions.enable`          | `{ name }`          | `IBridgeResponse`               | 启用扩展 |
| `extensions.disable`         | `{ name, reason? }` | `IBridgeResponse`               | 禁用扩展 |
| `extensions.get-permissions` | `{ name }`          | `IExtensionPermissionSummary[]` | 权限摘要 |
| `extensions.get-risk-level`  | `{ name }`          | `string`                        | 风险等级 |

### 4.3 推送事件 (1 个)

| 通道                       | 方向          | 载荷                         | 用途              |
| -------------------------- | ------------- | ---------------------------- | ----------------- |
| `extensions.state-changed` | main→renderer | `{ name, enabled, reason? }` | 扩展启用/禁用通知 |

## 5. 渲染层交互

### 5.1 Extension Settings Tab 渲染策略

渲染器对扩展设置 Tab 采用双分支渲染：

```mermaid
flowchart LR
  TabData["IExtensionSettingsTab\n{entryUrl, tabId, extensionName}"]
  TabData --> CheckURL{"entryUrl\n协议判断"}

  CheckURL -- "aion-asset://" --> Iframe["sandboxed iframe\nsandbox='allow-scripts\nallow-same-origin'"]
  CheckURL -- "https://" --> Webview["Electron webview\npartition='persist:ext-settings-{tabId}'"]

  Iframe --> Bridge["postMessage 桥接\naion:init → locale + translations\naion:get-locale → 响应\nstar-office:request-snapshot → 活动快照"]
  Webview --> Isolated["独立缓存分区\n无 postMessage 桥接"]
```

### 5.2 位置锚定系统

扩展设置 Tab 支持相对于内置 Tab 的位置锚定：

```
内置 Tab 序列: gemini | model | agent | tools | display | webui | system | about

position: { anchor: "tools", placement: "after" }
  → 插入到 tools 之后

position: { anchor: "ext-other-tab-id", placement: "before" }
  → 支持跨扩展锚定

无 position 声明
  → 默认插入到 system 之前
```

## 6. 目录结构

```
src/process/extensions/
├── index.ts                          公开 API barrel export
├── types.ts                          Zod schemas + TypeScript 类型 (522 行)
├── constants.ts                      路径、环境变量、manifest 文件名
├── ExtensionLoader.ts                目录扫描、manifest 加载/验证
├── ExtensionRegistry.ts              Singleton 注册中心: init, resolve, enable/disable
├── lifecycle/
│   ├── lifecycle.ts                  activate/deactivate/uninstall 钩子执行
│   ├── ExtensionEventBus.ts          全局事件总线 (跨扩展通信)
│   ├── statePersistence.ts           enabled/disabled 状态持久化 (JSON)
│   └── hotReload.ts                  FSWatcher 热重载
├── sandbox/
│   ├── sandbox.ts                    SandboxHost: Worker Thread 隔离 + 消息路由
│   ├── sandboxWorker.ts              Worker 脚本: aion API proxy + callMainThread
│   ├── ExtensionStorage.ts           扩展 KV 存储 (JSON 文件, 按扩展隔离)
│   ├── permissions.ts                权限分析、风险等级分类
│   └── pathSafety.ts                 路径遍历防护
├── protocol/
│   ├── assetProtocol.ts              aion-asset:// 自定义协议
│   └── uiProtocol.ts                 iframe ↔ main 消息协议
└── resolvers/
    ├── AcpAdapterResolver.ts         ACP Agent 适配器
    ├── AssistantResolver.ts          助手 + Agent 预设
    ├── ChannelPluginResolver.ts      消息渠道插件 (duck-typing)
    ├── I18nResolver.ts               扩展 i18n 国际化
    ├── McpServerResolver.ts          MCP 服务器
    ├── ModelProviderResolver.ts      模型提供商
    ├── SettingsTabResolver.ts        设置 Tab (位置锚定)
    ├── SkillResolver.ts              Skill markdown 文件
    ├── ThemeResolver.ts              CSS 主题
    ├── WebuiResolver.ts              WebUI 路由/资产
    └── utils/
        ├── entryPointResolver.ts     dist-first 入口点回退
        ├── envResolver.ts            ${env:VAR} 模板解析
        ├── dependencyResolver.ts     依赖校验 + 拓扑排序
        ├── engineValidator.ts        AionUI 版本 + API 版本兼容性
        └── fileResolver.ts           $file: 引用解析
```
