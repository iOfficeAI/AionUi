/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * MCP injection pipeline tests.
 *
 * Covers the 8-step injection chain:
 *  Step 5: buildTeamMcpServer() — null-guard and shape conversion
 *  Step 6: loadBuiltinSessionMcpServers() — builds final servers list
 *  Step 7: createOrResumeSession — passes mcpServers to session/load or session/new
 *  Step 8: IPC events (Task #3) — emitMcpStatus fires correct phases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── shared mocks ────────────────────────────────────────────────────────────

vi.mock('../../src/process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('../../src/process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn().mockResolvedValue({}),
  resolveNpxPath: vi.fn().mockResolvedValue('/usr/local/bin/npx'),
}));

vi.mock('../../src/process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn().mockResolvedValue(null) },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', () => ({
  promises: { readFile: vi.fn(), access: vi.fn() },
}));

// ─── ipcBridge mock (needed for mcpStatus.emit calls in createOrResumeSession) ──
// Must use vi.hoisted() so the mock factory can reference the variable before vi.mock() hoisting.

const { mockMcpStatusEmit } = vi.hoisted(() => ({
  mockMcpStatusEmit: vi.fn(),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    team: {
      mcpStatus: { emit: mockMcpStatusEmit },
      agentSpawned: { emit: vi.fn() },
      agentRemoved: { emit: vi.fn() },
      agentRenamed: { emit: vi.fn() },
    },
  },
}));

vi.mock('../../src/common/adapter/ipcBridge', () => ({
  team: {
    mcpStatus: { emit: mockMcpStatusEmit },
    agentSpawned: { emit: vi.fn() },
    agentRemoved: { emit: vi.fn() },
    agentRenamed: { emit: vi.fn() },
  },
}));

// ─── AcpConnection mock ───────────────────────────────────────────────────────

const mockLoadSession = vi.fn();
const mockNewSession = vi.fn();
const mockInitialize = vi.fn().mockResolvedValue({ agentInfo: {} });
const mockGetInitializeResponse = vi.fn().mockReturnValue(null);
const mockOn = vi.fn();
const mockDestroy = vi.fn();

vi.mock('../../src/process/agent/acp/AcpConnection', () => ({
  AcpConnection: class MockAcpConnection {
    loadSession = mockLoadSession;
    newSession = mockNewSession;
    initialize = mockInitialize;
    getInitializeResponse = mockGetInitializeResponse;
    on = mockOn;
    destroy = mockDestroy;
    sessionId = null;
  },
}));

vi.mock('../../src/process/agent/acp/modelInfo', () => ({
  buildAcpModelInfo: vi.fn(),
  summarizeAcpModelInfo: vi.fn(),
}));

vi.mock('../../src/process/agent/acp/utils', () => ({
  getClaudeModel: vi.fn(),
}));

// ─── imports ─────────────────────────────────────────────────────────────────

import { AcpAgent } from '../../src/process/agent/acp';
import { buildTeamMcpServer } from '../../src/process/agent/acp/mcpSessionConfig';
import { ProcessConfig } from '../../src/process/utils/initStorage';

// ─── helpers ─────────────────────────────────────────────────────────────────

const TEAM_MCP_CONFIG = {
  name: 'aionui-team-abc',
  command: 'node',
  args: ['/app/scripts/team-mcp-stdio.mjs'],
  env: [
    { name: 'TEAM_MCP_PORT', value: '9001' },
    { name: 'TEAM_MCP_TOKEN', value: 'tok' },
    { name: 'TEAM_AGENT_SLOT_ID', value: 'slot-leader' },
  ],
};

function createCodexAgent(extra: Record<string, unknown> = {}) {
  return new AcpAgent({
    id: 'conv-test-1',
    backend: 'codex',
    workingDir: '/tmp',
    extra: {
      workspace: '/tmp',
      backend: 'codex' as const,
      ...extra,
    },
    onStreamEvent: vi.fn(),
    onSessionIdUpdate: vi.fn(),
  });
}

