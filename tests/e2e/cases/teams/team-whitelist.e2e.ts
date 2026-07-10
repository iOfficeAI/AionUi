/**
 * E2E Scenario 6: Team assistant-only leader options.
 *
 * Verifies: UI create modal renders unified assistant rows and does not expose
 * the removed mixed CLI-agent / preset-assistant option groups.
 */
import { test, expect } from '../../fixtures';
import { httpDelete, httpGet, httpPost, navigateTo } from '../../helpers';
import type { Assistant } from '@/common/types/agent/assistantTypes';

type AgentMetadata = {
  id: string;
  name: string;
};

async function waitForAssistant(page: import('@playwright/test').Page, assistantId: string): Promise<Assistant> {
  await expect
    .poll(
      async () => {
        const assistants = await httpGet<Assistant[]>(page, '/api/assistants');
        return assistants.some((assistant) => assistant.id === assistantId);
      },
      {
        timeout: 15_000,
        message: `Waiting for generated assistant ${assistantId}`,
      }
    )
    .toBe(true);

  const assistants = await httpGet<Assistant[]>(page, '/api/assistants');
  const found = assistants.find((assistant) => assistant.id === assistantId);
  if (!found) {
    throw new Error(`Generated assistant ${assistantId} disappeared after materialization`);
  }
  return found;
}

test.describe('Team Assistant Leader Options', () => {
  test('UI shows assistant-only rows in create modal', async ({ page }) => {
    await navigateTo(page, '#/team');

    // Close any leftover modal from previous tests before interacting with the page
    const existingModal = page.locator('.arco-modal button[aria-label="Close"]');
    if (await existingModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      await existingModal.first().click({ force: true });
      await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
    }

    await expect(page.locator('[data-testid="team-create-btn"]').first()).toBeVisible({ timeout: 10000 });

    // Open Create Team modal
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await createBtn.click();

    const modal = page.locator('.team-create-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    const allOptions = modal.locator('[data-testid^="team-create-agent-option-"]');
    const emptyState = modal.getByText(/No supported assistants available|未检测到可用的助手|没有支持的助手/i);
    const noSearchResults = modal.getByText(/No results found|未找到结果/i);
    await expect
      .poll(
        async () => {
          const optionCount = await allOptions.count();
          if (optionCount > 0) return 'options';
          if (await emptyState.isVisible().catch(() => false)) return 'empty';
          if (await noSearchResults.isVisible().catch(() => false)) return 'empty';
          return 'loading';
        },
        {
          timeout: 5000,
          message: 'Waiting for team assistant options or empty state to render',
        }
      )
      .not.toBe('loading');

    await page.screenshot({ path: 'tests/e2e/results/team-assistant-options-01-list.png' });

    const totalCount = await allOptions.count();
    const assistants = await httpGet<Assistant[]>(page, '/api/assistants');

    if (totalCount === 0) {
      await expect(emptyState.or(noSearchResults).first()).toBeVisible();
      expect(assistants.some((assistant) => assistant.team_selectable)).toBe(false);
      return;
    }

    await expect(allOptions.first()).toBeVisible({ timeout: 5000 });

    const testIds = (
      await Promise.all(
        Array.from({ length: totalCount }, (_, index) => allOptions.nth(index).getAttribute('data-testid'))
      )
    ).filter((testId): testId is string => Boolean(testId));

    const assistantIds = new Set(assistants.map((assistant) => assistant.id));
    const optionAssistantIds = testIds.map((id) => id.replace('team-create-agent-option-', ''));

    expect(testIds.every((id) => !id.includes('cli::') && !id.includes('preset::'))).toBeTruthy();
    expect(optionAssistantIds.every((id) => assistantIds.has(id))).toBeTruthy();

    await page.locator('.arco-modal button[aria-label="Close"]').first().click();
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
  });

  test('UI keeps backend team_selectable assistants selectable', async ({ page }) => {
    test.skip(
      process.env.AIONUI_BYPASS_PROBE !== '1',
      'This deterministic custom-agent e2e requires AIONUI_BYPASS_PROBE=1.'
    );
    test.setTimeout(90_000);

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    let customAgentId: string | undefined;

    try {
      const agent = await httpPost<AgentMetadata>(page, '/api/agents/custom', {
        name: `E2E Team Selectable Agent ${suffix}`,
        command: process.execPath,
        args: [],
        env: [],
        advanced: {
          behavior_policy: {
            supports_team: true,
          },
          description: 'E2E custom agent used to verify team_selectable projection.',
        },
      });
      customAgentId = agent.id;

      const assistantId = `bare:${customAgentId}`;
      const assistant = await waitForAssistant(page, assistantId);
      expect(assistant.team_selectable, JSON.stringify(assistant)).toBe(true);

      await navigateTo(page, '#/team');
      const createBtn = page.locator('[data-testid="team-create-btn"]').first();
      await expect(createBtn).toBeVisible({ timeout: 10_000 });
      await createBtn.click();

      const modal = page.locator('.team-create-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      const option = modal.locator(`[data-testid="team-create-agent-option-${assistantId}"]`);
      await expect(option).toBeVisible({ timeout: 10_000 });
      await expect(option).not.toHaveClass(/cursor-not-allowed/);

      await option.click();
      await modal.locator('[data-testid="team-create-name-input"]').fill(`E2E Team Selectable ${suffix}`);

      const confirmBtn = modal.getByRole('button', { name: /create team|创建团队/i });
      await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });
    } finally {
      if (customAgentId) {
        await httpDelete(page, `/api/agents/custom/${customAgentId}`).catch(() => {});
      }
    }
  });
});
