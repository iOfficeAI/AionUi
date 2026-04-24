import type { Page } from '@playwright/test';
import { invokeBridge } from './bridge';
import { TEAM_SUPPORTED_BACKENDS } from './teamConfig';

/** Backend-shaped agent payload sent to POST /api/teams. */
type TeamAgent = {
  slot_id?: string;
  conversation_id?: string;
  role: string;
  name: string;
  backend: string;
  model: string;
  status?: string;
};

type TeamRecord = { id: string; name: string; agents: TeamAgent[] };

/** Map a leader backend selector to the backend `{ backend, model }` pair expected by aionui-backend. */
function resolveBackendAndModel(leaderType: string): { backend: string; model: string } {
  if (leaderType === 'claude' || leaderType === 'codex') return { backend: 'acp', model: leaderType };
  return { backend: leaderType, model: leaderType };
}

/**
 * Create a new team via IPC bridge. Returns the created teamId.
 * Throws if no supported backend is available — callers should skip the test in that case.
 *
 * @param page         Playwright page
 * @param name         Team name
 * @param leaderType   Leader selector: 'gemini' | 'claude' | 'codex' | ... (defaults to first TEAM_SUPPORTED_BACKENDS entry)
 */
export async function createTeam(page: Page, name: string, leaderType?: string): Promise<string> {
  if (TEAM_SUPPORTED_BACKENDS.size === 0) {
    throw new Error('No supported team backends available — skip this test');
  }

  const leader = leaderType ?? [...TEAM_SUPPORTED_BACKENDS][0];
  const { backend, model } = resolveBackendAndModel(leader);

  const result = await invokeBridge<TeamRecord>(page, 'team.create', {
    name,
    agents: [{ name: 'Leader', role: 'lead', backend, model }],
  });

  // HTTP-based creation bypasses the UI's onCreated→refreshTeams callback.
  // Reload page to force SWR to refetch the team list from backend.
  const currentUrl = page.url();
  await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2_000);

  return result.id;
}

/**
 * Find-or-create a team by name. Returns teamId.
 */
export async function ensureTeam(page: Page, name: string, leaderType?: string): Promise<string> {
  const teams = await invokeBridge<TeamRecord[]>(page, 'team.list', {
    user_id: 'system_default_user',
  });

  const existing = teams.find((t) => t.name === name);
  if (existing) return existing.id;

  return createTeam(page, name, leaderType);
}

/**
 * Delete a team by id. No-op if team doesn't exist.
 */
export async function deleteTeam(page: Page, id: string): Promise<void> {
  await invokeBridge(page, 'team.remove', { id }).catch(() => {});
}

/**
 * Remove all teams whose name matches `name`. Useful for pre-test cleanup.
 *
 * After deleting matches, reload the page so SWR refetches the sidebar team
 * list from the backend — otherwise stale rows from the previous render can
 * linger and cause Modal.confirm.onOk to target a dead teamId.
 */
export async function cleanupTeamsByName(page: Page, name: string): Promise<void> {
  const teams = await invokeBridge<TeamRecord[]>(page, 'team.list', {
    user_id: 'system_default_user',
  }).catch(() => [] as TeamRecord[]);

  const matches = teams.filter((t) => t.name === name);
  for (const t of matches) {
    await invokeBridge(page, 'team.remove', { id: t.id }).catch(() => {});
  }

  if (matches.length > 0) {
    const url = page.url();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
  }
}
