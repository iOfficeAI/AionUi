/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type HttpCall = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
};

const httpBridgeMocks = vi.hoisted(() => {
  const calls: HttpCall[] = [];
  let nextResponse: unknown;
  const provider =
    (method: HttpCall['method']) =>
    <Data, Params = undefined>(path: string | ((params: Params) => string), mapBody?: (params: Params) => unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        const resolvedPath = typeof path === 'function' ? path(params as Params) : path;
        calls.push({
          method,
          path: resolvedPath,
          body: mapBody && params !== undefined ? mapBody(params as Params) : undefined,
        });
        const response = nextResponse ?? { active_run: null };
        nextResponse = undefined;
        return response as Data;
      }),
    });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });

  return {
    calls,
    setNextResponse: (response: unknown) => {
      nextResponse = response;
    },
    httpGet: provider('GET'),
    httpPost: provider('POST'),
    httpPut: provider('PUT'),
    httpPatch: provider('PATCH'),
    httpDelete: provider('DELETE'),
    httpRequest: vi.fn(),
    stubProvider: vi.fn((name: string, defaultValue: unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async () => defaultValue),
    })),
    withResponseMap: vi.fn(
      (
        inner: { provider: unknown; invoke: (params?: unknown) => Promise<unknown> },
        map: (raw: unknown) => unknown
      ) => ({
        provider: inner.provider,
        invoke: vi.fn(async (params?: unknown) => map(await inner.invoke(params))),
      })
    ),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      on: vi.fn(() => vi.fn()),
      emit: vi.fn(),
    })),
  },
}));

describe('ipcBridge team adapter', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
  });

  it('getRunState calls GET /api/teams/{team_id}/run-state', async () => {
    const { team } = await import('@/common/adapter/ipcBridge');

    await team.getRunState.invoke({ team_id: 'team-1' });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'GET',
      path: '/api/teams/team-1/run-state',
      body: undefined,
    });
  });

  it('updateAgentModel persists the observed model through the team agent route', async () => {
    const { team } = await import('@/common/adapter/ipcBridge');

    await team.updateAgentModel.invoke({ team_id: 'team-1', slot_id: 'worker-1', model_id: 'gpt-5.6-sol' });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'PATCH',
      path: '/api/teams/team-1/agents/worker-1/model',
      body: { model_id: 'gpt-5.6-sol' },
    });
  });

  it('setLead posts the selected slot and maps the team response', async () => {
    const { team } = await import('@/common/adapter/ipcBridge');
    httpBridgeMocks.setNextResponse({
      id: 'team-1',
      user_id: 'user-1',
      name: 'Alpha',
      workspace_mode: 'shared',
      leader_agent_id: 'worker-1',
      agents: [],
    });

    const response = await team.setLead.invoke({ team_id: 'team-1', slot_id: 'worker-1' });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'POST',
      path: '/api/teams/team-1/lead',
      body: { slot_id: 'worker-1' },
    });
    expect(response.id).toBe('team-1');
    expect(response.leader_assistant_id).toBe('worker-1');
  });

  it('interruptAgent posts the durable replacement message to the member interrupt route', async () => {
    const { team } = await import('@/common/adapter/ipcBridge');

    await team.interruptAgent.invoke({
      team_id: 'team-1',
      slot_id: 'worker-1',
      input: 'Use the corrected requirement',
      files: [{ kind: 'local', path: '/tmp/spec.md' }],
      reason: 'leader_intervention',
    });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'POST',
      path: '/api/teams/team-1/agents/worker-1/interrupt',
      body: {
        message: 'Use the corrected requirement',
        files: [{ kind: 'local', path: '/tmp/spec.md' }],
        reason: 'leader_intervention',
        queued_policy: 'retain',
      },
    });
  });

  it('team.create posts canonical agents payload', async () => {
    const { team } = await import('@/common/adapter/ipcBridge');

    await team.create.invoke({
      user_id: 'user-1',
      name: 'Alpha',
      workspace: '/tmp/ws',
      workspace_mode: 'shared',
      agents: [
        {
          role: 'leader',
          assistant_name: 'Lead',
          assistant_id: 'assistant-lead',
          model: 'claude-sonnet-4',
        },
      ],
    });

    expect(httpBridgeMocks.calls).toContainEqual({
      method: 'POST',
      path: '/api/teams',
      body: {
        name: 'Alpha',
        workspace: '/tmp/ws',
        agents: [
          {
            name: 'Lead',
            role: 'lead',
            model: 'claude-sonnet-4',
            assistant_id: 'assistant-lead',
          },
        ],
      },
    });
    expect(JSON.stringify(httpBridgeMocks.calls.at(-1)?.body)).not.toContain('assistants');
  });
});
