/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool execution analysis — matches tool calls with results and builds execution records.
 * Adapted from claude-devtools (MIT license).
 */

import type { ParsedMessage, ToolExecution, ToolExecutionSummary } from './types';

/**
 * Generate a human-readable summary for a tool call.
 */
export function getToolSummary(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
      return `Read ${(input.file_path as string) || (input.path as string) || 'file'}`;
    case 'Edit':
    case 'Write':
      return `${toolName} ${(input.file_path as string) || (input.path as string) || 'file'}`;
    case 'Bash':
      return `${(input.description as string) || (input.command as string)?.slice(0, 80) || 'command'}`;
    case 'Grep':
      return `Grep "${(input.pattern as string) || ''}"`;
    case 'Glob':
      return `Glob "${(input.pattern as string) || ''}"`;
    case 'Task':
      return `Task: ${(input.description as string) || 'subagent'}`;
    case 'WebFetch':
      try {
        const url = new URL(input.url as string);
        return `Fetch ${url.hostname}`;
      } catch {
        return `Fetch ${(input.url as string)?.slice(0, 40) || 'URL'}`;
      }
    case 'WebSearch':
      return `Search "${(input.query as string) || ''}"`;
    case 'TodoWrite':
      return 'Update todo list';
    case 'NotebookEdit':
      return `Edit notebook ${(input.notebook_path as string) || ''}`;
    default:
      return toolName;
  }
}

/**
 * Build tool executions by matching tool calls with their results across messages.
 */
export function buildToolExecutions(messages: ParsedMessage[]): ToolExecution[] {
  // First pass: collect all tool calls into a map
  const callMap = new Map<string, { call: ParsedMessage['toolCalls'][0]; startTime: number; messageIndex: number }>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    for (const call of msg.toolCalls) {
      callMap.set(call.id, { call, startTime: msg.timestamp, messageIndex: i });
    }
  }

  // Second pass: match with results
  const matchedIds = new Set<string>();
  const executions: ToolExecution[] = [];

  for (const msg of messages) {
    for (const result of msg.toolResults) {
      const callInfo = callMap.get(result.toolUseId);
      if (callInfo) {
        matchedIds.add(result.toolUseId);
        const durationMs = msg.timestamp > callInfo.startTime ? msg.timestamp - callInfo.startTime : undefined;
        executions.push({
          id: callInfo.call.id,
          toolName: callInfo.call.name,
          input: callInfo.call.input,
          result: result.content,
          isError: result.isError,
          startTime: callInfo.startTime,
          endTime: msg.timestamp,
          durationMs,
          summary: getToolSummary(callInfo.call.name, callInfo.call.input),
        });
      }
    }
  }

  // Add unmatched calls (pending or no result captured)
  for (const [id, info] of callMap) {
    if (!matchedIds.has(id)) {
      executions.push({
        id,
        toolName: info.call.name,
        input: info.call.input,
        isError: false,
        startTime: info.startTime,
        summary: getToolSummary(info.call.name, info.call.input),
      });
    }
  }

  // Sort by start time
  executions.sort((a, b) => a.startTime - b.startTime);
  return executions;
}

/**
 * Build a summary of tool usage across the session.
 */
export function buildToolExecutionSummary(executions: ToolExecution[]): ToolExecutionSummary[] {
  const summaryMap = new Map<string, ToolExecutionSummary>();

  for (const exec of executions) {
    const existing = summaryMap.get(exec.toolName);
    if (existing) {
      existing.count++;
      existing.totalDurationMs += exec.durationMs || 0;
      if (exec.isError) existing.errorCount++;
    } else {
      summaryMap.set(exec.toolName, {
        toolName: exec.toolName,
        count: 1,
        totalDurationMs: exec.durationMs || 0,
        errorCount: exec.isError ? 1 : 0,
      });
    }
  }

  return Array.from(summaryMap.values()).sort((a, b) => b.count - a.count);
}
