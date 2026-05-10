# Agent Hub — 技术实现文档

> 基于 [Agent Hub 需求文档](./requirements.md) 编写

## 1. 架构概览

Agent Hub 功能涉及跨进程通信，整体按职责分为数据同步、核心安装逻辑、状态推导与前端交互四大模块。

- **HubIndexManager (Main Process)**: 负责在启动时异步获取并合并本地内置（bundled）和远程（remote）的 `index.json` 数据。
- **HubInstaller (Main Process)**: 核心执行器，处理 Extension 的下载、SRI 校验、解压部署以及安装生命周期钩子（如执行 `bun add -g <cli>`）。
- **HubStateManager (Main Process)**: 负责维护安装过程中的瞬时状态和错误记录（持久化至 `extension-states.json`）。
- **HubBridge & IPC**: 连接主进程与渲染进程的通信桥梁。
- **AgentHubModal (Renderer)**: 纯前端展示组件，展示可用 Agent 列表及对应的安装状态，接收用户交互指令。

## 2. 数据模型设计

### 2.1 Hub 索引数据 (Hub Index)

由持续集成 (CI) 从 `iOfficeAI/AionHub` 仓库生成，是 Extension 的元数据集合：

```typescript
export interface IHubIndex {
  schemaVersion: number;
  generatedAt: string;
  extensions: IHubExtension[];
}

export interface IHubExtension {
  id: string; // UUID 形式的唯一标识符
  name: string; // Extension 唯一标识符
  displayName: string; // UI 展示名称
  description: string;
  author: string;
  icon: string; // 相对于 Extension 根目录的路径
  dist: {
    tarball: string; // 相对路径，如 extensions/ext-claude-code.tgz
    integrity: string; // SHA-512 SRI Hash
    unpackedSize: number;
  };
  engines: {
    aionui: string; // APP 依赖版本
  };
  hubs: string[]; // 分类标识，本期固定筛选包含 "agent" 的项
  tags: string[];
  riskLevel: string;
  bundled?: boolean; // 标记是否随 APP 打包
}
```

### 2.2 运行时聚合数据模型

渲染层消费的数据模型，聚合了元数据与本地推导出的实时状态：

```typescript
export type HubExtensionStatus =
  | 'not_installed'
  | 'installing'
  | 'installed'
  | 'install_failed'
  | 'update_available'
  | 'uninstalling';

export interface IHubAgentItem extends IHubExtension {
  status: HubExtensionStatus;
  installError?: string; // 安装失败时的错误原因
}
```

## 3. 核心机制实现

### 3.1 启动与数据合并 (HubIndexManager)

在主进程（Main Process）初始化时启动后台任务：

1. **加载内置索引**: 同步读取 `process.resourcesPath/hub/index.json` 作为基础数据源。
2. **异步加载远程索引**:
   - 首选拉取 `https://raw.githubusercontent.com/aionui/hub/main/dist/index.json`。
   - 配置 5s 超时；若失败则尝试 fallback 到 jsDelivr CDN (`https://cdn.jsdelivr.net/gh/aionui/hub@main/dist/index.json`)。
   - 完全失败则只依赖内置数据，不抛出异常阻塞启动。
3. **合并策略**: 远程数据优先级高于内置数据。以 `name` 字段作为 Key 进行合并，输出 `mergedExtensions`。

### 3.2 动态状态推导逻辑

`HubExtensionStatus` 是基于多个数据源实时推导得出的，具体规则如下：

```typescript
// 伪代码: 核心推导逻辑
function deriveStatus(extension: IHubExtension): HubExtensionStatus {
  // 1. 检查瞬时执行状态 (内存态)
  if (memoryState[extension.name] === 'installing') return 'installing';
  if (memoryState[extension.name] === 'uninstalling') return 'uninstalling';

  // 2. 检查持久化错误状态
  const savedState = stateManager.getState(extension.name);
  if (savedState?.installError) return 'install_failed';

  // 3. 检查物理目录
  const extDir = path.join(extensionsDir, extension.name);
  if (!fs.existsSync(extDir)) return 'not_installed';

  // 4. 检查 CLI 命令检测状态 (与 AcpDetector 联动)
  const cliCommand = getCliCommandFromManifest(extDir);
  const isCliDetected = acpDetector.hasDetected(cliCommand);

  if (isCliDetected) {
    // 5. 检查版本更新 (对比 SRI)
    const localManifest = readLocalManifest(extDir);
    if (localManifest?.integrity && extension.dist.integrity !== localManifest.integrity) {
      return 'update_available';
    }
    return 'installed';
  }

  // 兜底: 目录存在但 CLI 未就绪，被认为是异常失败状态
  return 'install_failed';
}
```

### 3.3 安装主流程 (HubInstaller)

当用户点击安装触发 `hub.install` 时：

