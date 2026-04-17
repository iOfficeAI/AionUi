import { bench, describe } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────────────────────

function repeatToSize(base: string, targetBytes: number): string {
  let result = base;
  while (Buffer.byteLength(result, 'utf8') < targetBytes) {
    result += base;
  }
  return result.slice(0, targetBytes);
}

// Mirrors the production implementation in
// src/process/services/database/index.ts (lines 55-83)
function extractSearchPreviewText(rawContent: string): string {
  const collectStrings = (value: unknown, bucket: string[]): void => {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        bucket.push(normalized);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => collectStrings(item, bucket));
      return;
    }

    if (value && typeof value === 'object') {
      Object.values(value).forEach((item) => collectStrings(item, bucket));
    }
  };

  try {
    const parsed: unknown = JSON.parse(rawContent);
    const bucket: string[] = [];
    collectStrings(parsed, bucket);
    const previewText = bucket.join(' ').replace(/\s+/g, ' ').trim();
    return previewText || rawContent;
  } catch {
    return rawContent.replace(/\s+/g, ' ').trim();
  }
}

// ── Realistic test data factories ────────────────────────────────────────────

const MARKDOWN_WITH_CODE = `# Architecture Overview

The main process communicates with the renderer through IPC bridges defined in \`src/preload.ts\`.

\`\`\`typescript
export function createBridge<T>(channel: string): BridgeHandler<T> {
  return {
    send: (data: T) => ipcRenderer.send(channel, data),
    on: (callback: (data: T) => void) => {
      ipcRenderer.on(channel, (_event, data) => callback(data));
    },
  };
}
\`\`\`

## Worker Architecture

Fork workers run in separate Node.js processes:

\`\`\`typescript
const worker = fork(workerPath, [], {
  env: { ...process.env, WORKER_ID: id },
  serialization: 'advanced',
});
\`\`\`

This ensures the main process stays responsive while heavy computation runs in parallel.`;

const TOOL_CALL_RESULT = {
  type: 'tool_result' as const,
  toolCallId: 'call_abc123def456',
  status: 'completed' as const,
  title: 'Read src/process/services/database/index.ts',
  kind: 'read' as const,
  content: [
    {
      type: 'content' as const,
      content: {
        type: 'text' as const,
        text: 'import { Database } from "better-sqlite3";\nimport { migrations } from "./migrations";\n\nexport class AppDatabase {\n  private db: Database;\n  constructor(path: string) {\n    this.db = new Database(path);\n    this.db.pragma("journal_mode = WAL");\n  }\n}',
      },
    },
  ],
  locations: [{ path: 'src/process/services/database/index.ts' }],
};

function makeTextBlock(text: string) {
  return { type: 'text' as const, text };
}

function makeImageBlock() {
  return {
    type: 'image' as const,
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/png',
  };
}

function makeToolResultBlock(index: number) {
  return {
    ...TOOL_CALL_RESULT,
    toolCallId: `call_${index}_${Date.now()}`,
    content: [
      {
        type: 'content' as const,
        content: {
          type: 'text' as const,
          text: `File content block ${index}: export const value = ${index};\n`.repeat(20),
        },
      },
    ],
  };
}

function buildMessageContent(sizeLabel: '10KB' | '100KB') {
  const blocks: unknown[] = [
    makeTextBlock(MARKDOWN_WITH_CODE),
    makeImageBlock(),
    makeToolResultBlock(1),
    makeTextBlock('The function above handles database initialization with WAL mode enabled.'),
    makeToolResultBlock(2),
  ];

  const base = JSON.stringify(blocks);
  const target = sizeLabel === '10KB' ? 10_240 : 102_400;

  if (Buffer.byteLength(base, 'utf8') >= target) {
    return base;
  }

  // Pad with additional tool result blocks until we reach target size
  while (Buffer.byteLength(JSON.stringify(blocks), 'utf8') < target) {
    blocks.push(makeToolResultBlock(blocks.length));
    blocks.push(makeTextBlock(repeatToSize(MARKDOWN_WITH_CODE, 2048)));
  }
  return JSON.stringify(blocks);
}

const MESSAGE_CONTENT_10KB = buildMessageContent('10KB');
const MESSAGE_CONTENT_100KB = buildMessageContent('100KB');

// Typical conversation extra for a Gemini conversation
const TYPICAL_EXTRA = {
  workspace: '/Users/dev/project/my-app',
  customWorkspace: true,
  webSearchEngine: 'google' as const,
  lastTokenUsage: { totalTokens: 45_230 },
  contextFileName: 'AGENTS.md',
  contextContent: MARKDOWN_WITH_CODE.slice(0, 500),
  presetRules: 'You are a helpful coding assistant. Follow project conventions strictly.',
  enabledSkills: ['architecture', 'testing', 'i18n'],
  loadedSkills: [
    { name: 'architecture', description: 'Project architecture conventions' },
    { name: 'testing', description: 'Testing workflow and quality standards' },
    { name: 'i18n', description: 'Internationalization workflow' },
  ],
  presetAssistantId: 'gemini-default',
  pinned: false,
  sessionMode: 'code',
};

