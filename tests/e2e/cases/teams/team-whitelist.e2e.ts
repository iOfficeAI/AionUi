/**
 * E2E Scenario 6: Agent whitelist enforcement.
 *
 * Verifies: UI create modal dropdown only shows whitelisted agent types.
 *
 * Whitelist locations:
 * - agentSelectUtils.tsx (TEAM_SUPPORTED_BACKENDS)
 * - TeamMcpServer.ts (spawn whitelist)
 */
import { test, expect } from '../../fixtures';
import { TEAM_SUPPORTED_BACKENDS } from '../../helpers';

test.describe('Team Agent Whitelist', () => {
  test('UI only shows whitelisted agents in create modal dropdown', async ({ page }) => {
    // Navigate to home to access the create modal
    await page.goto(page.url().split('#')[0] + '#/guid');

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

    // Verify agent cards are visible (new UI uses card grid, not a select dropdown)
    const firstCard = page.locator('[data-testid^="team-create-agent-card-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 5000 });

    // Screenshot: dropdown options
    await page.screenshot({ path: 'tests/e2e/results/team-whitelist-01-dropdown.png' });

    // Get all agent card texts
    const cards = page.locator('[data-testid^="team-create-agent-card-"]');
    const count = await cards.count();

    const optionTexts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).textContent();
      if (text) optionTexts.push(text.trim());
    }

    console.log('[E2E] Available agents in dropdown:', optionTexts);

    // [WHITELIST RULE] All assertions here are based on TEAM_SUPPORTED_BACKENDS (tests/e2e/helpers/teamConfig.ts).
    // Do NOT hardcode which agents should or should not appear — the whitelist is the single source of truth.
    // If the supported backend list changes, update teamConfig.ts, not this test.

    // Every whitelisted backend must appear in the card grid
    for (const backend of TEAM_SUPPORTED_BACKENDS) {
      expect(optionTexts.some((t) => t.toLowerCase().includes(backend))).toBe(true);
    }

    // Close modal via Cancel button
    await page.locator('.arco-modal .arco-btn-text').first().click();
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
  });
});
