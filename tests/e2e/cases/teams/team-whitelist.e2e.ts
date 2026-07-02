/**
 * E2E Scenario 6: Team assistant-only leader options.
 *
 * Verifies: UI create modal renders unified assistant rows and does not expose
 * the removed mixed CLI-agent / preset-assistant option groups.
 */
import { test, expect } from '../../fixtures';
import { httpGet, navigateTo } from '../../helpers';
import type { Assistant } from '@/common/types/agent/assistantTypes';

test.describe('Team Assistant Leader Options', () => {
  test('UI shows assistant-only rows in create modal', async ({ page }) => {
    await navigateTo(page, '#/team');

    // Close any leftover modal from previous tests before interacting with the page
    const existingModal = page.locator('.arco-modal .arco-btn-text');
    if (await existingModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      await existingModal.click({ force: true });
      await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
    }

    await expect(page.locator('[data-testid="team-create-btn"]').first()).toBeVisible({ timeout: 10000 });

    // Open Create Team modal
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await createBtn.click();

    const modal = page.locator('.team-create-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    const allOptions = modal.locator('[data-testid^="team-create-agent-option-"]');
    await expect
      .poll(async () => allOptions.count(), {
        timeout: 5000,
        message: 'Waiting for team assistant options to render',
      })
      .toBeGreaterThan(0);
    await expect(allOptions.first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'tests/e2e/results/team-assistant-options-01-list.png' });

    const totalCount = await allOptions.count();
    expect(totalCount).toBeGreaterThan(0);

    const testIds: string[] = [];
    for (let i = 0; i < totalCount; i++) {
      const testId = await allOptions.nth(i).getAttribute('data-testid');
      if (testId) testIds.push(testId);
    }

    const assistants = await httpGet<Assistant[]>(page, '/api/assistants');
    const assistantIds = new Set(assistants.map((assistant) => assistant.id));
    const optionAssistantIds = testIds.map((id) => id.replace('team-create-agent-option-', ''));

    expect(testIds.every((id) => !id.includes('cli::') && !id.includes('preset::'))).toBeTruthy();
    expect(optionAssistantIds.every((id) => assistantIds.has(id))).toBeTruthy();

    await page.locator('.arco-modal .arco-btn-text').first().click();
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
  });
});
