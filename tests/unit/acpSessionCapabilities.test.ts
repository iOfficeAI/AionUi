/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcpConnection } from '../../src/process/agent/acp/AcpConnection';
import { AcpAgent } from '../../src/process/agent/acp/index';
import { parseInitializeResult } from '../../src/common/types/acpTypes';
import type { AcpSessionConfigOption, AcpSessionModels } from '../../src/types/acpTypes';

vi.mock('@process/utils/initStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@process/utils/initStorage')>();
  return {
    ...actual,
    ProcessConfig: {
      ...actual.ProcessConfig,
      get: vi.fn().mockResolvedValue([]),
    },
  };
});

// ─── helpers ────────────────────────────────────────────────────────────────

function makeConnection(backend: string = 'codex'): AcpConnection {
  const conn = new AcpConnection();
  (conn as any).backend = backend;
  return conn;
}

function makeAgent(backend: string, acpSessionId?: string): AcpAgent {
  return new AcpAgent({
    id: 'test-agent',
    backend: backend as any,
    workingDir: '/tmp',
    extra: {
      backend: backend as any,
      workspace: '/tmp',
      acpSessionId,
    },
    onStreamEvent: vi.fn(),
  });
}

const CONFIG_OPTIONS: AcpSessionConfigOption[] = [
  { id: 'model', category: 'model', type: 'select', currentValue: 'gpt-4o', options: [] },
];
const MODELS: AcpSessionModels = {
  currentModelId: 'gpt-4o',
  availableModels: [{ id: 'gpt-4o' }, { id: 'o3' }],
};

// ─── AcpConnection.loadSession ───────────────────────────────────────────────

describe('AcpConnection.loadSession', () => {
  let conn: AcpConnection;

  beforeEach(() => {
    conn = makeConnection('codex');
  });

  it('sets sessionId from response when present', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ sessionId: 'new-session-456' });

    await conn.loadSession('original-123', '/tmp');

    expect(conn.currentSessionId).toBe('new-session-456');
  });

  it('falls back to the passed sessionId when response omits it', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({});

    await conn.loadSession('original-123', '/tmp');

    expect(conn.currentSessionId).toBe('original-123');
  });

  it('calls session/load endpoint with correct params', async () => {
    const sendRequest = vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ sessionId: 's1' });
    // normalizeCwdForAgent returns the absolute path for codex
    await conn.loadSession('s1', '/tmp');

    expect(sendRequest).toHaveBeenCalledWith('session/load', expect.objectContaining({ sessionId: 's1' }));
  });

  it('returns the raw response', async () => {
    const mockResponse = { sessionId: 's1', extra: 'data' };
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue(mockResponse);

    const result = await conn.loadSession('s1', '/tmp');

    expect(result).toBe(mockResponse);
  });
});

// ─── parseSessionCapabilities (via loadSession) ──────────────────────────────

describe('AcpConnection.parseSessionCapabilities (via loadSession)', () => {
  let conn: AcpConnection;

  beforeEach(() => {
    conn = makeConnection('codex');
  });

  it('parses configOptions from response', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ configOptions: CONFIG_OPTIONS });

    await conn.loadSession('s1', '/tmp');

    expect((conn as any).configOptions).toEqual(CONFIG_OPTIONS);
  });

  it('parses top-level models from response', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ models: MODELS });

    await conn.loadSession('s1', '/tmp');

    expect((conn as any).models).toEqual(MODELS);
  });

  it('falls back to _meta.models when top-level models is absent', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ _meta: { models: MODELS } });

    await conn.loadSession('s1', '/tmp');

    expect((conn as any).models).toEqual(MODELS);
  });

  it('ignores configOptions when response value is not an array', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ configOptions: 'bad-value' });

    await conn.loadSession('s1', '/tmp');

    expect((conn as any).configOptions).toBeNull();
  });

  it('does not overwrite models when response has no models field', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({});

    await conn.loadSession('s1', '/tmp');

    expect((conn as any).models).toBeNull();
  });
});

// ─── AcpAgent.createOrResumeSession routing ──────────────────────────────────

describe('AcpAgent.createOrResumeSession — Codex routing', () => {
  it('uses connection.resumeSession for resume routing', async () => {
    const agent = makeAgent('codex', 'session-codex-1');
    const conn: AcpConnection = (agent as any).connection;

    const resumeSession = vi.spyOn(conn, 'resumeSession').mockResolvedValue({ sessionId: 'session-codex-1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ sessionId: 'fresh' } as any);

    await (agent as any).createOrResumeSession();

    expect(resumeSession).toHaveBeenCalledWith(
      'session-codex-1',
      expect.any(String),
      expect.objectContaining({
        forkSession: false,
        mcpServers: [],
      })
    );
    expect(newSession).not.toHaveBeenCalled();
  });

  it('routes non-Codex backends to newSession', async () => {
    const agent = makeAgent('claude', 'session-claude-1');
    const conn: AcpConnection = (agent as any).connection;

    const resumeSession = vi.spyOn(conn, 'resumeSession').mockResolvedValue({ sessionId: 'session-claude-1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ sessionId: 'session-claude-1' } as any);

    await (agent as any).createOrResumeSession();

    expect(resumeSession).toHaveBeenCalled();
    expect(newSession).not.toHaveBeenCalled();
  });

  it('falls back to fresh session when resumeSession throws', async () => {
    const agent = makeAgent('codex', 'session-expired');
    const conn: AcpConnection = (agent as any).connection;

    vi.spyOn(conn, 'resumeSession').mockRejectedValue(new Error('rollout expired'));
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ sessionId: 'fresh-session' } as any);

    await (agent as any).createOrResumeSession();

    expect(newSession).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mcpServers: [] }));
  });

  it('creates a fresh session when no acpSessionId is stored', async () => {
    const agent = makeAgent('codex'); // no acpSessionId
    const conn: AcpConnection = (agent as any).connection;

    const resumeSession = vi.spyOn(conn, 'resumeSession').mockResolvedValue({} as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ sessionId: 'brand-new' } as any);

    await (agent as any).createOrResumeSession();

    expect(resumeSession).not.toHaveBeenCalled();
    expect(newSession).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mcpServers: [] }));
  });

  it('updates acpSessionId when resume returns a new session ID', async () => {
    const agent = makeAgent('codex', 'old-session');
    const conn: AcpConnection = (agent as any).connection;
    const onSessionIdUpdate = vi.fn();
    (agent as any).onSessionIdUpdate = onSessionIdUpdate;

    vi.spyOn(conn, 'resumeSession').mockResolvedValue({ sessionId: 'rotated-session' } as any);

    await (agent as any).createOrResumeSession();

    expect((agent as any).extra.acpSessionId).toBe('rotated-session');
    expect(onSessionIdUpdate).toHaveBeenCalledWith('rotated-session');
  });
});

