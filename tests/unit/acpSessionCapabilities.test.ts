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
  current_model_id: 'gpt-4o',
  available_models: [{ id: 'gpt-4o' }, { id: 'o3' }],
};

// ─── AcpConnection.loadSession ───────────────────────────────────────────────

describe('AcpConnection.loadSession', () => {
  let conn: AcpConnection;

  beforeEach(() => {
    conn = makeConnection('codex');
  });

  it('sets session_id from response when present', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ session_id: 'new-session-456' });

    await conn.loadSession('original-123', '/tmp');

    expect(conn.currentSessionId).toBe('new-session-456');
  });

  it('falls back to the passed session_id when response omits it', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({});

    await conn.loadSession('original-123', '/tmp');

    expect(conn.currentSessionId).toBe('original-123');
  });

  it('calls session/load endpoint with correct params', async () => {
    const sendRequest = vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ session_id: 's1' });
    // normalizeCwdForAgent returns the absolute path for codex
    await conn.loadSession('s1', '/tmp');

    expect(sendRequest).toHaveBeenCalledWith('session/load', expect.objectContaining({ session_id: 's1' }));
  });

  it('returns the raw response', async () => {
    const mockResponse = { session_id: 's1', extra: 'data' };
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

  it('parses config_options from response', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ config_options: CONFIG_OPTIONS });

    await conn.loadSession('s1', '/tmp');

    expect((conn as any).config_options).toEqual(CONFIG_OPTIONS);
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

  it('ignores config_options when response value is not an array', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({ config_options: 'bad-value' });

    await conn.loadSession('s1', '/tmp');

    expect((conn as any).config_options).toBeNull();
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

    const resumeSession = vi.spyOn(conn, 'resumeSession').mockResolvedValue({ session_id: 'session-codex-1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ session_id: 'fresh' } as any);

    await (agent as any).createOrResumeSession();

    expect(resumeSession).toHaveBeenCalledWith(
      'session-codex-1',
      expect.any(String),
      expect.objectContaining({
        forkSession: false,
        mcp_servers: [],
      })
    );
    expect(newSession).not.toHaveBeenCalled();
  });

  it('routes non-Codex backends to newSession', async () => {
    const agent = makeAgent('claude', 'session-claude-1');
    const conn: AcpConnection = (agent as any).connection;

    const resumeSession = vi.spyOn(conn, 'resumeSession').mockResolvedValue({ session_id: 'session-claude-1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ session_id: 'session-claude-1' } as any);

    await (agent as any).createOrResumeSession();

    expect(resumeSession).toHaveBeenCalled();
    expect(newSession).not.toHaveBeenCalled();
  });

  it('falls back to fresh session when resumeSession throws', async () => {
    const agent = makeAgent('codex', 'session-expired');
    const conn: AcpConnection = (agent as any).connection;

    vi.spyOn(conn, 'resumeSession').mockRejectedValue(new Error('rollout expired'));
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ session_id: 'fresh-session' } as any);

    await (agent as any).createOrResumeSession();

    expect(newSession).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mcp_servers: [] }));
  });

  it('creates a fresh session when no acpSessionId is stored', async () => {
    const agent = makeAgent('codex'); // no acpSessionId
    const conn: AcpConnection = (agent as any).connection;

    const resumeSession = vi.spyOn(conn, 'resumeSession').mockResolvedValue({} as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ session_id: 'brand-new' } as any);

    await (agent as any).createOrResumeSession();

    expect(resumeSession).not.toHaveBeenCalled();
    expect(newSession).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mcp_servers: [] }));
  });

  it('updates acpSessionId when resume returns a new session ID', async () => {
    const agent = makeAgent('codex', 'old-session');
    const conn: AcpConnection = (agent as any).connection;
    const onSessionIdUpdate = vi.fn();
    (agent as any).onSessionIdUpdate = onSessionIdUpdate;

    vi.spyOn(conn, 'resumeSession').mockResolvedValue({ session_id: 'rotated-session' } as any);

    await (agent as any).createOrResumeSession();

    expect((agent as any).extra.acp_session_id).toBe('rotated-session');
    expect(onSessionIdUpdate).toHaveBeenCalledWith('rotated-session');
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

    const loadSession = vi.spyOn(conn, 'loadSession').mockResolvedValue({ session_id: 's1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ session_id: 'fresh' } as any);

    const result = await conn.resumeSession('s1', '/tmp', { mcp_servers: [] });

    expect(loadSession).toHaveBeenCalledWith('s1', '/tmp', []);
    expect(newSession).not.toHaveBeenCalled();
    expect(result.session_id).toBe('s1');
  });

  it('uses newSession for claude backend even when loadSession is declared', async () => {
    const conn = makeConnection('claude');
    setInitializeResponse(conn, { agentCapabilities: { loadSession: true } });

    const loadSession = vi.spyOn(conn, 'loadSession').mockResolvedValue({ session_id: 's1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ session_id: 's1' } as any);

    await conn.resumeSession('s1', '/tmp', { mcp_servers: [] });

    expect(loadSession).not.toHaveBeenCalled();
    expect(newSession).toHaveBeenCalledWith(
      '/tmp',
      expect.objectContaining({
        resumeSessionId: 's1',
        mcp_servers: [],
      })
    );
  });

  it('uses newSession for _meta.claudeCode capability', async () => {
    const conn = makeConnection('codebuddy');
    setInitializeResponse(conn, {
      agentCapabilities: { loadSession: true, _meta: { claudeCode: { promptQueueing: true } } },
    });

    const loadSession = vi.spyOn(conn, 'loadSession').mockResolvedValue({ session_id: 's1' } as any);
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ session_id: 's1' } as any);

    await conn.resumeSession('s1', '/tmp', { mcp_servers: [] });

    expect(loadSession).not.toHaveBeenCalled();
    expect(newSession).toHaveBeenCalled();
  });

  it('falls back to newSession when loadSession fails', async () => {
    const conn = makeConnection('qwen');
    setInitializeResponse(conn, { agentCapabilities: { loadSession: true } });

    vi.spyOn(conn, 'loadSession').mockRejectedValue(new Error('load failed'));
    const newSession = vi.spyOn(conn, 'newSession').mockResolvedValue({ session_id: 'fresh' } as any);

    const result = await conn.resumeSession('s1', '/tmp', { mcp_servers: [] });

    expect(newSession).toHaveBeenCalledWith(
      '/tmp',
      expect.objectContaining({
        resumeSessionId: 's1',
        mcp_servers: [],
      })
    );
    expect(result.session_id).toBe('fresh');
  });
});
