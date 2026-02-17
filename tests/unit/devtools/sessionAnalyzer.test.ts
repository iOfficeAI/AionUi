/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeSession, analyzeSessionFile } from '@/process/services/devtools/sessionAnalyzer';
import { _setClaudeBasePathForTest } from '@/process/services/devtools/sessionDiscovery';

describe('sessionAnalyzer', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devtools-analyzer-'));

    const projectsDir = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace');
    fs.mkdirSync(projectsDir, { recursive: true });

    // Create a realistic session file
    const sessionLines = [
      // User message
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'What is in src/index.ts?' },
        uuid: 'u1',
        timestamp: '2025-06-01T10:00:00Z',
      }),
      // Assistant thinks and reads
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'I need to read the file' },
            { type: 'tool_use', id: 'tu-1', name: 'Read', input: { file_path: '/src/index.ts' } },
          ],
          model: 'claude-sonnet-4-5-20250929',
          usage: { input_tokens: 500, output_tokens: 100 },
        },
        uuid: 'a1',
        parentUuid: 'u1',
        timestamp: '2025-06-01T10:00:01Z',
      }),
      // Tool result
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: '' },
        uuid: 'tr1',
        parentUuid: 'a1',
        timestamp: '2025-06-01T10:00:02Z',
        toolUseResult: { toolUseId: 'tu-1', content: 'console.log("hello world")', isError: false },
      }),
      // Assistant responds
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'The file contains a simple console.log statement.' }],
          usage: { input_tokens: 600, output_tokens: 30 },
        },
        uuid: 'a2',
        parentUuid: 'tr1',
        timestamp: '2025-06-01T10:00:03Z',
      }),
      // Second user message
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'Thanks!' },
        uuid: 'u2',
        timestamp: '2025-06-01T10:00:10Z',
      }),
    ];

    fs.writeFileSync(path.join(projectsDir, 'test-session.jsonl'), sessionLines.join('\n'));

    // Create a session with compaction
    const compactionLines = [
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'Start conversation' },
        uuid: 'cu1',
        timestamp: '2025-06-01T11:00:00Z',
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: 'Long response here',
          usage: { input_tokens: 1000, output_tokens: 500 },
        },
        uuid: 'ca1',
        timestamp: '2025-06-01T11:00:01Z',
      }),
      JSON.stringify({
        type: 'summary',
        message: { role: 'system', content: 'Here is a summary of the conversation so far: the user asked to start.' },
        uuid: 'cs1',
        timestamp: '2025-06-01T11:00:05Z',
      }),
    ];

    fs.writeFileSync(path.join(projectsDir, 'compaction-session.jsonl'), compactionLines.join('\n'));

    _setClaudeBasePathForTest(path.join(tmpDir, '.claude'));
  });

  afterAll(() => {
    _setClaudeBasePathForTest(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==================== analyzeSession ====================
  describe('analyzeSession', () => {
    it('should return null for non-existent session', async () => {
      const result = await analyzeSession('nonexistent');
      expect(result).toBeNull();
    });

    it('should analyze a session by ID and workspace', async () => {
      const result = await analyzeSession('test-session', '/analyzer/workspace');
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('test-session');
    });

    it('should find session without workspace', async () => {
      const result = await analyzeSession('test-session');
      expect(result).not.toBeNull();
    });
  });

  // ==================== analyzeSessionFile ====================
  describe('analyzeSessionFile', () => {
    it('should produce correct session metrics', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'test-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'test-session');

      expect(analysis.sessionId).toBe('test-session');
      expect(analysis.messageCount).toBeGreaterThanOrEqual(4); // u1, a1, tr1, a2, u2
      expect(analysis.metrics.inputTokens).toBe(1100); // 500 + 600
      expect(analysis.metrics.outputTokens).toBe(130); // 100 + 30
      expect(analysis.metrics.totalTokens).toBe(1230);
      expect(analysis.metrics.durationMs).toBeGreaterThan(0);
    });

    it('should extract model from first assistant message', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'test-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'test-session');

      expect(analysis.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should produce chunks', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'test-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'test-session');

      expect(analysis.chunks.length).toBeGreaterThanOrEqual(3); // user, ai, user
      const chunkTypes = analysis.chunks.map((c) => c.chunkType);
      expect(chunkTypes).toContain('user');
      expect(chunkTypes).toContain('ai');
    });

    it('should compute token attribution', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'test-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'test-session');

      const attr = analysis.tokenAttribution;
      // User tokens should be > 0 (from real user messages)
      expect(attr.user).toBeGreaterThan(0);
      // Thinking tokens should be > 0 (from thinking block)
      expect(attr.thinking).toBeGreaterThan(0);
      // Tool input tokens should be > 0 (from tool_use block)
      expect(attr.tool_input).toBeGreaterThan(0);
      // Tool output tokens should be > 0 (from tool result)
      expect(attr.tool_output).toBeGreaterThan(0);
      // Assistant output tokens should be > 0 (from text block)
      expect(attr.assistant).toBeGreaterThan(0);
    });

    it('should build tool execution summary', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'test-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'test-session');

      expect(analysis.toolExecutionSummary.length).toBeGreaterThanOrEqual(1);
      const readSummary = analysis.toolExecutionSummary.find((s) => s.toolName === 'Read');
      expect(readSummary).toBeDefined();
      expect(readSummary!.count).toBe(1);
    });

    it('should set start and end times', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'test-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'test-session');

      expect(analysis.startTime).toBeGreaterThan(0);
      expect(analysis.endTime).toBeGreaterThan(analysis.startTime);
    });

    it('should detect compaction events', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'compaction-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'compaction-session');

      // Should detect the summary message as a compaction event
      expect(analysis.compactionEvents.length).toBeGreaterThanOrEqual(1);
      expect(analysis.compactionEvents[0].timestamp).toBeGreaterThan(0);
    });

    it('should derive project path from file path', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'test-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'test-session');

      expect(analysis.projectPath).toBe('/analyzer/workspace');
    });

    it('should include full messages in analysis', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'test-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'test-session');

      expect(analysis.messages).toBeDefined();
      expect(analysis.messages.length).toBeGreaterThanOrEqual(4);
      const types = analysis.messages.map((m) => m.type);
      expect(types).toContain('user');
      expect(types).toContain('assistant');
    });

    it('should have empty subagents for session without agents', async () => {
      const filePath = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace', 'test-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'test-session');

      expect(analysis.subagents).toBeDefined();
      expect(analysis.subagents).toHaveLength(0);
    });

    it('should extract subagents from session with agent messages', async () => {
      const sessionLines = [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'Search for something' },
          uuid: 'su1',
          timestamp: '2025-06-01T12:00:00Z',
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'task-1', name: 'Task', input: { description: 'Search codebase', prompt: 'Find files', subagent_type: 'Explore' } }],
            usage: { input_tokens: 200, output_tokens: 50 },
          },
          uuid: 'sa1',
          parentUuid: 'su1',
          timestamp: '2025-06-01T12:00:01Z',
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Found 3 files' }],
            usage: { input_tokens: 100, output_tokens: 25 },
          },
          uuid: 'agent-a1',
          agentId: 'task-1',
          timestamp: '2025-06-01T12:00:02Z',
        }),
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: '' },
          uuid: 'str1',
          parentUuid: 'sa1',
          timestamp: '2025-06-01T12:00:03Z',
          toolUseResult: { toolUseId: 'task-1', content: 'Search complete', isError: false },
        }),
      ];

      const projectsDir = path.join(tmpDir, '.claude', 'projects', '-analyzer-workspace');
      fs.writeFileSync(path.join(projectsDir, 'subagent-session.jsonl'), sessionLines.join('\n'));

      const filePath = path.join(projectsDir, 'subagent-session.jsonl');
      const analysis = await analyzeSessionFile(filePath, 'subagent-session');

      expect(analysis.subagents.length).toBeGreaterThanOrEqual(1);
      expect(analysis.subagents[0].agentId).toBe('task-1');
      expect(analysis.subagents[0].description).toBe('Search codebase');
      expect(analysis.subagents[0].messageCount).toBe(1);
    });
  });
});
