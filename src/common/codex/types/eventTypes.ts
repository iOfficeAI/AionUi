/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Codex Agent Event Types
export enum CodexAgentEventType {
  // Session and configuration events
  SESSION_CONFIGURED = 'session_configured',
  TASK_STARTED = 'task_started',
  TASK_COMPLETE = 'task_complete',

  // Text & reasoning events
  AGENT_MESSAGE_DELTA = 'agent_message_delta',
  AGENT_MESSAGE = 'agent_message',
  USER_MESSAGE = 'user_message',
  AGENT_REASONING = 'agent_reasoning',
  AGENT_REASONING_DELTA = 'agent_reasoning_delta',
  AGENT_REASONING_RAW_CONTENT = 'agent_reasoning_raw_content',
  AGENT_REASONING_RAW_CONTENT_DELTA = 'agent_reasoning_raw_content_delta',
  AGENT_REASONING_SECTION_BREAK = 'agent_reasoning_section_break',

  // Usage / telemetry
  TOKEN_COUNT = 'token_count',

  // Command execution events
  EXEC_COMMAND_BEGIN = 'exec_command_begin',
  EXEC_COMMAND_OUTPUT_DELTA = 'exec_command_output_delta',
  EXEC_COMMAND_END = 'exec_command_end',
  EXEC_APPROVAL_REQUEST = 'exec_approval_request',

  // Patch/file modification events
  APPLY_PATCH_APPROVAL_REQUEST = 'apply_patch_approval_request',
  PATCH_APPLY_BEGIN = 'patch_apply_begin',
  PATCH_APPLY_END = 'patch_apply_end',

  // Elicitation & prompt approval
  ELICITATION_CREATE = 'elicitation/create',

  // MCP tool events
  MCP_TOOL_CALL_BEGIN = 'mcp_tool_call_begin',
  MCP_TOOL_CALL_END = 'mcp_tool_call_end',
  MCP_LIST_TOOLS_RESPONSE = 'mcp_list_tools_response',

  // Web search events
  WEB_SEARCH_BEGIN = 'web_search_begin',
  WEB_SEARCH_END = 'web_search_end',

  // Conversation history & context
  TURN_DIFF = 'turn_diff',
  GET_HISTORY_ENTRY_RESPONSE = 'get_history_entry_response',
  LIST_CUSTOM_PROMPTS_RESPONSE = 'list_custom_prompts_response',
  CONVERSATION_PATH = 'conversation_path',
  BACKGROUND_EVENT = 'background_event',
  TURN_ABORTED = 'turn_aborted',

  // Error channel
  STREAM_ERROR = 'stream_error',
}
