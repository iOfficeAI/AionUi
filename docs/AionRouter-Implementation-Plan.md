# AionRouter 实施方案

> 统一多协议 AI 路由 SDK，支持 OpenAI / Gemini / Anthropic 协议转换与多 Key 轮询

---

## 一、现有项目协议支持情况

### 1. aioncli (核心库)

| 协议方向 | 支持情况 | 实现位置 | 代码行数 |
|---------|---------|---------|---------|
| **Gemini → 内部格式** | ✅ 原生支持 | `geminiChat.ts` | 850 |
| **OpenAI → Gemini 格式** | ✅ 完整支持 | `openaiContentGenerator.ts` | 2355 |
| **Gemini 格式 → OpenAI** | ✅ 响应转换 | `convertToGeminiFormat()` | - |
| **Anthropic** | ❌ 不支持 | - | - |

**核心抽象**: `ContentGenerator` 接口统一所有平台

**支持的认证类型**:
- `USE_GEMINI` - Gemini API Key
- `USE_VERTEX_AI` - Google Cloud Vertex AI
- `LOGIN_WITH_GOOGLE` - Google OAuth
- `USE_OPENAI` - OpenAI 兼容协议
- `COMPUTE_ADC` - Application Default Credentials

---

### 2. AionUi (桌面应用)

| 协议方向 | 支持情况 | 实现位置 |
|---------|---------|---------|
| **Gemini API** | ✅ 完整支持 | `/src/agent/gemini/` |
| **ACP 协议** (Claude Code, Qwen 等) | ✅ 统一适配 | `/src/agent/acp/` |
| **Codex MCP** | ✅ 支持 | `/src/agent/codex/` |
| **OpenAI 兼容** | ✅ 通过 modelBridge | `/src/process/bridge/` |
| **Anthropic 原生** | ❌ 不支持 | - |

**支持的 ACP 后端**:
- Claude Code
- Qwen Code
- Goose
- Augment Code
- Kimi/Moonshot
- iFlow CLI
- OpenCode

---

### 3. Antigravity Tools (代理服务)

| 协议方向 | 支持情况 | 实现位置 | 代码行数 |
|---------|---------|---------|---------|
| **OpenAI → Gemini v1internal** | ✅ 完整支持 | `/proxy/mappers/openai/` | 300+ |
| **Claude → Gemini v1internal** | ✅ 完整支持 | `/proxy/mappers/claude/` | 400+ |
| **Gemini → Gemini v1internal** | ✅ 包装转发 | `/proxy/mappers/gemini/` | 100+ |
| **多 Key 轮询** | ✅ 60秒时间窗口 | `token_manager.rs` | 274 |
| **模型映射** | ✅ 三层优先级 | `model_mapping.rs` | 168 |

---

## 二、协议转换矩阵

```
                    ┌─────────────────────────────────────────────┐
                    │              目标协议 (Output)               │
                    ├───────────┬───────────┬───────────┬─────────┤
                    │  OpenAI   │  Gemini   │ Anthropic │ 内部格式 │
┌───────┬──────────┼───────────┼───────────┼───────────┼─────────┤
│       │ OpenAI   │    -      │ ✅ Anti   │ ❌        │ ✅ cli  │
│ 源    ├──────────┼───────────┼───────────┼───────────┼─────────┤
│ 协    │ Gemini   │ ✅ cli    │    -      │ ❌        │ ✅ cli  │
│ 议    ├──────────┼───────────┼───────────┼───────────┼─────────┤
│       │Anthropic │ ❌        │ ✅ Anti   │    -      │ ❌      │
└───────┴──────────┴───────────┴───────────┴───────────┴─────────┘

✅ cli  = aioncli 支持
✅ Anti = Antigravity 支持
❌      = 不支持
```

### 缺失的转换场景

| 转换方向 | 优先级 | 用途 |
|---------|-------|------|
| OpenAI → Anthropic | 高 | Claude API 直连 |
| Gemini → Anthropic | 高 | Claude API 直连 |
| Anthropic → OpenAI | 中 | OpenAI 兼容服务 |
| Anthropic → 内部格式 | 高 | aioncli 支持 Claude |

---

## 三、AionRouter 架构设计

### 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        AionRouter SDK                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   入口层    │  │   路由层    │  │   出口层    │             │
│  │  (Inbound)  │  │  (Router)   │  │  (Outbound) │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐             │
│  │ OpenAI     │  │ Key Pool   │  │ OpenAI     │             │
│  │ Adapter    │  │ Manager    │  │ Provider   │             │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤             │
│  │ Gemini     │  │ Model      │  │ Gemini     │             │
│  │ Adapter    │  │ Mapper     │  │ Provider   │             │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤             │
│  │ Anthropic  │  │ Load       │  │ Anthropic  │             │
│  │ Adapter    │  │ Balancer   │  │ Provider   │             │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤             │
│  │ Custom     │  │ Retry      │  │ Vertex AI  │             │
│  │ Adapter    │  │ Strategy   │  │ Provider   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┤
│  │                    统一消息格式 (UnifiedMessage)             │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │  │  Text   │ │ Image   │ │  Tool   │ │Thinking │           │
│  │  │  Part   │ │  Part   │ │  Call   │ │  Part   │           │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│  └─────────────────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────┘
```

### 2. 数据流

```
外部请求 (OpenAI/Gemini/Anthropic 格式)
    │
    ▼
┌─────────────────┐
│  Inbound        │  ← 入口适配器: 解析外部格式
│  Adapter        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Unified        │  ← 统一消息格式
│  Message        │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│ Model  │ │ Key    │  ← 路由决策
│ Mapper │ │ Pool   │
└────┬───┘ └───┬────┘
     └────┬────┘
          ▼
┌─────────────────┐
│  Outbound       │  ← 出口提供商: 发送请求
│  Provider       │
└────────┬────────┘
         │
         ▼
外部响应 → 转换回原格式 → 返回
```

---

## 四、核心模块设计

### 1. 统一消息格式 (UnifiedMessage)

```typescript
// types/unified-message.ts

