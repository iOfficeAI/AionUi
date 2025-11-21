# 初识 ACP 协议：AI 编码助手的标准化通信协议

> 从 MCP 到 ACP，探索 AI Agent 生态的标准化之路

## 目录

- [一、引言：AI Agent 生态的标准化挑战](#一引言ai-agent-生态的标准化挑战)
- [二、从 MCP 说起：理解 AI 协议的演进](#二从-mcp-说起理解-ai-协议的演进)
- [三、ACP 是什么？](#三acp-是什么)
- [四、ACP 核心架构设计](#四acp-核心架构设计)
- [五、ACP 协议详解](#五acp-协议详解)
- [六、ACP 实战：从代码看实现](#六acp-实战从代码看实现)
- [七、ACP vs MCP：两个协议的对比与互补](#七acp-vs-mcp两个协议的对比与互补)
- [八、生态系统与实际应用](#八生态系统与实际应用)
- [九、最佳实践与安全考量](#九最佳实践与安全考量)
- [十、未来展望](#十未来展望)

---

## 一、引言：AI Agent 生态的标准化挑战

### 1.1 当前 AI 开发工具面临的问题

在 AI 辅助编程工具快速发展的今天，我们看到了各种强大的 AI 编码助手：

- **GitHub Copilot**：微软的 AI 代码补全工具
- **Cursor**：AI 驱动的代码编辑器
- **Claude Code**：Anthropic 的智能编码助手
- **Codex CLI**：OpenAI 的命令行编码工具
- **Gemini Code Assist**：Google 的编码助手

然而，这些工具之间存在严重的**互操作性问题**：

```
┌──────────────────────────────────────────────────────┐
│                    现状：信息孤岛                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│   ┌─────────┐       ┌─────────┐       ┌─────────┐  │
│   │ VS Code │──────▶│ Copilot │       │ Claude  │  │
│   └─────────┘       └─────────┘       └─────────┘  │
│        ╳                                    ╳        │
│   ┌─────────┐       ┌─────────┐       ┌─────────┐  │
│   │   Zed   │──────▶│  Agent  │       │ Gemini  │  │
│   └─────────┘       └─────────┘       └─────────┘  │
│        ╳                                    ╳        │
│   每个编辑器只能用特定的 Agent                       │
│   用户无法自由选择和切换                             │
└──────────────────────────────────────────────────────┘
```

**核心挑战：**

1. **编辑器锁定**：用户必须为特定 AI Agent 切换编辑器
2. **重复开发**：每个编辑器都要为每个 Agent 单独开发集成
3. **用户体验割裂**：不同 Agent 的交互方式完全不同
4. **生态碎片化**：难以形成统一的开发者社区

### 1.2 标准化协议的价值

正如 **Language Server Protocol (LSP)** 将语言智能从单一 IDE 中解放出来，我们需要一个类似的标准来解决 AI Agent 的互操作性问题。

这就是 **Agent Client Protocol (ACP)** 诞生的背景。

---

## 二、从 MCP 说起：理解 AI 协议的演进

### 2.1 什么是 MCP？

在介绍 ACP 之前，我们需要先了解 **MCP (Model Context Protocol)**。

**MCP** 是 Anthropic 推出的开源标准协议，用于连接 **AI 模型**与**外部系统**（数据源、工具、API 等）。

```
┌─────────────────────────────────────────┐
│            MCP 架构图                    │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐                      │
│  │   AI Model   │  (Claude, GPT, etc.) │
│  └──────┬───────┘                      │
│         │                               │
│         │ MCP Protocol                  │
│         │                               │
│    ┌────▼────────────────┐             │
│    │   MCP Servers       │             │
│    ├─────────────────────┤             │
│    │ • Database Server   │             │
│    │ • File System       │             │
│    │ • API Services      │             │
│    │ • Knowledge Base    │             │
│    └─────────────────────┘             │
│                                         │
└─────────────────────────────────────────┘
```

**MCP 的三大核心原语：**

#### 1. Resources（资源）

类似文件系统的只读数据源，供 AI 模型读取上下文。

```typescript
// MCP Resource 示例
{
  "uri": "file:///workspace/README.md",
  "name": "项目文档",
  "mimeType": "text/markdown",
  "description": "项目需求和架构文档"
}
```

#### 2. Tools（工具）

AI 模型可调用的可执行函数。

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("code-tools")

@mcp.tool()
async def run_tests(test_file: str) -> str:
    """运行指定的测试文件"""
    result = subprocess.run(['pytest', test_file], capture_output=True)
    return result.stdout.decode()
```

#### 3. Prompts（提示模板）

预编写的任务模板，标准化常见操作。

```typescript
{
  "name": "code_review",
  "description": "代码审查提示模板",
  "arguments": [
    {
      "name": "language",
      "description": "编程语言",
      "required": true
    }
  ]
}
```

### 2.2 MCP 的局限性

虽然 MCP 解决了 AI 模型与工具的连接问题，但它**并不解决编辑器与 AI Agent 的通信问题**。

```
┌────────────────────────────────────────────┐
│          MCP 的作用范围                     │
├────────────────────────────────────────────┤
│                                            │
│  编辑器 ──❓──▶ AI Agent ──✓ MCP──▶ 工具   │
│   (Zed)         (Claude)         (DB/API) │
│                                            │
│  ❌ 没有标准协议  ✅ 有 MCP 协议            │
│                                            │
└────────────────────────────────────────────┘
```

这就是 **ACP** 要解决的问题。

---

## 三、ACP 是什么？

### 3.1 定义

**Agent Client Protocol (ACP)** 是一个**开放标准协议**，用于规范**代码编辑器**与 **AI 编码助手（Coding Agent）**之间的通信。

```
┌─────────────────────────────────────────────────┐
│              ACP 完整架构图                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐                  ┌──────────┐   │
│  │  Editor  │◀──── ACP ───────▶│  Agent   │   │
│  │  (Zed)   │                  │ (Claude) │   │
│  └──────────┘                  └────┬─────┘   │
│                                      │          │
│                                      │ MCP      │
│                                      │          │
│                                 ┌────▼─────┐   │
│                                 │   Tools  │   │
│                                 │ Resources│   │
│                                 └──────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**核心理念：**

> 就像 USB-C 接口可以连接任何设备，ACP 让任何编辑器都能使用任何 AI Agent。

### 3.2 设计目标

| 目标         | 说明                                    |
| ------------ | --------------------------------------- |
| **通用性**   | 任何编辑器都能集成任何符合 ACP 的 Agent |
| **隐私优先** | 本地通信，不经过第三方服务器            |
| **开源开放** | Apache 2.0 许可证，任何人都可以实现     |
| **可扩展性** | 支持未来的新功能和新场景                |

### 3.3 与 LSP 的类比

如果你熟悉 **Language Server Protocol (LSP)**，可以这样理解 ACP：

```
LSP 之于语言智能 = ACP 之于 AI 编码助手

┌────────────────────────────────────────┐
│         LSP 模式                        │
├────────────────────────────────────────┤
│                                        │
│  任意编辑器 ◀─── LSP ───▶ 任意语言服务器 │
│  (VS Code)              (TypeScript)  │
│  (Vim)                  (Python)      │
│  (Emacs)                (Go)          │
│                                        │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│         ACP 模式                        │
├────────────────────────────────────────┤
│                                        │
│  任意编辑器 ◀─── ACP ───▶ 任意 AI Agent │
│  (Zed)                  (Claude Code) │
│  (Neovim)               (Gemini)      │
│  (JetBrains)            (Codex)       │
│                                        │
└────────────────────────────────────────┘
```

---

## 四、ACP 核心架构设计

### 4.1 通信模型

ACP 采用 **JSON-RPC 2.0** 协议，基于 **stdio（标准输入输出）**进行通信。

```
┌─────────────────────────────────────────────┐
│          ACP 通信架构                        │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐                          │
│  │   Editor     │                          │
│  │  (主进程)     │                          │
│  └──────┬───────┘                          │
│         │                                   │
│         │ spawn()                           │
│         │                                   │
│  ┌──────▼───────┐                          │
│  │    Agent     │                          │
│  │  (子进程)     │                          │
│  └──────────────┘                          │
│                                             │
│  通信方式：                                  │
│  • Editor 写入 Agent 的 stdin              │
│  • Agent 写入 stdout 返回给 Editor          │
│  • 消息格式：JSON-RPC 2.0                   │
│                                             │
└─────────────────────────────────────────────┘
```

**优势：**

1. **简单高效**：无需网络层，直接进程间通信
2. **隐私安全**：所有数据都在本地，不经过外部服务器
3. **跨平台**：stdin/stdout 是所有操作系统的标准

### 4.2 协议层次

ACP 分为两个核心层：

```
┌─────────────────────────────────────────┐
│            协议分层                      │
├─────────────────────────────────────────┤
│                                         │
│  ┌────────────────────────────────┐   │
│  │   应用层 (Application Layer)    │   │
│  ├────────────────────────────────┤   │
│  │ • Session Management           │   │
│  │ • Tool Calls                   │   │
│  │ • Permission Requests          │   │
│  │ • File Operations              │   │
│  └────────────────────────────────┘   │
│               ▲                         │
│               │                         │
│  ┌────────────▼───────────────────┐   │
│  │   协议层 (Protocol Layer)       │   │
│  ├────────────────────────────────┤   │
│  │ • JSON-RPC 2.0                 │   │
│  │ • Request/Response             │   │
│  │ • Notifications                │   │
│  │ • Error Handling               │   │
│  └────────────────────────────────┘   │
│               ▲                         │
│               │                         │
│  ┌────────────▼───────────────────┐   │
│  │   传输层 (Transport Layer)      │   │
│  ├────────────────────────────────┤   │
│  │ • stdio (stdin/stdout)         │   │
│  └────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### 4.3 消息类型

ACP 支持三种消息类型：

#### 1. Request（请求）

客户端向服务器发送请求，期待响应。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "0.1.0",
    "clientInfo": {
      "name": "Zed",
      "version": "0.158.0"
    }
  }
}
```

#### 2. Response（响应）

服务器对请求的响应。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "0.1.0",
    "serverInfo": {
      "name": "Claude Code",
      "version": "1.0.0"
    },
    "capabilities": {
      "tools": true,
      "resources": true
    }
  }
}
```

#### 3. Notification（通知）

单向消息，不期待响应。

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "session-123",
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "content": {
        "type": "text",
        "text": "正在分析代码..."
      }
    }
  }
}
```

---

## 五、ACP 协议详解

### 5.1 核心方法

ACP 定义了一系列标准方法：

| 方法                         | 类型         | 说明                     |
| ---------------------------- | ------------ | ------------------------ |
| `initialize`                 | Request      | 初始化连接，交换能力信息 |
| `authenticate`               | Request      | 身份验证（可选）         |
| `session/new`                | Request      | 创建新的对话会话         |
| `session/prompt`             | Request      | 向 Agent 发送用户消息    |
| `session/update`             | Notification | Agent 推送会话更新       |
| `session/request_permission` | Notification | Agent 请求用户权限       |
| `fs/read_text_file`          | Request      | 读取文件内容             |
| `fs/write_text_file`         | Request      | 写入文件内容             |
| `end_turn`                   | Notification | Agent 完成一轮响应       |

### 5.2 初始化流程

```
┌────────────────────────────────────────────────┐
│            ACP 初始化序列图                     │
├────────────────────────────────────────────────┤
│                                                │
│  Editor                          Agent         │
│    │                               │           │
│    │──── spawn(agent-cli) ────────▶│           │
│    │                               │           │
│    │──── initialize request ──────▶│           │
│    │     {clientInfo, version}     │           │
│    │                               │           │
│    │◀─── initialize response ──────│           │
│    │     {serverInfo, capabilities}│           │
│    │                               │           │
│    │──── authenticate (optional) ─▶│           │
│    │                               │           │
│    │◀─── auth response ────────────│           │
│    │                               │           │
│    │──── session/new ─────────────▶│           │
│    │     {cwd, mcpServers}         │           │
│    │                               │           │
│    │◀─── session created ──────────│           │
│    │     {sessionId}               │           │
│    │                               │           │
│    ● 连接建立完成，可以开始对话     ●           │
│                                                │
└────────────────────────────────────────────────┘
```

**详细说明：**

#### 步骤 1：启动 Agent 进程

```typescript
// AionUi 项目中的实际代码
// src/agent/acp/AcpConnection.ts

async connect(backend: AcpBackend, cliPath?: string, workingDir?: string) {
  const command = cliPath || this.getDefaultCliPath(backend);

  // 使用 spawn 启动 Agent 子进程
  this.agentProcess = spawn(command, [], {
    cwd: workingDir,
    env: process.env,
  });

  // 监听 stdout（Agent 的输出）
  this.agentProcess.stdout.on('data', this.handleStdout.bind(this));

  // 监听 stderr（Agent 的日志）
  this.agentProcess.stderr.on('data', this.handleStderr.bind(this));

  // 初始化协议
  await this.initialize();
}
```

#### 步骤 2：发送初始化请求

```typescript
private async initialize(): Promise<AcpResponse> {
  return await this.sendRequest('initialize', {
    protocolVersion: '0.1.0',
    clientInfo: {
      name: 'AionUi',
      version: '1.0.0',
    },
  });
}
```

#### 步骤 3：接收能力信息

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "0.1.0",
    "serverInfo": {
      "name": "Claude Code",
      "version": "1.0.128"
    },
    "capabilities": {
      "tools": true,
      "resources": true,
      "streaming": false
    }
  }
}
```

### 5.3 会话更新类型

ACP 定义了丰富的会话更新类型，让编辑器能实时显示 Agent 的思考和操作过程。

```typescript
// AionUi 项目中的类型定义
// src/types/acpTypes.ts

export type AcpSessionUpdate =
  | AgentMessageChunkUpdate // Agent 消息块
  | AgentThoughtChunkUpdate // Agent 思考过程
  | ToolCallUpdate // 工具调用
  | ToolCallUpdateStatus // 工具状态更新
  | PlanUpdate // 任务计划
  | AvailableCommandsUpdate // 可用命令列表
  | UserMessageChunkUpdate; // 用户消息块
```

#### 1. Agent 消息块（AgentMessageChunkUpdate）

Agent 向用户发送的普通消息。

```json
{
  "method": "session/update",
  "params": {
    "sessionId": "sess-123",
    "update": {
      "sessionUpdate": "agent_message_chunk",
      "content": {
        "type": "text",
        "text": "我已经分析了你的代码，发现了以下问题..."
      }
    }
  }
}
```

#### 2. Agent 思考过程（AgentThoughtChunkUpdate）

Agent 的内部思考过程，类似 "思维链"。

```json
{
  "method": "session/update",
  "params": {
    "sessionId": "sess-123",
    "update": {
      "sessionUpdate": "agent_thought_chunk",
      "content": {
        "type": "text",
        "text": "首先，我需要检查 package.json 中的依赖版本..."
      }
    }
  }
}
```

#### 3. 工具调用（ToolCallUpdate）

最重要的更新类型，表示 Agent 要执行某个操作。

```typescript
interface ToolCallUpdate {
  sessionUpdate: 'tool_call';
  toolCallId: string; // 工具调用唯一 ID
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  title: string; // 操作描述
  kind: 'read' | 'edit' | 'execute'; // 操作类型
  rawInput?: any; // 原始输入参数
  content?: Array<{
    type: 'content' | 'diff';
    // ... 内容详情
  }>;
  locations?: Array<{
    path: string; // 受影响的文件路径
  }>;
}
```

**示例：读取文件**

```json
{
  "method": "session/update",
  "params": {
    "sessionId": "sess-123",
    "update": {
      "sessionUpdate": "tool_call",
      "toolCallId": "tool-001",
      "status": "pending",
      "title": "读取 src/index.ts",
      "kind": "read",
      "locations": [{ "path": "/workspace/src/index.ts" }]
    }
  }
}
```

**示例：编辑文件**

```json
{
  "method": "session/update",
  "params": {
    "sessionId": "sess-123",
    "update": {
      "sessionUpdate": "tool_call",
      "toolCallId": "tool-002",
      "status": "in_progress",
      "title": "修复 TypeScript 类型错误",
      "kind": "edit",
      "content": [
        {
          "type": "diff",
          "diff": "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -10,7 +10,7 @@\n-function add(a, b) {\n+function add(a: number, b: number): number {\n   return a + b;\n }"
        }
      ],
      "locations": [{ "path": "/workspace/src/index.ts" }]
    }
  }
}
```

#### 4. 计划更新（PlanUpdate）

Agent 的任务执行计划。

```json
{
  "method": "session/update",
  "params": {
    "sessionId": "sess-123",
    "update": {
      "sessionUpdate": "plan",
      "entries": [
        {
          "content": "分析现有代码结构",
          "status": "completed"
        },
        {
          "content": "识别类型错误位置",
          "status": "in_progress"
        },
        {
          "content": "修复类型定义",
          "status": "pending",
          "priority": "high"
        },
        {
          "content": "运行 TypeScript 编译检查",
          "status": "pending"
        }
      ]
    }
  }
}
```

### 5.4 权限请求机制

ACP 的一个重要安全特性是**权限请求机制**。Agent 在执行敏感操作前必须获得用户许可。

```
┌──────────────────────────────────────────────┐
│          权限请求流程                         │
├──────────────────────────────────────────────┤
│                                              │
│  Agent                          Editor       │
│    │                               │         │
│    │─── session/request_permission ──▶│     │
│    │    {toolCall, options}        │         │
│    │                               │         │
│    │                           [显示对话框]   │
│    │                           用户选择：     │
│    │                           • 仅此一次允许  │
│    │                           • 始终允许     │
│    │                           • 拒绝        │
│    │                               │         │
│    │◀─── permission response ──────│         │
│    │     {optionId: "allow_once"}  │         │
│    │                               │         │
│                                              │
└──────────────────────────────────────────────┘
```

**权限请求消息格式：**

```typescript
interface AcpPermissionRequest {
  sessionId: string;
  options: Array<{
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  }>;
  toolCall: {
    toolCallId: string;
    title: string;
    kind: 'read' | 'edit' | 'execute';
    content?: Array<any>;
    locations?: Array<{ path: string }>;
  };
}
```

**示例：请求写入文件权限**

```json
{
  "method": "session/request_permission",
  "params": {
    "sessionId": "sess-123",
    "options": [
      {
        "optionId": "allow_once",
        "name": "仅此一次允许",
        "kind": "allow_once"
      },
      {
        "optionId": "allow_always",
        "name": "始终允许对此文件的写入",
        "kind": "allow_always"
      },
      {
        "optionId": "reject",
        "name": "拒绝",
        "kind": "reject_once"
      }
    ],
    "toolCall": {
      "toolCallId": "tool-003",
      "title": "写入文件 src/config.ts",
      "kind": "edit",
      "locations": [{ "path": "/workspace/src/config.ts" }],
      "content": [
        {
          "type": "diff",
          "diff": "... (修改内容) ..."
        }
      ]
    }
  }
}
```

**AionUi 中的权限 UI 实现：**

```typescript
// src/renderer/messages/acp/MessageAcpPermission.tsx

const MessageAcpPermission: React.FC<Props> = ({ message }) => {
  const handleConfirm = async (optionId: string) => {
    // 调用 IPC Bridge 确认权限
    await ipcBridge.acpConversation.confirmMessage.invoke({
      confirmKey: message.confirmKey,
      msg_id: message.msg_id,
      conversation_id: message.conversation_id,
      callId: message.toolCall.toolCallId,
    });
  };

  return (
    <div className="permission-dialog">
      <h3>{message.toolCall.title}</h3>
      <div className="options">
        {message.options.map(option => (
          <button key={option.optionId} onClick={() => handleConfirm(option.optionId)}>
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
};
```

---

## 六、ACP 实战：从代码看实现

让我们通过 AionUi 项目的实际代码，深入理解 ACP 的实现细节。

### 6.1 AcpConnection 类：协议通信层

这是 ACP 客户端的核心实现，负责与 Agent 进程的通信。

**完整实现流程：**

```typescript
// src/agent/acp/AcpConnection.ts (605 行)

export class AcpConnection {
  private agentProcess: ChildProcess | null = null;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private requestIdCounter = 0;

  // 事件回调
  public onSessionUpdate?: (data: AcpSessionUpdate) => void;
  public onPermissionRequest?: (data: AcpPermissionRequest) => Promise<{ optionId: string }>;
  public onEndTurn?: () => void;
  public onFileOperation?: (operation: any) => void;

  /**
   * 连接到 Agent
   */
  async connect(backend: AcpBackend, cliPath?: string, workingDir?: string) {
    const command = cliPath || this.getDefaultCliPath(backend);

    // 启动 Agent 子进程
    this.agentProcess = spawn(command, [], {
      cwd: workingDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
    });

    // 监听输出
    this.agentProcess.stdout.on('data', this.handleStdout.bind(this));
    this.agentProcess.stderr.on('data', this.handleStderr.bind(this));

    // 初始化协议
    await this.initialize();
  }

  /**
   * 发送 JSON-RPC 请求
   */
  private async sendRequest(method: string, params: any, timeout = 60000): Promise<AcpResponse> {
    const id = ++this.requestIdCounter;

    const request: AcpRequest = {
      jsonrpc: JSONRPC_VERSION,
      id,
      method,
      params,
    };

    // 创建 Promise，等待响应
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      // 写入 Agent 的 stdin
      const message = JSON.stringify(request) + '\n';
      this.agentProcess.stdin.write(message);
    });
  }

  /**
   * 处理 Agent 的输出
   */
  private handleStdout(data: Buffer) {
    const lines = data
      .toString()
      .split('\n')
      .filter((line) => line.trim());

    for (const line of lines) {
      try {
        const message = JSON.parse(line);

        if ('id' in message && 'result' in message) {
          // Response: 匹配请求并 resolve
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            clearTimeout(pending.timer);
            pending.resolve(message);
            this.pendingRequests.delete(message.id);
          }
        } else if ('method' in message) {
          // Notification: 触发回调
          this.handleNotification(message);
        }
      } catch (error) {
        console.error('Failed to parse message:', line, error);
      }
    }
  }

  /**
   * 处理通知消息
   */
  private handleNotification(notification: AcpNotification) {
    const { method, params } = notification;

    switch (method) {
      case 'session/update':
        if (this.onSessionUpdate) {
          this.onSessionUpdate(params.update);
        }
        break;

      case 'session/request_permission':
        if (this.onPermissionRequest) {
          this.handlePermissionRequest(params);
        }
        break;

      case 'end_turn':
        if (this.onEndTurn) {
          this.onEndTurn();
        }
        break;

      case 'fs/read_text_file':
        this.handleReadOperation(params);
        break;

      case 'fs/write_text_file':
        this.handleWriteOperation(params);
        break;
    }
  }

  /**
   * 创建新会话
   */
  async newSession(cwd: string): Promise<AcpResponse> {
    return await this.sendRequest(
      'session/new',
      {
        cwd,
        mcpServers: [], // 可配置 MCP 服务器
      },
      120000
    ); // 120 秒超时
  }

  /**
   * 发送用户消息
   */
  async sendPrompt(prompt: string): Promise<AcpResponse> {
    return await this.sendRequest(
      'session/prompt',
      {
        prompt,
      },
      120000
    );
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.agentProcess) {
      this.agentProcess.kill();
      this.agentProcess = null;
    }
    this.pendingRequests.clear();
  }
}
```

### 6.2 AcpAgent 类：业务逻辑层

```typescript
// src/agent/acp/index.ts (607 行)

export class AcpAgent {
  private connection: AcpConnection;
  private sessionId: string | null = null;
  private onStreamEvent: (event: any) => void;

  constructor(options: { id: string; backend: AcpBackend; cliPath?: string; workingDir?: string; onStreamEvent: (event: any) => void }) {
    this.onStreamEvent = options.onStreamEvent;

    // 创建连接
    this.connection = new AcpConnection();

    // 注册回调
    this.connection.onSessionUpdate = this.handleSessionUpdate.bind(this);
    this.connection.onPermissionRequest = this.handlePermissionRequest.bind(this);
    this.connection.onEndTurn = this.handleEndTurn.bind(this);
    this.connection.onFileOperation = this.handleFileOperation.bind(this);
  }

  /**
   * 启动 Agent
   */
  async start() {
    await this.connection.connect(this.backend, this.cliPath, this.workingDir);

    // 创建会话
    const response = await this.connection.newSession(this.workingDir);
    this.sessionId = response.result.sessionId;
  }

  /**
   * 发送消息
   */
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
    try {
      await this.connection.sendPrompt(data.content);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理会话更新
   */
  private handleSessionUpdate(update: AcpSessionUpdate) {
    // 使用适配器转换为统一格式
    const event = AcpAdapter.convertUpdate(update);

    // 触发流事件
    this.onStreamEvent(event);
  }

  /**
   * 处理权限请求
   */
  private async handlePermissionRequest(params: AcpPermissionRequest): Promise<{ optionId: string }> {
    // 创建权限消息，显示给用户
    const permissionMessage = {
      role: 'permission_request',
      options: params.options,
      toolCall: params.toolCall,
      confirmKey: generateConfirmKey(),
    };

    this.onStreamEvent(permissionMessage);

    // 等待用户响应（通过 confirmMessage 方法）
    return new Promise((resolve) => {
      this.pendingPermissionResolve = resolve;
    });
  }

  /**
   * 确认权限（用户选择后调用）
   */
  async confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }) {
    // 将用户选择的 optionId 返回给 Agent
    if (this.pendingPermissionResolve) {
      this.pendingPermissionResolve({ optionId: data.confirmKey });
      this.pendingPermissionResolve = null;
    }
  }
}
```

### 6.3 前端 UI 集成

**聊天界面：**

```typescript
// src/renderer/pages/conversation/acp/AcpChat.tsx

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: AcpBackend;
}> = ({ conversation_id, workspace, backend }) => {
  return (
    <ConversationProvider value={{
      conversationId: conversation_id,
      workspace,
      type: 'acp',
    }}>
      {/* 消息列表 */}
      <MessageList />

      {/* 输入框 */}
      <AcpSendBox conversation_id={conversation_id} backend={backend} />
    </ConversationProvider>
  );
};
```

**工具调用 UI：**

```typescript
// src/renderer/messages/acp/MessageAcpToolCall.tsx

const MessageAcpToolCall: React.FC<{ toolCall: ToolCallUpdate }> = ({ toolCall }) => {
  return (
    <div className="tool-call">
      {/* 工具图标 */}
      <div className="tool-icon">
        {toolCall.kind === 'read' && <FileIcon />}
        {toolCall.kind === 'edit' && <EditIcon />}
        {toolCall.kind === 'execute' && <TerminalIcon />}
      </div>

      {/* 工具标题 */}
      <div className="tool-title">{toolCall.title}</div>

      {/* 状态指示器 */}
      <div className={`tool-status tool-status-${toolCall.status}`}>
        {toolCall.status === 'pending' && <ClockIcon />}
        {toolCall.status === 'in_progress' && <SpinnerIcon />}
        {toolCall.status === 'completed' && <CheckIcon />}
        {toolCall.status === 'failed' && <XIcon />}
      </div>

      {/* 文件路径 */}
      {toolCall.locations && (
        <div className="tool-locations">
          {toolCall.locations.map(loc => (
            <span key={loc.path}>{loc.path}</span>
          ))}
        </div>
      )}

      {/* Diff 内容 */}
      {toolCall.content && toolCall.content[0]?.type === 'diff' && (
        <DiffViewer diff={toolCall.content[0].diff} />
      )}
    </div>
  );
};
```

### 6.4 IPC Bridge 集成

```typescript
// src/process/bridge/acpConversationBridge.ts

export function initAcpConversationBridge() {
  // 确认权限
  ipcBridge.acpConversation.confirmMessage.provider(async ({ confirmKey, msg_id, conversation_id, callId }) => {
    const task = WorkerManage.getTaskById(conversation_id) as AcpAgentManager;
    await task.confirmMessage({ confirmKey, msg_id, callId });
    return { success: true };
  });

  // 检测可用的 Agent
  ipcBridge.acpConversation.getAvailableAgents.provider(async () => {
    const agents = acpDetector.getDetectedAgents();
    return { success: true, data: agents };
  });

  // 检测 CLI 路径
  ipcBridge.acpConversation.detectCliPath.provider(async ({ backend }) => {
    const agents = acpDetector.getDetectedAgents();
    const agent = agents.find((a) => a.backend === backend);
    return {
      success: !!agent?.cliPath,
      data: { path: agent?.cliPath },
    };
  });
}
```

---

## 七、ACP vs MCP：两个协议的对比与互补

### 7.1 核心区别

```
┌────────────────────────────────────────────────────┐
│              ACP vs MCP 对比                        │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │              ACP (Agent Client Protocol)      │ │
│  ├──────────────────────────────────────────────┤ │
│  │ 作用：编辑器 ←→ AI Agent                      │ │
│  │ 场景：代码编辑、重构、调试                     │ │
│  │ 通信：双向（请求/响应 + 通知）                 │ │
│  │ 传输：stdio (本地进程通信)                    │ │
│  │ 创建者：Zed Industries                        │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │           MCP (Model Context Protocol)        │ │
│  ├──────────────────────────────────────────────┤ │
│  │ 作用：AI 模型 ←→ 工具/资源                    │ │
│  │ 场景：数据库查询、API调用、文件系统操作        │ │
│  │ 通信：主要是单向（模型调用工具）               │ │
│  │ 传输：stdio / HTTP with SSE                  │ │
│  │ 创建者：Anthropic                             │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 7.2 详细对比表

| 维度         | ACP                        | MCP                          |
| ------------ | -------------------------- | ---------------------------- |
| **完整名称** | Agent Client Protocol      | Model Context Protocol       |
| **主要用途** | 编辑器与 AI 编码助手的通信 | AI 模型与外部工具/资源的通信 |
| **通信方向** | 双向（编辑器 ↔ Agent）    | 主要单向（Model → Tools）    |
| **协议基础** | JSON-RPC 2.0 over stdio    | JSON-RPC 2.0 over stdio/HTTP |
| **传输方式** | stdio（标准输入输出）      | stdio / HTTP with SSE        |
| **生命周期** | 编辑器启动 Agent 子进程    | Host 启动 MCP Server         |
| **状态管理** | 有状态（会话持久化）       | 有状态（连接生命周期）       |
| **权限控制** | 内置权限请求机制           | 依赖 Host 实现               |
| **典型场景** | 代码生成、重构、调试       | 数据库查询、API 调用         |
| **作者**     | Zed Industries             | Anthropic                    |
| **发布时间** | 2025 年                    | 2024 年                      |
| **开源协议** | Apache 2.0                 | MIT                          |

### 7.3 协作关系

ACP 和 MCP 不是竞争关系，而是**互补关系**。

```
┌─────────────────────────────────────────────────────┐
│            ACP + MCP 完整架构图                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐                                      │
│  │ Editor   │                                      │
│  │  (Zed)   │                                      │
│  └────┬─────┘                                      │
│       │                                             │
│       │ ACP (Agent Client Protocol)                │
│       │                                             │
│  ┌────▼─────────────────┐                          │
│  │   AI Agent           │                          │
│  │  (Claude Code)       │                          │
│  └────┬─────────────────┘                          │
│       │                                             │
│       │ MCP (Model Context Protocol)               │
│       │                                             │
│  ┌────▼─────────────────┐                          │
│  │   MCP Servers        │                          │
│  ├──────────────────────┤                          │
│  │ • Database Server    │                          │
│  │ • File System        │                          │
│  │ • Git Server         │                          │
│  │ • Web Fetch          │                          │
│  │ • Memory/Knowledge   │                          │
│  └──────────────────────┘                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**实际工作流程：**

1. **用户** 在 Zed 编辑器中输入："帮我重构这个函数，并将结果保存到数据库"
2. **Zed** 通过 **ACP** 将消息发送给 **Claude Code Agent**
3. **Claude** 分析代码，生成重构后的代码
4. **Claude** 通过 **MCP** 调用 **Database Server** 将结果保存
5. **Claude** 通过 **ACP** 将结果返回给 **Zed**
6. **Zed** 在编辑器中显示重构后的代码和执行结果

### 7.4 在 AionUi 中的集成

AionUi 项目同时支持 ACP 和 MCP：

```typescript
// src/agent/acp/AcpConnection.ts

async newSession(cwd: string): Promise<AcpResponse> {
  return await this.sendRequest('session/new', {
    cwd,
    // 可以在创建 ACP 会话时配置 MCP 服务器
    mcpServers: [
      {
        name: 'database',
        command: 'node',
        args: ['./mcp-servers/database-server.js'],
      },
      {
        name: 'git',
        command: 'node',
        args: ['./mcp-servers/git-server.js'],
      },
    ],
  });
}
```

这样，Claude Code Agent 就可以同时：

- 通过 **ACP** 与编辑器通信
- 通过 **MCP** 访问数据库、Git 等工具

---

## 八、生态系统与实际应用

### 8.1 支持 ACP 的编辑器

```
┌────────────────────────────────────────┐
│        ACP 编辑器生态                   │
├────────────────────────────────────────┤
│                                        │
│  ✅ Zed (官方支持，原生集成)            │
│  ✅ Neovim (社区插件)                  │
│  ✅ JetBrains IDEs (官方合作)          │
│  ✅ Marimo (数据科学笔记本)             │
│  🔄 VS Code (计划中)                   │
│  🔄 Emacs (社区开发中)                 │
│                                        │
└────────────────────────────────────────┘
```

**Zed 的 ACP 配置示例：**

```json
// ~/.config/zed/settings.json
{
  "agents": {
    "claude": {
      "command": "claude-code",
      "args": [],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    },
    "gemini": {
      "command": "gemini-cli",
      "args": ["--model", "gemini-1.5-pro"]
    },
    "codex": {
      "command": "codex",
      "args": ["--api-key", "sk-..."]
    }
  }
}
```

### 8.2 支持 ACP 的 AI Agent

| Agent           | 厂商      | 模型              | 特性                         |
| --------------- | --------- | ----------------- | ---------------------------- |
| **Claude Code** | Anthropic | Claude 3.5 Sonnet | 长上下文、思维链、代码理解强 |
| **Gemini CLI**  | Google    | Gemini 1.5 Pro    | 多模态、快速响应             |
| **Codex CLI**   | OpenAI    | GPT-4             | 广泛的编程语言支持           |
| **Qwen Code**   | 阿里云    | Qwen Coder        | 中文编程、本地化             |
| **goose**       | Block     | 多模型支持        | 开源、可定制                 |

### 8.3 实际应用场景

#### 场景 1：代码重构

**用户输入：**

> "将这个组件从 Class 组件重构为 Function 组件，使用 Hooks"

**ACP 工作流程：**

```
1. [Agent Message] "我会帮你重构这个组件..."

2. [Tool Call - Read]
   读取 src/components/UserList.tsx

3. [Agent Thought]
   "这是一个 Class 组件，有三个生命周期方法和一个状态..."

4. [Tool Call - Edit]
   生成重构后的代码（使用 useState、useEffect）

5. [Permission Request]
   "是否允许修改 UserList.tsx?"

6. [User] 点击"允许"

7. [Tool Call - Execute]
   运行 `npm run lint` 检查语法

8. [Agent Message]
   "重构完成！代码已通过 lint 检查。"
```

#### 场景 2：Bug 修复

**用户输入：**

> "修复这个 TypeScript 类型错误"

**ACP 工作流程：**

```
1. [Tool Call - Read]
   读取当前文件

2. [Agent Thought]
   "类型错误是因为函数返回值类型不匹配..."

3. [Plan Update]
   - [✓] 分析类型错误
   - [→] 修改函数签名
   - [ ] 添加类型注解
   - [ ] 运行 tsc 检查

4. [Tool Call - Edit]
   修改函数类型定义

5. [Tool Call - Execute]
   运行 `tsc --noEmit`

6. [Agent Message]
   "类型错误已修复！TypeScript 编译通过。"
```

#### 场景 3：集成 MCP 的复杂场景

**用户输入：**

> "从数据库中查询用户列表，生成一个 React 表格组件"

**ACP + MCP 协作流程：**

```
1. [ACP] Agent 收到请求

2. [MCP] Agent 调用 Database Server
   Tool: query_users()

3. [MCP] Database Server 返回数据
   Result: [{id: 1, name: "Alice"}, ...]

4. [ACP] Agent 思考如何生成组件

5. [ACP] Agent 创建新文件
   Tool Call: write_file("UserTable.tsx")

6. [ACP] Agent 生成组件代码
   基于数据库结构生成 TypeScript 类型

7. [ACP] Agent 运行测试
   Tool Call: execute("npm test UserTable")

8. [ACP] Agent 返回结果
   "组件已创建，所有测试通过！"
```

---

## 九、最佳实践与安全考量

### 9.1 实现 ACP Agent 的最佳实践

#### 1. 日志处理

**❌ 错误做法：**

```typescript
// 不要写入 stdout！
console.log('Agent is processing...');
```

**✅ 正确做法：**

```typescript
// 使用 stderr 或文件日志
import fs from 'fs';

const logFile = fs.createWriteStream('/tmp/agent.log');

function log(message: string) {
  logFile.write(`[${new Date().toISOString()}] ${message}\n`);
}

log('Agent is processing...');
```

**原因：** ACP 使用 stdout 传输 JSON-RPC 消息，任何非 JSON 输出都会破坏协议。

#### 2. 错误处理

```typescript
try {
  await executeToolCall(toolCall);
} catch (error) {
  // 返回标准错误格式
  return {
    jsonrpc: '2.0',
    id: requestId,
    error: {
      code: -32603,
      message: error.message,
      data: {
        stack: error.stack,
      },
    },
  };
}
```

#### 3. 超时管理

```typescript
const TOOL_CALL_TIMEOUT = 30000; // 30 秒

async function executeToolCallWithTimeout(toolCall: ToolCall) {
  return Promise.race([executeToolCall(toolCall), new Promise((_, reject) => setTimeout(() => reject(new Error('Tool call timeout')), TOOL_CALL_TIMEOUT))]);
}
```

#### 4. 流式响应

对于长时间的操作，使用流式更新：

```typescript
async function generateCode(prompt: string) {
  // 发送进度更新
  sendNotification('session/update', {
    update: {
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: '正在分析需求...' },
    },
  });

  // 生成代码
  const code = await llm.generate(prompt);

  // 发送代码块
  sendNotification('session/update', {
    update: {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: code },
    },
  });
}
```

### 9.2 安全考量

#### 1. 文件系统访问控制

```typescript
// 定义允许的工作目录
const ALLOWED_WORKSPACE = process.env.WORKSPACE_DIR;

function validateFilePath(path: string): boolean {
  const resolvedPath = path.resolve(path);

  // 检查路径是否在允许的工作目录内
  if (!resolvedPath.startsWith(ALLOWED_WORKSPACE)) {
    throw new Error('Access denied: path outside workspace');
  }

  // 检查是否访问敏感文件
  const sensitivePatterns = ['.env', '.git/config', 'id_rsa'];
  if (sensitivePatterns.some((pattern) => resolvedPath.includes(pattern))) {
    throw new Error('Access denied: sensitive file');
  }

  return true;
}
```

#### 2. 命令执行安全

```typescript
// 白名单机制
const ALLOWED_COMMANDS = ['npm test', 'npm run lint', 'tsc --noEmit', 'git status'];

function validateCommand(command: string): boolean {
  return ALLOWED_COMMANDS.some((allowed) => command.startsWith(allowed));
}

async function executeCommand(command: string) {
  if (!validateCommand(command)) {
    throw new Error('Command not allowed');
  }

  // 执行命令
  return execAsync(command, {
    timeout: 30000,
    cwd: WORKSPACE_DIR,
  });
}
```

#### 3. 权限请求实现

```typescript
async function requestPermission(toolCall: ToolCall): Promise<boolean> {
  // 发送权限请求
  sendNotification('session/request_permission', {
    sessionId: currentSessionId,
    options: [
      { optionId: 'allow_once', name: '仅此一次允许', kind: 'allow_once' },
      { optionId: 'allow_always', name: '始终允许', kind: 'allow_always' },
      { optionId: 'reject', name: '拒绝', kind: 'reject_once' },
    ],
    toolCall,
  });

  // 等待用户响应
  const response = await waitForPermissionResponse();

  // 缓存权限决策
  if (response.kind === 'allow_always') {
    permissionCache.set(toolCall.kind, true);
  } else if (response.kind === 'reject_always') {
    permissionCache.set(toolCall.kind, false);
  }

  return response.kind.startsWith('allow');
}
```

#### 4. 敏感信息处理

```typescript
// 过滤敏感信息
function sanitizeContent(content: string): string {
  // 移除 API 密钥
  content = content.replace(/sk-[a-zA-Z0-9]{48}/g, '***API_KEY***');

  // 移除密码
  content = content.replace(/password\s*=\s*['"][^'"]+['"]/gi, 'password=***');

  // 移除 Token
  content = content.replace(/Bearer\s+[a-zA-Z0-9._-]+/g, 'Bearer ***');

  return content;
}
```

### 9.3 性能优化

#### 1. 批量操作

```typescript
// 批量读取文件
async function readMultipleFiles(paths: string[]): Promise<Map<string, string>> {
  const results = new Map();

  await Promise.all(
    paths.map(async (path) => {
      const content = await fs.readFile(path, 'utf-8');
      results.set(path, content);
    })
  );

  return results;
}
```

#### 2. 增量更新

```typescript
// 只发送变化的内容
let lastContent = '';

function sendDiffUpdate(newContent: string) {
  const diff = computeDiff(lastContent, newContent);

  if (diff) {
    sendNotification('session/update', {
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'diff', diff },
      },
    });
  }

  lastContent = newContent;
}
```

#### 3. 缓存机制

```typescript
// 缓存文件内容
const fileCache = new LRU<string, string>({
  max: 100,
  maxAge: 5 * 60 * 1000, // 5 分钟
});

