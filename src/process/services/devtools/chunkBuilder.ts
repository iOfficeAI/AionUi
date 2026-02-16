/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chunk builder — transforms classified messages into visualization chunks.
 * Adapted from claude-devtools (MIT license).
 */

import { extractTextContent, calculateMetrics } from './jsonlParser';
import { classifyMessages } from './messageClassifier';
import { buildToolExecutions } from './toolAnalysis';
import type { AIChunk, Chunk, CompactChunk, ContentBlock, ParsedMessage, SemanticStep, SystemChunk, UserChunk } from './types';
import { EMPTY_METRICS } from './types';

let chunkCounter = 0;

function nextChunkId(): string {
  return `chunk-${++chunkCounter}`;
}

/**
 * Build a UserChunk from a user message.
 */
function buildUserChunk(message: ParsedMessage): UserChunk {
  return {
    id: nextChunkId(),
    chunkType: 'user',
    startTime: message.timestamp,
    endTime: message.timestamp,
    metrics: { ...EMPTY_METRICS, messageCount: 1 },
    text: extractTextContent(message.content),
    messageUuid: message.uuid,
  };
}

/**
 * Build a SystemChunk from a system output message.
 */
function buildSystemChunk(message: ParsedMessage): SystemChunk {
  const text = extractTextContent(message.content);
  // Extract content from <local-command-stdout> tags if present
  const match = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
  return {
    id: nextChunkId(),
    chunkType: 'system',
    startTime: message.timestamp,
    endTime: message.timestamp,
    metrics: { ...EMPTY_METRICS, messageCount: 1 },
    text: match ? match[1].trim() : text,
  };
}

/**
 * Build a CompactChunk from a compaction message.
 */
function buildCompactChunk(message: ParsedMessage): CompactChunk {
  return {
    id: nextChunkId(),
    chunkType: 'compact',
    startTime: message.timestamp,
    endTime: message.timestamp,
    metrics: { ...EMPTY_METRICS, messageCount: 1 },
    text: extractTextContent(message.content),
  };
}

/**
 * Extract semantic steps from AI chunk responses.
 */
function extractSemanticSteps(responses: ParsedMessage[]): SemanticStep[] {
  const steps: SemanticStep[] = [];
  let stepIndex = 0;

  for (const msg of responses) {
    const content = msg.content;

    if (msg.type === 'assistant' && Array.isArray(content)) {
      for (const block of content as ContentBlock[]) {
        if (block.type === 'thinking' && block.thinking) {
          steps.push({
            id: `step-${++stepIndex}`,
            type: 'thinking',
            content: block.thinking,
            startTime: msg.timestamp,
            tokens: {
              input: 0,
              output: Math.ceil(block.thinking.length / 4),
            },
          });
        } else if (block.type === 'tool_use') {
          steps.push({
            id: `step-${++stepIndex}`,
            type: 'tool_call',
            content: `${block.name}: ${JSON.stringify(block.input).slice(0, 200)}`,
            startTime: msg.timestamp,
            toolName: block.name,
            toolInput: block.input,
            tokens: {
              input: 0,
              output: Math.ceil(JSON.stringify(block.input).length / 4),
            },
          });
        } else if (block.type === 'text' && block.text && block.text.trim()) {
          steps.push({
            id: `step-${++stepIndex}`,
            type: 'output',
            content: block.text,
            startTime: msg.timestamp,
            tokens: {
              input: 0,
              output: Math.ceil(block.text.length / 4),
            },
          });
        }
      }
    }

    // Tool results from user messages (fed back to assistant)
    if (msg.toolResults.length > 0) {
      for (const result of msg.toolResults) {
        const resultContent = result.content || '';
        steps.push({
          id: `step-${++stepIndex}`,
          type: 'tool_result',
          content: resultContent.slice(0, 500),
          startTime: msg.timestamp,
          isError: result.isError,
          tokens: {
            input: Math.ceil(resultContent.length / 4),
            output: 0,
          },
        });
      }
    }

    // Detect Task (subagent) calls
    for (const call of msg.toolCalls) {
      if (call.isTask) {
        steps.push({
          id: `step-${++stepIndex}`,
          type: 'subagent',
          content: call.taskDescription || 'Subagent task',
          startTime: msg.timestamp,
          subagentDescription: call.taskDescription,
          tokens: { input: 0, output: 0 },
        });
      }
    }
  }

  return steps;
}

/**
 * Build an AIChunk from a buffer of AI messages.
 */
function buildAIChunk(responses: ParsedMessage[]): AIChunk {
  if (responses.length === 0) {
    return {
      id: nextChunkId(),
      chunkType: 'ai',
      startTime: 0,
      endTime: 0,
      metrics: { ...EMPTY_METRICS },
      responses: [],
      toolExecutions: [],
      semanticSteps: [],
      subagentIds: [],
    };
  }

  const metrics = calculateMetrics(responses);
  const timestamps = responses.map((r) => r.timestamp).filter((t) => t > 0);
  const startTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const endTime = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  const toolExecutions = buildToolExecutions(responses);
  const semanticSteps = extractSemanticSteps(responses);

  // Collect subagent IDs from Task tool calls
  const subagentIds: string[] = [];
  for (const r of responses) {
    for (const c of r.toolCalls) {
      if (c.isTask) subagentIds.push(c.id);
    }
  }

  return {
    id: nextChunkId(),
    chunkType: 'ai',
    startTime,
    endTime,
    metrics,
    responses,
    toolExecutions,
    semanticSteps,
    subagentIds,
  };
}

/**
 * Build all chunks from raw messages.
 * This is the main entry point for chunk building.
 */
export function buildChunks(messages: ParsedMessage[]): Chunk[] {
  // Filter to main thread messages only (no sidechain/subagent messages)
  const mainMessages = messages.filter((m) => !m.agentId);

  const classified = classifyMessages(mainMessages);
  const chunks: Chunk[] = [];
  let aiBuffer: ParsedMessage[] = [];

  const flushAIBuffer = () => {
    if (aiBuffer.length > 0) {
      chunks.push(buildAIChunk(aiBuffer));
      aiBuffer = [];
    }
  };

  for (const { message, category } of classified) {
    switch (category) {
      case 'user':
        flushAIBuffer();
        chunks.push(buildUserChunk(message));
        break;
      case 'system':
        flushAIBuffer();
        chunks.push(buildSystemChunk(message));
        break;
      case 'compact':
        flushAIBuffer();
        chunks.push(buildCompactChunk(message));
        break;
      case 'ai':
        aiBuffer.push(message);
        break;
      case 'hardNoise':
        // Filtered out entirely
        break;
    }
  }

  flushAIBuffer();
  return chunks;
}
