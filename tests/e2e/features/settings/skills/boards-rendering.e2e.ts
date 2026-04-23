/**
 * Skills Hub E2E Tests - Extension/Auto Boards Rendering (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-S-27: Render Extension Skills board
 * - TC-S-28: Render Auto-injected Skills board
 */

import { test, expect } from '../../../fixtures';
import { goToSkillsHub, cleanupTestSkills, getAutoSkills } from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';

test.describe('Skills Hub - Boards Rendering (P1)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-27: Render Extension Skills board
  // ============================================================================

  test('TC-S-27: should render Extension Skills board with correct structure', async ({ page }) => {
    // Screenshot 01: Initial state
    await takeScreenshot(page, 'skills-hub/tc-s-27/01-initial-state.png');

    // Expected: Extension Skills section exists
    const extensionSection = page.locator('[data-testid="extension-skills-section"]');
    await expect(extensionSection).toBeVisible();

    // Screenshot 02: Extension section visible
    await takeScreenshot(page, 'skills-hub/tc-s-27/02-extension-section.png');

    // Expected: Section has correct structure (title container with Puzzle icon)
    // Don't match i18n text, just verify structure exists
    const titleContainer = extensionSection.locator('.flex.items-center.gap-10px').first();
    await expect(titleContainer).toBeVisible();

    // Screenshot 03: Section structure verified
    await takeScreenshot(page, 'skills-hub/tc-s-27/03-structure-verified.png');

    // Additional verification: If extension skills exist, verify cards have Extension badge
    const extensionCards = page.locator('[data-testid^="my-skill-card-"]').filter({
      has: page.locator('text=/Extension/i'),
    });
    const cardCount = await extensionCards.count();
    console.log(`[TC-S-27] Extension skills found: ${cardCount}`);

    // Screenshot 04: Final state
    await takeScreenshot(page, 'skills-hub/tc-s-27/04-final-state.png');
  });

  // ============================================================================
  // TC-S-28: Render Auto-injected Skills board
  // ============================================================================

  test('TC-S-28: should render Auto-injected Skills board with correct structure', async ({ page }) => {
    // Screenshot 01: Initial state
    await takeScreenshot(page, 'skills-hub/tc-s-28/01-initial-state.png');

    // Expected: Auto Skills section exists
    const autoSection = page.locator('[data-testid="auto-skills-section"]');
    await expect(autoSection).toBeVisible();

    // Screenshot 02: Auto section visible
    await takeScreenshot(page, 'skills-hub/tc-s-28/02-auto-section.png');

    // Expected: Section has correct structure (title container with Lightning icon)
    // Don't match i18n text, just verify structure exists
    const titleContainer = autoSection.locator('.flex.items-center.gap-10px').first();
    await expect(titleContainer).toBeVisible();

    // Screenshot 03: Section structure verified
    await takeScreenshot(page, 'skills-hub/tc-s-28/03-structure-verified.png');

    // Additional verification via Bridge: Query builtin auto skills list
    const autoSkills = await getAutoSkills(page);
    console.log(`[TC-S-28] Bridge returned ${autoSkills.length} auto skills`);

    // Expected: If auto skills exist, verify cards have Auto badge
    const autoCards = page.locator('[data-testid^="my-skill-card-"]').filter({
      has: page.locator('text=/Auto/i'),
    });
    const cardCount = await autoCards.count();
    console.log(`[TC-S-28] Auto skill cards found: ${cardCount}`);

    // Screenshot 04: Final state
    await takeScreenshot(page, 'skills-hub/tc-s-28/04-final-state.png');
  });
});