async function readFileWithCache(path: string): Promise<string> {
  const cached = fileCache.get(path);
  if (cached) return cached;

  const content = await fs.readFile(path, 'utf-8');
  fileCache.set(path, content);

  return content;
}
```

---

## 十、未来展望

### 10.1 协议演进方向

#### 1. 更丰富的内容类型

```typescript
// 未来可能支持的内容类型
interface FutureContent {
  type: 'text' | 'image' | 'video' | 'audio' | 'diagram' | '3d-model';
  // ...
}

// 示例：Agent 生成架构图
{
  sessionUpdate: 'agent_message_chunk',
  content: {
    type: 'diagram',
    format: 'mermaid',
    data: `
      graph TD
        A[Client] -->|HTTP| B[Server]
        B --> C[Database]
    `
  }
}
```

#### 2. 多 Agent 协作

```
┌─────────────────────────────────────────┐
│         多 Agent 协作架构                │
├─────────────────────────────────────────┤
│                                         │
│  Editor                                 │
│    │                                    │
│    ├──▶ Code Agent (负责代码生成)       │
│    │                                    │
│    ├──▶ Test Agent (负责测试)          │
│    │                                    │
│    ├──▶ Review Agent (负责代码审查)     │
│    │                                    │
│    └──▶ Deploy Agent (负责部署)        │
│                                         │
│  Agent 之间可以互相通信和协作            │
│                                         │
└─────────────────────────────────────────┘
```

#### 3. 增强的上下文管理

```typescript
// 未来的会话上下文
interface EnhancedSessionContext {
  // 项目元数据
  project: {
    name: string;
    language: string[];
    framework: string[];
    dependencies: Record<string, string>;
  };

