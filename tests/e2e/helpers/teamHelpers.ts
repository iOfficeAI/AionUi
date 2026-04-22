import type { Page } from '@playwright/test';
import { invokeBridge } from './bridge';
import { TEAM_SUPPORTED_BACKENDS } from './teamConfig';

type TeamAgent = {
  slotId: string;
  conversationId: string;
  role: string;
  agentType: string;
  agentName: string;
  conversationType: string;
  status: string;
};

type TeamRecord = { id: string; name: string; agents: TeamAgent[] };

function resolveConversationType(backend: string): string {
  if (backend === 'claude' || backend === 'codex') return 'acp';
  if (backend === 'gemini') return 'gemini';
  return backend;
}

/**
 * Create a new team via IPC bridge. Returns the created teamId.
 * Throws if no supported backend is available — callers should skip the test in that case.
 *
 * @param page      Playwright page
 * @param name      Team name
 * @param backend   Leader backend type (defaults to first TEAM_SUPPORTED_BACKENDS entry)
 */
export async function createTeam(page: Page, name: string, backend?: string): Promise<string> {
  if (TEAM_SUPPORTED_BACKENDS.size === 0) {
    throw new Error('No supported team backends available — skip this test');
  }

  const agentType = backend ?? [...TEAM_SUPPORTED_BACKENDS][0];
  const conversationType = resolveConversationType(agentType);

  const result = await invokeBridge<TeamRecord>(page, 'team.create', {
    userId: 'system_default_user',
    name,
    workspace: '',
    workspaceMode: 'shared',
    agents: [
      {
        slotId: 'slot-lead',
        conversationId: '',
        role: 'leader',
        agentType,
        agentName: 'Leader',
        conversationType,
        status: 'idle',
      },
    ],
  });

  return result.id;
}

/**
 * Find-or-create a team by name. Returns teamId.
 * Uses `createTeam` if not found.
 */
export async function ensureTeam(page: Page, name: string, backend?: string): Promise<string> {
  const teams = await invokeBridge<TeamRecord[]>(page, 'team.list', {
    userId: 'system_default_user',
  });

  const existing = teams.find((t) => t.name === name);
  if (existing) return existing.id;

  return createTeam(page, name, backend);
}

/**
 * Delete a team by id. No-op if team doesn't exist.
 */
export async function deleteTeam(page: Page, id: string): Promise<void> {
  await invokeBridge(page, 'team.remove', { id }).catch(() => {});
}

/**
 * Remove all teams whose name matches `name`. Useful for pre-test cleanup.
 */
export async function cleanupTeamsByName(page: Page, name: string): Promise<void> {
  const teams = await invokeBridge<TeamRecord[]>(page, 'team.list', {
    userId: 'system_default_user',
  }).catch(() => [] as TeamRecord[]);

  for (const t of teams.filter((t) => t.name === name)) {
    await invokeBridge(page, 'team.remove', { id: t.id }).catch(() => {});
  }
}
