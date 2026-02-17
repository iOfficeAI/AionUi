/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DevTools types — adapted from claude-devtools' type system for AionUi integration.
 * Original source: https://github.com/matt1398/claude-devtools (MIT license)
 */

// ==================== Raw JSONL Types ====================

export type ContentBlock = TextContent | ThinkingContent | ToolUseContent | ToolResultContent;

export type TextContent = {
  type: 'text';
  text: string;
};

export type ThinkingContent = {
  type: 'thinking';
  thinking: string;
};

export type ToolUseContent = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResultContent = {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
};

export type UsageMetadata = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export type ChatHistoryEntry = {
  type: 'user' | 'assistant' | 'system' | 'summary' | 'queue-operation';
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
    usage?: UsageMetadata;
  };
  timestamp?: string;
  uuid?: string;
  parentUuid?: string;
  isMeta?: boolean;
  agentId?: string;
  toolUseResult?: { toolUseId?: string; content?: unknown; isError?: boolean; [key: string]: unknown };
  sourceToolUseID?: string;
  // For queue-operation entries written by AionUi hook system
  operation?: 'enqueue' | 'dequeue';
  content?: string;
  sessionId?: string;
  source?: string;
};

// ==================== Parsed Message ====================

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
  usage?: UsageMetadata;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  isMeta?: boolean;
  agentId?: string;
  model?: string;
  sourceToolUseID?: string;
};

// ==================== Session Metrics ====================

export type SessionMetrics = {
  durationMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  messageCount: number;
  costUsd?: number;
};

export const EMPTY_METRICS: SessionMetrics = {
  durationMs: 0,
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  messageCount: 0,
};

// ==================== Tool Execution ====================

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

// ==================== Semantic Steps ====================

export type SemanticStepType = 'thinking' | 'tool_call' | 'tool_result' | 'output' | 'subagent';

export type SemanticStep = {
  id: string;
  type: SemanticStepType;
  content: string;
  startTime: number;
  endTime?: number;
  tokens: {
    input: number;
    output: number;
  };
  // For tool_call / tool_result
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isError?: boolean;
  // For subagent
  subagentId?: string;
  subagentDescription?: string;
};

// ==================== Chunks ====================

export type ChunkType = 'user' | 'ai' | 'system' | 'compact';

export type BaseChunk = {
  id: string;
  chunkType: ChunkType;
  startTime: number;
  endTime: number;
  metrics: SessionMetrics;
};

export type UserChunk = BaseChunk & {
  chunkType: 'user';
  text: string;
  messageUuid: string;
};

export type AIChunk = BaseChunk & {
  chunkType: 'ai';
  responses: ParsedMessage[];
  toolExecutions: ToolExecution[];
  semanticSteps: SemanticStep[];
  subagentIds: string[];
};

export type SystemChunk = BaseChunk & {
  chunkType: 'system';
  text: string;
};

export type CompactChunk = BaseChunk & {
  chunkType: 'compact';
  text: string;
  tokenDelta?: number;
};

export type Chunk = UserChunk | AIChunk | SystemChunk | CompactChunk;

// ==================== Token Attribution ====================

export type TokenCategory = 'user' | 'assistant' | 'thinking' | 'tool_input' | 'tool_output' | 'system' | 'claude_md';

export type TokenAttribution = Record<TokenCategory, number>;

// ==================== Compaction Events ====================

export type CompactionEvent = {
  index: number;
  timestamp: number;
  tokensBefore: number;
  tokensAfter: number;
  delta: number;
  text: string;
};

// ==================== Subagent Analysis ====================

export type SubagentInfo = {
  agentId: string;
  description: string;
  parentToolUseId?: string;
  metrics: SessionMetrics;
  messageCount: number;
  toolNames: string[];
  startTime: number;
  endTime: number;
};

// ==================== Session Analysis (top-level result) ====================

export type SessionAnalysis = {
  sessionId: string;
  projectPath: string;
  metrics: SessionMetrics;
  chunks: Chunk[];
  messages: ParsedMessage[];
  tokenAttribution: TokenAttribution;
  compactionEvents: CompactionEvent[];
  toolExecutionSummary: ToolExecutionSummary[];
  subagents: SubagentInfo[];
  messageCount: number;
  model?: string;
  startTime: number;
  endTime: number;
};

export type ToolExecutionSummary = {
  toolName: string;
  count: number;
  totalDurationMs: number;
  errorCount: number;
};
