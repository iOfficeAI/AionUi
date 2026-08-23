import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';
import { getAcpImagePath } from './acpToolCallOutput';
import { categorizeToolName, mapAcpKindToCategory, type ToolCategory } from './toolBlockConstants';

export type UnifiedToolStatus = 'pending' | 'running' | 'completed' | 'error' | 'canceled';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/** Normalized, render-ready representation of ONE tool call, from any agent family. */
export interface UnifiedToolBlock {
  key: string;
  category: ToolCategory;
  status: UnifiedToolStatus;
  /** Raw tool name / ACP title (monospace-y identity, shown when useful). */
  title: string;
  fileName?: string;
  filePath?: string;
  lineRange?: string;
  diff?: { added: number; removed: number };
  command?: string;
  summary?: string;
  subagentType?: string;
  prompt?: string;
  parentCallId?: string;
  todoItems?: TodoItem[];
  input?: string;
  output?: string;
  outputKind: 'text' | 'diff' | 'image';
  imagePath?: string;
  truncated?: boolean;
  messageId?: string;
  conversationId?: string;
  raw: ToolMessage;
}

export type ToolMessage = IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall;

const formatValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const basename = (path: string): string => path.split(/[/\\]/).pop() || path;

/** LCS-based added/removed line counts. Counts only lines that actually changed,
 * not total lines in either side - so a one-line edit in a 100-line file reports
 * `{ added: 1, removed: 1 }`, not `{ added: 100, removed: 100 }`. */
const computeDiffCounts = (oldText: unknown, newText: unknown): { added: number; removed: number } => {
  const oldLines = typeof oldText === 'string' ? oldText.split('\n') : [];
  const newLines = typeof newText === 'string' ? newText.split('\n') : [];
  const m = oldLines.length;
  const n = newLines.length;
  if (m === 0) return { added: n, removed: 0 };
  if (n === 0) return { added: 0, removed: m };

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const lcs = dp[m][n];
  return { added: n - lcs, removed: m - lcs };
};

// ===== status maps (reuse the wire vocabularies proven by normalizeToolCall.ts) =====

const mapToolCallStatus = (status?: string): UnifiedToolStatus => {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    case 'running':
      return 'running';
    case 'canceled':
      return 'canceled';
    default:
      return 'pending';
  }
};

const mapGroupStatus = (status: string): UnifiedToolStatus => {
  switch (status) {
    case 'Success':
      return 'completed';
    case 'Error':
      return 'error';
    case 'Canceled':
      return 'canceled';
    case 'Pending':
      return 'pending';
    default:
      // 'Executing' | 'Confirming'
      return 'running';
  }
};

const mapAcpStatus = (status?: string): UnifiedToolStatus => {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'error';
    case 'in_progress':
      return 'running';
    default:
      return 'pending';
  }
};

// ===== field extraction =====

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pickString = (rec: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
};

const extractTodoItems = (input: Record<string, unknown>): TodoItem[] | undefined => {
  const todos = input.todos ?? input.todo ?? input.Todos;
  if (!Array.isArray(todos)) return undefined;
  const items = todos
    .map((item) => {
      const rec = asRecord(item);
      const content = pickString(rec, ['content', 'task', 'text']);
      const rawStatus = pickString(rec, ['status', 'state']);
      if (!content) return undefined;
      const status: TodoItem['status'] =
        rawStatus === 'completed'
          ? 'completed'
          : rawStatus === 'in_progress' || rawStatus === 'in-progress'
            ? 'in_progress'
            : 'pending';
      return { content, status };
    })
    .filter((item): item is TodoItem => item !== undefined);
  return items.length > 0 ? items : undefined;
};

const buildBlock = (
  partial: Omit<UnifiedToolBlock, 'outputKind'> & { outputKind?: UnifiedToolBlock['outputKind'] }
): UnifiedToolBlock => ({
  outputKind: 'text',
  ...partial,
});

// ===== per-type normalizers =====

function normalizeToolCall(message: IMessageToolCall): UnifiedToolBlock | undefined {
  const { call_id, name, status, input, output, args, description, parent_call_id } = message.content;
  if (!call_id) return undefined;
  const source = asRecord(input ?? args);
  const category = categorizeToolName(name);
  const filePath = pickString(source, ['file_path', 'path', 'file_name', 'fileName']);
  const oldText = source.old_string ?? source.old_text;
  const newText = source.new_string ?? source.new_text;

  return buildBlock({
    key: call_id,
    category,
    status: mapToolCallStatus(status),
    title: name,
    fileName: filePath ? basename(filePath) : undefined,
    filePath,
    lineRange: pickString(source, ['line_range', 'lines']),
    diff:
      category === 'edit' && (typeof oldText === 'string' || typeof newText === 'string')
        ? computeDiffCounts(oldText, newText)
        : undefined,
    command: pickString(source, ['command', 'cmd']),
    summary: description || pickString(source, ['description', 'task']),
    subagentType: pickString(source, ['subagent_type', 'subagentType', 'agent_type']),
    prompt: pickString(source, ['prompt', 'description', 'task']),
    parentCallId: parent_call_id,
    todoItems: category === 'todo' ? extractTodoItems(source) : undefined,
    input: formatValue(input ?? (args && Object.keys(args).length > 0 ? args : undefined)),
    output,
    truncated: false,
    messageId: message.id,
    conversationId: message.conversation_id,
    raw: message,
  });
}

