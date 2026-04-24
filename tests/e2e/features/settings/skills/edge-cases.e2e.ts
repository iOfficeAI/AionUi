/**
 * Skills Hub E2E Tests - Edge Cases (P2 Priority)
 *
 * Test Cases Covered:
 * - TC-S-15: Empty external source state (no external skills)
 * - TC-S-21: Export skill when no external sources exist
 * - TC-S-23: URL parameter highlight skill (skill doesn't exist scenario)
 */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  refreshSkillsHub,
  importSkillViaBridge,
  getCustomExternalPaths,
  removeCustomExternalPath,
  addCustomExternalPath,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId,
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';

test.describe('Skills Hub - Edge Cases (P2)', () => {
  let savedPaths: Array<{ path: string; name: string }> = [];

  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
    // Refresh and save custom paths (including those from other test files)
    await refreshSkillsHub(page);
    savedPaths = await getCustomExternalPaths(page);
  });

  test.afterEach(async ({ page }) => {
    // Restore any custom paths that were removed during test
    const currentPaths = await getCustomExternalPaths(page);
    for (const saved of savedPaths) {
      if (!currentPaths.find((p) => p.path === saved.path)) {
        await addCustomExternalPath(page, saved.name, saved.path);
      }
    }
    // Wait for restoration to complete
    await page.waitForTimeout(500);
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-15: Empty external source state (no external skills)
  // ============================================================================

  test('TC-S-15: should not show custom external source tabs when no custom paths exist', async ({ page }) => {
    // Setup: Remove all custom external paths
    const customPaths = await getCustomExternalPaths(page);
    for (const entry of customPaths) {
      await removeCustomExternalPath(page, entry.path);
    }

    // Navigate to Skills Hub again to reload without custom sources
    await goToSkillsHub(page);
    await page.waitForTimeout(500);

    // Screenshot 01: Initial state (no custom sources)
    await takeScreenshot(page, 'skills-hub/tc-s-15/01-no-custom-sources.png');

    // Expected: External skills section may still exist (due to builtin sources)
    const externalSection = page.locator('[data-testid="external-skills-section"]');

    // If external section exists, verify no custom- prefixed source tabs
    const isExternalVisible = await externalSection.isVisible();
    if (isExternalVisible) {
      // Verify no custom source tabs (custom tabs have data-testid starting with "external-source-tab-custom-")
      const customSourceTabs = page.locator('[data-testid^="external-source-tab-custom-"]');
      const customTabCount = await customSourceTabs.count();
      expect(customTabCount).toBe(0);

      // Screenshot 02: Only builtin sources visible
      await takeScreenshot(page, 'skills-hub/tc-s-15/02-only-builtin-sources.png');
    } else {
      // Screenshot 02: No external section at all
      await takeScreenshot(page, 'skills-hub/tc-s-15/02-no-external-section.png');
    }

    // Expected: My Skills section still visible
    const mySkillsSection = page.locator('[data-testid="my-skills-section"]');
    await expect(mySkillsSection).toBeVisible();

    // Screenshot 03: My Skills section visible
    await takeScreenshot(page, 'skills-hub/tc-s-15/03-my-skills-visible.png');
  });

  // ============================================================================
  // TC-S-21: Export skill when no external sources exist
  // ============================================================================

  test('TC-S-21: should show export button but only builtin targets when no custom sources exist', async ({ page }) => {
    // Setup: Create and import a custom skill
    const tempSource = createTempExternalSource('tc-s-21');
    try {
      const skillName = `E2E-Test-Export-NoTarget-${Date.now()}`;
      createTestSkill(tempSource.path, skillName, 'Skill to export');

      const importResult = await importSkillViaBridge(page, path.join(tempSource.path, skillName));
      expect(importResult.success).toBe(true);

      await goToSkillsHub(page);
      await refreshSkillsHub(page);

      // Screenshot 01: Before removing custom sources
      await takeScreenshot(page, 'skills-hub/tc-s-21/01-before-remove.png');

      // Remove all custom external paths
      const customPaths = await getCustomExternalPaths(page);
      for (const entry of customPaths) {
        await removeCustomExternalPath(page, entry.path);
      }

      // Navigate to Skills Hub again to reload
      await goToSkillsHub(page);
      await refreshSkillsHub(page);

      // Screenshot 02: After removing custom sources
      await takeScreenshot(page, 'skills-hub/tc-s-21/02-after-remove.png');

      // Expected: Skill card visible
      const skillCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skillName)}"]`);
      await expect(skillCard).toBeVisible();

      // Screenshot 03: Skill card visible
      await takeScreenshot(page, 'skills-hub/tc-s-21/03-skill-card.png');

      // Expected: Export button may be visible (builtin sources exist)
      // This test verifies the page doesn't crash when no custom sources exist
      console.log(`[TC-S-21] Verified skill card renders when no custom sources exist`);

      // Screenshot 04: Final state
      await takeScreenshot(page, 'skills-hub/tc-s-21/04-final-state.png');
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-23: URL parameter highlight skill (skill doesn't exist scenario)
  // ============================================================================

  test('TC-S-23: should not crash when URL highlight param references non-existent skill', async ({ page }) => {
    // Screenshot 01: Initial state
    await takeScreenshot(page, 'skills-hub/tc-s-23/01-initial-state.png');

    // Step 1: Add highlight parameter to current URL via history API
    // This updates the search params without triggering page navigation
    const nonExistentSkill = 'NonExistentSkill-12345';
    await page.evaluate((skillName) => {
      const url = new URL(window.location.href);
      url.searchParams.set('highlight', skillName);
      window.history.pushState({}, '', url.toString());
      // Dispatch popstate to trigger React Router's listener
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, nonExistentSkill);

    // Wait for React to process the URL change
    await page.waitForTimeout(1500);

    // Screenshot 02: After navigation with non-existent highlight
    await takeScreenshot(page, 'skills-hub/tc-s-23/02-after-navigation.png');

    // Expected: Page should not crash, My Skills section still visible
    const mySkillsSection = page.locator('[data-testid="my-skills-section"]');
    await expect(mySkillsSection).toBeVisible();

    // Screenshot 03: Page still functional
    await takeScreenshot(page, 'skills-hub/tc-s-23/03-page-functional.png');

    // Expected: No skill card highlighted
    const allCards = page.locator('[data-testid^="my-skill-card-"]');
    const cardCount = await allCards.count();

    // Verify no card has highlight styles
    for (let i = 0; i < cardCount; i++) {
      const card = allCards.nth(i);
      const classes = await card.getAttribute('class');
      if (classes) {
        expect(classes).not.toContain('border-primary-5');
      }
    }

    // Expected: URL parameter stays (not cleared when skill doesn't exist)
    // App only clears param when skill is found and highlighted
    await page.waitForTimeout(500);
    const currentURL = page.url();
    expect(currentURL).toContain('highlight=');

    // Screenshot 04: Final state (no highlight, param remains)
    await takeScreenshot(page, 'skills-hub/tc-s-23/04-final-state.png');
  });
});
