/**
 * Team Create — Phase 2 assistant-only leader selection.
 *
 * Verifies that the Team create flow consumes assistant rows directly instead
 * of a mixed agent/preset dropdown, and that the created leader persists
 * assistant identity.
 */
import { test, expect } from '../fixtures';
import { invokeBridge, navigateTo } from '../helpers';

type TTeamBackendAgent = {
  role: string;
  name: string;
  assistant_backend: string;
  assistant_id?: string;
  custom_agent_id?: string;
};

type TTeam = {
  id: string;
  name: string;
  assistants: TTeamBackendAgent[];
};

test.describe('Team Create - assistant leader', () => {
  test('can create a team with an assistant leader from the unified assistant list', async ({ page }) => {
    test.setTimeout(120_000);

    let createdTeamId: string | undefined;

    try {
      await navigateTo(page, '#/team');
      const createBtn = page.locator('[data-testid="team-create-btn"]').first();
      await expect(createBtn).toBeVisible({ timeout: 10_000 });
      await createBtn.click();

      const modal = page.locator('.team-create-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      await expect(modal.locator('[data-testid="team-create-leader-select"]')).toHaveCount(0);

      const leaderOptions = modal.locator('[data-testid^="team-create-agent-option-"]');
      await expect(leaderOptions.first()).toBeVisible({ timeout: 10_000 });

      const optionCount = await leaderOptions.count();
      let targetOption;
      for (let index = 0; index < optionCount; index += 1) {
        const candidate = leaderOptions.nth(index);
        const classes = (await candidate.getAttribute('class')) || '';
        if (!classes.includes('cursor-not-allowed')) {
          targetOption = candidate;
          break;
        }
      }

      if (!targetOption) {
        test.skip(true, 'No selectable assistants available in this environment');
        return;
      }

      const targetTestId = await targetOption.getAttribute('data-testid');
      expect(targetTestId).toBeTruthy();
      const expectedAssistantId = targetTestId!.replace('team-create-agent-option-', '');
      await targetOption.click();

      const teamName = `E2E Assistant Team ${Date.now()}`;
      await modal.locator('[data-testid="team-create-name-input"]').fill(teamName);

      const confirmBtn = modal.getByRole('button', { name: /create team|创建团队/i });
      await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
      await confirmBtn.click();

      await expect(modal).toBeHidden({ timeout: 15_000 });
      await page.waitForURL(/\/team\//, { timeout: 15_000 });

      createdTeamId = page.url().match(/team\/([^/?#]+)/)?.[1];
      expect(createdTeamId).toBeTruthy();

      const team = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId });
      expect(team).toBeTruthy();
      expect(team!.assistants.length).toBe(1);

      const leader = team!.assistants[0];
      expect(['lead', 'leader']).toContain(leader.role);
      expect(leader.assistant_id).toBe(expectedAssistantId);
      expect(leader.assistant_backend).toBeTruthy();
    } finally {
      if (createdTeamId) {
        await invokeBridge(page, 'team.remove', { id: createdTeamId }).catch(() => {});
        const deleted = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId }).catch(() => null);
        expect(deleted).toBeNull();
      }
    }
  });
});
