/**
 * Skills Hub E2E Tests - Manual Import (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-S-29: Import from Folder with mocked dialog
 */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  getMySkills,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId,
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';

test.describe('Skills Hub - Manual Import (P1)', () => {
  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-29: Import from Folder with mocked dialog
  // ============================================================================

  test('TC-S-29: should import skill from folder via mocked dialog', async ({ page, electronApp }) => {
    const tempSource = createTempExternalSource('tc-s-29');
    try {
      const skillName = `E2E-Test-Manual-Import-${Date.now()}`;
      createTestSkill(tempSource.path, skillName, 'Manual import test skill');
      const skillPath = path.join(tempSource.path, skillName);

      await goToSkillsHub(page);

      // Screenshot 01: Initial state
      await takeScreenshot(page, 'skills-hub/tc-s-29/01-initial-state.png');

      // Step 1: Mock dialog.showOpenDialog to return test skill path
      await electronApp.evaluate(({ dialog }, targetPath) => {
        // Store original showOpenDialog
        const originalShowOpenDialog = dialog.showOpenDialog;

        // Mock showOpenDialog to return test skill path
        dialog.showOpenDialog = () => {
          // Restore original after first call
          dialog.showOpenDialog = originalShowOpenDialog;

          return Promise.resolve({
            canceled: false,
            filePaths: [targetPath],
          });
        };
      }, skillPath);

      // Screenshot 02: Before clicking import button
      await takeScreenshot(page, 'skills-hub/tc-s-29/02-before-click.png');

      // Step 2: Click "Import from Folder" button
      const importButton = page.locator('[data-testid="btn-manual-import"]');
      await expect(importButton).toBeVisible();
      await importButton.click();

      // Wait for import to complete
      await page.waitForTimeout(2000);

      // Screenshot 03: After clicking import button
      await takeScreenshot(page, 'skills-hub/tc-s-29/03-after-click.png');

      // Expected: Success message shown
      const successMessage = page.locator('.arco-message-success');
      await expect(successMessage).toBeVisible({ timeout: 5000 });

      // Screenshot 04: Success message visible
      await takeScreenshot(page, 'skills-hub/tc-s-29/04-success-message.png');

      // Expected: New skill appears in My Skills
      await goToSkillsHub(page);
      await page.waitForTimeout(500);

      const skillCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skillName)}"]`);
      await expect(skillCard).toBeVisible();

      // Screenshot 05: Skill card visible
      await takeScreenshot(page, 'skills-hub/tc-s-29/05-skill-card.png');

      // Verify skill is in My Skills via Bridge
      const mySkills = await getMySkills(page);
      const importedSkill = mySkills.find((s) => s.name === skillName);
      expect(importedSkill).toBeDefined();
      expect(importedSkill?.source).toBe('custom');

      console.log(`[TC-S-29] Successfully imported skill: ${skillName}`);

      // Screenshot 06: Final state
      await takeScreenshot(page, 'skills-hub/tc-s-29/06-final-state.png');
    } finally {
      tempSource.cleanup();
    }
  });
});