  // 代码图谱
  codeGraph: {
    files: FileNode[];
    imports: ImportEdge[];
    exports: ExportEdge[];
  };

  // 历史操作
  history: Operation[];

  // 用户偏好
  preferences: {
    codingStyle: string;
    testFramework: string;
    // ...
  };
}
```

### 10.2 生态系统建设

#### 1. ACP Agent 市场

```
┌────────────────────────────────────────┐
│          ACP Agent 市场                 │
├────────────────────────────────────────┤
│                                        │
│  • 官方 Agent（Claude、Gemini、Codex） │
│  • 社区 Agent（开源、定制化）           │
│  • 企业 Agent（私有部署、定制模型）     │
│                                        │
│  用户可以：                             │
│  - 浏览和搜索 Agent                    │
│  - 查看评分和评论                       │
│  - 一键安装和配置                       │
│  - 分享自己的 Agent                    │
│                                        │
└────────────────────────────────────────┘
```

#### 2. 标准化的 Agent 能力声明

```json
// agent-manifest.json
{
  "name": "my-custom-agent",
  "version": "1.0.0",
  "description": "A custom coding agent for Rust projects",
  "author": "Your Name",
  "capabilities": {
    "languages": ["rust", "toml"],
    "frameworks": ["tokio", "actix"],
    "tools": {
      "code_generation": true,
      "refactoring": true,
      "testing": true,
      "debugging": false
    }
  },
  "requirements": {
    "model": "gpt-4",
    "apiKey": "required",
    "minEditorVersion": "0.158.0"
  }
}
```

#### 3. 跨编辑器同步

```typescript
// 未来的跨编辑器配置同步
interface AgentConfig {
  agents: {
    [name: string]: {
      command: string;
      args: string[];
      env: Record<string, string>;
      settings: any;
    };
  };
  preferences: {
    defaultAgent: string;
    autoStart: boolean;
    // ...
  };
}

