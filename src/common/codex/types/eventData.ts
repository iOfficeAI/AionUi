/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexAgentEventType } from './eventTypes';

// JSON-RPC 消息的完整结构
export interface CodexJsonRpcEvent {
  jsonrpc: '2.0';
  method: 'codex/event';
  params: {
    _meta: {
      requestId: number;
      timestamp?: number;
      source?: string;
    };
    id: string;
    msg: CodexEventMessage;
  };
}

// params.msg 的结构 - 这是实际的事件数据
export interface CodexEventMessage {
  type: string;
  [key: string]: unknown;
}

// Session / lifecycle events
export interface SessionConfiguredData extends CodexEventMessage {
  type: 'session_configured';
  session_id: string;
  model?: string;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high' | null;
  history_log_id?: number;
  history_entry_count?: number;
  initial_messages?: unknown[] | null;
  rollout_path?: string | null;
}

export interface TaskStartedData extends CodexEventMessage {
  type: 'task_started';
  model_context_window: number;
}

export interface TaskCompleteData extends CodexEventMessage {
  type: 'task_complete';
  last_agent_message: string;
}

// Message event data interfaces
export interface MessageDeltaData extends CodexEventMessage {
  type: 'agent_message_delta';
  delta: string;
}

// JSON-RPC event parameter interfaces
export interface CodexEventParams {
  msg?: {
    type: string;
    [key: string]: unknown;
  };
  _meta?: {
    requestId?: number;
    [key: string]: unknown;
  };
  call_id?: string;
  codex_call_id?: string;
  changes?: Record<string, unknown>;
  codex_changes?: Record<string, unknown>;
}

export interface MessageData extends CodexEventMessage {
  type: 'agent_message';
  message: string;
}

export interface AgentReasoningData extends CodexEventMessage {
  type: 'agent_reasoning';
  text: string;
}

export interface AgentReasoningDeltaData extends CodexEventMessage {
  type: 'agent_reasoning_delta';
  delta: string;
}

export type InputMessageKind = 'plain' | 'user_instructions' | 'environment_context';

export interface UserMessageData extends CodexEventMessage {
  type: 'user_message';
  message: string;
  kind?: InputMessageKind;
  images?: string[] | null;
}

export interface StreamErrorData extends CodexEventMessage {
  type: 'stream_error';
  message?: string;
  error?: string;
  code?: string;
  details?: unknown;
}

// Command execution event data interfaces
export interface ExecCommandBeginData extends CodexEventMessage {
  type: 'exec_command_begin';
  call_id: string;
  command: string[];
  cwd: string;
  parsed_cmd?: ParsedCommand[];
}

export interface ExecCommandOutputDeltaData extends CodexEventMessage {
  type: 'exec_command_output_delta';
  call_id: string;
  stream: 'stdout' | 'stderr';
  chunk: string;
}

export interface ExecCommandEndData extends CodexEventMessage {
  type: 'exec_command_end';
  call_id: string;
  stdout: string;
  stderr: string;
  aggregated_output: string;
  exit_code: number;
  duration?: { secs: number; nanos: number };
  formatted_output?: string;
}

// Patch/file modification event data interfaces
export interface PatchApprovalData extends CodexEventMessage {
  type: 'apply_patch_approval_request';
  call_id?: string;
  codex_call_id?: string;
  changes?: Record<string, FileChange>;
  codex_changes?: Record<string, FileChange>;
  message?: string;
  summary?: string;
  requiresConfirmation?: boolean;
  reason?: string | null;
  grant_root?: string | null;
}

export interface PatchApplyBeginData extends CodexEventMessage {
  type: 'patch_apply_begin';
  call_id?: string;
  auto_approved?: boolean;
  changes?: Record<string, FileChange>;
  dryRun?: boolean;
}

export interface PatchApplyEndData extends CodexEventMessage {
  type: 'patch_apply_end';
  call_id?: string;
  success?: boolean;
  error?: string;
  appliedChanges?: string[];
  failedChanges?: string[];
  stdout?: string;
  stderr?: string;
}

