/**
 * E2E Scenario 6: Agent whitelist enforcement.
 *
 * Verifies: UI create modal dropdown only shows whitelisted agent types.
 *
 * Whitelist locations:
 * - agentSelectUtils.tsx (TEAM_SUPPORTED_BACKENDS)
 * - TeamMcpServer.ts (spawn whitelist)
 */
import { test, expect } from '../fixtures';
import { TEAM_SUPPORTED_BACKENDS } from '../helpers';

test.describe('Team Agent Whitelist', () => {
  test('UI only shows whitelisted agents in create modal dropdown', async ({ page }) => {
    // Navigate to home to access the create modal
    await page.goto(page.url().split('#')[0] + '#/guid');

    // Close any leftover modal from previous tests before interacting with the page
    const existingModal = page.locator('.arco-modal-close-icon');
    if (await existingModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      await existingModal.click({ force: true });
      await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
    }

    await expect(page.locator('.h-20px.w-20px.rd-4px').first()).toBeVisible({ timeout: 10000 });

    // Open Create Team modal
    const createBtn = page.locator('.h-20px.w-20px.rd-4px').first();
    await createBtn.click();

    // Open agent dropdown
    const agentSelect = page.locator('.arco-modal .arco-select').first();
    await expect(agentSelect).toBeVisible({ timeout: 5000 });
    await agentSelect.click();
    await expect(page.locator('.arco-select-option').first()).toBeVisible({ timeout: 5000 });

    // Screenshot: dropdown options
    await page.screenshot({ path: 'tests/e2e/results/team-whitelist-01-dropdown.png' });

    // Get all visible option texts
    const options = page.locator('.arco-select-option');
    const count = await options.count();

    const optionTexts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent();
      if (text) optionTexts.push(text.trim());
    }

    console.log('[E2E] Available agents in dropdown:', optionTexts);

    // Every whitelisted backend must appear in the dropdown
    for (const backend of TEAM_SUPPORTED_BACKENDS) {
      expect(optionTexts.some((t) => t.toLowerCase().includes(backend))).toBe(true);
    }

    // Non-whitelisted backends must not appear
    const nonWhitelisted = ['qwen', 'codebuddy'];
    for (const text of optionTexts) {
      const lower = text.toLowerCase();
      for (const blocked of nonWhitelisted) {
        expect(lower).not.toContain(blocked);
      }
    }

    // Close modal
    await page.locator('.arco-modal .arco-modal-close-icon').click();
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
  });
});
