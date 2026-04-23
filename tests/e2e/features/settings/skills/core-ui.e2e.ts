/**
 * Skills Hub E2E Tests - Core UI (P0 Priority)
 *
 * Test Cases Covered:
 * - TC-S-01: Render My Skills list (basic scenario)
 * - TC-S-05: Delete custom skill (success scenario)
 * - TC-S-06: Delete builtin skill (no delete button)
 * - TC-S-08: Render external skills list (single source)
 * - TC-S-10: Import external skill via UI (success scenario)
 * - TC-S-16: Add custom external path (success scenario)
 * - TC-S-19: Export skill to external source (success scenario)
 *
 * Data-testid additions to source files:
 * File: src/renderer/pages/settings/SkillsHubSettings.tsx
 *   - Line 250: data-testid="external-skills-section"
 *   - Line 296: data-testid="external-source-tab-{sourceName}"
 *   - Line 311: data-testid="btn-add-custom-path"
 *   - Line 340: data-testid="external-skill-card-{skillName}"
 *   - Line 392: data-testid="my-skills-section"
 *   - Line 453: data-testid="my-skill-card-{skillName}"
 *   - Line 550: data-testid="btn-export-{skillName}"
 *   - Line 561: data-testid="btn-delete-{skillName}"
 *   - Line 571: wrapClassName="modal-delete-skill" (for Modal.confirm)
 *   - Line 596: data-testid="extension-skills-section"
 *   - Line 639: data-testid="auto-skills-section"
 *   - Line 711: wrapClassName="modal-name-custom-path"
 *   - Line 718: data-testid="input-source-name"
 *   - Line 731: data-testid="input-source-path"
 */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  refreshSkillsHub,
  getMySkills,
  getExternalSources,
  importSkillViaBridge,
  deleteSkillViaBridge,
  deleteSkillViaUI,
  addCustomExternalPath,
  removeCustomExternalPath,
  importSkillViaUI,
  exportSkillViaUI,
  addCustomPathViaUI,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId,
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';

