/**
 * Skills Hub E2E Tests - Path Management & Export (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-S-14: Refresh external skills list
 * - TC-S-17: Add custom path (duplicate scenario)
 * - TC-S-18: Add custom path (validation scenario)
 * - TC-S-20: Export skill (target already exists scenario)
 */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  refreshSkillsHub,
  importSkillViaBridge,
  addCustomExternalPath,
  getCustomExternalPaths,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Skills Hub - Path/Export (P1)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
    // Force-close any open modals from previous tests
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(50);
    }
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-14: Refresh external skills list
  // ============================================================================

  test('TC-S-14: should refresh external skills and show newly added skill', async ({ page }) => {
    // Setup: Create external source with 1 skill
    const tempSource = createTempExternalSource('tc-s-14');
    try {
      const initialSkill = 'E2E-Test-External-Initial';
      createTestSkill(tempSource.path, initialSkill, 'Initial external skill');

      await addCustomExternalPath(page, 'E2E Test Source TC14', tempSource.path);
      await refreshSkillsHub(page);

      // Verify external skills section visible
      const externalSection = page.locator('[data-testid="external-skills-section"]');
      await expect(externalSection).toBeVisible();

      // Click source tab to activate it
      const sourceTab = page.locator('button:has-text("E2E Test Source TC14")');
      await expect(sourceTab).toBeVisible();
      await sourceTab.click();
      await page.waitForTimeout(300);

      // Screenshot 01: Initial state with 1 external skill
      await takeScreenshot(page, 'skills-hub/tc-s-14/01-initial-state.png');

      // Verify initial skill visible
      const initialCard = page.locator(
        `[data-testid="external-skill-card-${normalizeTestId(initialSkill)}"]`
      );
      await expect(initialCard).toBeVisible();

      // Step 2: Dynamically add new skill to external source directory
      const newSkill = 'E2E-Test-New-External';
      createTestSkill(tempSource.path, newSkill, 'Newly added external skill');

      // Screenshot 02: Before refresh (new skill not visible yet)
      await takeScreenshot(page, 'skills-hub/tc-s-14/02-before-refresh.png');

      // Step 3: Click external refresh button
      const refreshButton = page.locator('[data-testid="btn-refresh-external"]');
      await expect(refreshButton).toBeVisible();
      await refreshButton.click();

      // Wait for refresh to complete
      await page.waitForTimeout(1000);

      // Screenshot 03: After refresh
      await takeScreenshot(page, 'skills-hub/tc-s-14/03-after-refresh.png');

      // Expected: New skill card appears
      const newCard = page.locator(
        `[data-testid="external-skill-card-${normalizeTestId(newSkill)}"]`
      );
      await expect(newCard).toBeVisible();

      // Screenshot 04: Both skills visible
      await takeScreenshot(page, 'skills-hub/tc-s-14/04-both-skills-visible.png');
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-17: Add custom path (duplicate scenario)
  // ============================================================================

  test('TC-S-17: should show error when adding duplicate custom path', async ({ page }) => {
    // Setup: Create external source and add it as custom path
    const tempSource = createTempExternalSource('tc-s-17');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-Existing', 'Existing skill');

      await addCustomExternalPath(page, 'E2E Existing Source', tempSource.path);
      await refreshSkillsHub(page);

      // Screenshot 01: Initial state with existing source
      await takeScreenshot(page, 'skills-hub/tc-s-17/01-existing-source.png');

      // Step 2: Try to add the same path again via UI
      const addButton = page.locator('[data-testid="btn-add-custom-path"]');
      await expect(addButton).toBeVisible();
      await addButton.click();

      // Wait for modal to appear
      const modal = page.locator('.modal-name-custom-path');
      await expect(modal).toBeVisible();

      // Screenshot 02: Modal opened
      await takeScreenshot(page, 'skills-hub/tc-s-17/02-modal-opened.png');

      // Step 3: Fill in duplicate path
      await page.fill('[data-testid="input-source-name"]', 'Duplicate Source');
      await page.fill('[data-testid="input-source-path"]', tempSource.path);

      // Screenshot 03: Form filled with duplicate path
      await takeScreenshot(page, 'skills-hub/tc-s-17/03-form-filled.png');

      // Step 4: Click Confirm button (use Arco's OK button class)
      const confirmButton = page.locator('.arco-modal-footer .arco-btn-primary');
      await expect(confirmButton).toBeEnabled();
      await confirmButton.click();

      // Wait for error message
      await page.waitForTimeout(500);

      // Screenshot 04: Error message shown
      await takeScreenshot(page, 'skills-hub/tc-s-17/04-error-message.png');

      // Expected: Modal still open (error occurred)
      await expect(modal).toBeVisible();

      // Expected: No new tab added
      const duplicateTab = page.locator('button:has-text("Duplicate Source")');
      await expect(duplicateTab).not.toBeVisible();

      // Screenshot 05: Modal still open, no new tab
      await takeScreenshot(page, 'skills-hub/tc-s-17/05-no-new-tab.png');
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-18: Add custom path (validation scenario)
  // ============================================================================

  test('TC-S-18: should disable Confirm button when required fields are empty', async ({ page }) => {
    // Screenshot 01: Initial state
    await takeScreenshot(page, 'skills-hub/tc-s-18/01-initial-state.png');

    // Step 1: Open add custom path modal
    const addButton = page.locator('[data-testid="btn-add-custom-path"]');
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Wait for modal to appear
    const modal = page.locator('.modal-name-custom-path');
    await expect(modal).toBeVisible();

    // Screenshot 02: Modal opened with empty fields
    await takeScreenshot(page, 'skills-hub/tc-s-18/02-modal-empty.png');

    // Expected: Confirm button disabled when both fields empty
    const confirmButton = page.locator('.arco-modal-footer button.arco-btn-primary');
    await expect(confirmButton).toBeDisabled();

    // Screenshot 03: Confirm button disabled
    await takeScreenshot(page, 'skills-hub/tc-s-18/03-button-disabled.png');

    // Step 2: Fill only Name field
    await page.fill('[data-testid="input-source-name"]', 'Test Source');

    // Screenshot 04: Name filled, Path empty
    await takeScreenshot(page, 'skills-hub/tc-s-18/04-name-only.png');

    // Expected: Confirm button still disabled (Path required)
    await expect(confirmButton).toBeDisabled();

    // Step 3: Clear Name, fill only Path field
    await page.fill('[data-testid="input-source-name"]', '');
    await page.fill('[data-testid="input-source-path"]', '/tmp/test-path');

    // Screenshot 05: Path filled, Name empty
    await takeScreenshot(page, 'skills-hub/tc-s-18/05-path-only.png');

    // Expected: Confirm button still disabled (Name required)
    await expect(confirmButton).toBeDisabled();

    // Step 4: Fill both fields
    await page.fill('[data-testid="input-source-name"]', 'Test Source');

    // Screenshot 06: Both fields filled
    await takeScreenshot(page, 'skills-hub/tc-s-18/06-both-filled.png');

    // Expected: Confirm button enabled
    await expect(confirmButton).toBeEnabled();

    // Screenshot 07: Confirm button enabled
    await takeScreenshot(page, 'skills-hub/tc-s-18/07-button-enabled.png');
  });

  // ============================================================================
  // TC-S-20: Export skill (target already exists scenario)
  // ============================================================================

  test('TC-S-20: should show error when exporting to target with existing skill', async ({ page }) => {
    // Setup: Create skill and external target
    const tempSource = createTempExternalSource('tc-s-20-target');
    const skillTimestamp = Date.now();
    const skillName = `E2E-Test-Export-Duplicate-${skillTimestamp}`;
    try {
      // Create skill in external source
      createTestSkill(tempSource.path, skillName, 'Skill to export');

      // Import skill to My Skills
      const importResult = await importSkillViaBridge(page, path.join(tempSource.path, skillName));
      expect(importResult.success).toBe(true);

      // Create target source with same skill already present
      createTestSkill(tempSource.path, `${skillName}-existing`, 'Pre-existing skill in target');

      // Add target as external source
      await addCustomExternalPath(page, 'E2E Target TC20', tempSource.path);
      await refreshSkillsHub(page);

      // Screenshot 01: Initial state with skill in My Skills
      await takeScreenshot(page, 'skills-hub/tc-s-20/01-initial-state.png');

      // Manually create duplicate skill in target directory
      createTestSkill(tempSource.path, skillName, 'Duplicate skill in target');

      // Step 2: Try to export the skill
      const exportButton = page.locator(`[data-testid="btn-export-${normalizeTestId(skillName)}"]`);
      await expect(exportButton).toBeVisible();

      // Screenshot 02: Export button visible
      await takeScreenshot(page, 'skills-hub/tc-s-20/02-export-button.png');

      await exportButton.click();
      await page.waitForTimeout(300);

      // Screenshot 03: Export dropdown opened
      await takeScreenshot(page, 'skills-hub/tc-s-20/03-dropdown-opened.png');

      // Step 3: Select target source from dropdown
      const targetOption = page.locator('.arco-dropdown-menu-item:has-text("E2E Target TC20")');
      await expect(targetOption).toBeVisible();
      await targetOption.click();

      // Wait for export attempt to complete
      await page.waitForTimeout(1000);

      // Screenshot 04: After export attempt (error message expected)
      await takeScreenshot(page, 'skills-hub/tc-s-20/04-error-occurred.png');

      // Expected: Skill still in My Skills (export failed)
      const skillCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skillName)}"]`);
      await expect(skillCard).toBeVisible();

      // Screenshot 05: Skill still in My Skills
      await takeScreenshot(page, 'skills-hub/tc-s-20/05-skill-still-present.png');
    } finally {
      tempSource.cleanup();
    }
  });
});
