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

export type AionrsCapabilities = {
  tool_approval: boolean;
  thinking: boolean;
  effort: boolean;
  effort_levels: string[];
  modes: string[];
  current_mode: string;
  mcp: boolean;
  current_model?: string;
  available_models?: Array<{
    id: string;
    display_name?: string;
    context_window?: number;
    effort_levels?: string[];
    default_effort?: string;
  }>;
  account_limits?: {
    plan_type?: string;
    limits: Array<{
      limit_id?: string;
      limit_name?: string;
      primary?: {
        used_percent: number;
        window_minutes?: number;
        resets_at?: number;
      };
      secondary?: {
        used_percent: number;
        window_minutes?: number;
        resets_at?: number;
      };
      credits?: {
        has_credits: boolean;
        unlimited: boolean;
        balance?: string;
      };
    }>;
  };
  context_limit?: number;
  compaction?: {
    enabled: boolean;
    context_window: number;
    output_reserve: number;
    autocompact_trigger: number;
    emergency_limit: number;
  };
};

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const MINUTES_PER_MONTH = 30 * MINUTES_PER_DAY;
const ROUNDING_BIAS_MINUTES = 3;

export type AionrsAccountLimits = NonNullable<AionrsCapabilities['account_limits']>;
export type AionrsAccountLimit = AionrsAccountLimits['limits'][number];
export type AionrsAccountLimitWindow = NonNullable<AionrsAccountLimit['primary']>;
export type AionrsAccountCredits = NonNullable<AionrsAccountLimit['credits']>;

export function humanizeAionrsIdentifier(value: string): string {
  return value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function getAionrsLimitBucketPrefix(limit: AionrsAccountLimit): string | null {
  const name = (limit.limit_name || limit.limit_id)?.replace(/_/g, '-');
  if (!name) {
    return null;
  }
  return name.toLowerCase() === 'codex' ? null : name;
}

export function describeAionrsLimitWindow(windowMinutes?: number, fallback = '5h'): string {
  if (!windowMinutes || !Number.isFinite(windowMinutes)) {
    return fallback;
  }

  const normalizedMinutes = Math.max(1, Math.floor(windowMinutes));

  if (normalizedMinutes <= MINUTES_PER_DAY + ROUNDING_BIAS_MINUTES) {
    const adjustedMinutes = normalizedMinutes + ROUNDING_BIAS_MINUTES;
    const hours = Math.max(1, Math.floor(adjustedMinutes / MINUTES_PER_HOUR));
    return `${hours}h`;
  }

  if (normalizedMinutes <= MINUTES_PER_WEEK + ROUNDING_BIAS_MINUTES) {
    return 'weekly';
  }

  if (normalizedMinutes <= MINUTES_PER_MONTH + ROUNDING_BIAS_MINUTES) {
    return 'monthly';
  }

  return 'annual';
}

export function formatAionrsLimitLabel(
  limit: AionrsAccountLimit,
  window: Pick<AionrsAccountLimitWindow, 'window_minutes'> | undefined,
  fallback: string
): string {
  const bucketPrefix = getAionrsLimitBucketPrefix(limit);
  const duration = describeAionrsLimitWindow(window?.window_minutes, fallback);
  return bucketPrefix ? `${bucketPrefix} ${duration}` : duration;
}

export function getAionrsRemainingPercent(usedPercent: number): number {
  const normalizedUsed = Math.min(100, Math.max(0, usedPercent));
  return Math.min(100, Math.max(0, 100 - normalizedUsed));
}

export function formatAionrsPercent(value: number): string {
  return Math.abs(value - Math.round(value)) < 0.05 ? `${Math.round(value)}%` : `${value.toFixed(1)}%`;
}

export type AionrsEvent =
  | {
      type: 'ready';
      version: string;
      session_id?: string;
      capabilities: AionrsCapabilities;
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
  | { type: 'info'; msg_id: string; message: string }
  | {
      type: 'provider_retry';
      msg_id: string;
      attempt: number;
      max_retries: number;
      delay_ms: number;
      error: string;
    }
  | { type: 'config_changed'; capabilities: AionrsCapabilities }
  | { type: 'mcp_ready'; name: string; tools: string[] };

// ============================================
// Client -> Agent Commands (stdin)
// ============================================

export type AionrsCommand =
  | { type: 'message'; msg_id: string; content: string; files?: string[] }
  | { type: 'stop' }
  | { type: 'tool_approve'; call_id: string; scope: 'once' | 'always' }
  | { type: 'tool_deny'; call_id: string; reason?: string }
  | { type: 'init_history'; text: string }
  | { type: 'set_mode'; mode: 'default' | 'auto_edit' | 'yolo' }
  | {
      type: 'set_config';
      model?: string;
      thinking?: string;
      thinking_budget?: number;
      effort?: string;
    }
  | {
      type: 'add_mcp_server';
      name: string;
      transport: string;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      headers?: Record<string, string>;
    };