test.describe('Skills Hub - Core UI (P0)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Skills Hub before each test
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    // Cleanup test data after each test
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-01: Render My Skills list (basic scenario)
  // ============================================================================

  test('TC-S-01: should render My Skills section with builtin and custom skills', async ({ page }) => {
    // Setup: Create 2 test skills (1 builtin-like, 1 custom)
    const tempSource = createTempExternalSource('tc-s-01');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-Builtin', 'Builtin-like test skill');
      createTestSkill(tempSource.path, 'E2E-Test-Custom', 'Custom test skill');

      // Import both skills
      await importSkillViaBridge(page, path.join(tempSource.path, 'E2E-Test-Builtin'));
      await importSkillViaBridge(page, path.join(tempSource.path, 'E2E-Test-Custom'));

      // Refresh page to ensure data is loaded
      await page.reload();
      await goToSkillsHub(page);

      // Screenshot 01: Initial state
      await takeScreenshot(page, 'skills-hub/tc-s-01/01-initial-my-skills.png');

      // Step 2: Locate "My Skills" section
      const mySkillsSection = page.locator('[data-testid="my-skills-section"]');
      await expect(mySkillsSection).toBeVisible();

      // Step 4: Verify skill count badge (should show 2)
      // Note: Badge structure may need adjustment based on actual implementation
      // const countBadge = mySkillsSection.locator('[class*="count"]');
      // await expect(countBadge).toHaveText('2');

      // Screenshot 02: My Skills section visible
      await takeScreenshot(page, 'skills-hub/tc-s-01/02-my-skills-section.png');

      // Expected: Display 2 skill cards
      const builtinCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId('E2E-Test-Builtin')}"]`);
      const customCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId('E2E-Test-Custom')}"]`);

      await expect(builtinCard).toBeVisible();
      await expect(customCard).toBeVisible();

      // Verify each card contains name and description
      await expect(builtinCard.locator(`text=E2E-Test-Builtin`)).toBeVisible();
      await expect(customCard.locator(`text=E2E-Test-Custom`)).toBeVisible();

      // Screenshot 03: Both cards visible
      await takeScreenshot(page, 'skills-hub/tc-s-01/03-skill-cards-rendered.png');

      // Bridge assertion: Verify backend state
      const skills = await getMySkills(page);
      const testSkills = skills.filter((s) => s.name.startsWith('E2E-Test-'));
      expect(testSkills).toHaveLength(2);
      expect(testSkills.map((s) => s.name)).toContain('E2E-Test-Builtin');
      expect(testSkills.map((s) => s.name)).toContain('E2E-Test-Custom');
    } finally {
      // Cleanup
      await deleteSkillViaBridge(page, 'E2E-Test-Builtin');
      await deleteSkillViaBridge(page, 'E2E-Test-Custom');
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-05: Delete custom skill (success scenario)
  // ============================================================================

  test('TC-S-05: should delete custom skill via UI with confirmation modal', async ({ page }) => {
    // Setup: Create 1 custom skill with unique name
    const skillName = `E2E-Test-Delete-Target-${Date.now()}`;
    const tempSource = createTempExternalSource('tc-s-05');
    try {
      createTestSkill(tempSource.path, skillName, 'Skill to be deleted');
      const skillPath = path.join(tempSource.path, skillName);
      const importResult = await importSkillViaBridge(page, skillPath);

      // Verify import success
      expect(importResult.success).toBe(true);

      await refreshSkillsHub(page);

      // Screenshot 01: Initial state with skill card
      await takeScreenshot(page, 'skills-hub/tc-s-05/01-before-delete.png');

      // Step 2: Locate target skill card in My Skills section
      const targetCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skillName)}"]`);
      await expect(targetCard).toBeVisible();

      // Step 3: Hover to show delete button (may require actual hover)
      await targetCard.hover();
      await page.waitForTimeout(200);

      // Screenshot 02: After hover, delete button visible
      await takeScreenshot(page, 'skills-hub/tc-s-05/02-delete-button-visible.png');

      // Step 4: Click delete button
      const deleteButton = page.locator(`[data-testid="btn-delete-${normalizeTestId(skillName)}"]`);
      await deleteButton.click();

      // Step 5: Verify confirmation modal appears
      const modal = page.locator('.modal-delete-skill .arco-modal');
      await expect(modal).toBeVisible();

      // Verify modal title via Arco's title class
      await expect(modal.locator('.arco-modal-title')).toBeVisible();

      // Screenshot 03: Confirmation modal
      await takeScreenshot(page, 'skills-hub/tc-s-05/03-confirmation-modal.png');

      // Step 6: Click confirm button (Arco Modal confirm button)
      const confirmButton = modal.locator('.arco-btn-primary');
      await confirmButton.click();

      // Expected: Modal closes
      await expect(modal).not.toBeVisible();

      // Expected: Success message appears (don't check i18n text)
      await page.waitForSelector('.arco-message-success', { timeout: 5000 });

      // Screenshot 04: Success message
      await takeScreenshot(page, 'skills-hub/tc-s-05/04-success-message.png');

      // Wait for list refresh
      await page.waitForTimeout(1000);

      // Expected: Target card disappears
      await expect(targetCard).not.toBeVisible();

      // Screenshot 05: Card removed
      await takeScreenshot(page, 'skills-hub/tc-s-05/05-card-removed.png');

      // Bridge assertion: Verify skill is deleted from backend
      const skills = await getMySkills(page);
      const deletedSkill = skills.find((s) => s.name === skillName);
      expect(deletedSkill).toBeUndefined();
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-06: Delete builtin skill (no delete button)
  // ============================================================================

  test('TC-S-06: should not show delete button for builtin skills', async ({ page }) => {
    // No setup needed - verify existing builtin skills
    await page.reload();
    await goToSkillsHub(page);

    // Screenshot 01: Initial state
    await takeScreenshot(page, 'skills-hub/tc-s-06/01-initial-state.png');

    // Query all skills and find a real builtin skill
    const skills = await getMySkills(page);
    const builtinSkills = skills.filter((s) => s.source === 'builtin');

    // Env-gated: dev-mode sandboxes and fresh CI runs may have no builtin
    // skills (builtin dir points at app bundle resources which are only
    // populated in packaged builds). Skip rather than hard-fail — this test
    // asserts UI behavior (no delete button), not fixture presence.
    // See post-pilot/2026-04-23-skill-library-followups.md §P1-1.
    if (builtinSkills.length === 0) {
      test.skip(true, 'No builtin skills available in this env — skipping delete-button visibility check');
      return;
    }

    // Test the first builtin skill
    const firstBuiltin = builtinSkills[0];
    const normalizedName = normalizeTestId(firstBuiltin.name);

    // Step 2: Locate the builtin skill card
    const builtinCard = page.locator(`[data-testid="my-skill-card-${normalizedName}"]`);
    await expect(builtinCard).toBeVisible();

    // Step 3: Hover to card to reveal buttons
    await builtinCard.hover();
    await page.waitForTimeout(300);

    // Screenshot 02: After hover
    await takeScreenshot(page, 'skills-hub/tc-s-06/02-after-hover-builtin.png');

    // Expected: Only "Export" button visible, NO delete button
    // Per source code line 565-577: delete button only shows if skill.source === 'custom'
    const deleteButton = builtinCard.locator(`[data-testid="btn-delete-${normalizedName}"]`);

    // Screenshot 03: Final state - verify no delete button
    await takeScreenshot(page, 'skills-hub/tc-s-06/03-verify-no-delete-button.png');

    // Assertion: Delete button must NOT be visible for builtin skills
    await expect(deleteButton).not.toBeVisible();
  });

  // ============================================================================
  // TC-S-08: Render external skills list (single source)
  // ============================================================================

  test('TC-S-08: should render external skills section with custom source', async ({ page }) => {
    // Setup: Create temporary external source with 1 skill (real directory + SKILL.md)
    const tempSource = createTempExternalSource('tc-s-08');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-External', 'External skill for testing');

      // Add custom external path via bridge
      await addCustomExternalPath(page, 'E2E Test Source', tempSource.path);

      // Refresh to trigger data reload
      await refreshSkillsHub(page);

      // Screenshot 01: Initial page state
      await takeScreenshot(page, 'skills-hub/tc-s-08/01-page-loaded.png');

      // Step 2: Locate "Discovered External Skills" section
      const externalSection = page.locator('[data-testid="external-skills-section"]');
      await expect(externalSection).toBeVisible();

      // Screenshot 02: External section visible
      await takeScreenshot(page, 'skills-hub/tc-s-08/02-external-section.png');

      // Step 4: Click Tab button for this test's specific source.
      // Use stable data-testid (format: `external-source-tab-${source.source}` where
      // source.source is `custom-<absolute-path>` per backend slug contract), avoiding
      // substring collisions with other tests' "E2E Test Source TC11/12/13/14".
      const sourceTab = page.locator(`[data-testid="external-source-tab-custom-${tempSource.path}"]`);
      await expect(sourceTab).toBeVisible();
      await sourceTab.click();
      await page.waitForTimeout(300);

      // Screenshot 03: Source tab visible and active
      await takeScreenshot(page, 'skills-hub/tc-s-08/03-source-tab.png');

      // Step 5: Verify skill card is displayed
      const externalCard = page.locator(`[data-testid="external-skill-card-${normalizeTestId('E2E-Test-External')}"]`);
      await expect(externalCard).toBeVisible();

      // Screenshot 04: External skill card
      await takeScreenshot(page, 'skills-hub/tc-s-08/04-external-skill-card.png');

      // Bridge assertion: Verify external sources (source field is custom-${path}, name field is display name)
      const externalSources = await getExternalSources(page);
      const testSource = externalSources.find((s: any) => s.name === 'E2E Test Source');
      expect(testSource).toBeDefined();
      expect(testSource?.skills?.length).toBeGreaterThan(0);
      expect(testSource?.skills[0]?.name).toBe('E2E-Test-External');
    } finally {
      await removeCustomExternalPath(page, tempSource.path);
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-10: Import external skill via UI (success scenario)
  // ============================================================================

  test('TC-S-10: should import external skill via UI click', async ({ page }) => {
    // Setup: Create external source with 1 skill (real directory + SKILL.md)
    const tempSource = createTempExternalSource('tc-s-10');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-Import-Single', 'Skill to import');
      await addCustomExternalPath(page, 'E2E Test Import Source', tempSource.path);

      // Refresh to trigger data reload
      await refreshSkillsHub(page);

      // Screenshot 01: Initial state
      await takeScreenshot(page, 'skills-hub/tc-s-10/01-before-import.png');

      // Step 1.5: Click external source tab by text
      const sourceTab = page.locator('button:has-text("E2E Test Import Source")');
      await expect(sourceTab).toBeVisible();
      await sourceTab.click();
      await page.waitForTimeout(300);

      // Step 2: Locate external skill card
      const externalCard = page.locator(
        `[data-testid="external-skill-card-${normalizeTestId('E2E-Test-Import-Single')}"]`
      );
      await expect(externalCard).toBeVisible();

      // Screenshot 02: External card visible
      await takeScreenshot(page, 'skills-hub/tc-s-10/02-external-card.png');

      // Step 3: Click the card to import (entire card is clickable)
      await importSkillViaUI(page, 'E2E-Test-Import-Single');

      // Screenshot 03: After import click
      await takeScreenshot(page, 'skills-hub/tc-s-10/03-after-import-click.png');

      // Screenshot 04: After import operation
      await takeScreenshot(page, 'skills-hub/tc-s-10/04-after-import.png');

      // Wait for "My Skills" section to auto-refresh
      await page.waitForTimeout(1000);

      // Expected: New skill appears in "My Skills"
      const mySkillCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId('E2E-Test-Import-Single')}"]`);
      await expect(mySkillCard).toBeVisible();

      // Screenshot 05: Skill in My Skills section
      await takeScreenshot(page, 'skills-hub/tc-s-10/05-skill-in-my-skills.png');

      // Bridge assertion
      const skills = await getMySkills(page);
      const importedSkill = skills.find((s) => s.name === 'E2E-Test-Import-Single');
      expect(importedSkill).toBeDefined();
    } finally {
      await deleteSkillViaBridge(page, 'E2E-Test-Import-Single');
      await removeCustomExternalPath(page, tempSource.path);
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-16: Add custom external path (success scenario)
  // ============================================================================

  test('TC-S-16: should add custom external path via UI', async ({ page, electronApp }) => {
    // Setup: Create real skill directory with SKILL.md
    const tempSource = createTempExternalSource('tc-s-16');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-Custom-Path-Skill', 'Skill in custom path');

      await page.reload();
      await goToSkillsHub(page);

      // Screenshot 01: Initial state
      await takeScreenshot(page, 'skills-hub/tc-s-16/01-before-add-path.png');

      // Step 2: Locate "Add Path" button in External Skills section
      const addPathButton = page.locator('[data-testid="btn-add-custom-path"]');
      await expect(addPathButton).toBeVisible();

      // Screenshot 02: Add Path button visible
      await takeScreenshot(page, 'skills-hub/tc-s-16/02-add-path-button.png');

      // Step 3: Click "Add Path" button
      await addPathButton.click();

      // Expected: Input modal appears
      const nameModal = page.locator('.modal-name-custom-path .arco-modal');
      await expect(nameModal).toBeVisible();

      // Screenshot 03: Name input modal
      await takeScreenshot(page, 'skills-hub/tc-s-16/03-name-modal.png');

      // Step 4: Enter source name and path
      const nameInput = page.locator('[data-testid="input-source-name"]');
      await nameInput.fill('E2E Custom Source');

      const pathInput = page.locator('[data-testid="input-source-path"]');
      await pathInput.fill(tempSource.path);

      // Screenshot 04: After entering name and path
      await takeScreenshot(page, 'skills-hub/tc-s-16/04-name-path-entered.png');

      // Step 5: Click confirm (Arco Modal OK button)
      const confirmButton = nameModal.locator('.arco-btn-primary');
      await confirmButton.click();

      // Expected: Modal closes
      await expect(nameModal).not.toBeVisible();

      // Refresh to trigger data reload
      await refreshSkillsHub(page);

      // Screenshot 06: After modal closes and refresh
      await takeScreenshot(page, 'skills-hub/tc-s-16/06-after-modal-closes.png');

      // Expected: New tab appears with source name (use text selector)
      const newSourceTab = page.locator('button:has-text("E2E Custom Source")');
      await expect(newSourceTab).toBeVisible();

      // Click the tab to activate it
      await newSourceTab.click();
      await page.waitForTimeout(300);

      // Screenshot 07: New source tab visible
      await takeScreenshot(page, 'skills-hub/tc-s-16/07-new-source-tab.png');

      // Expected: Skill card from that source is visible
      const skillCard = page.locator(
        `[data-testid="external-skill-card-${normalizeTestId('E2E-Test-Custom-Path-Skill')}"]`
      );
      await expect(skillCard).toBeVisible();

      // Screenshot 08: Skill card visible
      await takeScreenshot(page, 'skills-hub/tc-s-16/08-skill-card-visible.png');

      // Bridge assertion (match by name field, not source field)
      const externalSources = await getExternalSources(page);
      const addedSource = externalSources.find((s: any) => s.name === 'E2E Custom Source');
      expect(addedSource).toBeDefined();
      expect(addedSource?.skills?.length).toBeGreaterThan(0);
    } finally {
      await removeCustomExternalPath(page, tempSource.path);
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-19: Export skill to external source (success scenario)
  // ============================================================================

  test('TC-S-19: should export skill to external source via UI', async ({ page }) => {
    // Setup: Create real skill directory and export destination
    const skillName = `E2E-Test-Export-Source-${Date.now()}`;
    const tempExportDest = createTempExternalSource('tc-s-19-export');
    const tempSource = createTempExternalSource('tc-s-19-source');
    try {
      // Create skill with SKILL.md and import to My Skills
      createTestSkill(tempSource.path, skillName, 'Skill to export');
      const skillPath = path.join(tempSource.path, skillName);
      const importResult = await importSkillViaBridge(page, skillPath);
      expect(importResult.success).toBe(true);

      // Create a dummy skill in export destination so it appears in external sources
      // (detect-and-count-external-skills only returns sources with at least 1 skill)
      createTestSkill(tempExportDest.path, 'E2E-Placeholder-Skill', 'Placeholder to make source visible');

      // Add export destination as custom external path
      await addCustomExternalPath(page, 'E2E Target Source', tempExportDest.path);

      // Refresh to trigger data reload
      await refreshSkillsHub(page);

      // Screenshot 01: Initial state
      await takeScreenshot(page, 'skills-hub/tc-s-19/01-before-export.png');

      // Step 2: Locate skill card in "My Skills"
      const skillCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skillName)}"]`);
      await expect(skillCard).toBeVisible();

      // Step 3: Hover to show "Export" button and wait
      await skillCard.hover();
      await page.waitForTimeout(500);

      // Screenshot 02: After hover, export button visible
      await takeScreenshot(page, 'skills-hub/tc-s-19/02-export-button-visible.png');

      // Step 4: Click "Export" button to open Dropdown (force click to avoid hover issues)
      const exportButton = page.locator(`[data-testid="btn-export-${normalizeTestId(skillName)}"]`);
      await expect(exportButton).toBeVisible();
      await exportButton.click({ force: true });

      // Wait for Dropdown to appear
      await page.waitForTimeout(800);

      // Screenshot 03: Dropdown visible
      await takeScreenshot(page, 'skills-hub/tc-s-19/03-dropdown-visible.png');

      // Step 5: Select target source from dropdown menu
      const dropdownMenu = page.locator('.arco-dropdown-menu').last();
      await expect(dropdownMenu).toBeVisible();
      const menuItems = dropdownMenu.locator('.arco-dropdown-menu-item');
      const itemCount = await menuItems.count();
      console.log('[TC-S-19] Dropdown menu items count:', itemCount);

      // Get all menu item texts for debugging
      for (let i = 0; i < itemCount; i++) {
        const itemText = await menuItems.nth(i).textContent();
        console.log(`[TC-S-19] Menu item ${i}:`, itemText);
      }

      if (itemCount === 0) {
        throw new Error('Export dropdown menu is empty');
      }

      // Click "E2E Target Source" menu item by text
      const targetMenuItem = menuItems.filter({ hasText: 'E2E Target Source' });
      await expect(targetMenuItem).toBeVisible();
      await targetMenuItem.click();

      // Check for success message
      let successMessageAppeared = false;
      try {
        await page.waitForSelector('.arco-message-success', { timeout: 5000 });
        successMessageAppeared = true;
        console.log('[TC-S-19] Success message appeared');
      } catch {
        console.log('[TC-S-19] No success message appeared after export');
      }

      // Wait for export operation to complete
      await page.waitForTimeout(3000);

      // Screenshot 04: After export operation
      await takeScreenshot(page, 'skills-hub/tc-s-19/04-after-export.png');

      // Debug: Gather all diagnostic info
      const exportedSkillPath = path.join(tempExportDest.path, skillName);
      const fs = require('fs');

      console.log('[TC-S-19] Diagnostic info:');
      console.log('  Skill name:', skillName);
      console.log('  Export dest path:', tempExportDest.path);
      console.log('  Export dest exists:', fs.existsSync(tempExportDest.path));
      console.log(
        '  Export dest contents:',
        fs.existsSync(tempExportDest.path) ? fs.readdirSync(tempExportDest.path) : 'N/A'
      );
      console.log('  Expected skill path:', exportedSkillPath);
      console.log('  Skill path exists:', fs.existsSync(exportedSkillPath));
      console.log('  Success message appeared:', successMessageAppeared);

      // Verify imported skill location via Bridge
      const mySkills = await getMySkills(page);
      const exportedSkill = mySkills.find((s) => s.name === skillName);
      console.log('  Skill in My Skills:', exportedSkill ? 'yes' : 'no');
      if (exportedSkill) {
        console.log('  Skill.location:', exportedSkill.location);
        console.log('  Skill.source:', exportedSkill.source);
      }

      // Verify external sources via Bridge
      const externalSources = await getExternalSources(page);
      const targetSource = externalSources.find((s: any) => s.name === 'E2E Target Source');
      console.log('  Target source found:', targetSource ? 'yes' : 'no');
      if (targetSource) {
        console.log('  Target source.path:', targetSource.path);
        console.log('  Target source.source:', targetSource.source);
        console.log('  Target source.skills.length:', targetSource.skills?.length || 0);
      }

      // File system assertion (must pass - no conditional skip)
      expect(fs.existsSync(exportedSkillPath)).toBe(true);
      expect(fs.existsSync(path.join(exportedSkillPath, 'SKILL.md'))).toBe(true);

      // Screenshot 05: Final state
      await takeScreenshot(page, 'skills-hub/tc-s-19/05-export-complete.png');
    } finally {
      tempSource.cleanup();
      tempExportDest.cleanup();
    }
  });
});
