import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { formatManagedAgentDiagnosticMessage, managedAgentSearchText } from '@/renderer/utils/model/agentTypes';

const t = ((key: string, options?: Record<string, unknown>) => {
  switch (key) {
    case 'settings.agentManagement.errorCodes.command_not_found':
      return `Install ${String(options?.command)} and retry the connection test.`;
    case 'settings.agentManagement.errorCodes.bridge_missing':
      return `Install ${String(options?.command)} and retry the connection test.`;
    default:
      return String(options?.defaultValue ?? key);
  }
}) as unknown as TFunction;

function managedAgent(overrides: Partial<ManagedAgent>): ManagedAgent {
  return {
    id: 'agent-1',
    name: 'Codex',
    agent_type: 'acp',
    agent_source: 'builtin',
    enabled: true,
    installed: true,
    status: 'unavailable',
    sort_order: 1,
    args: [],
    env: [],
    behavior_policy: {},
    team_capable: true,
    ...overrides,
  } as ManagedAgent;
}

describe('managedAgentSearchText', () => {
  it('matches on the CLI command so "ag" finds Antigravity via agy', () => {
    const haystack = managedAgentSearchText(
      managedAgent({ name: 'Antigravity', backend: 'antigravity', command: 'agy' }),
      'zh-CN'
    );

    expect(haystack).toContain('agy');
    expect(haystack.includes('ag')).toBe(true);
  });

  it('includes localized name, description, backend, and binary name', () => {
    const haystack = managedAgentSearchText(
      managedAgent({
        name: 'Codex',
        name_i18n: { 'zh-CN': '代码助手' },
        description: 'OpenAI coding agent',
        description_i18n: { 'zh-CN': '编码智能体' },
        backend: 'codex',
        agent_source_info: { binary_name: 'codex-cli' },
      }),
      'zh-CN'
    );

    expect(haystack).toContain('代码助手');
    expect(haystack).toContain('编码智能体');
    expect(haystack).toContain('codex-cli');
  });

  it('lowercases the haystack and skips empty fields', () => {
    const haystack = managedAgentSearchText(managedAgent({ name: 'GLM Agent', command: undefined }), 'en-US');

    expect(haystack).toBe('glm agent');
  });
});

describe('formatManagedAgentDiagnosticMessage', () => {
  it('formats localized diagnostics from error code and details', () => {
    const message = formatManagedAgentDiagnosticMessage(
      t,
      managedAgent({
        last_check_error_code: 'command_not_found',
        last_check_error_details: { command: 'codex' },
        last_check_error_message: 'spawn failed',
      })
    );

    expect(message).toBe('Install codex and retry the connection test.');
  });

  it('falls back to backend message when the code is unknown', () => {
    const message = formatManagedAgentDiagnosticMessage(
      t,
      managedAgent({
        last_check_error_code: 'unknown_error_code',
        last_check_error_message: 'raw backend message',
      })
    );

    expect(message).toBe('raw backend message');
  });
});