1. **状态流转**: `status` 切换至 `installing`，IPC 广播该状态通知 Renderer 显示 loading。
2. **获取包体**:
   - 若 `bundled: true` 且存在本地资源，直接读取本地资源目录。
   - 若为远程，则下载并缓存至 `~/.aionui/cache/<name>.tgz`。
3. **完整性校验**: 计算获取文件的 SHA-512 Hash 并比对 `dist.integrity`。失败则回退至 `install_failed` 状态。
4. **解压验证**:
   - 解压至安全临时目录 `~/.aionui/extensions/.tmp/<name>/`。
   - 验证 `aion-extension.json` 规范性。
5. **部署执行**:
   - 将临时目录原子性移动（重命名）到目标安装目录 `~/.aionui/extensions/<name>/`。
   - 读取并执行生命周期 `onInstall` 钩子（例如执行 `bun add -g @anthropic-ai/claude-code`）。
6. **完成及联动**:
   - 成功执行后，触发 `ExtensionRegistry.reload()` 及 `AcpDetector.scan()`。
   - 依赖前文所述的"动态状态推导"，其状态将自然切换至 `installed`，主页 `Detected Agents` 自动刷新出该 Agent。

### 3.4 重试安装机制

当用户点击 `Retry` (触发 `hub.retryInstall`)：

- 系统首先检查目标目录 `~/.aionui/extensions/<name>/` 是否存在。
- 若目录及解压文件已就绪，则**跳过下载和解压**环节，直接尝试再次执行 `onInstall` 钩子命令。
- 若目录缺失或文件损坏，则从头（步骤 2）完整重启安装流程。

## 4. IPC 通信接口设计

在 `src/preload.ts` (Renderer Bridge) 和主进程 `IpcHandler` 中扩展 `hub` 命名空间：

### 4.1 Renderer -> Main

| 接口方法                 | 参数     | 返回值类型                    | 职责                         |
| :----------------------- | :------- | :---------------------------- | :--------------------------- |
| `hub.getExtensionList()` | `void`   | `Promise<IHubAgentItem[]>`    | 获取带完整状态的 Agent 列表  |
| `hub.install(name)`      | `string` | `Promise<IBridgeResponse>`    | 发起安装                     |
| `hub.retryInstall(name)` | `string` | `Promise<IBridgeResponse>`    | 发起重试安装                 |
| `hub.checkUpdates()`     | `void`   | `Promise<{ name: string }[]>` | 批量检查所有已安装扩展的更新 |
| `hub.update(name)`       | `string` | `Promise<IBridgeResponse>`    | 发起更新操作                 |

### 4.2 Main -> Renderer (Events)

| 事件通道             | Payload 结构                                                   | 触发场景                                              |
| :------------------- | :------------------------------------------------------------- | :---------------------------------------------------- |
| `hub.onStateChanged` | `{ name: string; status: HubExtensionStatus; error?: string }` | 安装中、安装成功、安装失败时主动推送状态变更以刷新 UI |

## 5. 前端 UI 组件设计

对应技术栈：React + Arco Design + UnoCSS

### 5.1 入口组件 (AgentHubTrigger)

- **位置**: `src/renderer/pages/Agent/LocalAgent.tsx` 右上角。
- **形态**: 一个包含 `[+]` 按钮的下拉菜单 (`Dropdown`)，菜单项包含 `从 Hub 中添加`。

### 5.2 列表弹窗视图 (AgentHubModal)

- 统筹数据：内部使用 `useHubAgents` hook 通过 IPC 抓取数据并监听实时状态推送。
- 分类过滤：获取数据后，前端需过滤保留 `hubs.includes('agent')` 的项目进行渲染。
- UI 呈现：弹窗内嵌一个 `List` 列表，每行对应一个 `AgentHubItem`。

### 5.3 交互单元 (AgentHubItem)

根据下发数据的 `status` 字段映射按钮样式及文案：

- `not_installed`: `Button type="primary"`，文案"安装"
- `installing`: `Button disabled loading`，文案"安装中..."
- `installed`: `Button disabled type="secondary"`，文案"已安装" (灰色)
- `install_failed`: `Button status="danger"`，文案"重试"；可配置 Tooltip 悬浮展示 `installError`
- `update_available`: `Button type="primary"`，文案"更新"

## 6. 模块拆分与后续规划 (Out of Scope)

本期设计以 P0 为核心，暂时不涵盖但预留口径的范围：

- **卸载功能**: `uninstalling` 状态已在类型中定义，后端可以预留 `hub.uninstall` 接口，但前端界面（如在主页的"更多"菜单中）本期暂不暴漏入口。
- **扩展 Hub 类型**: `IHubExtension` 中设计了 `hubs: string[]` 数组，为日后支持 Skill Hub、MCP Hub 的列表切换打好基础。目前只查询展示包含 `agent` 的项目。
- **安全沙箱防线**: 本期包源强制限制为官方仓库或本地置信包，通过 SHA-512 SRI 防治中间人劫持；复杂的 Sigstore 签名及三方准入审计在后续规划。
