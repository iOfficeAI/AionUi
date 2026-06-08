import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup, TMessage } from './chatLib';

export type NormalizedToolStatus = 'pending' | 'running' | 'completed' | 'error' | 'canceled';

export interface NormalizedToolCall {
  key: string;
  name: string;
  status: NormalizedToolStatus;
  description?: string;
  input?: string;
  output?: string;
  kind?: string;
}

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

// ===== tool_group → NormalizedToolCall[] =====

function normalizeToolGroupStatus(status: string): NormalizedToolStatus {
  switch (status) {
    case 'Success':
      return 'completed';
    case 'Error':
      return 'error';
    case 'Canceled':
      return 'canceled';
    case 'Pending':
      return 'pending';
    case 'Executing':
    case 'Confirming':
    default:
      return 'running';
  }
}

const getResultDisplayText = (
  result_display: IMessageToolGroup['content'][0]['result_display']
): string | undefined => {
  if (!result_display) return undefined;
  if (typeof result_display === 'string') return result_display;
  if ('file_diff' in result_display) return result_display.file_diff;
  if ('img_url' in result_display) return result_display.relative_path || result_display.img_url;
  return undefined;
};

export function normalizeToolGroup(message: IMessageToolGroup): NormalizedToolCall[] {
  if (!Array.isArray(message.content)) return [];
  return message.content.map(({ name, call_id, description, confirmationDetails, status, result_display }) => {
    let desc = typeof description === 'string' ? description.slice(0, 100) : '';
    const type = confirmationDetails?.type;
    if (type === 'edit') desc = confirmationDetails.file_name;
    if (type === 'exec') desc = confirmationDetails.command;
    if (type === 'info') desc = confirmationDetails.urls?.join(';') || confirmationDetails.title;
    if (type === 'mcp') desc = confirmationDetails.server_name + ':' + confirmationDetails.tool_name;

    let input: string | undefined;
    if (confirmationDetails) {
      const { title: _title, type: _type, ...rest } = confirmationDetails;
      if (Object.keys(rest).length) input = formatValue(rest);
    } else if (description) {
      input = description;
    }

    return {
      key: call_id,
      name,
      status: normalizeToolGroupStatus(status),
      description: desc,
      input,
      output: getResultDisplayText(result_display),
    };
  });
}

// ===== acp_tool_call → NormalizedToolCall =====

function normalizeAcpStatus(status: string): NormalizedToolStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'error';
    case 'in_progress':
      return 'running';
    case 'pending':
    default:
      return 'pending';
  }
}

const buildParamSummary = (kind: string, rawInput?: Record<string, unknown>): string | undefined => {
  if (!rawInput) return undefined;

  if (kind === 'read' || kind === 'edit') {
    return (rawInput.file_path as string) || (rawInput.path as string) || (rawInput.file_name as string);
  }
  if (kind === 'execute') {
    return rawInput.command as string;
  }
  if (kind === 'search' || kind === 'grep') {
    const parts: string[] = [];
    if (rawInput.pattern) parts.push(`"${rawInput.pattern}"`);
    if (rawInput.path) parts.push(`in ${rawInput.path}`);
    else if (rawInput.glob) parts.push(`in ${rawInput.glob}`);
    return parts.length > 0 ? parts.join(' ') : undefined;
  }
  if (kind === 'glob') {
    const parts: string[] = [];
    if (rawInput.pattern) parts.push(`${rawInput.pattern}`);
    if (rawInput.path) parts.push(`in ${rawInput.path}`);
    return parts.length > 0 ? parts.join(' ') : undefined;
  }
  if (kind === 'write') {
    return (rawInput.file_path as string) || (rawInput.path as string);
  }

  for (const key of ['file_path', 'command', 'path', 'pattern', 'query', 'url']) {
    if (rawInput[key] && typeof rawInput[key] === 'string') return rawInput[key] as string;
  }
  return undefined;
};

