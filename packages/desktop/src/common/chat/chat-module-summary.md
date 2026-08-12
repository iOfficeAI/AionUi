# Chat 模块源代码

> 路径：`packages/desktop/src/common/chat/`

---

## acpToolCallOutput.ts — ACP 工具调用输出处理，清理内联图片 Base64

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpRawOutput, ToolCallUpdate } from '@/common/types/platform/acpTypes';

const INLINE_IMAGE_RESULT_LIMIT = 64 * 1024;
const IMAGE_PATH_EXTENSION_RE = /\.(?:png|jpe?g|webp|gif)$/i;

const isProbablyInlineImageResult = (value: string): boolean =>
  value.length > INLINE_IMAGE_RESULT_LIMIT &&
  (value.startsWith('iVBORw0KGgo') ||
    value.startsWith('/9j/') ||
    value.startsWith('UklGR') ||
    value.startsWith('data:image/'));

const isImagePath = (path: string): boolean => IMAGE_PATH_EXTENSION_RE.test(path);

const mimeTypeFromImagePath = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
};

const sanitizeAcpRawOutput = (rawOutput?: AcpRawOutput): AcpRawOutput | undefined => {
  if (!rawOutput) return rawOutput;

  const result = rawOutput.result;
  const savedPath = rawOutput.saved_path;
  if (typeof result !== 'string' || !isProbablyInlineImageResult(result)) {
    return rawOutput;
  }

  const { result: _result, ...rest } = rawOutput;
  const sanitized: AcpRawOutput = {
    ...rest,
    result_omitted: true,
    result_omitted_reason: rawOutput.result_omitted_reason || 'image_base64',
    result_bytes: rawOutput.result_bytes || result.length,
  };

  if (rawOutput.image || (typeof savedPath === 'string' && savedPath)) {
    const path = rawOutput.image?.path || savedPath;
    sanitized.image = rawOutput.image || {
      path,
      mime_type: mimeTypeFromImagePath(path),
      source: 'codex_image_generation',
    };
  }

  return sanitized;
};

export const sanitizeAcpToolUpdate = (update: ToolCallUpdate['update']): ToolCallUpdate['update'] => ({
  ...update,
  rawOutput: sanitizeAcpRawOutput(update.rawOutput),
  raw_output: sanitizeAcpRawOutput(update.raw_output),
});

export const sanitizeAcpToolCallContent = (content: ToolCallUpdate): ToolCallUpdate => ({
  ...content,
  update: sanitizeAcpToolUpdate(content.update),
});

export const getAcpImagePath = (update: ToolCallUpdate['update']): string | undefined => {
  const rawOutput = update.rawOutput || update.raw_output;
  const imagePath = rawOutput?.image?.path;
  if (typeof imagePath === 'string' && imagePath) return imagePath;

  const savedPath = rawOutput?.saved_path;
  if (
    typeof savedPath === 'string' &&
    savedPath &&
    (rawOutput?.result_omitted_reason === 'image_base64' || isImagePath(savedPath))
  ) {
    return savedPath;
  }

  return undefined;
};

export const getAcpImageFileName = (path: string): string => path.split(/[/\\]/).pop() || 'generated-image.png';
```

---

## atCommandParser.ts — @命令解析器，解析文件引用语法

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared @ command parser for file references
 * 共享的 @ 命令解析器，用于文件引用
 */

export interface AtCommandPart {
  type: 'text' | 'atPath';
  content: string;
}

/**
 * Simple unescape function for @ paths
 * 简单的转义处理函数
 */
function unescapeAtPath(rawPath: string): string {
  // Remove leading @ if present
  const path = rawPath.startsWith('@') ? rawPath.substring(1) : rawPath;
  // Unescape backslash-escaped characters
  return path.replace(/\\(.)/g, '$1');
}

/**
 * Parses a query string to find all '@<path>' commands and text segments.
 * Handles \ escaped spaces within paths.
 *
 * 解析查询字符串，找出所有 '@<path>' 命令和文本段。
 * 处理路径中的 \ 转义空格。
 *
 * @example
 * parseAllAtCommands('@file.txt hello @dir/path world')
 * // Returns: [
 * //   { type: 'atPath', content: 'file.txt' },
 * //   { type: 'text', content: 'hello' },
 * //   { type: 'atPath', content: 'dir/path' },
 * //   { type: 'text', content: 'world' }
 * // ]
 */
export function parseAllAtCommands(query: string): AtCommandPart[] {
  const parts: AtCommandPart[] = [];
  let currentIndex = 0;

  while (currentIndex < query.length) {
    let atIndex = -1;
    let nextSearchIndex = currentIndex;
    // Find next unescaped '@'
    while (nextSearchIndex < query.length) {
      if (query[nextSearchIndex] === '@' && (nextSearchIndex === 0 || query[nextSearchIndex - 1] !== '\\')) {
        atIndex = nextSearchIndex;
        break;
      }
      nextSearchIndex++;
    }

    if (atIndex === -1) {
      // No more @
      if (currentIndex < query.length) {
        parts.push({ type: 'text', content: query.substring(currentIndex) });
      }
      break;
    }

    // Add text before @
    if (atIndex > currentIndex) {
      parts.push({
        type: 'text',
        content: query.substring(currentIndex, atIndex),
      });
    }

    // Parse @path
    let pathEndIndex = atIndex + 1;
    let inEscape = false;
    while (pathEndIndex < query.length) {
      const char = query[pathEndIndex];
      if (inEscape) {
        inEscape = false;
      } else if (char === '\\') {
        inEscape = true;
      } else if (/[,\s;!?()[\]{}]/.test(char)) {
        // Path ends at first whitespace or punctuation not escaped
        break;
      } else if (char === '.') {
        // For . we need to be more careful - only terminate if followed by whitespace or end of string
        // This allows file extensions like .txt, .js but terminates at sentence endings like "file.txt. Next sentence"
        const nextChar = pathEndIndex + 1 < query.length ? query[pathEndIndex + 1] : '';
        if (nextChar === '' || /\s/.test(nextChar)) {
          break;
        }
      }
      pathEndIndex++;
    }
    const rawAtPath = query.substring(atIndex, pathEndIndex);
    const atPath = unescapeAtPath(rawAtPath);
    parts.push({ type: 'atPath', content: atPath });
    currentIndex = pathEndIndex;
  }
  // Filter out empty text parts that might result from consecutive @paths or leading/trailing spaces
  return parts.filter((part) => !(part.type === 'text' && part.content.trim() === ''));
}

/**
 * Extract all @ file paths from a query string
 * 从查询字符串中提取所有 @ 文件路径
 */
export function extractAtPaths(query: string): string[] {
  const parts = parseAllAtCommands(query);
  return parts.filter((part) => part.type === 'atPath' && part.content !== '').map((part) => part.content);
}

/**
 * Check if a query contains any @ file references
 * 检查查询是否包含任何 @ 文件引用
 */
export function hasAtReferences(query: string): boolean {
  return extractAtPaths(query).length > 0;
}

/**
 * Reconstruct query from parts, optionally replacing @ paths
 * 从部分重建查询，可选择替换 @ 路径
 */
export function reconstructQuery(parts: AtCommandPart[], pathReplacer?: (path: string) => string): string {
  return parts
    .map((part) => {
      if (part.type === 'text') {
        return part.content;
      } else {
        // atPath
        if (pathReplacer) {
          return pathReplacer(part.content);
        }
        return '@' + part.content;
      }
    })
    .join('');
}
```

---

## chatLib.ts — 核心消息类型定义与转换逻辑

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpPermissionRequest, PlanUpdate, ToolCallUpdate } from '@/common/types/platform/acpTypes';
import type { AcpAvailableCommand } from '@/common/chat/slash/types';
import type { IResponseMessage } from '../adapter/ipcBridge';
import { uuid } from '../utils';
import { sanitizeAcpToolCallContent, sanitizeAcpToolUpdate } from './acpToolCallOutput';

export { sanitizeAcpToolCallContent } from './acpToolCallOutput';

/**
 * 安全的路径拼接函数，兼容Windows和Mac
 * @param basePath 基础路径
 * @param relativePath 相对路径
 * @returns 拼接后的绝对路径
 */
export const joinPath = (basePath: string, relativePath: string): string => {
  // 标准化路径分隔符为 /
  const normalizePath = (path: string) => path.replace(/\\/g, '/');

  const base = normalizePath(basePath);
  const relative = normalizePath(relativePath);

  // 去掉base路径末尾的斜杠
  const cleanBase = base.replace(/\/+$/, '');

  // 处理相对路径中的 ./ 和 ../
  const parts = relative.split('/');
  const resultParts = [];

  for (const part of parts) {
    if (part === '.' || part === '') {
      continue; // 跳过 . 和空字符串
    } else if (part === '..') {
      // 处理上级目录
      if (resultParts.length > 0) {
        resultParts.pop(); // 移除最后一个部分
      }
    } else {
      resultParts.push(part);
    }
  }

  // 拼接路径
  const result = cleanBase + '/' + resultParts.join('/');

  // 确保路径格式正确
  return result.replace(/\/+/g, '/'); // 将多个连续的斜杠替换为单个
};

/**
 * @description 跟对话相关的消息类型申明 及相关处理
 */

