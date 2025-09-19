/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Codex Agent Event Types
export enum CodexAgentEventType {
  // Message events
  AGENT_MESSAGE_DELTA = 'agent_message_delta',
  AGENT_MESSAGE = 'agent_message',
  TASK_COMPLETE = 'task_complete',
  STREAM_ERROR = 'stream_error',

  // Reasoning events (internal, usually ignored)
  AGENT_REASONING_DELTA = 'agent_reasoning_delta',
  AGENT_REASONING = 'agent_reasoning',

  // Command execution events
  EXEC_COMMAND_BEGIN = 'exec_command_begin',
  EXEC_COMMAND_OUTPUT_DELTA = 'exec_command_output_delta',
  EXEC_COMMAND_END = 'exec_command_end',

  // Patch/file modification events
  APPLY_PATCH_APPROVAL_REQUEST = 'apply_patch_approval_request',
  ELICITATION_CREATE = 'elicitation/create',
  PATCH_APPLY_BEGIN = 'patch_apply_begin',
  PATCH_APPLY_END = 'patch_apply_end',

  // MCP tool events
  MCP_TOOL_CALL_BEGIN = 'mcp_tool_call_begin',
  MCP_TOOL_CALL_END = 'mcp_tool_call_end',

  // Web search events
  WEB_SEARCH_BEGIN = 'web_search_begin',
  WEB_SEARCH_END = 'web_search_end',
}

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

// Message event data interfaces
export interface MessageDeltaData extends BaseCodexEventData {
  delta?: string;
  message?: string;
}

export interface MessageData extends BaseCodexEventData {
  message?: string;
}

export interface StreamErrorData extends BaseCodexEventData {
  message?: string;
  error?: string;
  code?: string;
  details?: any;
}

// Command execution event data interfaces
export interface ExecCommandBeginData extends BaseCodexEventData {
  command?: string | string[];
  workingDir?: string;
  env?: Record<string, string>;
}

export interface ExecCommandOutputDeltaData extends BaseCodexEventData {
  stream?: 'stdout' | 'stderr';
  chunk?: string | Buffer;
  encoding?: string;
}

export interface ExecCommandEndData extends BaseCodexEventData {
  exit_code?: number;
  signal?: string;
  duration?: number;
}

// Patch/file modification event data interfaces
export interface PatchApprovalData extends BaseCodexEventData {
  codex_call_id?: string;
  changes?: Record<string, FileChange>;
  codex_changes?: Record<string, FileChange>;
  summary?: string;
  requiresConfirmation?: boolean;
}

export interface PatchApplyBeginData extends BaseCodexEventData {
  auto_approved?: boolean;
  changes?: Record<string, FileChange>;
  dryRun?: boolean;
}

export interface PatchApplyEndData extends BaseCodexEventData {
  success?: boolean;
  error?: string;
  appliedChanges?: string[];
  failedChanges?: string[];
}

// MCP tool event data interfaces
export interface McpToolCallBeginData extends BaseCodexEventData {
  invocation?: McpInvocation;
  toolName?: string;
  serverName?: string;
}

export interface McpToolCallEndData extends BaseCodexEventData {
  invocation?: McpInvocation;
  result?: any;
  error?: string;
  duration?: number;
}

// Web search event data interfaces
export interface WebSearchBeginData extends BaseCodexEventData {
  query?: string;
  engine?: string;
  options?: Record<string, any>;
}

export interface WebSearchEndData extends BaseCodexEventData {
  query?: string;
  results?: SearchResult[];
  resultCount?: number;
  duration?: number;
}

// Supporting interfaces
export interface FileChange {
  action?: 'create' | 'modify' | 'delete' | 'rename';
  content?: string;
  oldPath?: string;
  newPath?: string;
  mode?: string;
  size?: number;
  checksum?: string;
}

export interface McpInvocation {
  method?: string;
  name?: string;
  arguments?: Record<string, any>;
  toolId?: string;
  serverId?: string;
}

export interface SearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  score?: number;
  metadata?: Record<string, any>;
}

// Discriminated union for type-safe event handling
export type CodexAgentEvent =
  | {
      type: CodexAgentEventType.AGENT_MESSAGE_DELTA;
      data: MessageDeltaData;
    }
  | {
      type: CodexAgentEventType.AGENT_MESSAGE;
      data: MessageData;
    }
  | {
      type: CodexAgentEventType.TASK_COMPLETE;
      data: BaseCodexEventData;
    }
  | {
      type: CodexAgentEventType.STREAM_ERROR;
      data: StreamErrorData;
    }
  | {
      type: CodexAgentEventType.AGENT_REASONING_DELTA;
      data: BaseCodexEventData;
    }
  | {
      type: CodexAgentEventType.AGENT_REASONING;
      data: BaseCodexEventData;
    }
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
  | {
      type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST;
      data: PatchApprovalData;
    }
  | {
      type: CodexAgentEventType.ELICITATION_CREATE;
      data: PatchApprovalData;
    }
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
    };

// Manager configuration interface
export interface CodexAgentManagerData {
  conversation_id: string;
  workspace?: string;
  cliPath?: string;
}

// Helper type for extracting specific event types
export type ExtractEventByType<T extends CodexAgentEventType> = Extract<CodexAgentEvent, { type: T }>;