/**
 * 统一消息角色
 */
type UnifiedRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 统一消息部件
 */
type UnifiedPart =
  | { type: 'text'; content: string }
  | { type: 'image'; mimeType: string; data: string; url?: string }
  | { type: 'audio'; mimeType: string; data: string }
  | { type: 'video'; mimeType: string; data: string }
  | { type: 'file'; mimeType: string; uri: string }
  | { type: 'toolCall'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'toolResult'; id: string; content: unknown; isError?: boolean }
  | { type: 'thinking'; content: string; signature?: string };

/**
 * 统一消息
 */
interface UnifiedMessage {
  role: UnifiedRole;
  parts: UnifiedPart[];
  metadata?: {
    name?: string;              // 工具名或用户名
    toolCallId?: string;        // 工具调用 ID
    thoughtSignature?: string;  // 思维签名 (Gemini 3+)
    cacheControl?: object;      // 缓存控制 (Anthropic)
  };
}

/**
 * 统一工具定义
 */
interface UnifiedTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * 统一请求
 */
interface UnifiedRequest {
  messages: UnifiedMessage[];
  model: string;
  stream?: boolean;
  tools?: UnifiedTool[];
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  config?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
    responseFormat?: 'text' | 'json';
    jsonSchema?: Record<string, unknown>;
  };
}

/**
 * 统一响应
 */
interface UnifiedResponse {
  id: string;
  model: string;
  message: UnifiedMessage;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error';
}

/**
 * 统一流式块
 */
interface UnifiedStreamChunk {
  id: string;
  model: string;
  delta: Partial<UnifiedMessage>;
  finishReason?: UnifiedResponse['finishReason'];
  usage?: UnifiedResponse['usage'];
}
```

---

### 2. Adapter 接口 (入口层)

```typescript
// adapters/base.ts

/**
 * 入口适配器接口
 * 负责将外部协议格式转换为统一格式
 */
interface InboundAdapter {
  /** 协议标识 */
  readonly protocol: 'openai' | 'gemini' | 'anthropic' | 'custom';

  /** 请求转换: 外部格式 → 统一格式 */
  parseRequest(raw: unknown): UnifiedRequest;

  /** 响应转换: 统一格式 → 外部格式 */
  formatResponse(unified: UnifiedResponse): unknown;

  /** 流式块转换: 统一格式 → 外部格式 */
  formatStreamChunk(chunk: UnifiedStreamChunk): unknown;

  /** 错误转换: 统一错误 → 外部格式 */
  formatError(error: RouterError): unknown;

  /** 验证请求格式 */
  validateRequest(raw: unknown): ValidationResult;
}

/**
 * 验证结果
 */
interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
```

#### 2.1 OpenAI Adapter

```typescript
// adapters/openai.ts

class OpenAIAdapter implements InboundAdapter {
  readonly protocol = 'openai';

  parseRequest(raw: OpenAIChatRequest): UnifiedRequest {
    return {
      model: raw.model,
      stream: raw.stream ?? false,
      messages: raw.messages.map(msg => this.convertMessage(msg)),
      tools: raw.tools?.map(tool => this.convertTool(tool)),
      toolChoice: this.convertToolChoice(raw.tool_choice),
      config: {
        temperature: raw.temperature,
        maxTokens: raw.max_tokens,
        topP: raw.top_p,
        stopSequences: raw.stop,
        responseFormat: raw.response_format?.type === 'json_object' ? 'json' : 'text',
        jsonSchema: raw.response_format?.json_schema?.schema,
      },
    };
  }

  formatResponse(unified: UnifiedResponse): OpenAIChatResponse {
    return {
      id: unified.id,
      object: 'chat.completion',
      created: Date.now() / 1000,
      model: unified.model,
      choices: [{
        index: 0,
        message: this.convertToOpenAIMessage(unified.message),
        finish_reason: this.mapFinishReason(unified.finishReason),
      }],
      usage: unified.usage ? {
        prompt_tokens: unified.usage.inputTokens,
        completion_tokens: unified.usage.outputTokens,
        total_tokens: unified.usage.totalTokens,
      } : undefined,
    };
  }

  formatStreamChunk(chunk: UnifiedStreamChunk): string {
    const data = {
      id: chunk.id,
      object: 'chat.completion.chunk',
      created: Date.now() / 1000,
      model: chunk.model,
      choices: [{
        index: 0,
        delta: this.convertToDelta(chunk.delta),
        finish_reason: chunk.finishReason ? this.mapFinishReason(chunk.finishReason) : null,
      }],
    };
    return `data: ${JSON.stringify(data)}\n\n`;
  }
}
```

#### 2.2 Gemini Adapter

```typescript
// adapters/gemini.ts

class GeminiAdapter implements InboundAdapter {
  readonly protocol = 'gemini';

  parseRequest(raw: GeminiGenerateRequest): UnifiedRequest {
    return {
      model: raw.model || this.extractModelFromUrl(),
      stream: raw.stream ?? false,
      messages: this.convertContents(raw.contents),
      tools: raw.tools?.flatMap(t => t.functionDeclarations?.map(f => ({
        name: f.name,
        description: f.description,
        parameters: f.parameters,
      })) ?? []),
      config: {
        temperature: raw.generationConfig?.temperature,
        maxTokens: raw.generationConfig?.maxOutputTokens,
        topP: raw.generationConfig?.topP,
        topK: raw.generationConfig?.topK,
        stopSequences: raw.generationConfig?.stopSequences,
        responseFormat: raw.generationConfig?.responseMimeType === 'application/json' ? 'json' : 'text',
        jsonSchema: raw.generationConfig?.responseSchema,
      },
    };
  }

  formatResponse(unified: UnifiedResponse): GeminiGenerateResponse {
    return {
      candidates: [{
        content: this.convertToGeminiContent(unified.message),
        finishReason: this.mapFinishReason(unified.finishReason),
      }],
      usageMetadata: unified.usage ? {
        promptTokenCount: unified.usage.inputTokens,
        candidatesTokenCount: unified.usage.outputTokens,
        totalTokenCount: unified.usage.totalTokens,
      } : undefined,
    };
  }
}
```

#### 2.3 Anthropic Adapter

```typescript
// adapters/anthropic.ts

