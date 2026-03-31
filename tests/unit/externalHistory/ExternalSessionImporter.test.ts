/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all parsers
vi.mock('../../../src/process/services/externalHistory/ClaudeCodeParser', () => ({
  parseClaudeSession: vi.fn(),
}));

vi.mock('../../../src/process/services/externalHistory/CodexParser', () => ({
  parseCodexSession: vi.fn(),
}));

vi.mock('../../../src/process/services/externalHistory/GeminiCliParser', () => ({
  parseGeminiCliSession: vi.fn(),
}));

vi.mock('../../../src/process/services/externalHistory/OpenCodeParser', () => ({
  parseOpenCodeSession: vi.fn(),
}));

// Mock database
const mockRunInTransaction = vi.fn((fn: () => void) => fn());
const mockCreateConversation = vi.fn(() => ({ success: true }));
const mockInsertMessage = vi.fn(() => ({ success: true }));

vi.mock('../../../src/process/services/database', () => ({
  getDatabase: vi.fn(() =>
    Promise.resolve({
      runInTransaction: mockRunInTransaction,
      createConversation: mockCreateConversation,
      insertMessage: mockInsertMessage,
    })
  ),
}));

// Mock uuid
vi.mock('../../../src/common/utils', () => ({
  uuid: vi.fn(() => 'mock-uuid-1234'),
}));

import { importExternalSession } from '../../../src/process/services/externalHistory/ExternalSessionImporter';
import { parseClaudeSession } from '../../../src/process/services/externalHistory/ClaudeCodeParser';
import { parseCodexSession } from '../../../src/process/services/externalHistory/CodexParser';
import { parseGeminiCliSession } from '../../../src/process/services/externalHistory/GeminiCliParser';
import { parseOpenCodeSession } from '../../../src/process/services/externalHistory/OpenCodeParser';

const mockParseClaudeSession = vi.mocked(parseClaudeSession);
const mockParseCodexSession = vi.mocked(parseCodexSession);
const mockParseGeminiCliSession = vi.mocked(parseGeminiCliSession);
const mockParseOpenCodeSession = vi.mocked(parseOpenCodeSession);

describe('ExternalSessionImporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunInTransaction.mockImplementation((fn: () => void) => fn());
    mockCreateConversation.mockReturnValue({ success: true });
    mockInsertMessage.mockReturnValue({ success: true });
  });

  it('imports a Claude session successfully', async () => {
    mockParseClaudeSession.mockResolvedValue({
      messages: [
        { role: 'user', content: 'Hello', timestamp: 1000 },
        { role: 'assistant', content: 'Hi!', timestamp: 2000 },
      ],
      workspace: '/project',
      name: 'Test Session',
    });

    const result = await importExternalSession(null, 'claude', 'session-1');

    expect(result.success).toBe(true);
    expect(result.messageCount).toBe(2);
    expect(result.conversationId).toBeDefined();
    expect(mockCreateConversation).toHaveBeenCalledTimes(1);
    expect(mockInsertMessage).toHaveBeenCalledTimes(2);
    expect(mockRunInTransaction).toHaveBeenCalledTimes(1);
  });

  it('imports a Codex session successfully', async () => {
    mockParseCodexSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'Hello' }],
      workspace: '/proj',
      name: 'Codex Session',
    });

    const result = await importExternalSession(null, 'codex', 'session-1');
    expect(result.success).toBe(true);
    expect(result.messageCount).toBe(1);
  });

  it('imports a Gemini CLI session with gemini conversation type', async () => {
    mockParseGeminiCliSession.mockResolvedValue({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ],
      workspace: '/project',
      name: 'Gemini Session',
    });

    const result = await importExternalSession(null, 'gemini-cli', 'session-1');
    expect(result.success).toBe(true);

    // Verify conversation type is 'gemini' for gemini-cli backend
    const convoArg = mockCreateConversation.mock.calls[0][0];
    expect(convoArg.type).toBe('gemini');
  });

  it('imports an OpenCode session', async () => {
    mockParseOpenCodeSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'Test' }],
      workspace: '/proj',
      name: 'OpenCode Session',
    });

    const result = await importExternalSession(null, 'opencode', 'session-1');
    expect(result.success).toBe(true);

    const convoArg = mockCreateConversation.mock.calls[0][0];
    expect(convoArg.type).toBe('acp');
  });

  it('returns error for unsupported backend', async () => {
    const result = await importExternalSession(null, 'unknown' as never, 'session-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported backend');
  });

  it('returns error when no messages found', async () => {
    mockParseClaudeSession.mockResolvedValue({
      messages: [],
      workspace: '/proj',
      name: 'Empty',
    });

    const result = await importExternalSession(null, 'claude', 'session-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No messages found');
  });

  it('returns error when conversation creation fails', async () => {
    mockParseClaudeSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'Hello' }],
      workspace: '/proj',
      name: 'Test',
    });
    mockCreateConversation.mockReturnValue({ success: false, error: 'DB error' });
    mockRunInTransaction.mockImplementation((fn: () => void) => fn());

    const result = await importExternalSession(null, 'claude', 'session-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to create conversation');
  });

  it('returns error when message insertion fails', async () => {
    mockParseClaudeSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'Hello' }],
      workspace: '/proj',
      name: 'Test',
    });
    mockCreateConversation.mockReturnValue({ success: true });
    mockInsertMessage.mockReturnValue({ success: false, error: 'Insert failed' });
    mockRunInTransaction.mockImplementation((fn: () => void) => fn());

    const result = await importExternalSession(null, 'claude', 'session-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to insert message');
  });

  it('uses first message content as conversation name when name is empty', async () => {
    mockParseClaudeSession.mockResolvedValue({
      messages: [{ role: 'user', content: 'This is my first message to you' }],
      workspace: '/proj',
      name: '',
    });

    const result = await importExternalSession(null, 'claude', 'session-1');
    expect(result.success).toBe(true);

    const convoArg = mockCreateConversation.mock.calls[0][0];
    expect(convoArg.name).toBe('This is my first message to you');
  });

  it('handles parser throwing an exception', async () => {
    mockParseClaudeSession.mockRejectedValue(new Error('Parse crash'));

    const result = await importExternalSession(null, 'claude', 'session-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Parse crash');
  });
});