type TMessageType =
  | 'text'
  | 'tips'
  | 'tool_call'
  | 'tool_group'
  | 'agent_status'
  | 'permission'
  | 'acp_permission'
  | 'acp_tool_call'
  | 'plan'
  | 'thinking'
  | 'available_commands';

interface IMessage<T extends TMessageType, Content extends Record<string, any>> {
  /**
   * 唯一ID
   */
  id: string;
  /**
   * 消息来源ID，
   */
  msg_id?: string;

  //消息会话ID
  conversation_id: string;
  /**
   * 消息类型
   */
  type: T;
  /**
   * 消息内容
   */
  content: Content;
  /**
   * 消息创建时间
   */
  created_at?: number;
  /**
   * 消息位置
   */
  position?: 'left' | 'right' | 'center' | 'pop';
  /**
   * 消息状态
   */
  status?: 'finish' | 'pending' | 'error' | 'work';
  /**
   * Hidden from UI display but persisted to DB and sent to agent.
   */
  hidden?: boolean;
}

export type CronMessageMeta = {
  source: 'cron';
  cron_job_id: string;
  cron_job_name: string;
  triggered_at: number;
};

export type IMessageText = IMessage<
  'text',
  {
    content: string;
    /** Backend explicitly replaced the accumulated text for this msg_id. */
    replace?: boolean;
    cronMeta?: CronMessageMeta;
    teammateMessage?: boolean;
    senderName?: string;
    senderAgentType?: string;
    /** Sender teammate's conversation id — lets the renderer resolve preset avatars via their conversation extras. */
    senderConversationId?: string;
  }
>;

export type AgentErrorOwnership = 'aionui' | 'user_agent' | 'user_llm_provider' | 'unknown_upstream';

export type AgentErrorResolutionKind =
  | 'retry'
  | 'wait_for_current_response'
  | 'start_new_session'
  | 'reconnect_agent'
  | 'check_agent_login'
  | 'check_agent_installation'
  | 'check_agent_version'
  | 'check_local_command'
  | 'check_provider_credentials'
  | 'check_provider_billing'
  | 'check_provider_base_url'
  | 'change_model'
  | 'reduce_context'
  | 'send_feedback';

export type AgentErrorResolutionTarget = 'provider_settings' | 'agent_settings' | 'new_conversation' | 'feedback';

export type AgentErrorResolution = {
  kind: AgentErrorResolutionKind;
  target?: AgentErrorResolutionTarget;
};

/** Redacted, size-bounded summary of the original error, for telemetry only. */
export type AgentStreamRawErrorSummary = {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
  stack?: string;
};

export type AgentStreamErrorInfo = {
  message: string;
  code?: string;
  ownership?: AgentErrorOwnership;
  detail?: string;
  workspacePath?: string;
  retryable?: boolean;
  feedback_recommended?: boolean;
  resolution?: AgentErrorResolution;
  /**
   * Diagnostic summary of the original underlying error, preserved on
   * unclassified ("internal") failures so they can be located in telemetry.
   * Redacted of secrets/PII before it reaches here.
   */
  rawError?: AgentStreamRawErrorSummary;
};

export type IMessageTips = IMessage<
  'tips',
  {
    content: string;
    type: 'error' | 'info' | 'success' | 'warning';
    code?: string;
    params?: Record<string, unknown>;
    error?: AgentStreamErrorInfo;
  }
>;

export const isErrorTipMessage = (message: IResponseMessage): boolean => {
  if (message.type !== 'tips' || !message.data || typeof message.data !== 'object') {
    return false;
  }

  const tipData = message.data as { type?: unknown };
  return tipData.type === 'error';
};

export type IMessageToolCall = IMessage<
  'tool_call',
  {
    call_id: string;
    name: string;
    args: Record<string, any>;
    error?: string;
    status?: 'running' | 'completed' | 'error';
    input?: Record<string, any>;
    output?: string;
    description?: string;
  }
>;

type IMessageToolGroupConfirmationDetailsBase<Type, Extra extends Record<string, any>> = {
  type: Type;
  title: string;
} & Extra;