function createClaudeAgent(extra: Record<string, unknown> = {}) {
  return new AcpAgent({
    id: 'conv-test-1',
    backend: 'claude',
    workingDir: '/tmp',
    extra: {
      workspace: '/tmp',
      backend: 'claude' as const,
      ...extra,
    },
    onStreamEvent: vi.fn(),
    onSessionIdUpdate: vi.fn(),
  });
}

async function callCreateOrResume(agent: AcpAgent) {
  return (agent as any).createOrResumeSession.bind(agent)();
}

async function callLoadBuiltin(agent: AcpAgent) {
  return (agent as any).loadBuiltinSessionMcpServers.bind(agent)();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: buildTeamMcpServer — null-guard and shape
// ─────────────────────────────────────────────────────────────────────────────

describe('Step 5: buildTeamMcpServer — null-guard and shape', () => {
  it('returns null when config is undefined', () => {
    expect(buildTeamMcpServer(undefined)).toBeNull();
  });

  it('returns null when config is null', () => {
    expect(buildTeamMcpServer(null)).toBeNull();
  });

  it('returns null when command is empty string', () => {
    expect(buildTeamMcpServer({ name: 'team-mcp', command: '', args: [], env: [] })).toBeNull();
  });

  it('returns correct stdio shape when config is valid', () => {
    const result = buildTeamMcpServer(TEAM_MCP_CONFIG);
    expect(result).not.toBeNull();
    expect(result).toEqual(TEAM_MCP_CONFIG);
  });

  it('preserves TEAM_AGENT_SLOT_ID for per-agent identity', () => {
    const result = buildTeamMcpServer({
      name: 'aionui-team-abc',
      command: 'node',
      args: [],
      env: [{ name: 'TEAM_AGENT_SLOT_ID', value: 'slot-leader' }],
    });
    expect(result).not.toBeNull();
    expect(result!.env).toContainEqual({ name: 'TEAM_AGENT_SLOT_ID', value: 'slot-leader' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 6: loadBuiltinSessionMcpServers — builds servers list
// ─────────────────────────────────────────────────────────────────────────────

describe('Step 6: loadBuiltinSessionMcpServers — builds servers list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProcessConfig.get).mockResolvedValue(null);
  });

  it('returns [] when no mcp.config and no teamMcpStdioConfig', async () => {
    expect(await callLoadBuiltin(createCodexAgent())).toEqual([]);
  });

  it('returns [teamServer] when teamMcpStdioConfig is set', async () => {
    const agent = createCodexAgent({ teamMcpStdioConfig: TEAM_MCP_CONFIG });
    const servers = await callLoadBuiltin(agent);
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({ name: 'aionui-team-abc', command: 'node' });
    expect(servers[0].env).toContainEqual({ name: 'TEAM_AGENT_SLOT_ID', value: 'slot-leader' });
  });

  it('returns [] when teamMcpStdioConfig has empty command', async () => {
    const agent = createCodexAgent({
      teamMcpStdioConfig: { name: 'team-mcp', command: '', args: [], env: [] },
    });
    expect(await callLoadBuiltin(agent)).toEqual([]);
  });

  // Checklist #4: loadBuiltinSessionMcpServers failure → empty array + warn logged
  it('returns [] on ProcessConfig error and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(ProcessConfig.get).mockRejectedValue(new Error('storage error'));

    const servers = await callLoadBuiltin(createCodexAgent());

    expect(Array.isArray(servers)).toBe(true);
    expect(servers).toHaveLength(0);
    // Must warn — silent swallow without any log is unacceptable
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load built-in MCP config'),
      expect.stringContaining('storage error')
    );
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 7a: routing — Codex vs non-Codex
// ─────────────────────────────────────────────────────────────────────────────

describe('Step 7a: createOrResumeSession — Codex vs non-Codex routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSession.mockResolvedValue({ sessionId: 'session-abc' });
    mockNewSession.mockResolvedValue({ sessionId: 'new-session-123' });
    vi.mocked(ProcessConfig.get).mockResolvedValue(null);
  });

  it('Codex resume calls loadSession, never newSession', async () => {
    const agent = createCodexAgent({
      acpSessionId: 'session-abc',
      acpSessionConversationId: 'conv-test-1',
    });
    await callCreateOrResume(agent);
    expect(mockLoadSession).toHaveBeenCalledOnce();
    expect(mockNewSession).not.toHaveBeenCalled();
  });

  it('non-Codex (claude) resume calls newSession, never loadSession', async () => {
    const agent = createClaudeAgent({
      acpSessionId: 'session-abc',
      acpSessionConversationId: 'conv-test-1',
    });
    await callCreateOrResume(agent);
    expect(mockNewSession).toHaveBeenCalledOnce();
    expect(mockLoadSession).not.toHaveBeenCalled();
  });

  it('non-Codex resume: newSession options contain mcpServers array', async () => {
    const agent = createClaudeAgent({
      acpSessionId: 'session-abc',
      acpSessionConversationId: 'conv-test-1',
      teamMcpStdioConfig: TEAM_MCP_CONFIG,
    });
    await callCreateOrResume(agent);
    const opts = mockNewSession.mock.calls[0][1];
    expect(Array.isArray(opts.mcpServers)).toBe(true);
    expect(opts.mcpServers).toHaveLength(1);
    expect(opts.mcpServers[0]).toMatchObject({ name: 'aionui-team-abc' });
  });

  it('fresh session (no prior sessionId) calls newSession with mcpServers', async () => {
    const agent = createCodexAgent({ teamMcpStdioConfig: TEAM_MCP_CONFIG });
    await callCreateOrResume(agent);
    expect(mockLoadSession).not.toHaveBeenCalled();
    const opts = mockNewSession.mock.calls[0][1];
    expect(opts.mcpServers).toHaveLength(1);
  });

  it('resume fallback to newSession when loadSession throws', async () => {
    mockLoadSession.mockRejectedValue(new Error('session expired'));
    const agent = createCodexAgent({
      acpSessionId: 'session-abc',
      acpSessionConversationId: 'conv-test-1',
    });
    await callCreateOrResume(agent);
    expect(mockLoadSession).toHaveBeenCalled();
    expect(mockNewSession).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 7b: PROOF-OF-FIX — Codex loadSession receives mcpServers (Task #1)
//
// FAIL on unfixed code: loadSession called with 2 args only (sessionId, cwd)
// PASS after fix: loadSession called with 3rd arg { mcpServers }
// ─────────────────────────────────────────────────────────────────────────────

describe('Step 7b PROOF-OF-FIX: Codex loadSession receives mcpServers (Task #1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSession.mockResolvedValue({ sessionId: 'session-abc' });
    mockNewSession.mockResolvedValue({ sessionId: 'new-session-123' });
    vi.mocked(ProcessConfig.get).mockResolvedValue(null);
  });

  it('loadSession receives { mcpServers: [] } when no team config', async () => {
    const agent = createCodexAgent({
      acpSessionId: 'session-abc',
      acpSessionConversationId: 'conv-test-1',
    });
    await callCreateOrResume(agent);
    expect(mockLoadSession).toHaveBeenCalledOnce();
    const args = mockLoadSession.mock.calls[0];
    // args[2] = [] (direct mcpServers array) after fix
    expect(args[2]).toEqual([]);
  });

  it('PROOF-OF-FIX: loadSession receives team MCP server when teamMcpStdioConfig is set', async () => {
    const agent = createCodexAgent({
      acpSessionId: 'session-abc',
      acpSessionConversationId: 'conv-test-1',
      teamMcpStdioConfig: TEAM_MCP_CONFIG,
    });
    await callCreateOrResume(agent);
    expect(mockLoadSession).toHaveBeenCalledOnce();
    const args = mockLoadSession.mock.calls[0];
    // On unfixed: args[2] is undefined → FAILS
    // On fixed:   args[2] = [{name:'aionui-team-abc',...}] (direct array) → PASSES
    expect(args[2]).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'aionui-team-abc', command: 'node' })])
    );
    expect(args[2][0].env).toContainEqual({ name: 'TEAM_AGENT_SLOT_ID', value: 'slot-leader' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 8: Task #3 IPC events — emitMcpStatus fires correct phases
// ─────────────────────────────────────────────────────────────────────────────

describe('Step 8: Task #3 IPC mcpStatus events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSession.mockResolvedValue({ sessionId: 'session-abc' });
    mockNewSession.mockResolvedValue({ sessionId: 'new-session-123' });
    vi.mocked(ProcessConfig.get).mockResolvedValue(null);
  });

  it('does NOT emit mcpStatus when no teamMcpStdioConfig (not a team agent)', async () => {
    const agent = createCodexAgent();
    await callCreateOrResume(agent);
    expect(mockMcpStatusEmit).not.toHaveBeenCalled();
  });

  it('emits session_injecting then session_ready for fresh session with team config', async () => {
    const agent = createCodexAgent({ teamMcpStdioConfig: TEAM_MCP_CONFIG });
    await callCreateOrResume(agent);

    const phases = mockMcpStatusEmit.mock.calls.map((c) => c[0].phase);
    expect(phases).toContain('session_injecting');
    expect(phases).toContain('session_ready');
    // session_injecting must come before session_ready
    expect(phases.indexOf('session_injecting')).toBeLessThan(phases.indexOf('session_ready'));
  });

  it('emits session_injecting then session_ready for Codex resume path', async () => {
    const agent = createCodexAgent({
      acpSessionId: 'session-abc',
      acpSessionConversationId: 'conv-test-1',
      teamMcpStdioConfig: TEAM_MCP_CONFIG,
    });
    await callCreateOrResume(agent);

    const phases = mockMcpStatusEmit.mock.calls.map((c) => c[0].phase);
    expect(phases).toContain('session_injecting');
    expect(phases).toContain('session_ready');
  });

  it('emits session_error when loadSession throws', async () => {
    mockLoadSession.mockRejectedValue(new Error('session expired'));
    const agent = createCodexAgent({
      acpSessionId: 'session-abc',
      acpSessionConversationId: 'conv-test-1',
      teamMcpStdioConfig: TEAM_MCP_CONFIG,
    });
    await callCreateOrResume(agent);

    const errorCalls = mockMcpStatusEmit.mock.calls.filter((c) => c[0].phase === 'session_error');
    expect(errorCalls.length).toBeGreaterThan(0);
    // error message must be present — not just a boolean
    expect(errorCalls[0][0].error).toBeTruthy();
    expect(typeof errorCalls[0][0].error).toBe('string');
  });

  it('emits session_error with error message when newSession throws', async () => {
    mockNewSession.mockRejectedValue(new Error('connection refused'));
    const agent = createCodexAgent({ teamMcpStdioConfig: TEAM_MCP_CONFIG });

    await expect(callCreateOrResume(agent)).rejects.toThrow('connection refused');

    const errorCalls = mockMcpStatusEmit.mock.calls.filter((c) => c[0].phase === 'session_error');
    expect(errorCalls.length).toBeGreaterThan(0);
    expect(errorCalls[0][0].error).toContain('connection refused');
  });

  it('emits degraded when team config is missing but mcpServers ends up empty', async () => {
    // Agent has teamId name pattern but somehow mcpServers is [] (e.g., command was empty)
    const agent = createCodexAgent({
      teamMcpStdioConfig: { name: 'aionui-team-abc', command: '', args: [], env: [] },
    });
    await callCreateOrResume(agent);

    const phases = mockMcpStatusEmit.mock.calls.map((c) => c[0].phase);
    expect(phases).toContain('degraded');
  });

  it('event payload includes teamId derived from server name', async () => {
    const agent = createCodexAgent({ teamMcpStdioConfig: TEAM_MCP_CONFIG });
    await callCreateOrResume(agent);

    const readyCalls = mockMcpStatusEmit.mock.calls.filter((c) => c[0].phase === 'session_ready');
    expect(readyCalls.length).toBeGreaterThan(0);
    const payload = readyCalls[0][0];
    // teamId extracted from 'aionui-team-abc' → 'abc'
    expect(payload.teamId).toBe('abc');
  });

  it('event payload includes slotId (conversationId) for routing to agent bubble', async () => {
    const agent = createCodexAgent({ teamMcpStdioConfig: TEAM_MCP_CONFIG });
    await callCreateOrResume(agent);

    const injectingCalls = mockMcpStatusEmit.mock.calls.filter((c) => c[0].phase === 'session_injecting');
    expect(injectingCalls.length).toBeGreaterThan(0);
    const payload = injectingCalls[0][0];
    expect(payload.slotId).toBe('conv-test-1');
  });

  it('session_ready payload includes serverCount', async () => {
    const agent = createCodexAgent({ teamMcpStdioConfig: TEAM_MCP_CONFIG });
    await callCreateOrResume(agent);

    const readyCalls = mockMcpStatusEmit.mock.calls.filter((c) => c[0].phase === 'session_ready');
    expect(readyCalls[0][0].serverCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Checklist #8: End-to-end falsification plan
//
// How to verify "frontend can see MCP injection status" in a real AionUi env:
//
// HAPPY PATH:
//   1. Launch AionUi, open a Team with at least one ACP (claude/codex) agent
//   2. Send first message to the team
//   3. Open DevTools → search IPC event 'team.mcp.status'
//      Expected sequence per agent:
//        tcp_ready  { teamId, port }
//        session_injecting  { teamId, slotId, serverCount: 1 }
//        session_ready      { teamId, slotId, serverCount: 1 }
//   4. Frontend team agent bubble should show MCP status indicator = ready
//
// FAILURE INJECTION (prove falsifiability):
//   A. Rename scripts/team-mcp-stdio.mjs → force tcp_error
//      Expected: tcp_error event fires, frontend shows error state
//
//   B. Set teamMcpStdioConfig.command = '' in DB before session starts
//      Expected: session_injecting fires with serverCount=0, then degraded
//      Frontend shows degraded/warning state
//
//   C. Kill TCP server mid-flight (ECONNREFUSED)
//      Expected: session_error fires with error string, NOT silent
//
//   D. Gemini team agent — no mcpStatus events at all (known gap)
//      Frontend should NOT show MCP status for Gemini agents
//
// DIAGNOSIS COMMANDS:
//   grep "Injecting team MCP server" ~/Library/Logs/AionUi/*.log
//   sqlite3 ~/Library/.../aionui.db "SELECT extra FROM conversations WHERE id='<agentConvId>'"
//     → extra.teamMcpStdioConfig should be non-null
//   ACP_PERF_LOG=1 bun run dev
//     → session/load or session/new request body logged, check mcpServers field
// ─────────────────────────────────────────────────────────────────────────────

describe('Checklist #8: end-to-end falsification (documentation)', () => {
  it.todo('E2E happy path: tcp_ready → session_injecting → session_ready events received in order');
  it.todo('E2E failure A: missing stdio script → tcp_error event fires, frontend shows error');
  it.todo('E2E failure B: empty command → degraded event fires, frontend shows warning');
  it.todo('E2E failure C: session/load throws → session_error fires with non-empty error string');
  it.todo('E2E Gemini gap: no mcpStatus events for Gemini agents (documented known limitation)');
});