// MCP tool event data interfaces
export interface McpToolCallBeginData extends CodexEventMessage {
  type: 'mcp_tool_call_begin';
  invocation?: McpInvocation;
  toolName?: string;
  serverName?: string;
}

export interface McpToolCallEndData extends CodexEventMessage {
  type: 'mcp_tool_call_end';
  invocation?: McpInvocation;
  result?: unknown;
  error?: string;
  duration?: string | number;
}

// Web search event data interfaces
export interface WebSearchBeginData extends CodexEventMessage {
  type: 'web_search_begin';
  call_id?: string;
}

export interface WebSearchEndData extends CodexEventMessage {
  type: 'web_search_end';
  call_id?: string;
  query?: string;
  results?: SearchResult[];
}

// Token count event data interface
export interface TokenCountData extends CodexEventMessage {
  type: 'token_count';
  info?: {
    total_token_usage?: {
      input_tokens?: number;
      cached_input_tokens?: number;
      output_tokens?: number;
      reasoning_output_tokens?: number;
      total_tokens?: number;
    };
    last_token_usage?: {
      input_tokens?: number;
      cached_input_tokens?: number;
      output_tokens?: number;
      reasoning_output_tokens?: number;
      total_tokens?: number;
    };
    model_context_window?: number;
  };
}

// Supporting interfaces
export type FileChange =
  | { type: 'add'; content: string }
  | { type: 'delete'; content: string }
  | { type: 'update'; unified_diff: string; move_path?: string | null }
  | {
      // Legacy/back‑compat
      action?: 'create' | 'modify' | 'delete' | 'rename';
      content?: string;
      oldPath?: string;
      newPath?: string;
      mode?: string;
      size?: number;
      checksum?: string;
    };

export interface McpInvocation {
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  // compat
  method?: string;
  name?: string;
  toolId?: string;
  serverId?: string;
}

export interface SearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export type ParsedCommand = { type: 'read'; cmd: string; name: string } | { type: 'list_files'; cmd: string; path?: string | null } | { type: 'search'; cmd: string; query?: string | null; path?: string | null } | { type: 'unknown'; cmd: string };

export interface AgentReasoningRawContentData extends CodexEventMessage {
  type: 'agent_reasoning_raw_content';
  text: string;
}
export interface AgentReasoningRawContentDeltaData extends CodexEventMessage {
  type: 'agent_reasoning_raw_content_delta';
  delta: string;
}

export interface ExecApprovalRequestData extends CodexEventMessage {
  type: 'exec_approval_request';
  call_id: string;
  command: string[];
  cwd: string;
  reason: string | null;
}

export interface TurnDiffData extends CodexEventMessage {
  type: 'turn_diff';
  unified_diff: string;
}

export interface ConversationPathResponseData extends CodexEventMessage {
  type: 'conversation_path';
  conversation_id: string;
  path: string;
}

export interface GetHistoryEntryResponseData extends CodexEventMessage {
  type: 'get_history_entry_response';
  offset: number;
  log_id: number;
  entry?: unknown;
}

export interface McpListToolsResponseData extends CodexEventMessage {
  type: 'mcp_list_tools_response';
  tools: Record<string, unknown>;
}

export interface ListCustomPromptsResponseData extends CodexEventMessage {
  type: 'list_custom_prompts_response';
  custom_prompts: unknown[];
}

export interface TurnAbortedData extends CodexEventMessage {
  type: 'turn_aborted';
  reason: 'interrupted' | 'replaced';
}

