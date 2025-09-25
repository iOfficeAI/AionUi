/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexAgentEventType } from './eventTypes';

// Base event interface for extensibility
export interface BaseCodexEventData {
  call_id?: string;
  requestId?: number;
  _meta?: {
    requestId?: number;
    timestamp?: number;
    source?: string;
  };
}

// Session / lifecycle events
export interface SessionConfiguredData extends BaseCodexEventData {
  session_id: string;
  model?: string;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high' | null;
  history_log_id?: number;
  history_entry_count?: number;
  initial_messages?: unknown[] | null;
  rollout_path?: string | null;
}

export interface TaskStartedData extends BaseCodexEventData {
  model_context_window?: number | null;
}

export interface TaskCompleteData extends BaseCodexEventData {
  last_agent_message?: string | null;
}

// Message event data interfaces
export interface MessageDeltaData extends BaseCodexEventData {
  delta?: string;
  message?: string;
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

export interface MessageData extends BaseCodexEventData {
  message?: string;
}

export interface AgentReasoningData extends BaseCodexEventData {
  text?: string;
}

export interface AgentReasoningDeltaData extends BaseCodexEventData {
  delta: string;
}

export type InputMessageKind = 'plain' | 'user_instructions' | 'environment_context';

export interface UserMessageData extends BaseCodexEventData {
  message: string;
  kind?: InputMessageKind;
  images?: string[] | null;
}

export interface StreamErrorData extends BaseCodexEventData {
  message?: string;
  error?: string;
  code?: string;
  details?: unknown;
}

// Command execution event data interfaces
export interface ExecCommandBeginData extends BaseCodexEventData {
  command?: string[] | string;
  cwd?: string;
  parsed_cmd?: ParsedCommand[];
  // Back-compat
  workingDir?: string;
  env?: Record<string, string>;
}

export interface ExecCommandOutputDeltaData extends BaseCodexEventData {
  stream?: 'stdout' | 'stderr';
  chunk?: string | Buffer;
  encoding?: string;
}

export interface ExecCommandEndData extends BaseCodexEventData {
  stdout?: string;
  stderr?: string;
  aggregated_output?: string;
  exit_code?: number;
  duration?: string | number;
  formatted_output?: string;
}

// Patch/file modification event data interfaces
export interface PatchApprovalData extends BaseCodexEventData {
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

export interface PatchApplyBeginData extends BaseCodexEventData {
  call_id?: string;
  auto_approved?: boolean;
  changes?: Record<string, FileChange>;
  dryRun?: boolean;
}

export interface PatchApplyEndData extends BaseCodexEventData {
  call_id?: string;
  success?: boolean;
  error?: string;
  appliedChanges?: string[];
  failedChanges?: string[];
  stdout?: string;
  stderr?: string;
}

// MCP tool event data interfaces
export interface McpToolCallBeginData extends BaseCodexEventData {
  invocation?: McpInvocation;
  toolName?: string;
  serverName?: string;
}

export interface McpToolCallEndData extends BaseCodexEventData {
  invocation?: McpInvocation;
  result?: unknown;
  error?: string;
  duration?: string | number;
}

// Web search event data interfaces
export interface WebSearchBeginData extends BaseCodexEventData {
  call_id?: string;
}

export interface WebSearchEndData extends BaseCodexEventData {
  call_id?: string;
  query?: string;
  results?: SearchResult[];
}

// Token count event data interface
export interface TokenCountData extends BaseCodexEventData {
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

export type ExecOutputStream = 'stdout' | 'stderr';

export interface AgentReasoningRawContentData extends BaseCodexEventData {
  text: string;
}
export interface AgentReasoningRawContentDeltaData extends BaseCodexEventData {
  delta: string;
}

export interface ExecApprovalRequestData extends BaseCodexEventData {
  call_id?: string;
  command?: string[];
  cwd?: string;
  reason?: string | null;
}

export interface TurnDiffData extends BaseCodexEventData {
  unified_diff: string;
}

export interface ConversationPathResponseData extends BaseCodexEventData {
  conversation_id: string;
  path: string;
}

export interface GetHistoryEntryResponseData extends BaseCodexEventData {
  offset: number;
  log_id: number;
  entry?: unknown;
}

export interface McpListToolsResponseData extends BaseCodexEventData {
  tools: Record<string, unknown>;
}

export interface ListCustomPromptsResponseData extends BaseCodexEventData {
  custom_prompts: unknown[];
}

export interface TurnAbortedData extends BaseCodexEventData {
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
      data: BaseCodexEventData;
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

// Helper type for extracting specific event types
export type ExtractEventByType<T extends CodexAgentEventType> = Extract<CodexAgentEvent, { type: T }>;

export interface ElicitationCreateData extends BaseCodexEventData {
  codex_elicitation: string;
  message?: string;
  codex_command?: string | string[];
  codex_cwd?: string;
  codex_call_id?: string;
  codex_changes?: Record<string, FileChange>;
}
