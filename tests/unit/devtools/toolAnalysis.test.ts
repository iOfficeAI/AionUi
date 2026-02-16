/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from '@jest/globals';
import { getToolSummary, buildToolExecutions, buildToolExecutionSummary } from '@/process/services/devtools/toolAnalysis';
import type { ParsedMessage, ToolExecution } from '@/process/services/devtools/types';

describe('toolAnalysis', () => {
  // ==================== getToolSummary ====================
  describe('getToolSummary', () => {
    it('should summarize Read tool with file path', () => {
      expect(getToolSummary('Read', { file_path: '/src/index.ts' })).toBe('Read /src/index.ts');
    });

    it('should summarize Read tool with fallback path key', () => {
      expect(getToolSummary('Read', { path: '/foo.txt' })).toBe('Read /foo.txt');
    });

    it('should summarize Read tool with fallback to "file"', () => {
      expect(getToolSummary('Read', {})).toBe('Read file');
    });

    it('should summarize Edit and Write tools', () => {
      expect(getToolSummary('Edit', { file_path: '/src/main.ts' })).toBe('Edit /src/main.ts');
      expect(getToolSummary('Write', { file_path: '/out/bundle.js' })).toBe('Write /out/bundle.js');
    });

    it('should summarize Bash tool with description', () => {
      expect(getToolSummary('Bash', { description: 'List files', command: 'ls -la' })).toBe('List files');
    });

    it('should summarize Bash tool with command when no description', () => {
      expect(getToolSummary('Bash', { command: 'npm install' })).toBe('npm install');
    });

    it('should truncate long Bash commands', () => {
      const longCommand = 'x'.repeat(100);
      const summary = getToolSummary('Bash', { command: longCommand });
      expect(summary.length).toBeLessThanOrEqual(80);
    });

    it('should summarize Grep and Glob tools', () => {
      expect(getToolSummary('Grep', { pattern: 'TODO' })).toBe('Grep "TODO"');
      expect(getToolSummary('Glob', { pattern: '**/*.ts' })).toBe('Glob "**/*.ts"');
    });

    it('should summarize Task tool as subagent', () => {
      expect(getToolSummary('Task', { description: 'Search codebase' })).toBe('Task: Search codebase');
      expect(getToolSummary('Task', {})).toBe('Task: subagent');
    });

    it('should summarize WebFetch with hostname', () => {
      expect(getToolSummary('WebFetch', { url: 'https://example.com/api/data' })).toBe('Fetch example.com');
    });

    it('should handle invalid WebFetch URLs', () => {
      const summary = getToolSummary('WebFetch', { url: 'not-a-url' });
      expect(summary).toContain('Fetch');
    });

    it('should summarize WebSearch with query', () => {
      expect(getToolSummary('WebSearch', { query: 'react hooks' })).toBe('Search "react hooks"');
    });

    it('should summarize TodoWrite', () => {
      expect(getToolSummary('TodoWrite', {})).toBe('Update todo list');
    });

    it('should return tool name for unknown tools', () => {
      expect(getToolSummary('CustomTool', {})).toBe('CustomTool');
    });
  });

  // ==================== buildToolExecutions ====================
  describe('buildToolExecutions', () => {
    it('should match tool calls with their results', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          timestamp: 1000,
          type: 'assistant',
          toolCalls: [{ id: 'tu-1', name: 'Read', input: { file_path: '/foo.ts' }, isTask: false }],
        }),
        createMessage({
          timestamp: 2000,
          type: 'user',
          toolResults: [{ toolUseId: 'tu-1', content: 'file contents', isError: false }],
        }),
      ];

      const executions = buildToolExecutions(messages);
      expect(executions).toHaveLength(1);
      expect(executions[0].toolName).toBe('Read');
      expect(executions[0].result).toBe('file contents');
      expect(executions[0].isError).toBe(false);
      expect(executions[0].startTime).toBe(1000);
      expect(executions[0].endTime).toBe(2000);
      expect(executions[0].durationMs).toBe(1000);
    });

    it('should handle unmatched tool calls (pending)', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          timestamp: 1000,
          type: 'assistant',
          toolCalls: [{ id: 'tu-2', name: 'Bash', input: { command: 'ls' }, isTask: false }],
        }),
      ];

      const executions = buildToolExecutions(messages);
      expect(executions).toHaveLength(1);
      expect(executions[0].toolName).toBe('Bash');
      expect(executions[0].result).toBeUndefined();
      expect(executions[0].endTime).toBeUndefined();
    });

    it('should handle error results', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          timestamp: 1000,
          type: 'assistant',
          toolCalls: [{ id: 'tu-3', name: 'Bash', input: { command: 'invalid' }, isTask: false }],
        }),
        createMessage({
          timestamp: 1500,
          type: 'user',
          toolResults: [{ toolUseId: 'tu-3', content: 'command not found', isError: true }],
        }),
      ];

      const executions = buildToolExecutions(messages);
      expect(executions).toHaveLength(1);
      expect(executions[0].isError).toBe(true);
    });

    it('should sort executions by start time', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          timestamp: 3000,
          type: 'assistant',
          toolCalls: [{ id: 'tu-b', name: 'Write', input: {}, isTask: false }],
        }),
        createMessage({
          timestamp: 1000,
          type: 'assistant',
          toolCalls: [{ id: 'tu-a', name: 'Read', input: {}, isTask: false }],
        }),
      ];

      const executions = buildToolExecutions(messages);
      expect(executions).toHaveLength(2);
      expect(executions[0].toolName).toBe('Read');
      expect(executions[1].toolName).toBe('Write');
    });

    it('should handle multiple tool calls in one message', () => {
      const messages: ParsedMessage[] = [
        createMessage({
          timestamp: 1000,
          type: 'assistant',
          toolCalls: [
            { id: 'tu-x', name: 'Read', input: { file_path: '/a.ts' }, isTask: false },
            { id: 'tu-y', name: 'Read', input: { file_path: '/b.ts' }, isTask: false },
          ],
        }),
        createMessage({
          timestamp: 2000,
          type: 'user',
          toolResults: [
            { toolUseId: 'tu-x', content: 'content of a', isError: false },
            { toolUseId: 'tu-y', content: 'content of b', isError: false },
          ],
        }),
      ];

      const executions = buildToolExecutions(messages);
      expect(executions).toHaveLength(2);
    });

    it('should return empty array for empty messages', () => {
      expect(buildToolExecutions([])).toEqual([]);
    });
  });

  // ==================== buildToolExecutionSummary ====================
  describe('buildToolExecutionSummary', () => {
    it('should aggregate tool usage', () => {
      const executions: ToolExecution[] = [
        createExecution({ toolName: 'Read', durationMs: 100 }),
        createExecution({ toolName: 'Read', durationMs: 200 }),
        createExecution({ toolName: 'Edit', durationMs: 50 }),
        createExecution({ toolName: 'Read', durationMs: 150, isError: true }),
      ];

      const summary = buildToolExecutionSummary(executions);
      expect(summary).toHaveLength(2);

      // Read should be first (3 calls > 1 call)
      const readSummary = summary.find((s) => s.toolName === 'Read');
      expect(readSummary?.count).toBe(3);
      expect(readSummary?.totalDurationMs).toBe(450);
      expect(readSummary?.errorCount).toBe(1);

      const editSummary = summary.find((s) => s.toolName === 'Edit');
      expect(editSummary?.count).toBe(1);
      expect(editSummary?.totalDurationMs).toBe(50);
      expect(editSummary?.errorCount).toBe(0);
    });

    it('should sort by count descending', () => {
      const executions: ToolExecution[] = [
        createExecution({ toolName: 'Bash' }),
        createExecution({ toolName: 'Read' }),
        createExecution({ toolName: 'Read' }),
        createExecution({ toolName: 'Read' }),
        createExecution({ toolName: 'Bash' }),
      ];

      const summary = buildToolExecutionSummary(executions);
      expect(summary[0].toolName).toBe('Read');
      expect(summary[0].count).toBe(3);
      expect(summary[1].toolName).toBe('Bash');
      expect(summary[1].count).toBe(2);
    });

    it('should return empty array for empty input', () => {
      expect(buildToolExecutionSummary([])).toEqual([]);
    });
  });
});

// ==================== Test Helpers ====================

function createMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    uuid: `msg-${Math.random().toString(36).slice(2)}`,
    type: 'user',
    role: 'user',
    content: '',
    timestamp: Date.now(),
    toolCalls: [],
    toolResults: [],
    ...overrides,
  };
}

function createExecution(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    id: `tu-${Math.random().toString(36).slice(2)}`,
    toolName: 'Read',
    input: {},
    isError: false,
    startTime: 1000,
    summary: 'Read file',
    ...overrides,
  };
}
