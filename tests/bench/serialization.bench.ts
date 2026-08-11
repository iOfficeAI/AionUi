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

// ── Search preview extraction ────────────────────────────────────────────────

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