function normalizeToolGroupItem(
  message: IMessageToolGroup,
  item: IMessageToolGroup['content'][number]
): UnifiedToolBlock | undefined {
  const { call_id, name, description, status, result_display } = item;
  // Confirmation items render via the dedicated confirmation card, not tool blocks.
  if (item.confirmationDetails) return undefined;
  const category = categorizeToolName(name);
  const resultText = typeof result_display === 'string' ? result_display : undefined;
  const resultObj = asRecord(result_display);
  const fileDiff = typeof resultObj.file_diff === 'string' ? resultObj.file_diff : undefined;

  return buildBlock({
    key: call_id,
    category,
    status: mapGroupStatus(status),
    title: name,
    fileName: typeof resultObj.file_name === 'string' ? resultObj.file_name : undefined,
    filePath: typeof resultObj.file_name === 'string' ? resultObj.file_name : undefined,
    diff:
      category === 'edit' && fileDiff
        ? {
            added: (fileDiff.match(/^\+[^+]/gm) ?? []).length,
            removed: (fileDiff.match(/^-[^-]/gm) ?? []).length,
          }
        : undefined,
    command: undefined,
    summary: description || undefined,
    input: undefined,
    output: resultText ?? fileDiff,
    outputKind: fileDiff ? 'diff' : 'text',
    imagePath: typeof resultObj.img_url === 'string' ? resultObj.img_url : undefined,
    truncated: false,
    messageId: message.id,
    conversationId: message.conversation_id,
    raw: message,
  });
}

type AcpUpdateCompat = NonNullable<IMessageAcpToolCall['content']['update']> & {
  raw_input?: Record<string, unknown>;
};

type AcpContentCompat = IMessageAcpToolCall['content'] & {
  update?: AcpUpdateCompat;
  _compact?: { truncated?: boolean };
};

function normalizeAcpToolCall(message: IMessageAcpToolCall): UnifiedToolBlock | undefined {
  const content = message.content as AcpContentCompat | undefined;
  const update = content?.update;
  if (!update) return undefined;
  const rawInput = asRecord(update.rawInput ?? update.raw_input);
  // Task/todo tools are identified by title (name) even on the ACP path.
  const nameCategory = categorizeToolName(update.title);
  const category = nameCategory !== 'generic' ? nameCategory : mapAcpKindToCategory(update.kind);
  const filePath = pickString(rawInput, ['file_path', 'path', 'file_name']);
  const outputText = Array.isArray(update.content)
    ? update.content
        .map((item) => {
          if (item?.type === 'content' && item.content?.text) return item.content.text;
          if (item?.type === 'diff' && 'path' in item) return `[diff] ${item.path}`;
          return '';
        })
        .filter(Boolean)
        .join('\n')
    : undefined;

  return buildBlock({
    key: update.tool_call_id,
    category,
    status: mapAcpStatus(update.status),
    title: update.title || update.kind || 'tool',
    fileName: filePath ? basename(filePath) : undefined,
    filePath,
    diff: undefined,
    command: category === 'bash' ? pickString(rawInput, ['command', 'cmd']) : undefined,
    summary:
      pickString(rawInput, ['command', 'file_path', 'path', 'pattern', 'query', 'url']) ||
      (category === 'task' ? pickString(rawInput, ['description']) : undefined),
    subagentType: pickString(rawInput, ['subagent_type', 'subagentType', 'agent_type']),
    prompt: pickString(rawInput, ['prompt', 'description']),
    todoItems: category === 'todo' ? extractTodoItems(rawInput) : undefined,
    input: Object.keys(rawInput).length > 0 ? formatValue(rawInput) : undefined,
    output: outputText,
    outputKind: 'text',
    imagePath: getAcpImagePath(update as never),
    truncated: content?._compact?.truncated === true,
    messageId: message.id,
    conversationId: message.conversation_id,
    raw: message,
  });
}

// ===== unified entry =====

export function normalizeUnifiedToolBlocks(messages: ToolMessage[]): UnifiedToolBlock[] {
  return messages
    .flatMap((m) => {
      if (m.type === 'tool_group') return m.content.map((item) => normalizeToolGroupItem(m, item));
      if (m.type === 'acp_tool_call') return [normalizeAcpToolCall(m)];
      if (m.type === 'tool_call') return [normalizeToolCall(m)];
      return [];
    })
    .filter((b): b is UnifiedToolBlock => b !== undefined);
}

export const hasRunningStatus = (blocks: UnifiedToolBlock[]): boolean =>
  blocks.some((b) => b.status === 'running' || b.status === 'pending');
