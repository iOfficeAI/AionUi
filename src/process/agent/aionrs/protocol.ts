/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// aionrs JSON Stream Protocol types
// Reference: aionrs/docs/json-stream-protocol.md

// ============================================
// Agent -> Client Events (stdout)
// ============================================

export type ToolCategory = 'info' | 'edit' | 'exec' | 'mcp';

export type ToolInfo = {
  name: string;
  category: ToolCategory;
  args: Record<string, unknown>;
  description: string;
};

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
};

export type AionrsEvent =
  | {
      type: 'ready';
      version: string;
      session_id?: string;
      capabilities: { tool_approval: boolean; thinking: boolean; mcp: boolean };
    }
  | { type: 'stream_start'; msg_id: string }
  | { type: 'text_delta'; text: string; msg_id: string }
  | { type: 'thinking'; text: string; msg_id: string }
  | {
      type: 'tool_request';
      msg_id: string;
      call_id: string;
      tool: ToolInfo;
    }
  | {
      type: 'tool_running';
      msg_id: string;
      call_id: string;
      tool_name: string;
    }
  | {
      type: 'tool_result';
      msg_id: string;
      call_id: string;
      tool_name: string;
      status: 'success' | 'error';
      output: string;
      output_type: 'text' | 'diff' | 'image';
      metadata?: Record<string, unknown>;
    }
  | { type: 'tool_cancelled'; msg_id: string; call_id: string; reason: string }
  | { type: 'stream_end'; msg_id: string; usage?: TokenUsage }
  | {
      type: 'error';
      msg_id: string | null;
      error: { code: string; message: string; retryable: boolean };
    }
  | { type: 'info'; msg_id: string; message: string };

// ============================================
// Client -> Agent Commands (stdin)
// ============================================

export type AionrsCommand =
  | { type: 'message'; msg_id: string; input: string; files?: string[] }
  | { type: 'stop' }
  | { type: 'tool_approve'; call_id: string; scope: 'once' | 'always' }
  | { type: 'tool_deny'; call_id: string; reason?: string }
  | { type: 'init_history'; text: string }
  | { type: 'set_mode'; mode: 'default' | 'auto_edit' | 'yolo' };