// ─── parseInitializeResult: top-level modes ─────────────────────────────────

describe('parseInitializeResult (top-level modes)', () => {
  it('extracts availableModes advertised at initialize time (qwen-code)', () => {
    const result = parseInitializeResult({
      protocolVersion: 1,
      modes: {
        currentModeId: 'default',
        availableModes: [
          { id: 'plan', name: 'Plan', description: 'Analyze only' },
          { id: 'default', name: 'Default' },
          { id: 'auto-edit', name: 'Auto Edit' },
          { id: 'yolo', name: 'YOLO' },
        ],
      },
    });
    expect(result.modes).not.toBeNull();
    expect(result.modes?.currentModeId).toBe('default');
    expect(result.modes?.availableModes?.map((m) => m.id)).toEqual(['plan', 'default', 'auto-edit', 'yolo']);
  });

  it('returns null modes when the field is absent', () => {
    const result = parseInitializeResult({ protocolVersion: 1 });
    expect(result.modes).toBeNull();
  });

  it('returns null modes when availableModes is empty', () => {
    const result = parseInitializeResult({ protocolVersion: 1, modes: { availableModes: [] } });
    expect(result.modes).toBeNull();
  });

  it('filters out malformed entries without an id', () => {
    const result = parseInitializeResult({
      protocolVersion: 1,
      modes: {
        availableModes: [{ id: 'plan' }, { name: 'no-id' }, { id: 'yolo', name: 'YOLO' }],
      },
    });
    expect(result.modes?.availableModes?.map((m) => m.id)).toEqual(['plan', 'yolo']);
  });
});

describe('AcpConnection.resumeSession capability routing', () => {
  /** Set parsed initializeResult on a connection (mirrors what initialize() does). */
  function setInitializeResponse(conn: AcpConnection, response: Record<string, unknown>): void {
    (conn as any).initializeResult = parseInitializeResult(response);
  }

  const makeConnection = (backend: AcpBackend): AcpConnection => {
    const conn = new AcpConnection();
    (conn as any).backend = backend;
    return conn;
  };

  it('prefers loadSession for load-capable non-claude backends', async () => {
    const conn = makeConnection('opencode');
    setInitializeResponse(conn, { agentCapabilities: { loadSession: true } });

    const loadSession = vi.spyOn(conn, 'loadSession').mockResolvedValue({ sessionId: 's1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ sessionId: 'fresh' } as any);

    const result = await conn.resumeSession('s1', '/tmp', { mcpServers: [] });

    expect(loadSession).toHaveBeenCalledWith('s1', '/tmp', []);
    expect(newSession).not.toHaveBeenCalled();
    expect(result.sessionId).toBe('s1');
  });

  it('uses newSession for claude backend even when loadSession is declared', async () => {
    const conn = makeConnection('claude');
    setInitializeResponse(conn, { agentCapabilities: { loadSession: true } });

    const loadSession = vi.spyOn(conn, 'loadSession').mockResolvedValue({ sessionId: 's1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ sessionId: 's1' } as any);

    await conn.resumeSession('s1', '/tmp', { mcpServers: [] });

    expect(loadSession).not.toHaveBeenCalled();
    expect(newSession).toHaveBeenCalledWith(
      '/tmp',
      expect.objectContaining({
        resumeSessionId: 's1',
        mcpServers: [],
      })
    );
  });

  it('uses newSession for _meta.claudeCode capability', async () => {
    const conn = makeConnection('codebuddy');
    setInitializeResponse(conn, {
      agentCapabilities: { loadSession: true, _meta: { claudeCode: { promptQueueing: true } } },
    });

    const loadSession = vi.spyOn(conn, 'loadSession').mockResolvedValue({ sessionId: 's1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ sessionId: 's1' } as any);

    await conn.resumeSession('s1', '/tmp', { mcpServers: [] });

    expect(loadSession).not.toHaveBeenCalled();
    expect(newSession).toHaveBeenCalled();
  });

  it('falls back to newSession when loadSession fails', async () => {
    const conn = makeConnection('qwen');
    setInitializeResponse(conn, { agentCapabilities: { loadSession: true } });

    vi.spyOn(conn, 'loadSession').mockRejectedValue(new Error('load failed'));
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ sessionId: 'fresh' } as any);

    const result = await conn.resumeSession('s1', '/tmp', { mcpServers: [] });

    expect(newSession).toHaveBeenCalledWith(
      '/tmp',
      expect.objectContaining({
        resumeSessionId: 's1',
        mcpServers: [],
      })
    );
    expect(result.sessionId).toBe('fresh');
  });
});