// 同步到云端
await syncConfigToCloud(config);

// 在另一台设备上
const config = await loadConfigFromCloud();
```

### 10.3 与其他标准的集成

#### 1. 与 LSP 的深度集成

```
┌────────────────────────────────────────┐
│       ACP + LSP 协同工作                │
├────────────────────────────────────────┤
│                                        │
│  Editor                                │
│    │                                   │
│    ├──▶ LSP (提供语言智能)             │
│    │     - 自动补全                    │
│    │     - 类型检查                    │
│    │     - 重构建议                    │
│    │                                   │
│    └──▶ ACP (提供 AI 能力)            │
│          - 理解 LSP 的诊断信息         │
│          - 生成符合项目规范的代码      │
│          - 自动修复 LSP 报告的错误     │
│                                        │
└────────────────────────────────────────┘
```

#### 2. 与 Debug Adapter Protocol (DAP) 集成

```typescript
// Agent 可以理解调试信息
{
  sessionUpdate: 'debug_analysis',
  breakpoint: {
    file: 'src/index.ts',
    line: 42,
    variables: {
      user: { id: 123, name: 'Alice' },
      error: new Error('Invalid token')
    }
  },
  suggestion: "错误是因为 token 已过期，建议添加 token 刷新逻辑"
}
```

### 10.4 AI 原生编程范式

ACP 正在推动一种新的编程范式：**AI 原生编程（AI-Native Programming）**。

```
传统编程：
  人类 → 手写代码 → 编译器 → 可执行程序

