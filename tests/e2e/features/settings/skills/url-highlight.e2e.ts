/**
 * Skills Hub E2E Tests - URL Highlight (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-S-22: URL parameter highlight skill (success scenario)
 */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  refreshSkillsHub,
  importSkillViaBridge,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';

test.describe('Skills Hub - URL Highlight (P1)', () => {
  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-22: URL parameter highlight skill (success scenario)
  // ============================================================================

  test('TC-S-22: should highlight skill and scroll to it when URL has highlight param', async ({ page }) => {
    // Clear any existing URL params from previous tests
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.toString());
    });

    // Setup: Create and import target skill
    const tempSource = createTempExternalSource('tc-s-22');
    try {
      const skillName = `E2E-Test-Highlight-Target-${Date.now()}`;
      createTestSkill(tempSource.path, skillName, 'Target skill for highlight test');

      const importResult = await importSkillViaBridge(page, path.join(tempSource.path, skillName));
      expect(importResult.success).toBe(true);

      // Navigate to Skills Hub and refresh to load imported skill
      await goToSkillsHub(page);
      await refreshSkillsHub(page);

      // Verify skill exists before highlight test
      let targetCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skillName)}"]`);
      await expect(targetCard).toBeVisible({ timeout: 10000 });

      // Screenshot 01: Before highlight
      await takeScreenshot(page, 'skills-hub/tc-s-22/01-before-highlight.png');

      // Step 1: Add highlight parameter via history API
      const hashInfo = await page.evaluate((name) => {
        const url = new URL(window.location.href);
        const currentHash = url.hash;
        const [path, search] = currentHash.split('?');
        const params = new URLSearchParams(search || '');
        params.set('highlight', name);
        const newHash = `${path}?${params.toString()}`;
        window.location.hash = newHash;
        return { currentHash, newHash, finalHash: window.location.hash };
      }, skillName);
      // Wait for highlight animation to start (requestAnimationFrame + scroll)
      await page.waitForTimeout(300);

      // Screenshot 02: After adding highlight param (during highlight)
      await takeScreenshot(page, 'skills-hub/tc-s-22/02-after-navigation.png');

      // Card should still be visible (no page reload)
      await expect(targetCard).toBeVisible({ timeout: 10000 });

      // Screenshot 03: Card visible during highlight
      await takeScreenshot(page, 'skills-hub/tc-s-22/03-card-visible.png');

      // Expected: Target card has highlight styles (border-primary-5, bg-primary-1)
      // Check immediately while highlight is still active
      const cardClasses = await targetCard.getAttribute('class');
      console.log(`[TC-S-22] Card classes: ${cardClasses}`);

      // Verify highlight styles are applied
      if (cardClasses) {
        expect(cardClasses).toContain('border-primary-5');
        expect(cardClasses).toContain('bg-primary-1');
      }

      // Verify URL parameter was cleared by app
      const currentURL = page.url();
      expect(currentURL).not.toContain('highlight=');

      // Screenshot 04: Highlight styles visible
      await takeScreenshot(page, 'skills-hub/tc-s-22/04-highlight-styles.png');

      // Step 2: Wait for highlight to disappear (2 seconds)
      await page.waitForTimeout(2500);

      // Screenshot 05: After highlight timeout
      await takeScreenshot(page, 'skills-hub/tc-s-22/05-after-timeout.png');

      // Expected: Highlight styles removed
      const updatedClasses = await targetCard.getAttribute('class');
      console.log(`[TC-S-22] Updated classes: ${updatedClasses}`);

      if (updatedClasses) {
        expect(updatedClasses).not.toContain('border-primary-5');
        expect(updatedClasses).not.toContain('bg-primary-1');
      }

      // Expected: URL parameter cleared
      const finalUrl = page.url();
      expect(finalUrl).not.toContain('highlight=');

      // Screenshot 06: Highlight cleared, URL cleaned
      await takeScreenshot(page, 'skills-hub/tc-s-22/06-final-state.png');
    } finally {
      tempSource.cleanup();
    }
  });
});