export type IMessageToolGroup = IMessage<
  'tool_group',
  Array<{
    call_id: string;
    description: string;
    name: string;
    render_output_as_markdown: boolean;
    result_display?:
      | string
      | {
          file_diff: string;
          file_name: string;
        }
      | {
          img_url: string;
          relative_path: string;
        };
    status: 'Executing' | 'Success' | 'Error' | 'Canceled' | 'Pending' | 'Confirming';
    confirmationDetails?:
      | IMessageToolGroupConfirmationDetailsBase<
          'edit',
          {
            file_name: string;
            file_diff: string;
            isModifying?: boolean;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          'exec',
          {
            rootCommand: string;
            command: string;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          'info',
          {
            urls?: string[];
            prompt: string;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          'mcp',
          {
            tool_name: string;
            tool_display_name: string;
            server_name: string;
          }
        >;
  }>
>;

// Unified agent status message type for all ACP-based agents (Claude, Qwen, Codex, etc.)
export type IMessageAgentStatus = IMessage<
  'agent_status',
  {
    backend: string; // Agent identifier: 'claude', 'qwen', 'codex', 'remote', etc.
    status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'error';
    /** Display name for the agent (e.g. extension-contributed adapter name) / Agent 显示名称 */
    agent_name?: string;
    // Optional legacy fields for backward compatibility
    session_id?: string;
    is_connected?: boolean;
    has_active_session?: boolean;
  }
>;

export type IMessageAcpPermission = IMessage<'acp_permission', AcpPermissionRequest>;

export type IMessagePermission = IMessage<'permission', IConfirmation>;

export type IMessageAcpToolCall = IMessage<'acp_tool_call', ToolCallUpdate>;

export const mergeAcpToolCallContent = (
  existing: IMessageAcpToolCall['content'],
  incoming: IMessageAcpToolCall['content']
): IMessageAcpToolCall['content'] => ({
  ...existing,
  ...incoming,
  update: sanitizeAcpToolUpdate({
    ...existing.update,
    ...incoming.update,
  }),
});

export const isTextContentReplacement = (content: IMessageText['content'] | undefined): boolean =>
  content?.replace === true;

export const mergeTextMessageContent = (
  existing: IMessageText['content'],
  incoming: IMessageText['content']
): IMessageText['content'] => {
  const { replace: _existingReplace, ...existingRest } = existing;
  const { replace: incomingReplace, ...incomingRest } = incoming;

  return {
    ...existingRest,
    ...incomingRest,
    content: incomingReplace ? incoming.content : existing.content + incoming.content,
    ...(incomingReplace ? { replace: true } : {}),
  };
};

export const preferTextMessageVersion = (primary: IMessageText, secondary: IMessageText): IMessageText => {
  const primaryIsReplace = isTextContentReplacement(primary.content);
  const secondaryIsReplace = isTextContentReplacement(secondary.content);

  if (primaryIsReplace !== secondaryIsReplace) {
    return primaryIsReplace ? primary : secondary;
  }

  return secondary.content.content.length > primary.content.content.length ? secondary : primary;
};

export type IMessagePlan = IMessage<
  'plan',
  {
    session_id: string;
    entries: PlanUpdate['update']['entries'];
  }
>;

export type IMessageThinking = IMessage<
  'thinking',
  {
    content: string;
    subject?: string;
    duration?: number;
    status: 'thinking' | 'done';
  }
>;

// Available commands from ACP agents (Claude, etc.)
export type AvailableCommand = AcpAvailableCommand;

export type IMessageAvailableCommands = IMessage<
  'available_commands',
  {
    commands: AvailableCommand[];
  }
>;

// eslint-disable-next-line max-len
export type TMessage =
  | IMessageText
  | IMessageTips
  | IMessageToolCall
  | IMessageToolGroup
  | IMessageAgentStatus
  | IMessagePermission
  | IMessageAcpPermission
  | IMessageAcpToolCall
  | IMessagePlan
  | IMessageThinking
  | IMessageAvailableCommands;

// 统一所有需要用户交互的用户类型
export interface IConfirmation<Option extends any = any> {
  title?: string;
  id: string;
  action?: string;
  description: string;
  call_id: string;
  options: Array<{
    label: string;
    value: Option;
    params?: Record<string, string>; // Translation interpolation parameters
  }>;
  /**
   * Command type for exec confirmations (e.g., 'curl', 'npm', 'git')
   * Used for "always allow" permission memory
   */
  command_type?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type RawTextMessageContent = {
  content?: unknown;
  replace?: unknown;
  cronMeta?: unknown;
  teammateMessage?: unknown;
  teammate_message?: unknown;
  senderName?: unknown;
  sender_name?: unknown;
  from_name?: unknown;
  senderAgentType?: unknown;
  sender_backend?: unknown;
  senderBackend?: unknown;
  senderConversationId?: unknown;
  sender_conversation_id?: unknown;
  senderConversationID?: unknown;
};

type NormalizeTextMessageContentOptions = {
  replace?: boolean;
};

const isCronMessageMeta = (value: unknown): value is CronMessageMeta =>
  isObject(value) &&
  value.source === 'cron' &&
  typeof value.cron_job_id === 'string' &&
  typeof value.cron_job_name === 'string' &&
  typeof value.triggered_at === 'number';

const firstStringField = (
  data: RawTextMessageContent,
  keys: Array<keyof RawTextMessageContent>
): string | undefined => {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
};

const normalizeTextMessageContentObject = (
  data: RawTextMessageContent,
  options?: NormalizeTextMessageContentOptions
): IMessageText['content'] => {
  const content = typeof data.content === 'string' ? data.content : String(data.content ?? '');
  const senderName = firstStringField(data, ['senderName', 'sender_name', 'from_name']);
  const senderAgentType = firstStringField(data, ['senderAgentType', 'sender_backend', 'senderBackend']);
  const senderConversationId = firstStringField(data, [
    'senderConversationId',
    'sender_conversation_id',
    'senderConversationID',
  ]);
  const cronMeta = isCronMessageMeta(data.cronMeta) ? data.cronMeta : undefined;
  const replace = options?.replace === true || data.replace === true;
  const teammateMessage = Boolean(data.teammateMessage) || Boolean(data.teammate_message);

  return {
    content,
    ...(replace ? { replace: true } : {}),
    ...(cronMeta ? { cronMeta } : {}),
    ...(teammateMessage ? { teammateMessage: true } : {}),
    ...(senderName ? { senderName } : {}),
    ...(senderAgentType ? { senderAgentType } : {}),
    ...(senderConversationId ? { senderConversationId } : {}),
  };
};

export const normalizeTextMessageContent = (
  raw: unknown,
  options?: NormalizeTextMessageContentOptions
): IMessageText['content'] => {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isObject(parsed)) {
        return normalizeTextMessageContentObject(parsed as RawTextMessageContent, options);
      }
    } catch {
      // Plain text is the common streaming shape.
    }

    return {
      content: raw,
      ...(options?.replace === true ? { replace: true } : {}),
    };
  }

  if (isObject(raw)) {
    return normalizeTextMessageContentObject(raw as RawTextMessageContent, options);
  }

  return {
    content: String(raw ?? ''),
    ...(options?.replace === true ? { replace: true } : {}),
  };
};

const AGENT_ERROR_OWNERSHIPS = new Set<AgentErrorOwnership>([
  'aionui',
  'user_agent',
  'user_llm_provider',
  'unknown_upstream',
]);

const AGENT_ERROR_RESOLUTION_KINDS = new Set<AgentErrorResolutionKind>([
  'retry',
  'wait_for_current_response',
  'start_new_session',
  'reconnect_agent',
  'check_agent_login',
  'check_agent_installation',
  'check_agent_version',
  'check_local_command',
  'check_provider_credentials',
  'check_provider_billing',
  'check_provider_base_url',
  'change_model',
  'reduce_context',
  'send_feedback',
]);

const AGENT_ERROR_RESOLUTION_TARGETS = new Set<AgentErrorResolutionTarget>([
  'provider_settings',
  'agent_settings',
  'new_conversation',
  'feedback',
]);

export const normalizeAgentErrorResolution = (value: unknown): AgentErrorResolution | undefined => {
  if (!isObject(value) || typeof value.kind !== 'string') {
    return undefined;
  }

  if (!AGENT_ERROR_RESOLUTION_KINDS.has(value.kind as AgentErrorResolutionKind)) {
    return undefined;
  }

  const target =
    typeof value.target === 'string' && AGENT_ERROR_RESOLUTION_TARGETS.has(value.target as AgentErrorResolutionTarget)
      ? (value.target as AgentErrorResolutionTarget)
      : undefined;

  return {
    kind: value.kind as AgentErrorResolutionKind,
    ...(target ? { target } : {}),
  };
};

const normalizeRawErrorSummary = (value: unknown): AgentStreamRawErrorSummary | undefined => {
  if (!isObject(value)) return undefined;

  const name = typeof value.name === 'string' ? value.name : undefined;
  const message = typeof value.message === 'string' ? value.message : undefined;
  const code = typeof value.code === 'string' ? value.code : undefined;
  const status = typeof value.status === 'number' && Number.isFinite(value.status) ? value.status : undefined;
  const stack = typeof value.stack === 'string' ? value.stack : undefined;

  if (
    name === undefined &&
    message === undefined &&
    code === undefined &&
    status === undefined &&
    stack === undefined
  ) {
    return undefined;
  }

  return {
    ...(name !== undefined ? { name } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(stack !== undefined ? { stack } : {}),
  };
};

export const normalizeAgentStreamError = (value: unknown): AgentStreamErrorInfo | undefined => {
  if (!isObject(value) || typeof value.message !== 'string') {
    return undefined;
  }

  const code = typeof value.code === 'string' ? value.code : undefined;
  const ownership =
    typeof value.ownership === 'string' && AGENT_ERROR_OWNERSHIPS.has(value.ownership as AgentErrorOwnership)
      ? (value.ownership as AgentErrorOwnership)
      : undefined;
  const detail = typeof value.detail === 'string' ? value.detail : undefined;
  const workspacePath = typeof value.workspacePath === 'string' ? value.workspacePath : undefined;
  const retryable = typeof value.retryable === 'boolean' ? value.retryable : undefined;
  const feedback_recommended = typeof value.feedback_recommended === 'boolean' ? value.feedback_recommended : undefined;
  const resolution = normalizeAgentErrorResolution(value.resolution);
  const rawError = normalizeRawErrorSummary(value.rawError);

  if (
    !code &&
    !ownership &&
    !detail &&
    !workspacePath &&
    retryable === undefined &&
    feedback_recommended === undefined &&
    !resolution &&
    !rawError
  ) {
    return undefined;
  }

  return {
    message: value.message,
    ...(code ? { code } : {}),
    ...(ownership ? { ownership } : {}),
    ...(detail ? { detail } : {}),
    ...(workspacePath ? { workspacePath } : {}),
    ...(retryable !== undefined ? { retryable } : {}),
    ...(feedback_recommended !== undefined ? { feedback_recommended } : {}),
    ...(resolution ? { resolution } : {}),
    ...(rawError ? { rawError } : {}),
  };
};

/**
 * @description 将后端返回的消息转换为前端消息
 * */
const isChatMessagePosition = (value: unknown): value is NonNullable<TMessage['position']> =>
  value === 'left' || value === 'right' || value === 'center' || value === 'pop';

const isChatMessageStatus = (value: unknown): value is NonNullable<TMessage['status']> =>
  value === 'finish' || value === 'pending' || value === 'error' || value === 'work';

export const transformMessage = (message: IResponseMessage): TMessage | undefined => {
  const created_at = message.created_at ?? Date.now();
  switch (message.type) {
    case 'error': {
      const errorData = message.data;
      const structuredError = normalizeAgentStreamError(errorData);
      const errorText =
        typeof errorData === 'string'
          ? errorData
          : ((errorData as { message?: string })?.message ?? JSON.stringify(errorData));
      return {
        id: uuid(),
        type: 'tips',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        created_at,
        content: {
          content: errorText,
          type: 'error',
          ...(structuredError ? { error: structuredError } : {}),
        },
      };
    }
    case 'tips': {
      const data = message.data as {
        content: string;
        type?: 'error' | 'info' | 'success' | 'warning';
        code?: unknown;
        params?: unknown;
        error?: unknown;
      };
      const tipType = data.type ?? 'warning';
      const tipCode = typeof data.code === 'string' ? data.code : undefined;
      const tipParams = isObject(data.params) ? data.params : undefined;
      const structuredError =
        tipType === 'error'
          ? (normalizeAgentStreamError(data.error) ?? normalizeAgentStreamError({ ...data, message: data.content }))
          : undefined;
      return {
        id: uuid(),
        type: 'tips',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        created_at,
        content: {
          content: data.content,
          type: tipType,
          ...(tipCode ? { code: tipCode } : {}),
          ...(tipParams ? { params: tipParams } : {}),
          ...(structuredError ? { error: structuredError } : {}),
        },
      };
    }
    case 'text':
    case 'content':
    case 'user_content': {
      const data = message.data;
      const position = isChatMessagePosition(message.position)
        ? message.position
        : message.type === 'user_content'
          ? 'right'
          : 'left';
      const status = isChatMessageStatus(message.status) ? message.status : undefined;
      return {
        id: uuid(),
        type: 'text',
        msg_id: message.msg_id,
        position,
        ...(status ? { status } : {}),
        conversation_id: message.conversation_id,
        created_at,
        content: normalizeTextMessageContent(data, {
          replace: message.replace === true,
        }),
        ...(message.hidden && { hidden: true }),
      };
    }
    case 'tool_call': {
      return {
        id: uuid(),
        type: 'tool_call',
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        position: 'left',
        created_at,
        content: message.data as any,
      };
    }
    case 'tool_group': {
      return {
        type: 'tool_group',
        id: uuid(),
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        created_at,
        content: message.data as any,
      };
    }
    case 'agent_status': {
      return {
        id: uuid(),
        type: 'agent_status',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        created_at,
        content: message.data as any,
      };
    }
    case 'permission': {
      return {
        id: uuid(),
        type: 'permission',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        created_at,
        content: message.data as any,
      };
    }
    case 'acp_permission': {
      return {
        id: uuid(),
        type: 'acp_permission',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        created_at,
        content: message.data as any,
      };
    }
    case 'acp_tool_call': {
      return {
        id: uuid(),
        type: 'acp_tool_call',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        created_at,
        content: message.data as any,
      };
    }
    case 'plan': {
      return {
        id: uuid(),
        type: 'plan',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        created_at,
        content: message.data as any,
      };
    }
    case 'thinking': {
      const data = message.data as {
        content: string;
        subject?: string;
        duration?: number;
        duration_ms?: number;
        status: 'thinking' | 'done';
      };
      return {
        id: uuid(),
        type: 'thinking',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        created_at,
        content: {
          content: data.content,
          subject: data.subject,
          duration: data.duration ?? data.duration_ms,
          status: data.status,
        },
      };
    }
    // Disabled: available_commands messages are too noisy and distracting in the chat UI
    case 'available_commands':
      return undefined;
    case 'start':
    case 'finish':
    case 'thought':
    case 'skill_suggest':
    case 'cron_trigger':
    case 'info': // Stream retry notifications and similar transient agent updates
    case 'system': // Cron system responses, ignored
    case 'acp_model_info': // Model info updates, handled by AcpModelSelector
    case 'codex_model_info': // Legacy Codex model info updates
    case 'acp_context_usage': // Context usage updates, handled by AcpSendBox
    case 'request_trace': // Request trace events, logged to F12 console (not persisted)
      return undefined;
    default: {
      console.warn(
        `[transformMessage] Unsupported message type '${message.type}'. All non-standard message types should be pre-processed by respective AgentManagers.`
      );
      return undefined;
    }
  }
};

/**
 * @description 将消息合并到消息列表中
 * */
export const composeMessage = (
  message: TMessage | undefined,
  list: TMessage[] | undefined,
  messageHandler: (type: 'update' | 'insert', message: TMessage) => void = () => {}
): TMessage[] => {
  if (!message) return list || [];
  const normalizedMessage =
    message.type === 'acp_tool_call'
      ? ({ ...message, content: sanitizeAcpToolCallContent(message.content) } as TMessage)
      : message;
  if (!list?.length) {
    messageHandler('insert', normalizedMessage);
    return [normalizedMessage];
  }
  const last = list[list.length - 1];

  const updateMessage = (index: number, message: TMessage, change = true) => {
    message.id = list[index].id;
    list[index] = message;
    if (change) messageHandler('update', message);
    return list.slice();
  };
  const pushMessage = (message: TMessage) => {
    list.push(message);
    messageHandler('insert', message);
    return list.slice();
  };

  if (message.type === 'tool_group') {
    const remainingToolsMap = new Map(message.content.map((t) => [t.call_id, t] as const));
    if (remainingToolsMap.size === 0) return list;

    const updatesToReport: TMessage[] = [];

    const updatedList = list.map((existingMessage) => {
      if (existingMessage.type !== 'tool_group') return existingMessage;
      if (!existingMessage.content.length) return existingMessage;

      let didMergeIntoThisMessage = false;
      const new_content = existingMessage.content.map((tool) => {
        const newToolData = remainingToolsMap.get(tool.call_id);
        if (!newToolData) return tool;
        didMergeIntoThisMessage = true;
        remainingToolsMap.delete(tool.call_id);
        // Create new object instead of mutating original
        return { ...tool, ...newToolData };
      });

      if (!didMergeIntoThisMessage) return existingMessage;
      const updatedMessage = { ...existingMessage, content: new_content } as TMessage;
      updatesToReport.push(updatedMessage);
      return updatedMessage;
    });

    const didUpdateExisting = updatesToReport.length > 0;
    for (const updatedMessage of updatesToReport) {
      messageHandler('update', updatedMessage);
    }

    const baseList = didUpdateExisting ? updatedList : list;

    // If there are new tool calls, append them as a new tool_group message (without mutating inputs)
    if (remainingToolsMap.size > 0) {
      const newTools = Array.from(remainingToolsMap.values());
      const insertMessage = { ...message, content: newTools } as TMessage;
      messageHandler('insert', insertMessage);
      return baseList.concat(insertMessage);
    }
    // No new tools appended; return a new list only if something was updated
    return didUpdateExisting ? baseList : list;
  }

  // Handle Gemini tool_call message merging
  if (message.type === 'tool_call') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'tool_call' && msg.content.call_id === message.content.call_id) {
        // Create new object instead of mutating original
        return updateMessage(i, { ...msg, content: { ...msg.content, ...message.content } });
      }
    }
    // If no existing tool call found, add new one
    return pushMessage(message);
  }

  // Handle acp_tool_call message merging
  if (message.type === 'acp_tool_call') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'acp_tool_call' && msg.content.update?.tool_call_id === message.content.update?.tool_call_id) {
        // Create new object instead of mutating original
        const merged = mergeAcpToolCallContent(msg.content, message.content);
        return updateMessage(i, { ...msg, content: merged });
      }
    }
    // If no existing tool call found, add new one
    return pushMessage(normalizedMessage);
  }

  if (message.type === 'plan') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'plan' && msg.content.session_id === message.content.session_id) {
        // Create new object instead of mutating original
        const merged = { ...msg.content, ...message.content };
        return updateMessage(i, { ...msg, content: merged });
      }
    }
    return pushMessage(message);
    // If no existing plan found, add new one
  }

  // Handle thinking message merging — only merge contiguous streaming chunks
  if (message.type === 'thinking') {
    if (message.content.status === 'done') {
      for (let i = list.length - 1; i >= 0; i--) {
        const msg = list[i];
        if (msg.type !== 'thinking' || msg.msg_id !== message.msg_id) continue;

        const merged = {
          ...msg.content,
          status: 'done' as const,
          duration: message.content.duration,
          subject: message.content.subject || msg.content.subject,
        };
        return updateMessage(i, { ...msg, content: merged });
      }
    }

    if (last.type === 'thinking' && last.msg_id === message.msg_id) {
      // Otherwise append content
      const merged = {
        ...last.content,
        content: last.content.content + message.content.content,
        subject: message.content.subject || last.content.subject,
      };
      return updateMessage(list.length - 1, { ...last, content: merged });
    }
    return pushMessage(message);
  }

  if (last.msg_id !== message.msg_id || last.type !== message.type) {
    return pushMessage(message);
  }
  if (message.type === 'text' && last.type === 'text') {
    message.content = mergeTextMessageContent(last.content, message.content);
  }
  return updateMessage(list.length - 1, Object.assign({}, last, message));
};