// Large extra: ACP conversation with many cached config options
const LARGE_EXTRA = {
  workspace: '/Users/dev/project/monorepo',
  backend: 'claude' as const,
  cliPath: '/usr/local/bin/claude',
  customWorkspace: true,
  agentName: 'Claude Code',
  customAgentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  presetContext: repeatToSize('System prompt for the coding agent. ', 4096),
  enabledSkills: Array.from({ length: 15 }, (_, i) => `skill-${i}`),
  excludeBuiltinSkills: ['deprecated-skill'],
  loadedSkills: Array.from({ length: 15 }, (_, i) => ({
    name: `skill-${i}`,
    description: `Description for skill ${i} that explains what it does in detail`,
  })),
  presetAssistantId: 'claude-code-main',
  pinned: true,
  pinnedAt: Date.now(),
  acpSessionId: 'sess_abc123',
  acpSessionConversationId: 'conv_xyz789',
  acpSessionUpdatedAt: Date.now(),
  lastTokenUsage: { totalTokens: 128_000 },
  lastContextLimit: 200_000,
  sessionMode: 'agent',
  currentModelId: 'claude-sonnet-4-20250514',
  cachedConfigOptions: Array.from({ length: 8 }, (_, i) => ({
    id: `option-${i}`,
    name: `Config Option ${i}`,
    description: `Controls behavior setting #${i}`,
    category: i % 2 === 0 ? 'general' : 'advanced',
    type: 'select' as const,
    currentValue: `value-${i}-default`,
    options: Array.from({ length: 5 }, (_, j) => ({
      value: `value-${i}-${j}`,
      name: `Option ${i} Choice ${j}`,
    })),
  })),
  pendingConfigOptions: { 'option-0': 'value-0-2', 'option-3': 'value-3-1' },
};

// Small config object (user settings)
const SMALL_CONFIG = {
  language: 'en-US',
  theme: 'dark',
  colorScheme: 'blue',
  customCss: '',
  'system.closeToTray': true,
  'system.notificationEnabled': true,
  'system.keepAwake': false,
  'ui.zoomFactor': 1.0,
  'gemini.defaultModel': 'gemini-2.5-pro',
  'guid.lastSelectedAgent': 'gemini',
};

// Large config: assistant rules array with many entries
const LARGE_CONFIG = {
  assistants: Array.from({ length: 30 }, (_, i) => ({
    id: `assistant-${i}`,
    name: `Assistant ${i}`,
    description: `A specialized assistant for task category ${i}`,
    cliCommand: i % 3 === 0 ? 'claude' : i % 3 === 1 ? 'goose' : 'qwen',
    authRequired: i % 2 === 0,
    enabled: true,
    supportsStreaming: i % 4 === 0,
    isPreset: true,
    context: repeatToSize(`Rules for assistant ${i}. `, 512),
    prompts: Array.from({ length: 4 }, (_, j) => `Example prompt ${j} for assistant ${i}`),
    enabledSkills: Array.from({ length: 5 }, (_, j) => `skill-${j}`),
    models: [`model-${i}-a`, `model-${i}-b`, `model-${i}-c`],
  })),
  'mcp.config': Array.from({ length: 10 }, (_, i) => ({
    id: `mcp-server-${i}`,
    name: `MCP Server ${i}`,
    enabled: true,
    transport: {
      type: 'stdio' as const,
      command: 'npx',
      args: [`@mcp/server-${i}`, '--port', `${3000 + i}`],
      env: { API_KEY: `sk-test-${i}` },
    },
    tools: Array.from({ length: 8 }, (_, j) => ({
      name: `tool_${i}_${j}`,
      description: `Tool ${j} from MCP server ${i}`,
    })),
    status: 'connected' as const,
    createdAt: Date.now() - 86400000 * i,
    updatedAt: Date.now(),
    originalJson: '{}',
  })),
};

// Deep message object for clone benchmarks
const MESSAGE_OBJECT = {
  id: 'msg_001',
  conversationId: 'conv_abc',
  role: 'assistant' as const,
  content: JSON.parse(MESSAGE_CONTENT_10KB) as unknown[],
  createdAt: Date.now(),
  metadata: {
    model: 'gemini-2.5-pro',
    tokenUsage: { inputTokens: 12000, outputTokens: 3500, totalTokens: 15500 },
    toolCalls: [
      { id: 'tc_1', name: 'read_file', status: 'completed' },
      { id: 'tc_2', name: 'write_file', status: 'completed' },
      { id: 'tc_3', name: 'run_command', status: 'failed' },
    ],
    duration: 4523,
  },
  extra: { ...TYPICAL_EXTRA },
};

// Pre-stringify for benchmarks that need the serialized form
const TYPICAL_EXTRA_JSON = JSON.stringify(TYPICAL_EXTRA);
const LARGE_EXTRA_JSON = JSON.stringify(LARGE_EXTRA);
const SMALL_CONFIG_JSON = JSON.stringify(SMALL_CONFIG);
const LARGE_CONFIG_JSON = JSON.stringify(LARGE_CONFIG);
const _MESSAGE_OBJECT_JSON = JSON.stringify(MESSAGE_OBJECT);

