/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export function buildOpenApiSpec(): Record<string, any> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'AionUi HTTP API',
      version: '1.0.0',
      description:
        'AionUi conversation API documentation with interactive request testing. Set `Authorization: Bearer <api_token>` in Swagger Authorize.',
    },
    servers: [
      {
        url: '/',
        description: 'Current AionUi server',
      },
    ],
    tags: [
      { name: 'Conversation API', description: 'Create and manage AI conversations' },
      { name: 'Testing', description: 'Simulation endpoints for integration testing' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Token',
          description: 'API token generated in Settings > API',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Invalid API token' },
          },
          required: ['success', 'error'],
        },
        ConversationCreateRequest: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['gemini', 'acp', 'codex', 'openclaw-gateway', 'nanobot'],
              example: 'gemini',
              description: 'Conversation type. Preferred over `cli`.',
            },
            cli: {
              type: 'string',
              example: 'claude',
              description:
                'Alias for `type`/ACP backend. Supports conversation types or ACP backend names (e.g. claude, qwen, codex).',
            },
            model: {
              type: 'object',
              description:
                'Model object used by AionUi. Required for gemini conversations; optional for ACP/CLI-based conversations.',
              additionalProperties: true,
              example: {
                id: 'default-provider',
                platform: 'openai',
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                apiKey: '***',
                useModel: 'gpt-4o-mini',
              },
            },
            workspace: {
              type: 'string',
              example: 'E:/code/project',
              description: 'Optional. When omitted, AionUi uses its default workspace behavior.',
            },
            backend: {
              type: 'string',
              example: 'claude',
              description: 'ACP backend. Required when type/cli resolves to `acp`.',
            },
            mode: {
              type: 'string',
              example: 'default',
              description: 'Session mode alias. Mapped to sessionMode in conversation extra.',
            },
            sessionMode: {
              type: 'string',
              example: 'default',
              description: 'Alternative name of `mode`.',
            },
            cliPath: {
              type: 'string',
              example: 'npx @qwen-code/qwen-code',
              description: 'Optional custom CLI command/path.',
            },
            currentModelId: {
              type: 'string',
              example: 'claude-sonnet-4',
              description: 'Pre-selected ACP model ID.',
            },
            configOptionValues: {
              type: 'object',
              description: 'Optional ACP config options such as Codex reasoning effort.',
              additionalProperties: {
                type: 'string',
              },
              example: {
                reasoning_effort: 'high',
              },
            },
            codexModel: {
              type: 'string',
              example: 'gpt-5-codex',
              description: 'Pre-selected Codex model ID.',
            },
            agentName: {
              type: 'string',
              example: 'Claude Code',
              description: 'Optional agent display name.',
            },
            customAgentId: {
              type: 'string',
              example: 'b9f0d7a1-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
              description: 'Custom agent UUID when backend is `custom`.',
            },
            message: { type: 'string', example: 'Hello, introduce yourself.' },
            waitForDispatch: {
              type: 'boolean',
              default: false,
              description: 'When true, wait until first message dispatch completes before returning.',
            },
          },
          required: ['message'],
        },
        ConversationCreateResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            sessionId: { type: 'string', example: 'conv_1741000000000' },
            status: { type: 'string', example: 'running' },
          },
          required: ['success', 'sessionId', 'status'],
        },
        ConversationMessageRequest: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Continue from previous answer.' },
            waitForDispatch: {
              type: 'boolean',
              default: false,
              description: 'When true, wait until message dispatch completes before returning.',
            },
          },
          required: ['message'],
        },
        ConversationStatusResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            sessionId: { type: 'string', example: 'conv_1741000000000' },
            status: {
              type: 'string',
              enum: ['pending', 'running', 'finished'],
              example: 'running',
              description: 'Legacy high-level status for backward compatibility',
            },
            state: {
              type: 'string',
              enum: [
                'ai_generating',
                'ai_waiting_input',
                'ai_waiting_confirmation',
                'initializing',
                'stopped',
                'error',
                'unknown',
              ],
              example: 'ai_generating',
              description: 'Detailed runtime state',
            },
            category: {
              type: 'string',
              enum: ['generating', 'waiting', 'stopped', 'error', 'unknown'],
              example: 'generating',
              description: 'Normalized state bucket shared by the single-status and list endpoints.',
            },
            detail: { type: 'string', example: 'AI is generating response' },
            canSendMessage: { type: 'boolean', example: false },
            isWorking: {
              type: 'boolean',
              example: true,
              description:
                'Whether the model is still actively working, excluding waiting-for-confirmation and idle states.',
            },
            runtime: {
              type: 'object',
              description: 'Debug/runtime details used for state derivation',
              additionalProperties: true,
            },
            lastMessage: {
              type: 'object',
              nullable: true,
              additionalProperties: true,
            },
          },
          required: ['success', 'sessionId', 'status'],
        },
        ConversationStatusListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            total: { type: 'integer', example: 2 },
            filters: {
              type: 'object',
              additionalProperties: true,
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sessionId: { type: 'string', example: 'conv_1741000000000' },
                  conversationId: { type: 'string', example: 'conv_1741000000000' },
                  name: { type: 'string', example: 'Daily coding session' },
                  type: { type: 'string', example: 'codex' },
                  cli: {
                    type: 'string',
                    example: 'qwen',
                    description: 'ACP backend/CLI type when the conversation type is `acp`.',
                  },
                  source: { type: 'string', example: 'api' },
                  status: {
                    type: 'string',
                    enum: ['pending', 'running', 'finished'],
                    example: 'running',
                  },
                  state: {
                    type: 'string',
                    enum: [
                      'ai_generating',
                      'ai_waiting_input',
                      'ai_waiting_confirmation',
                      'initializing',
                      'stopped',
                      'error',
                      'unknown',
                    ],
                    example: 'ai_generating',
                  },
                  category: {
                    type: 'string',
                    enum: ['generating', 'waiting', 'stopped', 'error', 'unknown'],
                    example: 'generating',
                  },
                  detail: { type: 'string', example: 'AI is generating response' },
                  canSendMessage: { type: 'boolean', example: false },
                  isWorking: {
                    type: 'boolean',
                    example: true,
                  },
                  runtime: {
                    type: 'object',
                    additionalProperties: true,
                  },
                  lastMessage: {
                    type: 'object',
                    nullable: true,
                    additionalProperties: true,
                  },
                  updatedAt: { type: 'integer', example: 1741000001000 },
                  createdAt: { type: 'integer', example: 1741000000000 },
                },
                required: [
                  'sessionId',
                  'conversationId',
                  'type',
                  'status',
                  'state',
                  'category',
                  'detail',
                  'canSendMessage',
                  'isWorking',
                  'runtime',
                ],
              },
            },
          },
          required: ['success', 'total', 'items'],
        },
        ConversationMessagesResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            messages: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            total: { type: 'integer', example: 12 },
            page: { type: 'integer', example: 0 },
            pageSize: { type: 'integer', example: 50 },
            hasMore: { type: 'boolean', example: false },
          },
          required: ['success', 'messages', 'total', 'page', 'pageSize', 'hasMore'],
        },
        ConversationTokenUsageRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'token_usage_conv_001_1_1741000000000' },
            conversationId: { type: 'string', example: 'conv_1741000000000' },
            backend: { type: 'string', example: 'claude' },
            replyIndex: { type: 'integer', example: 1 },
            assistantMessageId: { type: 'string', nullable: true, example: 'msg_assistant_001' },
            inputTokens: { type: 'integer', example: 1200 },
            outputTokens: { type: 'integer', example: 320 },
            cachedReadTokens: { type: 'integer', example: 0 },
            cachedWriteTokens: { type: 'integer', example: 0 },
            thoughtTokens: { type: 'integer', example: 64 },
            totalTokens: { type: 'integer', example: 1520 },
            contextUsed: { type: 'integer', nullable: true, example: 8420 },
            contextSize: { type: 'integer', nullable: true, example: 200000 },
            sessionCostAmount: { type: 'number', nullable: true, example: 0.12 },
            sessionCostCurrency: { type: 'string', nullable: true, example: 'USD' },
            createdAt: { type: 'integer', example: 1741000001000 },
            updatedAt: { type: 'integer', example: 1741000001000 },
          },
          required: [
            'id',
            'conversationId',
            'backend',
            'replyIndex',
            'inputTokens',
            'outputTokens',
            'cachedReadTokens',
            'cachedWriteTokens',
            'thoughtTokens',
            'totalTokens',
            'createdAt',
            'updatedAt',
          ],
        },
        ConversationTokenUsageSummary: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', example: 'conv_1741000000000' },
            backend: { type: 'string', nullable: true, example: 'claude' },
            replyCount: { type: 'integer', example: 3 },
            totalInputTokens: { type: 'integer', example: 5400 },
            totalOutputTokens: { type: 'integer', example: 960 },
            totalCachedReadTokens: { type: 'integer', example: 0 },
            totalCachedWriteTokens: { type: 'integer', example: 0 },
            totalThoughtTokens: { type: 'integer', example: 128 },
            totalTokens: { type: 'integer', example: 6360 },
            latestContextUsed: { type: 'integer', nullable: true, example: 12400 },
            latestContextSize: { type: 'integer', nullable: true, example: 200000 },
            latestSessionCostAmount: { type: 'number', nullable: true, example: 0.34 },
            latestSessionCostCurrency: { type: 'string', nullable: true, example: 'USD' },
            lastReplyIndex: { type: 'integer', nullable: true, example: 3 },
            firstRecordedAt: { type: 'integer', nullable: true, example: 1741000001000 },
            lastRecordedAt: { type: 'integer', nullable: true, example: 1741000003000 },
          },
          required: [
            'conversationId',
            'replyCount',
            'totalInputTokens',
            'totalOutputTokens',
            'totalCachedReadTokens',
            'totalCachedWriteTokens',
            'totalThoughtTokens',
            'totalTokens',
          ],
        },
        ConversationTokenUsageRange: {
          type: 'object',
          properties: {
            startTime: { type: 'integer', nullable: true, example: 1741000000000 },
            endTime: { type: 'integer', nullable: true, example: 1741086399999 },
          },
        },
        ConversationUsageMonitorSummary: {
          type: 'object',
          properties: {
            conversationCount: { type: 'integer', example: 12 },
            replyCount: { type: 'integer', example: 38 },
            totalInputTokens: { type: 'integer', example: 54000 },
            totalOutputTokens: { type: 'integer', example: 12800 },
            totalCachedReadTokens: { type: 'integer', example: 2400 },
            totalCachedWriteTokens: { type: 'integer', example: 0 },
            totalThoughtTokens: { type: 'integer', example: 900 },
            totalTokens: { type: 'integer', example: 69700 },
            firstRecordedAt: { type: 'integer', nullable: true, example: 1741000001000 },
            lastRecordedAt: { type: 'integer', nullable: true, example: 1741086399000 },
          },
          required: [
            'conversationCount',
            'replyCount',
            'totalInputTokens',
            'totalOutputTokens',
            'totalCachedReadTokens',
            'totalCachedWriteTokens',
            'totalThoughtTokens',
            'totalTokens',
          ],
        },
        ConversationUsageMonitorGroup: {
          type: 'object',
          properties: {
            agent: { type: 'string', nullable: true, example: 'acp' },
            backend: { type: 'string', nullable: true, example: 'claude' },
            summary: { $ref: '#/components/schemas/ConversationUsageMonitorSummary' },
          },
          required: ['summary'],
        },
        ConversationUsageResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            sessionId: { type: 'string', example: 'conv_1741000000000' },
            conversationType: { type: 'string', example: 'acp' },
            backend: { type: 'string', nullable: true, example: 'claude' },
            range: { $ref: '#/components/schemas/ConversationTokenUsageRange' },
            summary: { $ref: '#/components/schemas/ConversationTokenUsageSummary' },
            replies: {
              type: 'array',
              items: { $ref: '#/components/schemas/ConversationTokenUsageRecord' },
            },
            total: { type: 'integer', example: 3 },
            page: { type: 'integer', example: 0 },
            pageSize: { type: 'integer', example: 50 },
            hasMore: { type: 'boolean', example: false },
          },
          required: [
            'success',
            'sessionId',
            'conversationType',
            'range',
            'summary',
            'replies',
            'total',
            'page',
            'pageSize',
            'hasMore',
          ],
        },
        ConversationUsageSummaryListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            range: { $ref: '#/components/schemas/ConversationTokenUsageRange' },
            total: { type: 'integer', example: 2 },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sessionId: { type: 'string', example: 'conv_1741000000000' },
                  conversationType: { type: 'string', example: 'acp' },
                  backend: { type: 'string', nullable: true, example: 'claude' },
                  summary: { $ref: '#/components/schemas/ConversationTokenUsageSummary' },
                },
                required: ['sessionId', 'conversationType', 'summary'],
              },
            },
            notFoundSessionIds: {
              type: 'array',
              items: { type: 'string' },
              example: ['conv_missing_001'],
            },
          },
          required: ['success', 'range', 'total', 'items', 'notFoundSessionIds'],
        },
        ConversationUsageMonitorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            range: { $ref: '#/components/schemas/ConversationTokenUsageRange' },
            summary: { $ref: '#/components/schemas/ConversationUsageMonitorSummary' },
            groups: {
              type: 'object',
              properties: {
                byAgent: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ConversationUsageMonitorGroup' },
                },
                byBackend: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ConversationUsageMonitorGroup' },
                },
                byAgentBackend: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ConversationUsageMonitorGroup' },
                },
              },
              required: ['byAgent', 'byBackend', 'byAgentBackend'],
            },
          },
          required: ['success', 'range', 'summary', 'groups'],
        },
        SimulationRequest: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'message', 'status', 'stop', 'messages'],
              example: 'create',
            },
            sessionId: {
              type: 'string',
              example: 'conv_example_001',
              description: 'Used by message/status/stop/messages simulations',
            },
            payload: {
              type: 'object',
              additionalProperties: true,
              description: 'Optional request payload override for simulation',
            },
          },
          required: ['action'],
        },
      },
    },
    paths: {
      '/api/v1/conversation/create': {
        post: {
          tags: ['Conversation API'],
          summary: 'Create conversation and send first message',
          description: 'Requires `model`, `message`, and one of `type` or `cli`.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConversationCreateRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Conversation created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ConversationCreateResponse' },
                },
              },
            },
            400: {
              description: 'Bad request',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
            401: {
              description: 'Unauthorized',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/v1/conversation/status': {
        get: {
          tags: ['Conversation API'],
          summary: 'Get conversation status',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'sessionId',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Status result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ConversationStatusResponse' },
                },
              },
            },
            404: {
              description: 'Conversation not found',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/v1/conversation/status/list': {
        get: {
          tags: ['Conversation API'],
          summary: 'List conversations by runtime status filters',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'scope',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['generating', 'waiting', 'stopped', 'error', 'active', 'all'] },
              description:
                'Filter preset. `generating` returns sessions actively working; `waiting` returns sessions waiting for input or confirmation; `stopped` returns explicitly stopped sessions; `error` returns sessions whose last response ended in error; `active` returns sessions whose CLI/runtime task is still attached, even when they are idle and waiting for the next message; `all` disables preset filtering. When `status` or `state` is provided without `scope`, the API uses `all` so explicit status filters are not pre-filtered away.',
            },
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: { type: 'string', example: 'running,pending' },
              description: 'Comma-separated conversation statuses.',
            },
            {
              name: 'state',
              in: 'query',
              required: false,
              schema: { type: 'string', example: 'ai_generating,ai_waiting_confirmation' },
              description: 'Comma-separated runtime states.',
            },
            {
              name: 'type',
              in: 'query',
              required: false,
              schema: { type: 'string', example: 'gemini,codex' },
              description: 'Comma-separated conversation types.',
            },
            {
              name: 'cli',
              in: 'query',
              required: false,
              schema: { type: 'string', example: 'qwen,codex' },
              description: 'Comma-separated ACP backend/CLI types.',
            },
            {
              name: 'source',
              in: 'query',
              required: false,
              schema: { type: 'string', example: 'api,aionui' },
              description: 'Comma-separated conversation sources.',
            },
            {
              name: 'canSendMessage',
              in: 'query',
              required: false,
              schema: { type: 'boolean' },
              description: 'Filter by whether the conversation currently accepts a new message.',
            },
          ],
          responses: {
            200: {
              description: 'Conversation status list',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ConversationStatusListResponse' },
                },
              },
            },
            401: {
              description: 'Unauthorized',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/v1/conversation/stop': {
        post: {
          tags: ['Conversation API'],
          summary: 'Stop ongoing generation',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'sessionId',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Stopped',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      sessionId: { type: 'string' },
                      status: { type: 'string', example: 'finished' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/conversation/message': {
        post: {
          tags: ['Conversation API'],
          summary: 'Send a follow-up message',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'sessionId',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConversationMessageRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Accepted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      sessionId: { type: 'string' },
                      status: { type: 'string', example: 'running' },
                    },
                  },
                },
              },
            },
            409: {
              description: 'AI busy',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/v1/conversation/messages': {
        get: {
          tags: ['Conversation API'],
          summary: 'Get conversation message history',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'sessionId',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 0 },
            },
            {
              name: 'pageSize',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 50, maximum: 100 },
            },
          ],
          responses: {
            200: {
              description: 'Message list',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ConversationMessagesResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/conversation/usage': {
        get: {
          tags: ['Conversation API'],
          summary: 'Get conversation token usage summary and per-reply records',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'sessionId',
              in: 'query',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 0 },
            },
            {
              name: 'pageSize',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 50, maximum: 100 },
            },
            {
              name: 'startTime',
              in: 'query',
              required: false,
              schema: { type: 'integer', example: 1741000000000 },
              description: 'Optional millisecond timestamp. Filters usage records created at or after this time.',
            },
            {
              name: 'endTime',
              in: 'query',
              required: false,
              schema: { type: 'integer', example: 1741086399999 },
              description: 'Optional millisecond timestamp. Filters usage records created at or before this time.',
            },
          ],
          responses: {
            200: {
              description: 'Structured token usage result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ConversationUsageResponse' },
                },
              },
            },
            404: {
              description: 'Conversation not found',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/v1/conversation/usage/list': {
        get: {
          tags: ['Conversation API'],
          summary: 'Get token usage summaries for multiple conversations',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'sessionIds',
              in: 'query',
              required: true,
              schema: { type: 'string', example: 'conv_1,conv_2,conv_3' },
              description: 'Comma-separated conversation session IDs.',
            },
            {
              name: 'startTime',
              in: 'query',
              required: false,
              schema: { type: 'integer', example: 1741000000000 },
              description: 'Optional millisecond timestamp. Filters usage records created at or after this time.',
            },
            {
              name: 'endTime',
              in: 'query',
              required: false,
              schema: { type: 'integer', example: 1741086399999 },
              description: 'Optional millisecond timestamp. Filters usage records created at or before this time.',
            },
          ],
          responses: {
            200: {
              description: 'Batch token usage summaries',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ConversationUsageSummaryListResponse' },
                },
              },
            },
            400: {
              description: 'Bad request',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/v1/conversation/usage/monitor': {
        get: {
          tags: ['Conversation API'],
          summary: 'Get usage monitoring aggregates grouped by agent and backend',
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: 'startTime',
              in: 'query',
              required: false,
              schema: { type: 'integer', example: 1741000000000 },
              description: 'Optional millisecond timestamp. Includes usage records created at or after this time.',
            },
            {
              name: 'endTime',
              in: 'query',
              required: false,
              schema: { type: 'integer', example: 1741086399999 },
              description: 'Optional millisecond timestamp. Includes usage records created at or before this time.',
            },
          ],
          responses: {
            200: {
              description: 'Usage monitoring aggregates',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ConversationUsageMonitorResponse' },
                },
              },
            },
            400: {
              description: 'Bad request',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
            },
          },
        },
      },
      '/api/v1/conversation/simulate': {
        post: {
          tags: ['Testing'],
          summary: 'Simulate API request (no model execution)',
          description:
            'Returns sample method/path/body/response and a ready-to-run curl command. This endpoint does not create or execute a real conversation.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SimulationRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Simulation result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      simulation: {
                        type: 'object',
                        additionalProperties: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
