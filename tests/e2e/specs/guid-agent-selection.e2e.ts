/**
 * Guid Assistant Selection — Phase 2 assistant-only coverage.
 *
 * Verifies that Guid no longer exposes direct agent pills and that assistant
 * pills are the only selectable runtime entry on the landing page.
 */
import { test, expect } from '../fixtures';
import { goToGuid, AGENT_PILL, GUID_INPUT } from '../helpers';

test.describe('Guid Assistant Selection', () => {
  test('guid renders assistant pills and no direct agent pills', async ({ page }) => {
    await goToGuid(page);

    const assistantPills = page.locator('[data-testid^="preset-pill-"]');
    await expect(assistantPills.first()).toBeVisible({ timeout: 12_000 });
    expect(await assistantPills.count()).toBeGreaterThanOrEqual(1);

    await expect(page.locator(AGENT_PILL)).toHaveCount(0);
  });

  test('selecting an assistant keeps guid input usable', async ({ page }) => {
    await goToGuid(page);

    const assistantPills = page.locator('[data-testid^="preset-pill-"]');
    await expect(assistantPills.first()).toBeVisible({ timeout: 12_000 });

    const firstLabel = (await assistantPills.first().textContent())?.trim();
    expect(firstLabel).toBeTruthy();

    await assistantPills.first().click();

    await expect(page.locator(GUID_INPUT)).toBeVisible();
    await expect(page.locator('body')).toContainText(firstLabel!);
    await expect(page.locator(AGENT_PILL)).toHaveCount(0);
  });

  test('assistant overflow menu lists assistants only', async ({ page }) => {
    await goToGuid(page);

    const moreButton = page.locator('[data-testid="assistant-more-btn"]');
    const hasMore = await moreButton.isVisible().catch(() => false);
    if (!hasMore) {
      test.skip(true, 'Assistant overflow menu is not needed in this environment');
      return;
    }

    await moreButton.click();

    const overflowItems = page.locator('[data-testid^="assistant-overflow-"]');
    await expect(overflowItems.first()).toBeVisible({ timeout: 8_000 });
    expect(await overflowItems.count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator(AGENT_PILL)).toHaveCount(0);
  });
});