AI 辅助编程（现在）：
  人类 → AI 生成代码片段 → 人类修改 → 编译器 → 可执行程序

AI 原生编程（未来）：
  人类描述需求 → AI Agent 理解 → AI 设计架构 → AI 实现 → AI 测试 → AI 部署
  ↑                                                                    ↓
  └─────────────────── 人类审查和指导 ─────────────────────────────────┘
```

**关键特征：**

1. **声明式编程**：人类只需描述"要什么"，而不是"怎么做"
2. **持续对话**：编程变成与 AI 的持续对话过程
3. **多层抽象**：从需求 → 架构 → 实现 → 优化，每层都有 AI 辅助
4. **自动化流程**：测试、部署、监控都由 AI 自动化

---

## 十一、总结

### 11.1 ACP 的核心价值

✅ **标准化**：统一的协议规范，消除编辑器与 Agent 的互操作壁垒

✅ **开放性**：开源协议，任何人都可以实现和扩展

✅ **隐私优先**：本地通信，不经过第三方服务器

✅ **可组合性**：与 MCP 等协议协同工作，构建完整的 AI 生态

✅ **易用性**：基于成熟的 JSON-RPC 2.0，简单高效

### 11.2 适用场景

- **代码编辑器开发者**：希望集成多个 AI 编码助手
- **AI Agent 开发者**：希望让自己的 Agent 被更多编辑器支持
- **企业开发团队**：需要在统一的编辑器环境中使用不同的 AI 工具
- **开源社区**：构建开放、协作的 AI 辅助编程生态

### 11.3 开始使用 ACP

#### 1. 作为编辑器开发者

```bash
# 安装 ACP SDK
npm install @agentclientprotocol/sdk

