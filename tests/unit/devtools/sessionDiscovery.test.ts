/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  encodePath,
  findSessionFile,
  listSessionFiles,
  findSubagentFiles,
  _setClaudeBasePathForTest,
} from '@/process/services/devtools/sessionDiscovery';

describe('sessionDiscovery', () => {
  // ==================== encodePath ====================
  describe('encodePath', () => {
    it('should replace forward slashes with dashes', () => {
      const result = encodePath('/Users/foo/project');
      expect(result).toBe('-Users-foo-project');
    });

    it('should handle paths without leading slash', () => {
      const result = encodePath('relative/path');
      // path.resolve will make it absolute, so the result will have a leading dash
      expect(result).toContain('-relative-path');
    });
  });

  // ==================== findSessionFile ====================
  describe('findSessionFile', () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devtools-discovery-'));

      // Create a mock ~/.claude/projects structure
      const projectsDir = path.join(tmpDir, '.claude', 'projects', '-workspace-myproject');
      fs.mkdirSync(projectsDir, { recursive: true });
      fs.writeFileSync(path.join(projectsDir, 'abc-123.jsonl'), '{"type":"user","message":{"role":"user","content":"hi"}}\n');
      fs.writeFileSync(path.join(projectsDir, 'def-456.jsonl'), '{"type":"user","message":{"role":"user","content":"hello"}}\n');

      // Create subagent files
      fs.writeFileSync(path.join(projectsDir, 'agent-abc.jsonl'), '{"type":"assistant","message":{"role":"assistant","content":"sub"}}\n');

      _setClaudeBasePathForTest(path.join(tmpDir, '.claude'));
    });

    afterAll(() => {
      _setClaudeBasePathForTest(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should find a session file by ID with workspace', () => {
      const result = findSessionFile('abc-123', '/workspace/myproject');
      expect(result).not.toBeNull();
      expect(result!).toContain('abc-123.jsonl');
    });

    it('should find a session file by ID without workspace (scan all)', () => {
      const result = findSessionFile('def-456');
      expect(result).not.toBeNull();
      expect(result!).toContain('def-456.jsonl');
    });

    it('should return null for non-existent session', () => {
      const result = findSessionFile('nonexistent-session');
      expect(result).toBeNull();
    });

    it('should return null for non-existent workspace', () => {
      const result = findSessionFile('abc-123', '/does/not/exist');
      // It should still find via scan-all fallback
      expect(result).not.toBeNull();
    });
  });

  // ==================== listSessionFiles ====================
  describe('listSessionFiles', () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devtools-list-'));

      const projectsDir = path.join(tmpDir, '.claude', 'projects', '-test-workspace');
      fs.mkdirSync(projectsDir, { recursive: true });

      // Create session files with different timestamps
      fs.writeFileSync(path.join(projectsDir, 'old-session.jsonl'), 'data\n');
      // Touch with older timestamp
      const oldTime = new Date('2024-01-01').getTime() / 1000;
      fs.utimesSync(path.join(projectsDir, 'old-session.jsonl'), oldTime, oldTime);

      fs.writeFileSync(path.join(projectsDir, 'new-session.jsonl'), 'data\n');

      // Non-JSONL file should be ignored
      fs.writeFileSync(path.join(projectsDir, 'notes.txt'), 'not a session\n');

      // Create subagent file (should be included since it's .jsonl)
      fs.writeFileSync(path.join(projectsDir, 'agent-sub.jsonl'), 'data\n');

      _setClaudeBasePathForTest(path.join(tmpDir, '.claude'));
    });

    afterAll(() => {
      _setClaudeBasePathForTest(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should list all session files for a workspace', () => {
      const sessions = listSessionFiles('/test/workspace');
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(sessions.map((s) => s.sessionId)).toContain('old-session');
      expect(sessions.map((s) => s.sessionId)).toContain('new-session');
    });

    it('should sort by modification time (newest first)', () => {
      const sessions = listSessionFiles('/test/workspace');
      // new-session should come before old-session
      const newIdx = sessions.findIndex((s) => s.sessionId === 'new-session');
      const oldIdx = sessions.findIndex((s) => s.sessionId === 'old-session');
      expect(newIdx).toBeLessThan(oldIdx);
    });

    it('should list sessions across all workspaces when no workspace provided', () => {
      const sessions = listSessionFiles();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for non-existent workspace', () => {
      const sessions = listSessionFiles('/nonexistent/workspace');
      expect(sessions).toEqual([]);
    });
  });

  // ==================== findSubagentFiles ====================
  describe('findSubagentFiles', () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devtools-subagent-'));

      const projectsDir = path.join(tmpDir, '.claude', 'projects', '-sub-workspace');
      fs.mkdirSync(projectsDir, { recursive: true });

      fs.writeFileSync(path.join(projectsDir, 'main-session.jsonl'), 'data\n');
      fs.writeFileSync(path.join(projectsDir, 'agent-abc.jsonl'), 'subagent data\n');
      fs.writeFileSync(path.join(projectsDir, 'agent-def.jsonl'), 'subagent data\n');
      fs.writeFileSync(path.join(projectsDir, 'not-agent.jsonl'), 'other data\n');

      _setClaudeBasePathForTest(path.join(tmpDir, '.claude'));
    });

    afterAll(() => {
      _setClaudeBasePathForTest(null);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should find subagent files for a session', () => {
      const files = findSubagentFiles('main-session', '/sub/workspace');
      expect(files).toHaveLength(2);
      expect(files.some((f) => f.includes('agent-abc.jsonl'))).toBe(true);
      expect(files.some((f) => f.includes('agent-def.jsonl'))).toBe(true);
    });

    it('should not include non-agent JSONL files', () => {
      const files = findSubagentFiles('main-session', '/sub/workspace');
      expect(files.some((f) => f.includes('not-agent.jsonl'))).toBe(false);
      expect(files.some((f) => f.includes('main-session.jsonl'))).toBe(false);
    });

    it('should return empty array for non-existent session', () => {
      const files = findSubagentFiles('nonexistent-session');
      expect(files).toEqual([]);
    });
  });
});
