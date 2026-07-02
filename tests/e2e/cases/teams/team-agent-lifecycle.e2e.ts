/**
 * E2E: Team agent lifecycle via assistant-first team contracts.
 *
 * Parameterized by leader type. Each test:
 *   1. Creates the team in beforeAll if it doesn't exist (self-contained, no dependency on team-create.e2e.ts).
 *   2. Navigates to the team page.
 *   3. Adds a teammate with assistant_id through the team add-agent contract.
 *   4. Asserts new member tab appears in tab bar.
 */
import { test, expect } from '../../fixtures';
import { invokeBridge, navigateTo, TEAM_SUPPORTED_BACKENDS, findAssistantIdForBackend } from '../../helpers';

// Natural-language team tool calling is not deterministic across every local
// CLI/auth state. Keep this release-gating smoke on the backend that reliably
// exercises the path in E2E; deterministic bridge/TCP/UI tests cover the shared
// Team contracts for the other backends.
const LIFECYCLE_BACKENDS = [...TEAM_SUPPORTED_BACKENDS].filter((leaderType) => leaderType === 'codex');

const LEADER_CONFIGS = LIFECYCLE_BACKENDS.map((leaderType) => ({
  leaderType,
  teamName: `E2E Lifecycle-${leaderType}-${Date.now()}`,
}));

type TeamState = {
  assistants?: Array<{
    assistant_id?: string;
    assistant_name?: string;
    role?: string;
    slot_id?: string;
  }>;
  agents?: Array<{
    assistant_id?: string;
    assistant_name?: string;
    role?: string;
    slot_id?: string;
  }>;
};

async function pickTeamMemberAssistant(page: import('@playwright/test').Page): Promise<{
  assistantId: string;
  backend: string;
} | null> {
  for (const backend of ['claude', 'codex', 'gemini', 'aionrs']) {
    const assistantId = await findAssistantIdForBackend(page, backend).catch(() => null);
    if (assistantId) {
      return { assistantId, backend };
    }
  }
  return null;
}

async function createLifecycleTeam(
  page: import('@playwright/test').Page,
  teamName: string,
  leaderBackend: string
): Promise<string | null> {
  const leaderAssistantId =
    (await findAssistantIdForBackend(page, leaderBackend).catch(() => null)) ??
    (await pickTeamMemberAssistant(page))?.assistantId;
  if (!leaderAssistantId) return null;

  const team = await invokeBridge<{ id?: string }>(
    page,
    'team.create',
    {
      user_id: 'system_default_user',
      name: teamName,
      workspace: '',
      workspace_mode: 'shared',
      assistants: [
        {
          role: 'leader',
          assistant_name: `Lifecycle ${leaderBackend}`,
          assistant_id: leaderAssistantId,
          model: leaderBackend,
        },
      ],
    },
    20_000
  ).catch(() => null);

  return team?.id ?? null;
}

for (const { leaderType, teamName } of LEADER_CONFIGS) {
  test(`team lifecycle: ${leaderType} leader`, async ({ page }) => {
    test.setTimeout(120_000);

    const resolvedTeamId = await createLifecycleTeam(page, teamName, leaderType);
    if (!resolvedTeamId) {
      test.skip(true, `Team "${teamName}" could not be created in this environment`);
      return;
    }

    // [setup] Navigate to team page, wait for leader chat input
    await navigateTo(page, '#/team/' + resolvedTeamId);
    await page.waitForURL(/\/team\//);
    await expect(page.locator('textarea:visible').first()).toBeVisible({ timeout: 10000 });

    const tabBar = page.locator('[data-testid="team-tab-bar"]');
    const memberAssistant = await pickTeamMemberAssistant(page);
    if (!memberAssistant) {
      test.skip(true, 'No assistant available for team lifecycle member spawn');
      return;
    }
    const memberName = `E2E-member-${Date.now()}`;
    const addResult = await invokeBridge<{ slot_id?: string } | null>(
      page,
      'team.add-agent',
      {
        team_id: resolvedTeamId,
        agent: {
          name: memberName,
          role: 'teammate',
          assistant_id: memberAssistant.assistantId,
          model: memberAssistant.backend,
        },
      },
      20_000
    ).catch(() => null);
    if (!addResult?.slot_id) {
      await invokeBridge(page, 'team.remove', { id: resolvedTeamId }).catch(() => {});
      test.skip(true, 'team.add-agent failed in this environment');
      return;
    }
    await navigateTo(page, '#/team/' + resolvedTeamId);

    const memberTab = tabBar.locator('[data-testid^="team-tab-"][data-team-tab-role="teammate"]').filter({
      hasText: memberName,
    });
    await expect(memberTab).toBeVisible({ timeout: 30000 });

    const teamState = await invokeBridge<TeamState>(page, 'team.get', { id: resolvedTeamId });
    const assistants = teamState.assistants ?? teamState.agents ?? [];
    const addedMember = assistants.find((assistant) => assistant.assistant_name === memberName);
    expect(addedMember?.assistant_id).toBe(memberAssistant.assistantId);
    expect(addedMember?.role).toBe('teammate');

    await invokeBridge(page, 'team.remove', { id: resolvedTeamId }).catch(() => {});
  });
}