class AnthropicAdapter implements InboundAdapter {
  readonly protocol = 'anthropic';

  parseRequest(raw: AnthropicMessageRequest): UnifiedRequest {
    const messages: UnifiedMessage[] = [];

    // 处理 system prompt
    if (raw.system) {
      messages.push({
        role: 'system',
        parts: [{ type: 'text', content: raw.system }],
      });
    }

    // 转换消息
    for (const msg of raw.messages) {
      messages.push(this.convertMessage(msg));
    }

    return {
      model: raw.model,
      stream: raw.stream ?? false,
      messages,
      tools: raw.tools?.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      })),
      toolChoice: this.convertToolChoice(raw.tool_choice),
      config: {
        temperature: raw.temperature,
        maxTokens: raw.max_tokens,
        topP: raw.top_p,
        topK: raw.top_k,
        stopSequences: raw.stop_sequences,
      },
    };
  }

  formatResponse(unified: UnifiedResponse): AnthropicMessageResponse {
    return {
      id: unified.id,
      type: 'message',
      role: 'assistant',
      content: this.convertToAnthropicContent(unified.message),
      model: unified.model,
      stop_reason: this.mapStopReason(unified.finishReason),
      usage: {
        input_tokens: unified.usage?.inputTokens ?? 0,
        output_tokens: unified.usage?.outputTokens ?? 0,
      },
    };
  }

  formatStreamChunk(chunk: UnifiedStreamChunk): string {
    // Anthropic SSE 格式
    const events: string[] = [];

    if (chunk.delta.parts) {
      for (const part of chunk.delta.parts) {
        if (part.type === 'text') {
          events.push(`event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: part.content }
          })}\n\n`);
        }
      }
    }

    if (chunk.finishReason) {
      events.push(`event: message_stop\ndata: ${JSON.stringify({
        type: 'message_stop'
      })}\n\n`);
    }

    return events.join('');
  }
}
```

---

### 3. Provider 接口 (出口层)

```typescript
// providers/base.ts

/**
 * 出口提供商接口
 * 负责将统一格式发送到目标 API
 */
interface OutboundProvider {
  /** 提供商标识 */
  readonly provider: 'openai' | 'gemini' | 'anthropic' | 'vertex-ai' | 'custom';

  /** 发送请求 */
  send(request: UnifiedRequest, config: ProviderConfig): Promise<UnifiedResponse>;

  /** 流式发送 */
  sendStream(request: UnifiedRequest, config: ProviderConfig): AsyncGenerator<UnifiedStreamChunk>;

  /** 获取模型列表 */
  listModels(config: ProviderConfig): Promise<ModelInfo[]>;

  /** 健康检查 */
  healthCheck(config: ProviderConfig): Promise<boolean>;

  /** Token 计数 */
  countTokens?(request: UnifiedRequest, config: ProviderConfig): Promise<number>;
}

/**
 * 提供商配置
 */
interface ProviderConfig {
  baseUrl?: string;
  apiKey: string;
  timeout?: number;
  proxy?: string;
  headers?: Record<string, string>;
  retries?: number;
}

/**
 * 模型信息
 */
interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities?: string[];
}
```

#### 3.1 Gemini Provider

```typescript
// providers/gemini.ts

class GeminiProvider implements OutboundProvider {
  readonly provider = 'gemini';

  async send(request: UnifiedRequest, config: ProviderConfig): Promise<UnifiedResponse> {
    const geminiRequest = this.convertToGeminiFormat(request);

    const url = this.buildUrl(request.model, config, 'generateContent');
    const response = await this.fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(config),
      body: JSON.stringify(geminiRequest),
    });

    const data = await response.json();
    return this.convertFromGeminiFormat(data);
  }

  async *sendStream(request: UnifiedRequest, config: ProviderConfig): AsyncGenerator<UnifiedStreamChunk> {
    const geminiRequest = this.convertToGeminiFormat(request);

    const url = this.buildUrl(request.model, config, 'streamGenerateContent');
    const response = await this.fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(config),
      body: JSON.stringify(geminiRequest),
    });

    for await (const line of this.parseSSE(response.body)) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        yield this.convertStreamChunk(data);
      }
    }
  }

  async listModels(config: ProviderConfig): Promise<ModelInfo[]> {
    const url = `${config.baseUrl || 'https://generativelanguage.googleapis.com'}/v1beta/models`;
    const response = await this.fetch(url, {
      headers: this.buildHeaders(config),
    });

    const data = await response.json();
    return data.models.map(m => ({
      id: m.name.replace('models/', ''),
      name: m.displayName,
      provider: 'gemini',
      contextWindow: m.inputTokenLimit,
      maxOutputTokens: m.outputTokenLimit,
    }));
  }

  private buildHeaders(config: ProviderConfig): Record<string, string> {
    // 支持两种认证方式
    if (config.apiKey.startsWith('AIza')) {
      // 标准 API Key - 通过 URL 参数传递
      return { 'Content-Type': 'application/json' };
    } else {
      // OAuth2 Token - 通过 Header 传递
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
    }
  }
}
```

#### 3.2 OpenAI Provider

```typescript
// providers/openai.ts

class OpenAIProvider implements OutboundProvider {
  readonly provider = 'openai';