// ── 1. Message content parsing ───────────────────────────────────────────────

describe('Message content parsing', () => {
  bench('parse 10KB message content (nested JSON with code blocks + tool calls)', () => {
    JSON.parse(MESSAGE_CONTENT_10KB);
  });

  bench('parse 100KB message content (nested JSON with code blocks + tool calls)', () => {
    JSON.parse(MESSAGE_CONTENT_100KB);
  });

  bench('stringify 10KB message content', () => {
    JSON.stringify(JSON.parse(MESSAGE_CONTENT_10KB));
  });

  bench('stringify 100KB message content', () => {
    JSON.stringify(JSON.parse(MESSAGE_CONTENT_100KB));
  });
});

// ── 2. Conversation extra field ──────────────────────────────────────────────

describe('Conversation extra field serialization', () => {
  bench('stringify typical Gemini extra', () => {
    JSON.stringify(TYPICAL_EXTRA);
  });

  bench('parse typical Gemini extra', () => {
    JSON.parse(TYPICAL_EXTRA_JSON);
  });

  bench('roundtrip typical Gemini extra', () => {
    JSON.parse(JSON.stringify(TYPICAL_EXTRA));
  });

  bench('stringify large ACP extra (skills + config options + session state)', () => {
    JSON.stringify(LARGE_EXTRA);
  });

  bench('parse large ACP extra', () => {
    JSON.parse(LARGE_EXTRA_JSON);
  });

  bench('roundtrip large ACP extra', () => {
    JSON.parse(JSON.stringify(LARGE_EXTRA));
  });
});

// ── 3. Config storage serialization ──────────────────────────────────────────

describe('Config storage serialization', () => {
  bench('stringify small settings object', () => {
    JSON.stringify(SMALL_CONFIG);
  });

  bench('parse small settings object', () => {
    JSON.parse(SMALL_CONFIG_JSON);
  });

  bench('stringify large config (30 assistants + 10 MCP servers)', () => {
    JSON.stringify(LARGE_CONFIG);
  });

  bench('parse large config (30 assistants + 10 MCP servers)', () => {
    JSON.parse(LARGE_CONFIG_JSON);
  });

  bench('roundtrip small settings', () => {
    JSON.parse(JSON.stringify(SMALL_CONFIG));
  });

  bench('roundtrip large config', () => {
    JSON.parse(JSON.stringify(LARGE_CONFIG));
  });
});

// ── 4. structuredClone vs JSON roundtrip ─────────────────────────────────────

describe('Deep copy: structuredClone vs JSON roundtrip', () => {
  bench('structuredClone — message object', () => {
    structuredClone(MESSAGE_OBJECT);
  });

  bench('JSON roundtrip — message object', () => {
    JSON.parse(JSON.stringify(MESSAGE_OBJECT)) as typeof MESSAGE_OBJECT;
  });

  bench('structuredClone — large ACP extra', () => {
    structuredClone(LARGE_EXTRA);
  });

  bench('JSON roundtrip — large ACP extra', () => {
    JSON.parse(JSON.stringify(LARGE_EXTRA)) as typeof LARGE_EXTRA;
  });

  bench('structuredClone — large config', () => {
    structuredClone(LARGE_CONFIG);
  });

  bench('JSON roundtrip — large config', () => {
    JSON.parse(JSON.stringify(LARGE_CONFIG)) as typeof LARGE_CONFIG;
  });
});

// ── 5. Search preview extraction ─────────────────────────────────────────────

describe('extractSearchPreviewText', () => {
  const simpleTextContent = JSON.stringify([makeTextBlock('Hello, how can I help you today?')]);

  const multiBlockContent = JSON.stringify([
    makeTextBlock(MARKDOWN_WITH_CODE),
    makeToolResultBlock(1),
    makeTextBlock('Summary of changes applied.'),
    makeToolResultBlock(2),
    makeImageBlock(),
  ]);

  const deeplyNestedContent = JSON.stringify([
    makeTextBlock('Top-level text'),
    {
      type: 'tool_result',
      content: [
        {
          type: 'content',
          content: {
            type: 'text',
            text: 'Nested level 1',
            metadata: {
              inner: {
                deep: 'Nested level 3 value',
                items: ['array-item-1', 'array-item-2', 'array-item-3'],
              },
            },
          },
        },
      ],
    },
  ]);

  const plainTextFallback = 'This is plain text, not JSON — triggers the catch branch';

  bench('simple text block (small JSON)', () => {
    extractSearchPreviewText(simpleTextContent);
  });

  bench('multi-block with code + tool results', () => {
    extractSearchPreviewText(multiBlockContent);
  });

  bench('deeply nested content', () => {
    extractSearchPreviewText(deeplyNestedContent);
  });

  bench('10KB message content', () => {
    extractSearchPreviewText(MESSAGE_CONTENT_10KB);
  });

  bench('100KB message content', () => {
    extractSearchPreviewText(MESSAGE_CONTENT_100KB);
  });

  bench('plain text fallback (invalid JSON)', () => {
    extractSearchPreviewText(plainTextFallback);
  });
});