export const handleImageGenerationWithWorkspace = (message: TMessage, workspace: string): TMessage => {
  // 只处理text类型的消息
  if (message.type !== 'text') {
    return message;
  }

  // 深拷贝消息以避免修改原始对象
  const processedMessage = {
    ...message,
    content: {
      ...message.content,
      content: message.content.content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, imagePath) => {
        // 如果是绝对路径、http链接或data URL，保持不变
        if (
          imagePath.startsWith('http') ||
          imagePath.startsWith('data:') ||
          imagePath.startsWith('/') ||
          imagePath.startsWith('file:') ||
          imagePath.startsWith('\\') ||
          /^[A-Za-z]:/.test(imagePath)
        ) {
          return match;
        }
        // 如果是相对路径，与workspace拼接
        const absolutePath = joinPath(workspace, imagePath);
        return `![${alt}](${encodeURI(absolutePath)})`;
      }),
    },
  };

  return processedMessage;
};
```

---

## normalizeToolCall.ts — 三种工具调用格式统一归一化

```typescript
import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';
import { getAcpImagePath } from './acpToolCallOutput';

export type NormalizedToolStatus = 'pending' | 'running' | 'completed' | 'error' | 'canceled';

export interface NormalizedToolCall {
  key: string;
  name: string;
  status: NormalizedToolStatus;
  description?: string;
  input?: string;
  output?: string;
  truncated?: boolean;
  messageId?: string;
  conversationId?: string;
  imagePath?: string;
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

type AcpToolCallUpdateCompat = IMessageAcpToolCall['content']['update'] & {
  session_update?: string;
  raw_input?: Record<string, unknown>;
};

type AcpToolCallContentCompat = IMessageAcpToolCall['content'] & {
  _compact?: {
    truncated?: boolean;
    original_size?: number;
    preview_chars?: number;
  };
  update?: AcpToolCallUpdateCompat;
};

export function normalizeAcpToolCall(message: IMessageAcpToolCall): NormalizedToolCall | undefined {
  const content = message.content as AcpToolCallContentCompat | undefined;
  const update = content?.update;
  if (!update) return undefined;

  const rawInput = update.rawInput ?? update.raw_input;
  const input = rawInput ? formatValue(rawInput) : undefined;

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

  const keyParam = buildParamSummary(update.kind, rawInput);

  return {
    key: update.tool_call_id,
    name: update.title,
    status: normalizeAcpStatus(update.status),
    description: keyParam || (rawInput?.command as string) || update.kind,
    input,
    output,
    truncated: content?._compact?.truncated === true,
    messageId: message.id,
    conversationId: message.conversation_id,
    imagePath: getAcpImagePath(update),
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
  if (!call_id) return undefined;

  const displayInput = input
    ? formatValue(input)
    : args && Object.keys(args).length > 0
      ? formatValue(args)
      : undefined;

  return {
    key: call_id,
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
```

---

## normalizeToolCall.test.ts — 工具调用归一化单元测试

```typescript
import { describe, expect, it } from 'vitest';
import { normalizeToolCall } from './normalizeToolCall';

describe('normalizeToolCall', () => {
  it('ignores tool_call messages without call_id', () => {
    const result = normalizeToolCall({
      type: 'tool_call',
      content: {
        call_id: '',
        name: 'Glob',
        status: 'running',
        args: { pattern: '*.rs' },
      },
    } as any);

    expect(result).toBeUndefined();
  });
});
```

---

## sideQuestion.ts — 判断对话是否支持边栏问题

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';

type SideQuestionConversationType = TChatConversation['type'];

export type SideQuestionEligibilityTarget = {
  backend?: string;
  type: SideQuestionConversationType;
};

export function isSideQuestionSupported(target: SideQuestionEligibilityTarget): boolean {
  return target.type === 'acp' && target.backend === 'claude';
}
```

---

## imageGenCore.ts — 图片生成核心逻辑（MCP服务器/Gemini工具共享）

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared image generation logic used by both:
 * - The built-in MCP server (imageGenServer.ts)
 * - The legacy Gemini-specific tool (img-gen.ts)
 */

import * as fs from 'fs';
import * as path from 'path';
import { jsonrepair } from 'jsonrepair';
import type OpenAI from 'openai';
import { ClientFactory, type RotatingClient } from '@/common/api/ClientFactory';
import type { TProviderWithModel } from '@/common/config/storage';
import type { UnifiedChatCompletionResponse } from '@/common/api/RotatingApiClient';
import { IMAGE_EXTENSIONS, MIME_TYPE_MAP, MIME_TO_EXT_MAP, DEFAULT_IMAGE_EXTENSION } from '@/common/config/constants';

const API_TIMEOUT_MS = 120000; // 2 minutes for image generation API calls

type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

// ===== Utility Functions =====

export function safeJsonParse<T = unknown>(jsonString: string, fallbackValue: T): T {
  if (!jsonString || typeof jsonString !== 'string') {
    return fallbackValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (_error) {
    try {
      const repairedJson = jsonrepair(jsonString);
      return JSON.parse(repairedJson) as T;
    } catch (_repairError) {
      console.warn('[ImageGen] JSON parse failed:', jsonString.substring(0, 50));
      return fallbackValue;
    }
  }
}

export function isImageFile(file_path: string): boolean {
  const ext = path.extname(file_path).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext as ImageExtension);
}

export function isHttpUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

export async function fileToBase64(file_path: string): Promise<string> {
  try {
    const fileBuffer = await fs.promises.readFile(file_path);
    return fileBuffer.toString('base64');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('ENOENT') || errorMessage.includes('no such file')) {
      throw new Error(`Image file not found: ${file_path}`, { cause: error });
    }
    throw new Error(`Failed to read image file: ${errorMessage}`, { cause: error });
  }
}

export function getImageMimeType(file_path: string): string {
  const ext = path.extname(file_path).toLowerCase();
  return MIME_TYPE_MAP[ext] || MIME_TYPE_MAP[DEFAULT_IMAGE_EXTENSION];
}

export function getFileExtensionFromDataUrl(dataUrl: string): string {
  const mimeTypeMatch = dataUrl.match(/^data:image\/([^;]+);base64,/);
  if (mimeTypeMatch && mimeTypeMatch[1]) {
    const mimeType = mimeTypeMatch[1].toLowerCase();
    return MIME_TO_EXT_MAP[mimeType] || DEFAULT_IMAGE_EXTENSION;
  }
  return DEFAULT_IMAGE_EXTENSION;
}

export async function saveGeneratedImage(base64Data: string, workspaceDir: string): Promise<string> {
  const timestamp = Date.now();
  const fileExtension = getFileExtensionFromDataUrl(base64Data);
  const file_name = `img-${timestamp}${fileExtension}`;
  const file_path = path.join(workspaceDir, file_name);

  const base64WithoutPrefix = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
  const imageBuffer = Buffer.from(base64WithoutPrefix, 'base64');

  try {
    await fs.promises.writeFile(file_path, imageBuffer);
    return file_path;
  } catch (error) {
    console.error('[ImageGen] Failed to save image file:', error);
    throw new Error(`Failed to save image: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

// ===== Image Content Processing =====

interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail: 'auto' | 'low' | 'high';
  };
}

export async function processImageUri(imageUri: string, workspaceDir: string): Promise<ImageContent | null> {
  if (isHttpUrl(imageUri)) {
    return {
      type: 'image_url',
      image_url: { url: imageUri, detail: 'auto' },
    };
  }

  let processedUri = imageUri;
  if (imageUri.startsWith('@')) {
    processedUri = imageUri.substring(1);
  }

  let fullPath = processedUri;
  if (!path.isAbsolute(processedUri)) {
    fullPath = path.join(workspaceDir, processedUri);
  }

  try {
    await fs.promises.access(fullPath, fs.constants.F_OK);

    if (!isImageFile(fullPath)) {
      throw new Error(`File is not a supported image type: ${fullPath}`);
    }

    const base64Data = await fileToBase64(fullPath);
    const mimeType = getImageMimeType(fullPath);
    return {
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: 'auto' },
    };
  } catch (error) {
    const possiblePaths = [imageUri, path.join(workspaceDir, imageUri)].filter((p, i, arr) => arr.indexOf(p) === i);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Image file not found') || errorMessage.includes('not a supported image type')) {
      throw error;
    }

    throw new Error(
      `Image file not found. Searched paths:\n${possiblePaths.map((p) => `- ${p}`).join('\n')}\n\nPlease ensure the image file exists and has a valid image extension (.jpg, .png, .gif, .webp, etc.)`,
      { cause: error }
    );
  }
}

// ===== Core Execution =====

export interface ImageGenParams {
  prompt: string;
  image_uris?: string[] | string;
}

export interface ImageGenResult {
  success: boolean;
  text: string;
  imagePath?: string;
  relativeImagePath?: string;
  error?: string;
}

/**
 * Core image generation function shared between MCP server and Gemini tool.
 */
export async function executeImageGeneration(
  params: ImageGenParams,
  provider: TProviderWithModel,
  workspaceDir: string,
  proxy?: string,
  signal?: AbortSignal
): Promise<ImageGenResult> {
  if (signal?.aborted) {
    return { success: false, text: 'Image generation was cancelled.', error: 'cancelled' };
  }

  try {
    // Parse image URIs
    let imageUris: string[] = [];
    if (params.image_uris) {
      if (typeof params.image_uris === 'string') {
        const parsed = safeJsonParse<string[]>(params.image_uris, null);
        imageUris = Array.isArray(parsed) ? parsed : [params.image_uris];
      } else if (Array.isArray(params.image_uris)) {
        imageUris = params.image_uris;
      }
    }

    const hasImages = imageUris.length > 0;
    let enhancedPrompt: string;
    if (hasImages) {
      enhancedPrompt = `Analyze/Edit image: ${params.prompt}`;
    } else {
      enhancedPrompt = `Generate image: ${params.prompt}`;
    }

    const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: enhancedPrompt }];

    // Process image URIs
    if (hasImages) {
      const imageResults = await Promise.allSettled(imageUris.map((uri) => processImageUri(uri, workspaceDir)));

      const successful: ImageContent[] = [];
      const errors: string[] = [];

      imageResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          successful.push(result.value);
        } else {
          const error = result.status === 'rejected' ? result.reason : 'Unknown error';
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Image ${index + 1} (${imageUris[index]}): ${errorMessage}`);
        }
      });

      successful.forEach((imageContent) => contentParts.push(imageContent));

      if (successful.length === 0) {
        return {
          success: false,
          text: `Error: Failed to process any images. Errors:\n${errors.join('\n')}`,
          error: errors.join('\n'),
        };
      }
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'user', content: contentParts }];

    // Create client and call API
    const rotatingClient: RotatingClient = await ClientFactory.createRotatingClient(provider, {
      proxy,
      rotatingOptions: { maxRetries: 3, retryDelay: 1000 },
    });

    const completion: UnifiedChatCompletionResponse = await rotatingClient.createChatCompletion(
      { model: provider.use_model, messages: messages as any },
      { signal, timeout: API_TIMEOUT_MS }
    );

    const choice = completion.choices[0];
    if (!choice) {
      return { success: false, text: 'No response from image generation API', error: 'No response' };
    }

    const responseText = choice.message.content || 'Image generated successfully.';
    let images = choice.message.images;

    // Extract images from markdown in content if not in images field
    if ((!images || images.length === 0) && responseText) {
      const dataUrlRegex = /!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
      const dataUrlMatches = [...responseText.matchAll(dataUrlRegex)];
      if (dataUrlMatches.length > 0) {
        images = dataUrlMatches.map((match) => ({
          type: 'image_url' as const,
          image_url: { url: match[1] },
        }));
      } else {
        const file_pathRegex = /!\[[^\]]*\]\(([^)]+\.(?:jpg|jpeg|png|gif|webp|bmp|tiff|svg))\)/gi;
        const file_pathMatches = [...responseText.matchAll(file_pathRegex)];
        if (file_pathMatches.length > 0) {
          const processedImages: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
          for (const match of file_pathMatches) {
            const file_path = match[1];
            const fullPath = path.isAbsolute(file_path) ? file_path : path.join(workspaceDir, file_path);
            try {
              await fs.promises.access(fullPath);
              const base64Data = await fileToBase64(fullPath);
              const mimeType = getImageMimeType(fullPath);
              processedImages.push({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Data}` },
              });
            } catch (_fileError) {
              console.warn(`[ImageGen] Could not load image file: ${file_path}`);
            }
          }
          if (processedImages.length > 0) {
            images = processedImages;
          }
        }
      }
    }

    if (!images || images.length === 0) {
      const warningMessage = `Image generation did not produce any images.\n\nModel response: ${responseText}\n\nTip: Make sure your image generation model supports this type of request. Current model: ${provider.use_model}`;
      return { success: true, text: warningMessage };
    }

    const firstImage = images[0];
    if (firstImage.type === 'image_url' && firstImage.image_url?.url) {
      const imagePath = await saveGeneratedImage(firstImage.image_url.url, workspaceDir);
      const relativeImagePath = path.relative(workspaceDir, imagePath);

      // Strip any inline base64 data URLs from the human-readable text before
      // returning. The image is already saved to disk and referenced by path,
      // so re-emitting hundreds of MB of base64 in the MCP tool response just
      // forces the parent process to ship that payload through framed TCP again
      // (which is where the 2026-04-14 commit-charge blow-up happened).
      const cleanText = responseText.replace(
        /!\[[^\]]*\]\(data:image\/[^;]+;base64,[^)]+\)/g,
        '[embedded image extracted]'
      );

      return {
        success: true,
        text: `${cleanText}\n\nGenerated image saved to: ${imagePath}`,
        imagePath,
        relativeImagePath,
      };
    }

    return { success: true, text: responseText };
  } catch (error) {
    if (signal?.aborted) {
      return { success: false, text: 'Image generation was cancelled.', error: 'cancelled' };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ImageGen] API call failed:`, error);
    return { success: false, text: `Error generating image: ${errorMessage}`, error: errorMessage };
  }
}
```

---

## approval/ApprovalStore.ts — 审批存储，会话级"始终允许"缓存

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Common approval key interface for permission memory
 * Used by Gemini, ACP, and Codex agents
 */
export type IApprovalKey = {
  /** Operation type: exec, edit, read, info, etc. */
  action: string;
  /** Optional sub-type identifier (e.g., command name, tool name) */
  identifier?: string;
};

/**
 * Common approval store interface
 * Session-level cache for "always allow" decisions
 */
export type IApprovalStore<K extends IApprovalKey = IApprovalKey> = {
  /** Check if key is approved */
  isApproved(key: K): boolean;
  /** Store approval decision */
  approve(key: K): void;
  /** Clear all cached approvals */
  clear(): void;
  /** Number of cached approvals */
  readonly size: number;
};

/**
 * Base implementation of approval store
 * Subclasses can override serializeKey for custom key formats
 */
export class BaseApprovalStore<K extends IApprovalKey = IApprovalKey> implements IApprovalStore<K> {
  protected map = new Map<string, boolean>();

  /**
   * Serialize key to string for Map storage
   * Override this method for custom key serialization
   */
  protected serializeKey(key: K): string {
    return JSON.stringify({
      action: key.action,
      identifier: key.identifier || '',
    });
  }

  isApproved(key: K): boolean {
    return this.map.get(this.serializeKey(key)) === true;
  }

  approve(key: K): void {
    this.map.set(this.serializeKey(key), true);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  /**
   * Check if all keys are approved
   * Accepts base IApprovalKey type for compatibility with IPC calls
   */
  allApproved(keys: IApprovalKey[]): boolean {
    return keys.length > 0 && keys.every((k) => this.isApproved(k as K));
  }

  /**
   * Approve multiple keys at once
   * Accepts base IApprovalKey type for compatibility with IPC calls
   */
  approveAll(keys: IApprovalKey[]): void {
    keys.forEach((k) => this.approve(k as K));
  }
}
```

---

## approval/index.ts — approval 模块导出入口

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { BaseApprovalStore, type IApprovalKey, type IApprovalStore } from './ApprovalStore';
```

---

## document/DocumentConverter.ts — 文档转换器，Word/Excel ↔ Markdown

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 文档转换器 - Markdown 中心化
 *
 * 核心理念：所有可编辑文档都转换为 Markdown 进行统一编辑
 * Word/Excel → Markdown → 编辑 → Word/Excel/PDF
 */
export class DocumentConverter {
  /**
   * Word → Markdown
   * 使用 mammoth + turndown
   */
  async wordToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
    // 动态导入以减少初始加载
    const mammoth = await import('mammoth');
    const TurndownService = (await import('turndown')).default;
    const { gfm } = await import('turndown-plugin-gfm');

    // 1. Word → HTML
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;

    // 2. HTML → Markdown
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    turndown.use(gfm); // 支持 GitHub Flavored Markdown (表格等)

    const markdown = turndown.turndown(html);

    return markdown;
  }

  /**
   * Markdown → Word
   * 使用 docx 库将 Markdown 转换为 Word 文档
   */
  async markdownToWord(markdown: string): Promise<ArrayBuffer> {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

    // 简单实现：将 Markdown 段落转为 Word 段落
    // 更复杂的实现可以解析 Markdown AST
    const lines = markdown.split('\n');
    const paragraphs = [];

    for (const line of lines) {
      if (line.startsWith('# ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(2),
            heading: HeadingLevel.HEADING_1,
          })
        );
      } else if (line.startsWith('## ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(3),
            heading: HeadingLevel.HEADING_2,
          })
        );
      } else if (line.startsWith('### ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(4),
            heading: HeadingLevel.HEADING_3,
          })
        );
      } else if (line.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(line)],
          })
        );
      } else {
        // 空行
        paragraphs.push(new Paragraph({ text: '' }));
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    // 将 Buffer 转换为 ArrayBuffer
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }

  /**
   * Excel → Markdown (表格)
   * 使用 SheetJS
   */
  async excelToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
    const XLSX = await import('xlsx-republish');

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let markdown = '';

    workbook.SheetNames.forEach((sheetName) => {
      // 多个 Sheet 时添加标题
      if (workbook.SheetNames.length > 1) {
        markdown += `## ${sheetName}\n\n`;
      }

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (data.length === 0) return;

      // 表头
      const headers = data[0].map((cell: any) => String(cell || ''));
      markdown += `| ${headers.join(' | ')} |\n`;
      markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

      // 数据行
      for (let i = 1; i < data.length; i++) {
        const row = data[i].map((cell: any) => String(cell || ''));
        // 补齐列数
        while (row.length < headers.length) {
          row.push('');
        }
        markdown += `| ${row.join(' | ')} |\n`;
      }

      markdown += '\n';
    });

    return markdown;
  }

  /**
   * Markdown → Excel
   * 解析 Markdown 表格并转换为 Excel
   */
  async markdownToExcel(markdown: string): Promise<ArrayBuffer> {
    const XLSX = await import('xlsx-republish');

    const workbook = XLSX.utils.book_new();
    const sheets = this.parseMarkdownTables(markdown);

    sheets.forEach((sheet, index) => {
      const sheetName = sheet.name || `Sheet${index + 1}`;
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    const uint8Array = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    // 将 Uint8Array 转换为 ArrayBuffer
    return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
  }

  /**
   * 解析 Markdown 表格
   */
  private parseMarkdownTables(markdown: string): Array<{ name: string; data: any[][] }> {
    const sheets: Array<{ name: string; data: any[][] }> = [];
    const lines = markdown.split('\n');

    let currentSheet: { name: string; data: any[][] } | null = null;
    let currentTable: any[][] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 检测 Sheet 标题 (## Sheet名)
      if (line.startsWith('## ')) {
        // 保存上一个 Sheet
        if (currentSheet && currentTable.length > 0) {
          currentSheet.data = currentTable;
          sheets.push(currentSheet);
        }

        // 创建新 Sheet
        currentSheet = {
          name: line.substring(3).trim(),
          data: [],
        };
        currentTable = [];
        continue;
      }

      // 检测表格行
      if (line.startsWith('|')) {
        const cells = line
          .split('|')
          .filter((cell, idx, arr) => idx > 0 && idx < arr.length - 1)
          .map((cell) => cell.trim());

        // 跳过分隔行 (|---|---|)
        if (cells.every((cell) => /^-+$/.test(cell))) {
          continue;
        }

        currentTable.push(cells);
      } else if (currentTable.length > 0) {
        // 表格结束
        if (currentSheet) {
          currentSheet.data = currentTable;
          sheets.push(currentSheet);
          currentSheet = null;
        } else {
          sheets.push({ name: `Sheet${sheets.length + 1}`, data: currentTable });
        }
        currentTable = [];
      }
    }

    // 保存最后一个表格
    if (currentTable.length > 0) {
      if (currentSheet) {
        currentSheet.data = currentTable;
        sheets.push(currentSheet);
      } else {
        sheets.push({ name: `Sheet${sheets.length + 1}`, data: currentTable });
      }
    }

    return sheets;
  }
}

export const documentConverter = new DocumentConverter();
```

---

## navigation/index.ts — navigation 模块导出入口

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  NavigationInterceptor,
  NAVIGATION_TOOLS,
  CHROME_DEVTOOLS_IDENTIFIERS,
  MCP_PREFIXES,
  type NavigationToolName,
  type PreviewOpenData,
  type NavigationToolData,
  type InterceptionResult,
} from './NavigationInterceptor';
```

---

## navigation/NavigationInterceptor.ts — 导航拦截器，Chrome DevTools 导航拦截到预览面板

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { PreviewContentType } from '@/common/types/office/preview';
import { uuid } from '@/common/utils';

/**
 * Navigation tools that should be intercepted for preview
 * 需要拦截到预览面板的导航工具
 */
export const NAVIGATION_TOOLS = ['navigate_page', 'new_page'] as const;
export type NavigationToolName = (typeof NAVIGATION_TOOLS)[number];

/**
 * Chrome DevTools MCP server identifiers
 * Chrome DevTools MCP 服务器标识符
 */
export const CHROME_DEVTOOLS_IDENTIFIERS = ['chrome-devtools', 'chrome_devtools', 'chromedevtools'] as const;

/**
 * Common MCP prefixes to strip when normalizing tool names
 * 需要去除的常见 MCP 前缀
 */
export const MCP_PREFIXES = ['mcp__chrome-devtools__', 'chrome-devtools__', 'chrome-devtools.'] as const;

/**
 * Preview open event data structure
 * 预览打开事件数据结构
 */
export interface PreviewOpenData {
  content: string;
  contentType: PreviewContentType;
  metadata?: {
    title?: string;
  };
}

/**
 * Navigation tool data that can come from different agent formats
 * 来自不同 agent 格式的导航工具数据
 */
export interface NavigationToolData {
  // Tool identification
  tool_name?: string;
  server?: string;
  // URL sources (try in order)
  url?: string;
  arguments?: Record<string, unknown>;
  rawInput?: Record<string, unknown>;
  content?: Array<{ type?: string; content?: { type?: string; text?: string }; text?: string }>;
  title?: string;
}

/**
 * Interception result indicating what action was taken
 * 拦截结果，指示采取了什么行动
 */
export interface InterceptionResult {
  intercepted: boolean;
  url?: string;
  previewMessage?: IResponseMessage;
}

/**
 * Unified Navigation Interceptor for all agents
 * 所有 agent 的统一导航拦截器
 */
export class NavigationInterceptor {
  /**
   * Normalize tool name by stripping MCP prefixes and suffixes
   * 规范化工具名称，去除 MCP 前缀和后缀
   */
  static normalizeToolName(tool_name: string): string {
    if (!tool_name) return '';

    let normalized = tool_name;

    // Remove known prefixes
    for (const prefix of MCP_PREFIXES) {
      if (normalized.startsWith(prefix)) {
        normalized = normalized.slice(prefix.length);
        break;
      }
    }

    // Handle double underscore format (e.g., \"mcp__server__tool\")
    if (normalized.includes('__')) {
      normalized = normalized.split('__').pop() || normalized;
    }

    // Remove trailing parentheses like \"(chrome-devtools MCP Server)\"
    normalized = normalized.replace(/\s*\([^)]*\)\s*$/, '').trim();

    return normalized.toLowerCase();
  }

  /**
   * Check if a string contains chrome-devtools identifier
   * 检查字符串是否包含 chrome-devtools 标识符
   */
  static isChromeDevToolsIdentifier(str: string): boolean {
    if (!str) return false;
    const lower = str.toLowerCase();
    return CHROME_DEVTOOLS_IDENTIFIERS.some((id) => lower.includes(id));
  }

  /**
   * Check if a tool is a chrome-devtools navigation tool
   * 检查工具是否为 chrome-devtools 导航工具
   *
   * Handles various formats:
   * - \"navigate_page\"
   * - \"mcp__chrome-devtools__navigate_page\"
   * - \"navigate_page (chrome-devtools MCP Server)\"
   * - { server: \"chrome-devtools\", tool: \"navigate_page\" }
   */
  static isNavigationTool(data: NavigationToolData | string): boolean {
    if (typeof data === 'string') {
      // Simple string check
      const tool_name = data;
      const isChromeDevTools = this.isChromeDevToolsIdentifier(tool_name);
      const baseName = this.normalizeToolName(tool_name);
      const isNavTool = NAVIGATION_TOOLS.includes(baseName as NavigationToolName);
      return isChromeDevTools && isNavTool;
    }

    // Object-based check
    const { tool_name = '', server = '' } = data;
    const fullName = tool_name || '';

    // Check server field
    const serverIsChromeDevTools = this.isChromeDevToolsIdentifier(server);
    // Check tool name for chrome-devtools reference
    const tool_nameIsChromeDevTools = this.isChromeDevToolsIdentifier(fullName);

    const isChromeDevTools = serverIsChromeDevTools || tool_nameIsChromeDevTools;

    // Normalize and check if it's a navigation tool
    const baseName = this.normalizeToolName(fullName);
    const isNavTool = NAVIGATION_TOOLS.includes(baseName as NavigationToolName);

    return isChromeDevTools && isNavTool;
  }

  /**
   * Extract URL from navigation tool data
   * 从导航工具数据中提取 URL
   *
   * Tries multiple sources in order:
   * 1. Direct url field
   * 2. arguments.url
   * 3. rawInput.url
   * 4. URL pattern in content text
   * 5. URL pattern in title
   */
  static extractUrl(data: NavigationToolData): string | null {
    // 1. Direct url field
    if (data.url && typeof data.url === 'string') {
      return data.url;
    }

    // 2. Check arguments (common MCP format)
    if (data.arguments) {
      const url = this.extractUrlFromObject(data.arguments);
      if (url) return url;
    }

    // 3. Check rawInput (ACP format)
    if (data.rawInput) {
      const url = this.extractUrlFromObject(data.rawInput);
      if (url) return url;
    }

    // 4. Check content array for URL pattern
    if (data.content && Array.isArray(data.content)) {
      for (const item of data.content) {
        const text = item.text || item.content?.text || '';
        if (text) {
          const urlMatch = text.match(/https?:\/\/[^\s<>\"]+/i);
          if (urlMatch) {
            return urlMatch[0];
          }
        }
      }
    }

    // 5. Check title for URL pattern
    if (data.title) {
      const urlMatch = data.title.match(/https?:\/\/[^\s<>\"]+/i);
      if (urlMatch) {
        return urlMatch[0];
      }
    }

    return null;
  }

  /**
   * Extract URL from an object with common URL field names
   * 从具有常见 URL 字段名的对象中提取 URL
   */
  private static extractUrlFromObject(obj: Record<string, unknown>): string | null {
    const urlFields = ['url', 'URL', 'uri', 'URI', 'href', 'target'];

    for (const field of urlFields) {
      const value = obj[field];
      if (value && typeof value === 'string') {
        // Validate it looks like a URL
        if (value.startsWith('http://') || value.startsWith('https://')) {
          return value;
        }
      }
    }

    return null;
  }

  /**
   * Create a preview_open response message
   * 创建 preview_open 响应消息
   */
  static createPreviewMessage(url: string, conversation_id: string, title?: string): IResponseMessage {
    return {
      type: 'preview_open',
      conversation_id: conversation_id,
      msg_id: uuid(),
      turn_id: '',
      data: {
        content: url,
        contentType: 'url' as PreviewContentType,
        metadata: {
          title: title || `Browser: ${url}`,
        },
      },
    };
  }

  /**
   * Attempt to intercept navigation tool and create preview message
   * 尝试拦截导航工具并创建预览消息
   *
   * @returns InterceptionResult with intercepted status and optional preview message
   */
  static intercept(data: NavigationToolData, conversation_id: string): InterceptionResult {
    if (!this.isNavigationTool(data)) {
      return { intercepted: false };
    }

    const url = this.extractUrl(data);
    if (!url) {
      return { intercepted: false };
    }

    const previewMessage = this.createPreviewMessage(url, conversation_id);

    return {
      intercepted: true,
      url,
      previewMessage,
    };
  }
}

// Re-export for convenience
export { NavigationInterceptor as default };
```

---

## slash/types.ts — 斜杠命令类型定义

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Defines how a slash command is executed.
 * - `template`: Expands into a prompt template text
 * - `builtin`: Executes a built-in application action (e.g., /open for file picker)
 */
export type SlashCommandKind = 'template' | 'builtin';

/**
 * Defines what happens when the user selects a slash command from the menu.
 * - `execute`: run the command immediately
 * - `insert`: insert `/<name> ` into the input
 */
export type SlashCommandSelectionBehavior = 'execute' | 'insert';

/**
 * Defines what follow-up UX to use after a slash command is selected and the turn ends empty.
 */
export type SlashCommandCompletionBehavior = 'normal' | 'neutral_tip_on_empty';

/**
 * Indicates where the slash command originates from.
 * - `acp`: Provided by the ACP agent (e.g., Claude)
 * - `builtin`: Built into the application
 * - `skill`: A skill loaded into the current conversation
 */
export type SlashCommandSource = 'acp' | 'builtin' | 'skill';

/**
 * Live ACP available_commands payload as it appears on the websocket stream.
 */
export interface AcpAvailableCommand {
  name: string;
  description: string;
  hint?: string;
  input?: {
    hint?: string;
  };
  _meta?: {
    completion_behavior?: SlashCommandCompletionBehavior;
    empty_turn_tip_code?: string;
    empty_turn_tip_params?: Record<string, unknown>;
  };
}

/**
 * ACP slash command item returned by the HTTP slash-commands endpoint.
 */
export interface AcpSlashCommandApiItem {
  command: string;
  description: string;
  hint?: string;
  completion_behavior?: SlashCommandCompletionBehavior;
  empty_turn_tip_code?: string;
  empty_turn_tip_params?: Record<string, unknown>;
  completionBehavior?: SlashCommandCompletionBehavior;
  emptyTurnTipCode?: string;
  emptyTurnTipParams?: Record<string, unknown>;
}

/**
 * Represents a single slash command item in the autocomplete list.
 */
export interface SlashCommandItem {
  /** Command name without the leading slash (e.g., \"open\", \"test\") */
  name: string;
  /** Human-readable description shown in the dropdown */
  description: string;
  /** How the command is executed */
  kind: SlashCommandKind;
  /** Where the command comes from */
  source: SlashCommandSource;
  /** Optional keyboard hint (e.g., \"⌘O\") */
  hint?: string;
  /** Optional override for how selection behaves in the slash menu */
  selectionBehavior?: SlashCommandSelectionBehavior;
  /** Optional override for empty-turn completion behavior */
  completionBehavior?: SlashCommandCompletionBehavior;
  /** Optional localization code for the empty-turn neutral tip */
  emptyTurnTipCode?: string;
  /** Optional interpolation params for the empty-turn neutral tip */
  emptyTurnTipParams?: Record<string, unknown>;
}
```

---

## slash/acpMapping.ts — ACP 命令 → SlashCommandItem 映射

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AcpAvailableCommand,
  AcpSlashCommandApiItem,
  SlashCommandCompletionBehavior,
  SlashCommandItem,
} from './types';

type AcpSlashCommandLike = AcpAvailableCommand | AcpSlashCommandApiItem;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeCompletionBehavior = (value: unknown): SlashCommandCompletionBehavior | undefined => {
  if (value === 'normal' || value === 'neutral_tip_on_empty') {
    return value;
  }
  return undefined;
};

const isHttpSlashCommand = (command: AcpSlashCommandLike): command is AcpSlashCommandApiItem => 'command' in command;

const getHint = (command: AcpSlashCommandLike): string | undefined => {
  if (isHttpSlashCommand(command)) {
    return typeof command.hint === 'string' ? command.hint : undefined;
  }

  return typeof command.input?.hint === 'string' ? command.input.hint : undefined;
};

const getCompletionBehavior = (command: AcpSlashCommandLike): SlashCommandCompletionBehavior | undefined => {
  if (isHttpSlashCommand(command)) {
    return normalizeCompletionBehavior(command.completion_behavior ?? command.completionBehavior);
  }

  return normalizeCompletionBehavior(command._meta?.completion_behavior);
};

const getEmptyTurnTipCode = (command: AcpSlashCommandLike): string | undefined => {
  if (isHttpSlashCommand(command)) {
    const value = command.empty_turn_tip_code ?? command.emptyTurnTipCode;
    return typeof value === 'string' ? value : undefined;
  }

  return typeof command._meta?.empty_turn_tip_code === 'string' ? command._meta.empty_turn_tip_code : undefined;
};

const getEmptyTurnTipParams = (command: AcpSlashCommandLike): Record<string, unknown> | undefined => {
  if (isHttpSlashCommand(command)) {
    const value = command.empty_turn_tip_params ?? command.emptyTurnTipParams;
    return isObject(value) ? value : undefined;
  }

  return isObject(command._meta?.empty_turn_tip_params) ? command._meta.empty_turn_tip_params : undefined;
};

export const mapAcpCommandToSlashCommand = (command: AcpSlashCommandLike): SlashCommandItem => {
  const hint = getHint(command);
  const completionBehavior = getCompletionBehavior(command);
  const emptyTurnTipCode = getEmptyTurnTipCode(command);
  const emptyTurnTipParams = getEmptyTurnTipParams(command);

  return {
    name: 'command' in command ? command.command : command.name,
    description: command.description,
    kind: 'template',
    source: 'acp',
    selectionBehavior: 'insert',
    ...(hint ? { hint } : {}),
    ...(completionBehavior ? { completionBehavior } : {}),
    ...(emptyTurnTipCode ? { emptyTurnTipCode } : {}),
    ...(emptyTurnTipParams ? { emptyTurnTipParams } : {}),
  };
};

export const mapAcpCommandsToSlashCommands = (commands: readonly AcpSlashCommandLike[]): SlashCommandItem[] =>
  commands.map(mapAcpCommandToSlashCommand);
```

---

## slash/availability.ts — 判断斜杠命令列表是否可用

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Input parameters for determining slash command list availability.
 */
export interface SlashCommandListAvailabilityInput {
  /** Type of conversation (e.g., 'gemini', 'codex', 'acp') */
  conversation_type?: string;
  /** Current status for Codex conversations */
  codexStatus?: string | null;
}

/**
 * Determines whether the slash command autocomplete list should be enabled.
 *
 * Slash commands are supported by ACP and aionrs agent types. The backend's
 * `/slash-commands` endpoint returns an empty list for other agent types
 * (openclaw-gateway / nanobot / remote), so calling it from those is waste
 * (and additionally 404s when the agent has not been warmed up yet).
 *
 * Special case for Codex (an ACP vendor): commands are only available when the
 * session is fully active (`session_active`), because Codex CLI does not
 * support command queries during the connection phase.
 *
 * @param input - Conversation type and status information
 * @returns true if slash commands should be enabled
 */
export function isSlashCommandListEnabled(input: SlashCommandListAvailabilityInput): boolean {
  if (input.conversation_type === 'codex') {
    return input.codexStatus === 'session_active';
  }
  return input.conversation_type === 'acp' || input.conversation_type === 'aionrs';
}
```

---

## slash/guidSlashCommands.ts — 构建最终显示的斜杠命令列表

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mapAcpCommandsToSlashCommands } from './acpMapping';
import { buildSkillSlashCommands, mergeSlashCommands } from './mergeSlashCommands';
import type { AcpAvailableCommand, AcpSlashCommandApiItem, SlashCommandItem } from './types';

type AcpSlashCommandLike = AcpAvailableCommand | AcpSlashCommandApiItem;

type BuildGuidSlashCommandsInput = {
  builtinCommands: readonly SlashCommandItem[];
  agentCommands?: readonly SlashCommandItem[];
  selectedSkills: readonly string[];
  descriptionByName: ReadonlyMap<string, string>;
  skillFallbackDescription: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJsonPayload = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const isAcpSlashCommandLike = (value: unknown): value is AcpSlashCommandLike => {
  if (!isRecord(value) || typeof value.description !== 'string') {
    return false;
  }

  return typeof value.name === 'string' || typeof value.command === 'string';
};

const readCommandArray = (value: unknown): unknown[] => {
  const payload = parseJsonPayload(value);
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  if (Array.isArray(payload.available_commands)) {
    return payload.available_commands;
  }

  if (Array.isArray(payload.commands)) {
    return payload.commands;
  }

  return [];
};

export const mapAgentAvailableCommandsToSlashCommands = (value: unknown): SlashCommandItem[] => {
  const commands = readCommandArray(value).filter(isAcpSlashCommandLike);
  if (commands.length === 0) {
    return [];
  }

  return mapAcpCommandsToSlashCommands(commands);
};

export const buildGuidSlashCommands = ({
  builtinCommands,
  agentCommands,
  selectedSkills,
  descriptionByName,
  skillFallbackDescription,
}: BuildGuidSlashCommandsInput): SlashCommandItem[] => {
  const safeAgentCommands = agentCommands ?? [];
  const skillCommands =
    safeAgentCommands.length > 0
      ? []
      : buildSkillSlashCommands(selectedSkills, descriptionByName, skillFallbackDescription);

  return mergeSlashCommands(builtinCommands, safeAgentCommands, skillCommands);
};
```

---

## slash/mergeSlashCommands.ts — 斜杠命令合并去重

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommandItem } from './types';

/**
 * Builds slash command items for the skills loaded into the current
 * conversation. Skills are inserted as `/name ` templates (never executed
 * immediately) so the user can add arguments before sending.
 *
 * @param loadedSkills - Skill names mounted on the conversation (snapshot).
 * @param descriptionByName - Optional map from skill name to a human-readable
 *   description (from the global skills index). Names missing here fall back to
 *   `fallbackDescription`.
 * @param fallbackDescription - Shown when a skill has no indexed description.
 */
export function buildSkillSlashCommands(
  loadedSkills: readonly string[] | undefined,
  descriptionByName: ReadonlyMap<string, string>,
  fallbackDescription: string
): SlashCommandItem[] {
  if (!loadedSkills || loadedSkills.length === 0) {
    return [];
  }
  return loadedSkills.map((name) => ({
    name,
    description: descriptionByName.get(name) ?? fallbackDescription,
    kind: 'template',
    source: 'skill',
    selectionBehavior: 'insert',
  }));
}

/**
 * Merges the slash command groups into a single de-duplicated list. Earlier
 * groups win on name collisions, so the intended priority is:
 * builtin > ACP agent commands > session skills.
 */
export function mergeSlashCommands(
  builtin: readonly SlashCommandItem[],
  acp: readonly SlashCommandItem[],
  skills: readonly SlashCommandItem[]
): SlashCommandItem[] {
  const map = new Map<string, SlashCommandItem>();
  for (const group of [builtin, acp, skills]) {
    for (const command of group) {
      if (!map.has(command.name)) {
        map.set(command.name, command);
      }
    }
  }
  return Array.from(map.values());
}
```