  async send(request: UnifiedRequest, config: ProviderConfig): Promise<UnifiedResponse> {
    const openaiRequest = this.convertToOpenAIFormat(request);

    const url = `${config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...config.headers,
      },
      body: JSON.stringify(openaiRequest),
    });

    const data = await response.json();
    return this.convertFromOpenAIFormat(data);
  }

  async *sendStream(request: UnifiedRequest, config: ProviderConfig): AsyncGenerator<UnifiedStreamChunk> {
    const openaiRequest = this.convertToOpenAIFormat({ ...request, stream: true });

    const url = `${config.baseUrl || 'https://api.openai.com'}/v1/chat/completions`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...config.headers,
      },
      body: JSON.stringify(openaiRequest),
    });

    for await (const line of this.parseSSE(response.body)) {
      if (line === 'data: [DONE]') break;
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        yield this.convertStreamChunk(data);
      }
    }
  }
}
```

#### 3.3 Anthropic Provider

```typescript
// providers/anthropic.ts

class AnthropicProvider implements OutboundProvider {
  readonly provider = 'anthropic';

  async send(request: UnifiedRequest, config: ProviderConfig): Promise<UnifiedResponse> {
    const anthropicRequest = this.convertToAnthropicFormat(request);

    const url = `${config.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        ...config.headers,
      },
      body: JSON.stringify(anthropicRequest),
    });

    const data = await response.json();
    return this.convertFromAnthropicFormat(data);
  }

  async *sendStream(request: UnifiedRequest, config: ProviderConfig): AsyncGenerator<UnifiedStreamChunk> {
    const anthropicRequest = this.convertToAnthropicFormat({ ...request, stream: true });

    const url = `${config.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        ...config.headers,
      },
      body: JSON.stringify(anthropicRequest),
    });

    for await (const event of this.parseAnthropicSSE(response.body)) {
      yield this.convertStreamEvent(event);
    }
  }
}
```

---

### 4. Key Pool Manager (多 Key 轮询)

```typescript
// key-pool/manager.ts

/**
 * Key 配置
 */
interface KeyConfig {
  id: string;
  apiKey: string;
  provider: string;
  weight?: number;              // 权重 (用于加权轮询)
  rateLimit?: number;           // 每分钟请求限制
  quotaLimit?: number;          // 配额限制
  enabled?: boolean;            // 是否启用
  metadata?: Record<string, unknown>;
}

/**
 * Key 状态
 */
interface KeyStatus {
  available: boolean;
  lastUsed?: Date;
  errorCount: number;
  lastError?: string;
  requestCount: number;
  rateLimitResetAt?: Date;
}

/**
 * 获取 Key 选项
 */
interface GetKeyOptions {
  provider?: string;            // 指定提供商
  preferredKeyId?: string;      // 首选 Key
  forceRotate?: boolean;        // 强制轮换
  requestType?: string;         // 请求类型 (agent/image_gen/web_search)
}

/**
 * 负载均衡策略
 */
type LoadBalanceStrategy =
  | 'round-robin'               // 简单轮询
  | 'weighted'                  // 权重轮询
  | 'least-connections'         // 最少连接
  | 'random'                    // 随机
  | 'time-window';              // 时间窗口锁定

/**
 * Key 池管理器
 */
class KeyPoolManager {
  private keys: Map<string, KeyConfig> = new Map();
  private status: Map<string, KeyStatus> = new Map();
  private currentIndex: number = 0;
  private lastUsedKey: { id: string; time: Date } | null = null;

  constructor(private options: {
    strategy: LoadBalanceStrategy;
    timeWindowSeconds?: number;  // 时间窗口 (默认 60秒)
    maxErrorCount?: number;      // 最大错误次数后禁用 (默认 3)
  }) {}

  /**
   * 添加 Key
   */
  addKey(key: KeyConfig): void {
    this.keys.set(key.id, key);
    this.status.set(key.id, {
      available: true,
      errorCount: 0,
      requestCount: 0,
    });
  }

  /**
   * 批量添加 Key
   */
  addKeys(keys: KeyConfig[]): void {
    keys.forEach(key => this.addKey(key));
  }

  /**
   * 移除 Key
   */
  removeKey(keyId: string): void {
    this.keys.delete(keyId);
    this.status.delete(keyId);
  }

  /**
   * 获取下一个可用 Key
   */
  getNextKey(options?: GetKeyOptions): KeyConfig | null {
    const availableKeys = this.getAvailableKeys(options?.provider);
    if (availableKeys.length === 0) return null;

    // 时间窗口锁定策略
    if (this.options.strategy === 'time-window' && !options?.forceRotate) {
      if (this.lastUsedKey) {
        const elapsed = Date.now() - this.lastUsedKey.time.getTime();
        const windowMs = (this.options.timeWindowSeconds ?? 60) * 1000;

        if (elapsed < windowMs) {
          const key = this.keys.get(this.lastUsedKey.id);
          if (key && this.isKeyAvailable(key)) {
            return key;
          }
        }
      }
    }

    // 选择 Key
    let selected: KeyConfig;
    switch (this.options.strategy) {
      case 'weighted':
        selected = this.selectWeighted(availableKeys);
        break;
      case 'random':
        selected = availableKeys[Math.floor(Math.random() * availableKeys.length)];
        break;
      case 'least-connections':
        selected = this.selectLeastConnections(availableKeys);
        break;
      case 'round-robin':
      case 'time-window':
      default:
        this.currentIndex = (this.currentIndex + 1) % availableKeys.length;
        selected = availableKeys[this.currentIndex];
    }

    // 更新状态
    this.lastUsedKey = { id: selected.id, time: new Date() };
    const status = this.status.get(selected.id)!;
    status.lastUsed = new Date();
    status.requestCount++;

    return selected;
  }

  /**
   * 标记 Key 成功
   */
  markSuccess(keyId: string): void {
    const status = this.status.get(keyId);
    if (status) {
      status.errorCount = 0;
      status.available = true;
    }
  }

  /**
   * 标记 Key 失败
   */
  markError(keyId: string, error: string): void {
    const status = this.status.get(keyId);
    if (status) {
      status.errorCount++;
      status.lastError = error;

      // 超过最大错误次数，禁用 Key
      if (status.errorCount >= (this.options.maxErrorCount ?? 3)) {
        status.available = false;
      }
    }
  }

  /**
   * 标记 Key 限流
   */
  markRateLimited(keyId: string, resetAt?: Date): void {
    const status = this.status.get(keyId);
    if (status) {
      status.available = false;
      status.rateLimitResetAt = resetAt ?? new Date(Date.now() + 60000);

      // 设置定时恢复
      setTimeout(() => {
        status.available = true;
        status.rateLimitResetAt = undefined;
      }, (resetAt?.getTime() ?? Date.now() + 60000) - Date.now());
    }
  }

  /**
   * 获取池状态
   */
  getPoolStats(): {
    total: number;
    available: number;
    keys: Array<{ id: string; status: KeyStatus }>;
  } {
    const keys = Array.from(this.keys.entries()).map(([id, key]) => ({
      id,
      status: this.status.get(id)!,
    }));

    return {
      total: this.keys.size,
      available: keys.filter(k => k.status.available).length,
      keys,
    };
  }

  private getAvailableKeys(provider?: string): KeyConfig[] {
    return Array.from(this.keys.values()).filter(key => {
      if (provider && key.provider !== provider) return false;
      return this.isKeyAvailable(key);
    });
  }

  private isKeyAvailable(key: KeyConfig): boolean {
    if (key.enabled === false) return false;
    const status = this.status.get(key.id);
    return status?.available ?? true;
  }

  private selectWeighted(keys: KeyConfig[]): KeyConfig {
    const totalWeight = keys.reduce((sum, k) => sum + (k.weight ?? 1), 0);
    let random = Math.random() * totalWeight;

    for (const key of keys) {
      random -= (key.weight ?? 1);
      if (random <= 0) return key;
    }

    return keys[0];
  }

  private selectLeastConnections(keys: KeyConfig[]): KeyConfig {
    return keys.reduce((min, key) => {
      const minCount = this.status.get(min.id)?.requestCount ?? 0;
      const keyCount = this.status.get(key.id)?.requestCount ?? 0;
      return keyCount < minCount ? key : min;
    });
  }
}
```

---

### 5. Model Mapper (模型映射)

```typescript
// router/model-mapper.ts

/**
 * 映射优先级
 */
enum MappingPriority {
  EXACT = 100,      // 精确匹配
  CUSTOM = 80,      // 自定义映射
  FAMILY = 60,      // 家族映射
  DEFAULT = 40,     // 默认映射
}

/**
 * 解析后的模型信息
 */
interface ResolvedModel {
  provider: string;
  model: string;
  capabilities: string[];
  priority: MappingPriority;
  metadata?: Record<string, unknown>;
}

/**
 * 路由上下文
 */
interface RouteContext {
  requestType?: 'chat' | 'completion' | 'embedding' | 'image';
  hasTools?: boolean;
  hasImages?: boolean;
  preferredProvider?: string;
}

/**
 * 模型映射器
 */
class ModelMapper {
  private exactMappings: Map<string, ResolvedModel> = new Map();
  private familyMappings: Map<string, string[]> = new Map();
  private familyTargets: Map<string, ResolvedModel> = new Map();

  constructor() {
    this.initDefaultMappings();
  }

  /**
   * 解析模型路由
   */
  resolve(modelId: string, context?: RouteContext): ResolvedModel {
    // 1. 精确匹配
    if (this.exactMappings.has(modelId)) {
      return this.exactMappings.get(modelId)!;
    }

    // 2. 家族匹配
    for (const [family, models] of this.familyMappings) {
      if (models.includes(modelId)) {
        const target = this.familyTargets.get(family);
        if (target) return { ...target, priority: MappingPriority.FAMILY };
      }
    }

    // 3. 模式匹配
    const patternMatch = this.matchPattern(modelId);
    if (patternMatch) return patternMatch;

    // 4. 默认：原样返回
    return {
      provider: this.guessProvider(modelId),
      model: modelId,
      capabilities: [],
      priority: MappingPriority.DEFAULT,
    };
  }

  /**
   * 添加精确映射
   */
  addMapping(source: string, target: ResolvedModel): void {
    this.exactMappings.set(source, { ...target, priority: MappingPriority.CUSTOM });
  }

  /**
   * 添加家族映射
   */
  addFamilyMapping(family: string, models: string[], target: ResolvedModel): void {
    this.familyMappings.set(family, models);
    this.familyTargets.set(family, target);
  }

  /**
   * 初始化默认映射
   */
  private initDefaultMappings(): void {
    // OpenAI → Gemini 映射
    const openaiToGemini: Record<string, string> = {
      'gpt-4o': 'gemini-2.5-flash',
      'gpt-4o-mini': 'gemini-2.0-flash',
      'gpt-4': 'gemini-2.5-pro',
      'gpt-4-turbo': 'gemini-2.5-pro',
      'gpt-4-turbo-preview': 'gemini-2.5-pro',
      'gpt-3.5-turbo': 'gemini-2.0-flash',
      'o1': 'gemini-2.5-pro',
      'o1-mini': 'gemini-2.5-flash',
      'o1-preview': 'gemini-2.5-pro',
    };

    for (const [source, target] of Object.entries(openaiToGemini)) {
      this.exactMappings.set(source, {
        provider: 'gemini',
        model: target,
        capabilities: ['chat', 'tools'],
        priority: MappingPriority.DEFAULT,
      });
    }

    // Claude → Gemini 映射
    const claudeToGemini: Record<string, string> = {
      'claude-3-opus-20240229': 'gemini-2.5-pro',
      'claude-3-sonnet-20240229': 'gemini-2.5-flash',
      'claude-3-haiku-20240307': 'gemini-2.0-flash',
      'claude-3-5-sonnet-20241022': 'gemini-2.5-pro',
      'claude-3-5-haiku-20241022': 'gemini-2.5-flash',
    };

    for (const [source, target] of Object.entries(claudeToGemini)) {
      this.exactMappings.set(source, {
        provider: 'gemini',
        model: target,
        capabilities: ['chat', 'tools', 'vision'],
        priority: MappingPriority.DEFAULT,
      });
    }

    // GPT-4 家族
    this.addFamilyMapping('gpt-4-series', [
      'gpt-4', 'gpt-4-0314', 'gpt-4-0613', 'gpt-4-32k', 'gpt-4-32k-0314',
    ], {
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      capabilities: ['chat', 'tools'],
      priority: MappingPriority.FAMILY,
    });

    // Claude 家族
    this.addFamilyMapping('claude-3-series', [
      'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
    ], {
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      capabilities: ['chat', 'tools', 'vision'],
      priority: MappingPriority.FAMILY,
    });
  }

  private matchPattern(modelId: string): ResolvedModel | null {
    const lower = modelId.toLowerCase();

    // GPT 系列
    if (lower.includes('gpt-4')) {
      return {
        provider: 'gemini',
        model: lower.includes('turbo') ? 'gemini-2.5-flash' : 'gemini-2.5-pro',
        capabilities: ['chat', 'tools'],
        priority: MappingPriority.DEFAULT,
      };
    }

    // Claude 系列
    if (lower.includes('claude')) {
      return {
        provider: 'gemini',
        model: lower.includes('opus') ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
        capabilities: ['chat', 'tools', 'vision'],
        priority: MappingPriority.DEFAULT,
      };
    }

    return null;
  }

  private guessProvider(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (lower.includes('gpt') || lower.includes('o1')) return 'openai';
    if (lower.includes('claude')) return 'anthropic';
    if (lower.includes('gemini')) return 'gemini';
    return 'unknown';
  }
}
```

---

### 6. AionRouter 主类

```typescript
// index.ts

/**
 * 路由器配置
 */
interface AionRouterConfig {
  /** 入口适配器 */
  inbound: InboundAdapter;

  /** 出口提供商 */
  outbound: OutboundProvider;

  /** Key 池管理器 (可选) */
  keyPool?: KeyPoolManager;

  /** 模型映射器 (可选) */
  modelMapper?: ModelMapper;

  /** 默认提供商配置 */
  defaultConfig?: ProviderConfig;

  /** 重试配置 */
  retry?: {
    maxRetries: number;
    retryDelay: number;
    retryOn: (error: Error) => boolean;
  };

  /** 日志配置 */
  logger?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    handler: (level: string, message: string, data?: unknown) => void;
  };
}

/**
 * AionRouter 主类
 */
class AionRouter {
  private inbound: InboundAdapter;
  private outbound: OutboundProvider;
  private keyPool?: KeyPoolManager;
  private modelMapper: ModelMapper;
  private config: AionRouterConfig;

  constructor(config: AionRouterConfig) {
    this.config = config;
    this.inbound = config.inbound;
    this.outbound = config.outbound;
    this.keyPool = config.keyPool;
    this.modelMapper = config.modelMapper ?? new ModelMapper();
  }

  /**
   * 处理请求
   */
  async handle(rawRequest: unknown): Promise<unknown> {
    // 1. 验证请求
    const validation = this.inbound.validateRequest(rawRequest);
    if (!validation.valid) {
      return this.inbound.formatError({
        code: 'INVALID_REQUEST',
        message: validation.errors?.join(', ') ?? 'Invalid request',
      });
    }

    // 2. 解析请求
    const unified = this.inbound.parseRequest(rawRequest);

    // 3. 模型路由
    const resolved = this.modelMapper.resolve(unified.model);
    unified.model = resolved.model;

    // 4. 获取 Key
    const key = this.keyPool?.getNextKey({ provider: resolved.provider });
    const providerConfig: ProviderConfig = key
      ? { ...this.config.defaultConfig, apiKey: key.apiKey }
      : this.config.defaultConfig!;

    // 5. 发送请求 (带重试)
    let lastError: Error | null = null;
    const maxRetries = this.config.retry?.maxRetries ?? 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.outbound.send(unified, providerConfig);

        // 标记成功
        if (key) this.keyPool?.markSuccess(key.id);

        // 6. 格式化响应
        return this.inbound.formatResponse(response);

      } catch (error) {
        lastError = error as Error;

        // 标记失败
        if (key) this.keyPool?.markError(key.id, lastError.message);

        // 是否重试
        if (this.config.retry?.retryOn && !this.config.retry.retryOn(lastError)) {
          break;
        }

        // 尝试轮换 Key
        const newKey = this.keyPool?.getNextKey({
          provider: resolved.provider,
          forceRotate: true
        });
        if (newKey) {
          providerConfig.apiKey = newKey.apiKey;
        }

        // 延迟
        if (attempt < maxRetries - 1) {
          await this.delay(this.config.retry?.retryDelay ?? 1000);
        }
      }
    }

    // 返回错误
    return this.inbound.formatError({
      code: 'REQUEST_FAILED',
      message: lastError?.message ?? 'Unknown error',
    });
  }

  /**
   * 处理流式请求
   */
  async *handleStream(rawRequest: unknown): AsyncGenerator<unknown> {
    // 1. 解析请求
    const unified = this.inbound.parseRequest(rawRequest);
    unified.stream = true;

    // 2. 模型路由
    const resolved = this.modelMapper.resolve(unified.model);
    unified.model = resolved.model;

    // 3. 获取 Key
    const key = this.keyPool?.getNextKey({ provider: resolved.provider });
    const providerConfig: ProviderConfig = key
      ? { ...this.config.defaultConfig, apiKey: key.apiKey }
      : this.config.defaultConfig!;

    // 4. 流式发送
    try {
      for await (const chunk of this.outbound.sendStream(unified, providerConfig)) {
        yield this.inbound.formatStreamChunk(chunk);
      }

      if (key) this.keyPool?.markSuccess(key.id);

    } catch (error) {
      if (key) this.keyPool?.markError(key.id, (error as Error).message);
      yield this.inbound.formatError({
        code: 'STREAM_ERROR',
        message: (error as Error).message,
      });
    }
  }

  /**
   * 获取模型列表
   */
  async listModels(): Promise<ModelInfo[]> {
    const key = this.keyPool?.getNextKey();
    const config = key
      ? { ...this.config.defaultConfig, apiKey: key.apiKey }
      : this.config.defaultConfig!;

    return this.outbound.listModels(config);
  }

  /**
   * 添加模型映射
   */
  addModelMapping(source: string, target: ResolvedModel): void {
    this.modelMapper.addMapping(source, target);
  }

  /**
   * 添加 Key
   */
  addKey(key: KeyConfig): void {
    this.keyPool?.addKey(key);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出
export {
  AionRouter,
  OpenAIAdapter,
  GeminiAdapter,
  AnthropicAdapter,
  OpenAIProvider,
  GeminiProvider,
  AnthropicProvider,
  KeyPoolManager,
  ModelMapper,
};
```

---

## 五、目录结构

```
aion-router/
├── src/
│   ├── types/
│   │   ├── unified-message.ts      # 统一消息格式
│   │   ├── request.ts              # 请求类型
│   │   ├── response.ts             # 响应类型
│   │   ├── error.ts                # 错误类型
│   │   └── index.ts
│   │
│   ├── adapters/                   # 入口适配器
│   │   ├── base.ts                 # 基础接口
│   │   ├── openai.ts               # OpenAI 适配器
│   │   ├── gemini.ts               # Gemini 适配器
│   │   ├── anthropic.ts            # Anthropic 适配器
│   │   ├── custom.ts               # 自定义适配器基类
│   │   └── index.ts
│   │
│   ├── providers/                  # 出口提供商
│   │   ├── base.ts                 # 基础接口
│   │   ├── openai.ts               # OpenAI 提供商
│   │   ├── gemini.ts               # Gemini 提供商
│   │   ├── anthropic.ts            # Anthropic 提供商
│   │   ├── vertex-ai.ts            # Vertex AI 提供商
│   │   ├── custom.ts               # 自定义提供商基类
│   │   └── index.ts
│   │
│   ├── router/                     # 路由层
│   │   ├── model-mapper.ts         # 模型映射
│   │   ├── request-router.ts       # 请求路由
│   │   └── index.ts
│   │
│   ├── key-pool/                   # Key 池管理
│   │   ├── manager.ts              # Key 池管理器
│   │   ├── strategies/
│   │   │   ├── round-robin.ts      # 轮询策略
│   │   │   ├── weighted.ts         # 权重策略
│   │   │   ├── time-window.ts      # 时间窗口策略
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── utils/
│   │   ├── retry.ts                # 重试逻辑
│   │   ├── stream.ts               # 流处理
│   │   ├── sse.ts                  # SSE 解析
│   │   ├── validation.ts           # 请求验证
│   │   ├── logger.ts               # 日志
│   │   └── index.ts
│   │
│   └── index.ts                    # 主入口
│
├── tests/
│   ├── adapters/
│   ├── providers/
│   ├── router/
│   ├── key-pool/
│   └── integration/
│
├── examples/
│   ├── basic-usage.ts              # 基础用法
│   ├── multi-key.ts                # 多 Key 轮询
│   ├── model-mapping.ts            # 模型映射
│   ├── streaming.ts                # 流式处理
│   └── express-server.ts           # Express 集成
│
├── package.json
├── tsconfig.json
├── README.md
└── CHANGELOG.md
```

---

## 六、实现优先级

### Phase 1: 核心框架 (2周)

| 任务 | 优先级 | 预计工时 |
|------|-------|---------|
| 统一消息格式定义 | P0 | 2天 |
| Adapter/Provider 接口 | P0 | 1天 |
| OpenAI Adapter (入口) | P0 | 3天 |
| Gemini Provider (出口) | P0 | 3天 |
| 基础测试 | P0 | 2天 |
| 错误处理 | P0 | 1天 |

### Phase 2: 多协议支持 (2周)

| 任务 | 优先级 | 预计工时 |
|------|-------|---------|
| Gemini Adapter (入口) | P1 | 2天 |
| Anthropic Adapter (入口) | P1 | 2天 |
| OpenAI Provider (出口) | P1 | 2天 |
| Anthropic Provider (出口) | P1 | 2天 |
| 协议转换测试 | P1 | 2天 |
| 流式处理统一 | P1 | 2天 |

### Phase 3: 高级功能 (2周)

| 任务 | 优先级 | 预计工时 |
|------|-------|---------|
| Key Pool Manager | P1 | 3天 |
| Model Mapper | P1 | 2天 |
| 重试策略 | P2 | 2天 |
| 流式处理优化 | P2 | 2天 |
| Vertex AI Provider | P2 | 2天 |
| 错误处理优化 | P2 | 1天 |

### Phase 4: 生产就绪 (2周)

| 任务 | 优先级 | 预计工时 |
|------|-------|---------|
| 监控和日志 | P1 | 2天 |
| 性能优化 | P2 | 2天 |
| 文档和示例 | P1 | 3天 |
| aioncli 集成 | P1 | 2天 |
| AionUi 集成 | P1 | 2天 |
| 发布 npm 包 | P1 | 1天 |

---

## 七、使用示例

### 1. 基础用法

```typescript
import { AionRouter, OpenAIAdapter, GeminiProvider } from 'aion-router';

// 创建路由器：接收 OpenAI 格式，转发到 Gemini
const router = new AionRouter({
  inbound: new OpenAIAdapter(),
  outbound: new GeminiProvider(),
  defaultConfig: {
    apiKey: 'your-gemini-api-key',
  },
});

// 处理 OpenAI 格式请求
const response = await router.handle({
  model: 'gpt-4',  // 自动映射到 gemini-2.5-pro
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
});

console.log(response);  // OpenAI 格式响应
```

### 2. 多 Key 轮询

```typescript
import { AionRouter, OpenAIAdapter, GeminiProvider, KeyPoolManager } from 'aion-router';

// 创建 Key 池
const keyPool = new KeyPoolManager({
  strategy: 'time-window',
  timeWindowSeconds: 60,
});

// 添加多个 Key
keyPool.addKeys([
  { id: 'key1', apiKey: 'xxx', provider: 'gemini', weight: 1 },
  { id: 'key2', apiKey: 'yyy', provider: 'gemini', weight: 2 },
  { id: 'key3', apiKey: 'zzz', provider: 'gemini', weight: 1 },
]);

// 创建路由器
const router = new AionRouter({
  inbound: new OpenAIAdapter(),
  outbound: new GeminiProvider(),
  keyPool,
  retry: {
    maxRetries: 3,
    retryDelay: 1000,
    retryOn: (error) => error.message.includes('429'),
  },
});

// 请求会自动轮询 Key
const response = await router.handle(request);
```

### 3. 自定义模型映射

```typescript
const router = new AionRouter({
  inbound: new OpenAIAdapter(),
  outbound: new GeminiProvider(),
  defaultConfig: { apiKey: 'xxx' },
});

// 添加自定义映射
router.addModelMapping('my-custom-model', {
  provider: 'gemini',
  model: 'gemini-2.5-pro',
  capabilities: ['chat', 'tools', 'vision'],
});

// 添加家族映射
router.modelMapper.addFamilyMapping('llama-series', [
  'llama-3-70b', 'llama-3-8b', 'llama-2-70b',
], {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  capabilities: ['chat'],
});
```

### 4. 流式处理

```typescript
const router = new AionRouter({
  inbound: new OpenAIAdapter(),
  outbound: new GeminiProvider(),
  defaultConfig: { apiKey: 'xxx' },
});

// 流式响应
for await (const chunk of router.handleStream({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Write a story' }],
  stream: true,
})) {
  // 每个 chunk 都是 OpenAI 格式
  process.stdout.write(chunk);
}
```

### 5. Express 集成

```typescript
import express from 'express';
import { AionRouter, OpenAIAdapter, GeminiProvider } from 'aion-router';

const app = express();
app.use(express.json());

const router = new AionRouter({
  inbound: new OpenAIAdapter(),
  outbound: new GeminiProvider(),
  defaultConfig: { apiKey: process.env.GEMINI_API_KEY },
});

// OpenAI 兼容端点
app.post('/v1/chat/completions', async (req, res) => {
  if (req.body.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    for await (const chunk of router.handleStream(req.body)) {
      res.write(chunk);
    }
    res.end();
  } else {
    const response = await router.handle(req.body);
    res.json(response);
  }
});

app.listen(3000);
```

---

## 八、与现有项目集成

### 1. aioncli 集成

```typescript
// packages/core/src/core/routerContentGenerator.ts
import { AionRouter, GeminiAdapter, OpenAIProvider } from 'aion-router';

export class RouterContentGenerator implements ContentGenerator {
  private router: AionRouter;

  constructor(config: Config) {
    this.router = new AionRouter({
      inbound: new GeminiAdapter(),  // aioncli 内部使用 Gemini 格式
      outbound: new OpenAIProvider(),
      defaultConfig: {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      },
    });
  }

  async generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse> {
    return this.router.handle(request) as Promise<GenerateContentResponse>;
  }

  async *generateContentStream(request: GenerateContentParameters): AsyncGenerator<GenerateContentResponse> {
    for await (const chunk of this.router.handleStream(request)) {
      yield chunk as GenerateContentResponse;
    }
  }
}
```

### 2. AionUi 集成

```typescript
// src/process/bridge/modelBridge.ts
import { AionRouter, KeyPoolManager } from 'aion-router';

// 创建共享的 Key 池
const keyPool = new KeyPoolManager({
  strategy: 'time-window',
  timeWindowSeconds: 60,
});

// 在 fetchModelList 中使用
const router = new AionRouter({
  inbound: new GeminiAdapter(),
  outbound: new GeminiProvider(),
  keyPool,
});

const models = await router.listModels();
```

### 3. 替代 Antigravity

对于轻量级场景，AionRouter 可以完全替代 Antigravity：

```typescript
// 启动本地代理服务
import express from 'express';
import { AionRouter, OpenAIAdapter, ClaudeAdapter, GeminiProvider, KeyPoolManager } from 'aion-router';

const app = express();

// 配置 Key 池
const keyPool = new KeyPoolManager({ strategy: 'time-window' });
keyPool.addKeys(loadKeysFromConfig());

// OpenAI 兼容端点
const openaiRouter = new AionRouter({
  inbound: new OpenAIAdapter(),
  outbound: new GeminiProvider(),
  keyPool,
});

// Claude 兼容端点
const claudeRouter = new AionRouter({
  inbound: new ClaudeAdapter(),
  outbound: new GeminiProvider(),
  keyPool,
});

app.post('/v1/chat/completions', (req, res) => openaiRouter.handle(req.body).then(r => res.json(r)));
app.post('/v1/messages', (req, res) => claudeRouter.handle(req.body).then(r => res.json(r)));

app.listen(8045);
```

---

## 九、对比现有方案

| 特性 | aioncli | Antigravity | AionRouter |
|------|---------|-------------|------------|
| **语言** | TypeScript | Rust | TypeScript |
| **部署** | 库 | 独立服务 | 库/服务 |
| **协议支持** | OpenAI↔Gemini | OpenAI/Claude→Gemini | 全协议互转 |
| **多 Key** | ❌ | ✅ | ✅ |
| **模型映射** | 有限 | ✅ 三层 | ✅ 三层 |
| **流式** | ✅ | ✅ | ✅ |
| **工具调用** | ✅ | ✅ | ✅ |
| **性能** | 中 | 高 | 中 |
| **可扩展** | 中 | 低 | 高 |
| **学习成本** | 中 | 高 (Rust) | 低 |

**建议**：
- **高性能场景**：继续使用 Antigravity
- **快速开发/集成**：使用 AionRouter
- **两者配合**：Antigravity 作为后端，AionRouter 作为客户端 SDK

---

## 十、后续规划

### v1.0 (MVP)
- [x] 统一消息格式
- [x] OpenAI/Gemini/Anthropic Adapter
- [x] OpenAI/Gemini/Anthropic Provider
- [x] Key Pool Manager
- [x] Model Mapper
- [x] 基础文档

### v1.1
- [ ] Vertex AI Provider
- [ ] Azure OpenAI Provider
- [ ] 请求缓存
- [ ] Token 计数优化

### v1.2
- [ ] 监控面板
- [ ] Prometheus 指标
- [ ] 配额管理
- [ ] 成本追踪

### v2.0
- [ ] Embedding 支持
- [ ] Image Generation 支持
- [ ] 语音支持
- [ ] 插件系统