# 参考 Zed 的实现
git clone https://github.com/zed-industries/zed
```

#### 2. 作为 Agent 开发者

```bash
# 选择你喜欢的语言 SDK
npm install @agentclientprotocol/sdk       # TypeScript
pip install agent-client-protocol          # Python
cargo add agent-client-protocol            # Rust
```

#### 3. 作为用户

```bash
# 下载支持 ACP 的编辑器
# Zed
curl https://zed.dev/install.sh | sh

# 配置你喜欢的 Agent
zed --config agents.claude.command="claude-code"
```

### 11.4 学习资源

- **官方网站**：[agentclientprotocol.com](https://agentclientprotocol.com/)
- **GitHub 仓库**：[github.com/agentclientprotocol/agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol)
- **协议规范**：[Schema JSON](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/schema.json)
- **社区讨论**：[GitHub Discussions](https://github.com/agentclientprotocol/agent-client-protocol/discussions)

---

## 附录：ACP 与 MCP 协议对比速查表

```
┌──────────────────────────────────────────────────────────┐
│                  ACP vs MCP 速查表                        │
├──────────────────┬───────────────────┬───────────────────┤
│   特性           │   ACP             │   MCP             │
├──────────────────┼───────────────────┼───────────────────┤
│ 完整名称         │ Agent Client      │ Model Context     │
│                  │ Protocol          │ Protocol          │
├──────────────────┼───────────────────┼───────────────────┤
│ 主要作用         │ 编辑器 ↔ AI Agent │ AI Model ↔ Tools  │
├──────────────────┼───────────────────┼───────────────────┤
│ 协议基础         │ JSON-RPC 2.0      │ JSON-RPC 2.0      │
├──────────────────┼───────────────────┼───────────────────┤
│ 传输方式         │ stdio             │ stdio / HTTP+SSE  │
├──────────────────┼───────────────────┼───────────────────┤
│ 通信方向         │ 双向              │ 主要单向          │
├──────────────────┼───────────────────┼───────────────────┤
│ 生命周期管理     │ 编辑器控制        │ Host 控制         │
├──────────────────┼───────────────────┼───────────────────┤
│ 权限控制         │ 内置机制          │ 依赖 Host         │
├──────────────────┼───────────────────┼───────────────────┤
│ 流式响应         │ 支持              │ 支持              │
├──────────────────┼───────────────────┼───────────────────┤
│ 作者             │ Zed Industries    │ Anthropic         │
├──────────────────┼───────────────────┼───────────────────┤
│ 开源协议         │ Apache 2.0        │ MIT               │
├──────────────────┼───────────────────┼───────────────────┤
│ 发布时间         │ 2025              │ 2024              │
├──────────────────┼───────────────────┼───────────────────┤
│ 典型场景         │ 代码生成、重构    │ 数据库、API 调用  │
└──────────────────┴───────────────────┴───────────────────┘
```

---

**关于本文**

本文结合了：

- MCP 官方文档和社区实践
- ACP 官方规范和 Zed 实现
- AionUi 项目的实际代码
- 行业最佳实践和未来趋势

希望能帮助你深入理解 ACP 协议，并在实际项目中应用。

**作者**：基于掘金文章《MCP 深度解析》、ACP 官方文档、以及 AionUi 开源项目综合整理

**更新日期**：2025 年

---

**相关阅读**

- [MCP 官方文档](https://modelcontextprotocol.io)
- [ACP 官方网站](https://agentclientprotocol.com/)
- [Zed 编辑器 ACP 集成](https://zed.dev/acp)
- [AionUi 开源项目](https://github.com/iOfficeAI/AionUi)
