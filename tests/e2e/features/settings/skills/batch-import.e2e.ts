/**
 * Skills Hub E2E Tests - Batch Import (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-S-11: Batch import external skills (partial success scenario)
 */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  refreshSkillsHub,
  getMySkills,
  importSkillViaBridge,
  addCustomExternalPath,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';

test.describe('Skills Hub - Batch Import (P1)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-11: Batch import external skills (partial success scenario)
  // ============================================================================

  test('TC-S-11: should batch import external skills and skip already existing ones', async ({ page }) => {
    // Setup: Create external source with 3 skills
    const tempSource = createTempExternalSource('tc-s-11');
    try {
      const timestamp = Date.now();
      const skill1 = `E2E-Test-Batch-1-${timestamp}`;
      const skill2 = `E2E-Test-Batch-2-${timestamp}`;
      const skill3 = `E2E-Test-Batch-3-${timestamp}`;

      createTestSkill(tempSource.path, skill1, 'Valid skill #1');
      createTestSkill(tempSource.path, skill2, 'Already exists in My Skills');
      createTestSkill(tempSource.path, skill3, 'Valid skill #3');

      // Pre-import skill2 to simulate "already exists" scenario
      const preImport = await importSkillViaBridge(page, path.join(tempSource.path, skill2));
      expect(preImport.success).toBe(true);

      await addCustomExternalPath(page, 'E2E Test Source TC11', tempSource.path);
      await refreshSkillsHub(page);

      // Screenshot 01: Initial state with 3 external skills in source
      await takeScreenshot(page, 'skills-hub/tc-s-11/01-external-source.png');

      // Verify 1 skill already in My Skills
      let mySkills = await getMySkills(page);
      let testSkills = mySkills.filter(s => s.name.includes(`-${timestamp}`));
      expect(testSkills.length).toBe(1);
      expect(testSkills[0].name).toBe(skill2);

      // Screenshot 02: My Skills before batch import
      await takeScreenshot(page, 'skills-hub/tc-s-11/02-before-batch-import.png');

      // Click source tab to activate it
      const sourceTab = page.locator('button:has-text("E2E Test Source TC11")');
      await expect(sourceTab).toBeVisible();
      await sourceTab.click();
      await page.waitForTimeout(300);

      // Step 2: Click "Import All" button
      const importAllButton = page.locator('[data-testid="btn-import-all"]');
      await expect(importAllButton).toBeVisible();
      await importAllButton.click();

      // Wait for batch import to complete
      await page.waitForTimeout(1000);

      // Screenshot 03: After clicking Import All
      await takeScreenshot(page, 'skills-hub/tc-s-11/03-after-import-all.png');

      // Expected: Success message shown (2 skills imported, 1 skipped)
      // Note: Message text may vary, so we verify via Bridge instead

      // Verify via Bridge: 3 skills total now (skill1, skill2, skill3)
      mySkills = await getMySkills(page);
      testSkills = mySkills.filter(s => s.name.includes(`-${timestamp}`));
      expect(testSkills.length).toBe(3);

      // Screenshot 04: My Skills after batch import
      await takeScreenshot(page, 'skills-hub/tc-s-11/04-my-skills-updated.png');

      // Verify new skill cards visible in My Skills section
      await refreshSkillsHub(page);
      const card1 = page.locator(
        `[data-testid="my-skill-card-${normalizeTestId(skill1)}"]`
      );
      const card3 = page.locator(
        `[data-testid="my-skill-card-${normalizeTestId(skill3)}"]`
      );
      await expect(card1).toBeVisible();
      await expect(card3).toBeVisible();

      // Screenshot 05: Final state with all 3 skills
      await takeScreenshot(page, 'skills-hub/tc-s-11/05-final-state.png');
    } finally {
      tempSource.cleanup();
    }
  });
});
