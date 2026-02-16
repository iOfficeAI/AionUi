/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared frontend types for DevTools viewer components.
 * These mirror the backend types but are deserialized from JSON on the renderer side.
 */

// ==================== Parsed Message (deserialized) ====================

export type ContentBlock = {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  isTask: boolean;
  taskDescription?: string;
};

export type ToolResult = {
  toolUseId: string;
  content: string;
  isError: boolean;
};

export type ParsedMessage = {
  uuid: string;
  parentUuid?: string;
  type: 'user' | 'assistant' | 'system' | 'summary';
  role: string;
  content: string | ContentBlock[];
  timestamp: number;
  usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  isMeta?: boolean;
  agentId?: string;
  model?: string;
  sourceToolUseID?: string;
};

// ==================== Semantic Steps & Chunks ====================

export type SemanticStep = {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'output' | 'subagent';
  content: string;
  startTime: number;
  tokens: { input: number; output: number };
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isError?: boolean;
  subagentDescription?: string;
};

export type ToolExecution = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: string;
  isError: boolean;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  summary: string;
};

export type ChunkBase = {
  id: string;
  chunkType: 'user' | 'ai' | 'system' | 'compact';
  startTime: number;
  endTime: number;
};

export type UserChunk = ChunkBase & { chunkType: 'user'; text: string; messageUuid: string };
export type AIChunk = ChunkBase & { chunkType: 'ai'; semanticSteps: SemanticStep[]; toolExecutions: ToolExecution[]; subagentIds: string[] };
export type SystemChunk = ChunkBase & { chunkType: 'system'; text: string };
export type CompactChunk = ChunkBase & { chunkType: 'compact'; text: string; tokenDelta?: number };
export type Chunk = UserChunk | AIChunk | SystemChunk | CompactChunk;

// ==================== Context Injection ====================

export type ContextInjection = {
  type: string;
  source: string;
  tokenEstimate: number;
  preview: string;
};

export type MessageContextInfo = {
  uuid: string;
  injections: ContextInjection[];
  totalTokens: number;
};

// ==================== Colors ====================

export const TOKEN_COLORS: Record<string, string> = {
  user: '#3491FA',
  assistant: '#0FC6C2',
  thinking: '#F7BA1E',
  tool_input: '#722ED1',
  tool_output: '#9FDB1D',
  system: '#86909C',
  claude_md: '#F77234',
};

export const STEP_ICONS: Record<string, string> = {
  thinking: '\uD83D\uDCAD',
  tool_call: '\uD83D\uDD27',
  tool_result: '\uD83D\uDCCB',
  output: '\uD83D\uDCAC',
  subagent: '\uD83E\uDD16',
};

export const STEP_COLORS: Record<string, string> = {
  thinking: '#F7BA1E',
  tool_call: '#722ED1',
  tool_result: '#9FDB1D',
  output: '#0FC6C2',
  subagent: '#3491FA',
};

export const CONTEXT_TYPE_COLORS: Record<string, string> = {
  claude_md: '#F77234',
  file_content: '#9FDB1D',
  system_reminder: '#86909C',
  tool_result: '#9FDB1D',
  tool_input: '#722ED1',
  thinking: '#F7BA1E',
  user_input: '#3491FA',
  assistant_output: '#0FC6C2',
  unknown: '#C9CDD4',
};

export const CONTEXT_TYPE_LABELS: Record<string, string> = {
  claude_md: 'CLAUDE.md',
  file_content: 'File Content',
  system_reminder: 'System',
  tool_result: 'Tool Output',
  tool_input: 'Tool Input',
  thinking: 'Thinking',
  user_input: 'User Input',
  assistant_output: 'Assistant',
  unknown: 'Other',
};
