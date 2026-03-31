/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all parsers
vi.mock('../../../src/process/services/externalHistory/ClaudeCodeParser', () => ({
  listClaudeCodeSessions: vi.fn(),
}));

vi.mock('../../../src/process/services/externalHistory/CodexParser', () => ({
  listCodexSessions: vi.fn(),
}));

vi.mock('../../../src/process/services/externalHistory/GeminiCliParser', () => ({
  listGeminiCliSessions: vi.fn(),
}));

vi.mock('../../../src/process/services/externalHistory/OpenCodeParser', () => ({
  listOpenCodeSessions: vi.fn(),
}));

import { listAllExternalSessions } from '../../../src/process/services/externalHistory/ExternalSessionReader';
import { listClaudeCodeSessions } from '../../../src/process/services/externalHistory/ClaudeCodeParser';
import { listCodexSessions } from '../../../src/process/services/externalHistory/CodexParser';
import { listGeminiCliSessions } from '../../../src/process/services/externalHistory/GeminiCliParser';
import { listOpenCodeSessions } from '../../../src/process/services/externalHistory/OpenCodeParser';
import type { ExternalSessionInfo } from '../../../src/process/services/externalHistory/types';

const mockClaudeSessions = vi.mocked(listClaudeCodeSessions);
const mockCodexSessions = vi.mocked(listCodexSessions);
const mockGeminiSessions = vi.mocked(listGeminiCliSessions);
const mockOpenCodeSessions = vi.mocked(listOpenCodeSessions);

describe('ExternalSessionReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClaudeSessions.mockResolvedValue([]);
    mockCodexSessions.mockResolvedValue([]);
    mockGeminiSessions.mockResolvedValue([]);
    mockOpenCodeSessions.mockResolvedValue([]);
  });

  it('returns empty array when no backends have sessions', async () => {
    const result = await listAllExternalSessions();
    expect(result).toEqual([]);
  });

  it('aggregates sessions from all backends', async () => {
    const claudeSession: ExternalSessionInfo = {
      id: 'claude-1',
      name: 'Claude Session',
      backend: 'claude',
      workspace: '/proj',
      updatedAt: 1000,
    };
    const codexSession: ExternalSessionInfo = {
      id: 'codex-1',
      name: 'Codex Session',
      backend: 'codex',
      workspace: '/proj2',
      updatedAt: 2000,
    };

    mockClaudeSessions.mockResolvedValue([claudeSession]);
    mockCodexSessions.mockResolvedValue([codexSession]);

    const result = await listAllExternalSessions();
    expect(result).toHaveLength(2);
  });

  it('sorts results by updatedAt descending (most recent first)', async () => {
    const oldSession: ExternalSessionInfo = {
      id: 'old-1',
      name: 'Old',
      backend: 'claude',
      updatedAt: 1000,
    };
    const newSession: ExternalSessionInfo = {
      id: 'new-1',
      name: 'New',
      backend: 'codex',
      updatedAt: 3000,
    };
    const midSession: ExternalSessionInfo = {
      id: 'mid-1',
      name: 'Mid',
      backend: 'gemini-cli',
      updatedAt: 2000,
    };

    mockClaudeSessions.mockResolvedValue([oldSession]);
    mockCodexSessions.mockResolvedValue([newSession]);
    mockGeminiSessions.mockResolvedValue([midSession]);

    const result = await listAllExternalSessions();
    expect(result[0].id).toBe('new-1');
    expect(result[1].id).toBe('mid-1');
    expect(result[2].id).toBe('old-1');
  });

  it('handles backend errors gracefully', async () => {
    mockClaudeSessions.mockRejectedValue(new Error('Claude failed'));
    mockCodexSessions.mockRejectedValue(new Error('Codex crashed'));
    const geminiSession: ExternalSessionInfo = {
      id: 'gemini-1',
      name: 'Working',
      backend: 'gemini-cli',
      updatedAt: 1000,
    };
    mockGeminiSessions.mockResolvedValue([geminiSession]);

    const result = await listAllExternalSessions();
    expect(result).toHaveLength(1);
    expect(result[0].backend).toBe('gemini-cli');
  });
});