// Discriminated union for type-safe event handling
export type CodexAgentEvent =
  | {
      type: CodexAgentEventType.SESSION_CONFIGURED;
      data: SessionConfiguredData;
    }
  | {
      type: CodexAgentEventType.TASK_STARTED;
      data: TaskStartedData;
    }
  | {
      type: CodexAgentEventType.TASK_COMPLETE;
      data: TaskCompleteData;
    }
  | {
      type: CodexAgentEventType.AGENT_MESSAGE_DELTA;
      data: MessageDeltaData;
    }
  | {
      type: CodexAgentEventType.AGENT_MESSAGE;
      data: MessageData;
    }
  | {
      type: CodexAgentEventType.USER_MESSAGE;
      data: UserMessageData;
    }
  | {
      type: CodexAgentEventType.STREAM_ERROR;
      data: StreamErrorData;
    }
  | {
      type: CodexAgentEventType.AGENT_REASONING_DELTA;
      data: AgentReasoningDeltaData;
    }
  | {
      type: CodexAgentEventType.AGENT_REASONING;
      data: AgentReasoningData;
    }
  | { type: CodexAgentEventType.AGENT_REASONING_RAW_CONTENT; data: AgentReasoningRawContentData }
  | { type: CodexAgentEventType.AGENT_REASONING_RAW_CONTENT_DELTA; data: AgentReasoningRawContentDeltaData }
  | {
      type: CodexAgentEventType.EXEC_COMMAND_BEGIN;
      data: ExecCommandBeginData;
    }
  | {
      type: CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA;
      data: ExecCommandOutputDeltaData;
    }
  | {
      type: CodexAgentEventType.EXEC_COMMAND_END;
      data: ExecCommandEndData;
    }
  | { type: CodexAgentEventType.EXEC_APPROVAL_REQUEST; data: ExecApprovalRequestData }
  | {
      type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST;
      data: PatchApprovalData;
    }
  | { type: CodexAgentEventType.ELICITATION_CREATE; data: ElicitationCreateData }
  | {
      type: CodexAgentEventType.PATCH_APPLY_BEGIN;
      data: PatchApplyBeginData;
    }
  | {
      type: CodexAgentEventType.PATCH_APPLY_END;
      data: PatchApplyEndData;
    }
  | {
      type: CodexAgentEventType.MCP_TOOL_CALL_BEGIN;
      data: McpToolCallBeginData;
    }
  | {
      type: CodexAgentEventType.MCP_TOOL_CALL_END;
      data: McpToolCallEndData;
    }
  | {
      type: CodexAgentEventType.WEB_SEARCH_BEGIN;
      data: WebSearchBeginData;
    }
  | {
      type: CodexAgentEventType.WEB_SEARCH_END;
      data: WebSearchEndData;
    }
  | {
      type: CodexAgentEventType.TOKEN_COUNT;
      data: TokenCountData;
    }
  | {
      type: CodexAgentEventType.AGENT_REASONING_SECTION_BREAK;
      data: Record<string, never>; // Section break event carries no data
    }
  | { type: CodexAgentEventType.TURN_DIFF; data: TurnDiffData }
  | { type: CodexAgentEventType.GET_HISTORY_ENTRY_RESPONSE; data: GetHistoryEntryResponseData }
  | { type: CodexAgentEventType.MCP_LIST_TOOLS_RESPONSE; data: McpListToolsResponseData }
  | { type: CodexAgentEventType.LIST_CUSTOM_PROMPTS_RESPONSE; data: ListCustomPromptsResponseData }
  | { type: CodexAgentEventType.CONVERSATION_PATH; data: ConversationPathResponseData }
  | { type: CodexAgentEventType.BACKGROUND_EVENT; data: { message: string } }
  | { type: CodexAgentEventType.TURN_ABORTED; data: TurnAbortedData };

// Manager configuration interface
export interface CodexAgentManagerData {
  conversation_id: string;
  workspace?: string;
  cliPath?: string;
}

export interface ElicitationCreateData extends CodexEventMessage {
  type: 'elicitation_create';
  codex_elicitation: string;
  message?: string;
  codex_command?: string | string[];
  codex_cwd?: string;
  codex_call_id?: string;
  codex_changes?: Record<string, FileChange>;
}
