/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JSONL session parser — reads Claude Code session log files and produces parsed messages.
 * Adapted from claude-devtools (MIT license).
 */

import * as fs from 'fs';
import * as readline from 'readline';
import type { ChatHistoryEntry, ContentBlock, ParsedMessage, SessionMetrics, ToolCall, ToolResult, ToolUseContent, UsageMetadata } from './types';
import { EMPTY_METRICS } from './types';

/**
 * Estimate token count from text (chars / 4 approximation).
 */
export function countTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Extract tool calls from content blocks.
 */
function extractToolCalls(content: string | ContentBlock[]): ToolCall[] {
  if (typeof content === 'string') return [];
  const calls: ToolCall[] = [];

  for (const block of content) {
    if (block.type === 'tool_use') {
      const toolBlock = block as ToolUseContent;
      const isTask = toolBlock.name === 'Task';
      calls.push({
        id: toolBlock.id,
        name: toolBlock.name,
        input: toolBlock.input || {},
        isTask,
        taskDescription: isTask ? (toolBlock.input?.description as string) : undefined,
      });
    }
  }

  return calls;
}

/**
 * Extract tool results from a message entry.
 */
function extractToolResults(entry: ChatHistoryEntry): ToolResult[] {
  const results: ToolResult[] = [];

  // From toolUseResult field
  if (entry.toolUseResult) {
    results.push({
      toolUseId: entry.toolUseResult.toolUseId,
      content: entry.toolUseResult.content,
      isError: entry.toolUseResult.isError ?? false,
    });
  }

  // From content blocks
  const content = entry.message?.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'tool_result') {
        results.push({
          toolUseId: block.tool_use_id,
          content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
          isError: block.is_error ?? false,
        });
      }
    }
  }

  return results;
}

/**
 * Parse a single JSONL line into a ChatHistoryEntry.
 */
function parseJsonlLine(line: string): ChatHistoryEntry | null {
  try {
    const trimmed = line.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as ChatHistoryEntry;
  } catch {
    return null;
  }
}

/**
 * Parse a JSONL session file into an array of ParsedMessages.
 */
export async function parseJsonlFile(filePath: string): Promise<ParsedMessage[]> {
  const messages: ParsedMessage[] = [];

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineIndex = 0;

  for await (const line of rl) {
    const entry = parseJsonlLine(line);
    if (!entry) continue;

    // Skip non-conversational entries (e.g., file history snapshots, queue operations)
    if (!entry.type || !entry.message) continue;

    const timestamp = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();

    const parsed: ParsedMessage = {
      uuid: entry.uuid || `msg-${lineIndex}`,
      parentUuid: entry.parentUuid,
      type: entry.type as ParsedMessage['type'],
      role: entry.message.role || entry.type,
      content: entry.message.content || '',
      timestamp,
      usage: entry.message.usage,
      toolCalls: extractToolCalls(entry.message.content || ''),
      toolResults: extractToolResults(entry),
      isMeta: entry.isMeta,
      agentId: entry.agentId,
      model: entry.message.model,
      sourceToolUseID: entry.sourceToolUseID,
    };

    messages.push(parsed);
    lineIndex++;
  }

  return messages;
}

/**
 * Calculate session metrics from parsed messages.
 */
export function calculateMetrics(messages: ParsedMessage[]): SessionMetrics {
  if (messages.length === 0) return { ...EMPTY_METRICS };

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;

  for (const msg of messages) {
    const usage = msg.usage as UsageMetadata | undefined;
    if (!usage) continue;
    inputTokens += usage.input_tokens || 0;
    outputTokens += usage.output_tokens || 0;
    cacheReadTokens += usage.cache_read_input_tokens || 0;
    cacheCreationTokens += usage.cache_creation_input_tokens || 0;
  }

  const timestamps = messages.map((m) => m.timestamp).filter((t) => t > 0);
  const startTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const endTime = timestamps.length > 0 ? Math.max(...timestamps) : 0;

  return {
    durationMs: endTime - startTime,
    totalTokens: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    messageCount: messages.length,
  };
}

/**
 * Extract displayable text content from a message's content field.
 */
export function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;

  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      parts.push(block.text);
    } else if (block.type === 'thinking') {
      parts.push(block.thinking);
    }
  }
  return parts.join('\n');
}
