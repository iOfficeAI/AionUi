/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageCodexToolCall, CodexToolCallUpdate } from '@/common/chat/chatLib';
import React from 'react';
import ExecCommandDisplay from './ToolCallComponent/ExecCommandDisplay';
import WebSearchDisplay from './ToolCallComponent/WebSearchDisplay';
import PatchDisplay from './ToolCallComponent/PatchDisplay';
import McpToolDisplay from './ToolCallComponent/McpToolDisplay';
import TurnDiffDisplay from './ToolCallComponent/TurnDiffDisplay';
import GenericDisplay from './ToolCallComponent/GenericDisplay';

type ExecCommandContent = Extract<
  CodexToolCallUpdate,
  { subtype: 'exec_command_begin' | 'exec_command_output_delta' | 'exec_command_end' }
>;
type WebSearchContent = Extract<CodexToolCallUpdate, { subtype: 'web_search_begin' | 'web_search_end' }>;
type PatchContent = Extract<CodexToolCallUpdate, { subtype: 'patch_apply_begin' | 'patch_apply_end' }>;
type McpToolContent = Extract<CodexToolCallUpdate, { subtype: 'mcp_tool_call_begin' | 'mcp_tool_call_end' }>;
type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;
type GenericContent = Extract<CodexToolCallUpdate, { subtype: 'generic' }>;

const MessageCodexToolCall: React.FC<{ message: IMessageCodexToolCall }> = ({ message }) => {
  const { content } = message;
  const { subtype } = content;

  if (shouldHideInternalNativeToolCall(content)) return null;

  // Factory function: render different components based on subtype
  switch (subtype) {
    case 'exec_command_begin':
    case 'exec_command_output_delta':
    case 'exec_command_end':
      return <ExecCommandDisplay content={content as ExecCommandContent} />;

    case 'web_search_begin':
    case 'web_search_end':
      return <WebSearchDisplay content={content as WebSearchContent} />;

    case 'patch_apply_begin':
    case 'patch_apply_end':
      return <PatchDisplay content={content as PatchContent} />;

    case 'mcp_tool_call_begin':
    case 'mcp_tool_call_end':
      return <McpToolDisplay content={content as McpToolContent} />;

    case 'turn_diff':
      return <TurnDiffDisplay content={content as TurnDiffContent} />;

    case 'generic':
    default:
      return <GenericDisplay content={content as GenericContent} />;
  }
};

export function shouldHideInternalNativeToolCall(content: CodexToolCallUpdate): boolean {
  if (content.subtype === 'generic') {
    const data = asRecord(content.data);
    const method = typeof data?.method === 'string' ? data.method : undefined;
    return content.toolCallId.startsWith('native_') || isInternalNativeMethod(method);
  }

  if (content.subtype === 'mcp_tool_call_begin' || content.subtype === 'mcp_tool_call_end') {
    const data = asRecord(content.data);
    if (!data) return false;
    const hasInvocation = asRecord(data.invocation) !== undefined;
    const hasToolMetadata = typeof data.toolName === 'string' || typeof data.serverName === 'string';
    return !hasInvocation && !hasToolMetadata && ('name' in data || 'status' in data);
  }

  return false;
}

function isInternalNativeMethod(method?: string): boolean {
  return (
    method === 'error' ||
    method === 'thread/status/changed' ||
    method === 'mcpServer/startupStatus/updated' ||
    method?.startsWith('unknown/') === true
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export default MessageCodexToolCall;