export function normalizeAcpToolCall(message: IMessageAcpToolCall): NormalizedToolCall | undefined {
  const update = message.content?.update;
  if (!update) return undefined;

  const input = update.rawInput ? formatValue(update.rawInput) : undefined;

  let output: string | undefined;
  if (Array.isArray(update.content) && update.content.length) {
    output = update.content
      .map((item) => {
        if (item.type === 'content' && item.content?.text) return item.content.text;
        if (item.type === 'diff' && 'path' in item) return `[diff] ${item.path}`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  const keyParam = buildParamSummary(update.kind, update.rawInput);

  return {
    key: update.tool_call_id,
    name: update.title,
    status: normalizeAcpStatus(update.status),
    description: keyParam || (update.rawInput?.command as string) || update.kind,
    input,
    output,
    kind: update.kind,
  };
}

// ===== tool_call → NormalizedToolCall =====

function normalizeToolCallStatus(status?: string): NormalizedToolStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    case 'running':
      return 'running';
    default:
      return 'pending';
  }
}

export function normalizeToolCall(message: IMessageToolCall): NormalizedToolCall | undefined {
  const { call_id, name, status, input, output, args, description } = message.content;
  if (!call_id && !name) return undefined;

  const displayInput = input
    ? formatValue(input)
    : args && Object.keys(args).length > 0
      ? formatValue(args)
      : undefined;

  return {
    key: call_id || name,
    name,
    status: normalizeToolCallStatus(status),
    description: description || undefined,
    input: displayInput,
    output,
  };
}

// ===== Unified entry =====

export type ToolMessage = IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall;

export function normalizeToolMessages(messages: ToolMessage[]): NormalizedToolCall[] {
  return messages
    .flatMap((m) => {
      if (m.type === 'tool_group') return normalizeToolGroup(m);
      if (m.type === 'acp_tool_call') return normalizeAcpToolCall(m);
      if (m.type === 'tool_call') return normalizeToolCall(m);
      return undefined;
    })
    .filter((item): item is NormalizedToolCall => item !== undefined);
}

export function hasRunningToolMessages(messages: ToolMessage[]): boolean {
  return messages.some((m) => {
    if (m.type === 'tool_group') {
      return Array.isArray(m.content) && m.content.some((t) => normalizeToolGroupStatus(t.status) === 'running');
    }
    if (m.type === 'acp_tool_call') {
      return m.content?.update && normalizeAcpStatus(m.content.update.status) === 'running';
    }
    if (m.type === 'tool_call') {
      return normalizeToolCallStatus(m.content?.status) === 'running';
    }
    return false;
  });
}

// ===== Agent-edited paths extraction =====
//
// Walks the message history of a conversation and returns the union of file
// paths the current conversation's agent has edited/written via its tool calls.
// Used to mark which lines in the Git changes list originated from the agent
// (vs. the user's own edits) before committing.

const pickStringField = (raw: Record<string, unknown> | undefined, keys: readonly string[]): string | undefined => {
  if (!raw) return undefined;
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
};

const collectAcpToolCallPaths = (message: IMessageAcpToolCall): string[] => {
  const out: string[] = [];
  const update = message.content?.update;
  if (!update) return out;
  // `kind` is the typed discriminator from ACP/OpenCode. Today the public
  // ToolCallUpdate type enumerates 'read' | 'edit' | 'execute', but agents in
  // the wild also report 'write'; treat both as editing operations. Cast to
  // string so the comparison is forward-compatible with future enum
  // additions without a `noOverlap` typecheck error.
  const kind = update.kind as string;
  const isEditKind = kind === 'edit' || kind === 'write';
  if (!isEditKind) return out;
  const fromRaw = pickStringField(update.rawInput, ['file_path', 'path', 'file_name']);
  if (fromRaw) out.push(fromRaw);
  if (Array.isArray(update.locations)) {
    for (const loc of update.locations) {
      if (typeof loc?.path === 'string' && loc.path.length > 0) out.push(loc.path);
    }
  }
  if (Array.isArray(update.content)) {
    for (const item of update.content) {
      if (item && item.type === 'diff' && typeof item.path === 'string' && item.path.length > 0) {
        out.push(item.path);
      }
    }
  }
  return out;
};

const collectToolGroupPaths = (message: IMessageToolGroup): string[] => {
  const out: string[] = [];
  if (!Array.isArray(message.content)) return out;
  for (const entry of message.content) {
    if (entry.confirmationDetails?.type === 'edit') {
      const fileName = entry.confirmationDetails.file_name;
      if (typeof fileName === 'string' && fileName.length > 0) out.push(fileName);
    }
  }
  return out;
};

/**
 * Extract every distinct file path the current conversation's agent has
 * edited or written, based on the persisted message history. Pure / side-
 * effect free; safe to call from any render path.
 *
 * Handles two ACP-shaped message families:
 *  - `acp_tool_call`: when `update.kind` is `edit` or `write`, collects
 *    `rawInput.file_path | path | file_name`, every `update.locations[].path`,
 *    and every `update.content[]` item where `type === 'diff'`.
 *  - `tool_group`: for each entry whose `confirmationDetails.type === 'edit'`,
 *    collects `confirmationDetails.file_name`.
 *
 * Returns paths verbatim (as emitted by the agent / tool). Path normalization
 * against the workspace is the caller's responsibility — the Git changes
 * panel matches by repo-relative POSIX path and needs the same string form on
 * both sides.
 */
export function extractAgentEditedPaths(messages: readonly TMessage[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (path: string | undefined) => {
    if (typeof path !== 'string' || path.length === 0) return;
    if (seen.has(path)) return;
    seen.add(path);
    out.push(path);
  };
  for (const m of messages) {
    if (m.type === 'acp_tool_call') {
      for (const p of collectAcpToolCallPaths(m)) push(p);
    } else if (m.type === 'tool_group') {
      for (const p of collectToolGroupPaths(m)) push(p);
    }
    // All other message types (text, tips, tool_call, agent_status, permission,
    // acp_permission, plan, thinking, available_commands, opencode_subtask,
    // opencode_retry, opencode_error) intentionally ignored.
  }
  return out;
}
