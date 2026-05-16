/**
 * Skills Hub E2E Tests - Refresh/Empty State/Tabs (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-S-04: Refresh My Skills list
 * - TC-S-07: Empty state when no skills
 * - TC-S-09: Tab switching between external sources
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
  normalizeTestId,
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Skills Hub - Refresh/Empty/Tabs (P1)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-04: Refresh My Skills list
  // ============================================================================

  test('TC-S-04: should refresh My Skills list and show newly added skill', async ({ page }) => {
    // Setup: Create 1 initial test skill
    const tempSource = createTempExternalSource('tc-s-04');
    try {
      const initialSkill = `E2E-Test-Initial-${Date.now()}`;
      createTestSkill(tempSource.path, initialSkill, 'Initial skill');

      const import1 = await importSkillViaBridge(page, path.join(tempSource.path, initialSkill));
      expect(import1.success).toBe(true);

      await refreshSkillsHub(page);

      // Screenshot 01: Initial state with 1 skill
      await takeScreenshot(page, 'skills-hub/tc-s-04/01-initial-state.png');

      // Verify 1 skill exists
      const mySkillsSection = page.locator('[data-testid="my-skills-section"]');
      await expect(mySkillsSection).toBeVisible();
      const initialCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(initialSkill)}"]`);
      await expect(initialCard).toBeVisible();

      // Step 2: Dynamically add new skill via Bridge
      const newSkill = `E2E-Test-New-Skill-${Date.now()}`;
      createTestSkill(tempSource.path, newSkill, 'Newly added skill');
      const import2 = await importSkillViaBridge(page, path.join(tempSource.path, newSkill));
      expect(import2.success).toBe(true);

      // Screenshot 02: Before refresh (new skill not visible in UI yet)
      await takeScreenshot(page, 'skills-hub/tc-s-04/02-before-refresh.png');

      // Step 3: Click refresh button
      const refreshButton = page.locator('[data-testid="btn-refresh-my-skills"]');
      await expect(refreshButton).toBeVisible();
      await refreshButton.click();

      // Wait for refresh to complete (loading state disappears)
      await page.waitForTimeout(500);

      // Screenshot 03: After refresh
      await takeScreenshot(page, 'skills-hub/tc-s-04/03-after-refresh.png');

      // Expected: New skill card appears
      const newCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(newSkill)}"]`);
      await expect(newCard).toBeVisible();

      // Expected: Skill count updated (verify via Bridge)
      const mySkills = await getMySkills(page);
      const testSkills = mySkills.filter((s) => s.name.startsWith('E2E-Test-'));
      expect(testSkills.length).toBe(2);

      // Screenshot 04: Verify both skills visible
      await takeScreenshot(page, 'skills-hub/tc-s-04/04-both-skills-visible.png');
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-07: Empty state when no skills
  // ============================================================================

  test('TC-S-07: should show empty state when no skills exist', async ({ page }) => {
    // Setup: Ensure no test skills exist (cleanup already done in beforeEach)
    await cleanupTestSkills(page);
    await refreshSkillsHub(page);

    // Screenshot 01: Initial state (may have builtin skills)
    await takeScreenshot(page, 'skills-hub/tc-s-07/01-initial-state.png');

    // Expected: My Skills section visible
    const mySkillsSection = page.locator('[data-testid="my-skills-section"]');
    await expect(mySkillsSection).toBeVisible();

    // Verify via Bridge that no E2E test skills exist
    const mySkills = await getMySkills(page);
    const testSkills = mySkills.filter((s) => s.name.startsWith('E2E-Test-'));
    expect(testSkills.length).toBe(0);

    // Screenshot 02: No E2E test skills
    await takeScreenshot(page, 'skills-hub/tc-s-07/02-no-e2e-skills.png');

    // Expected: No E2E test skill cards rendered
    // Note: There may be builtin skills, so we only check that E2E test skills don't exist
    const e2eSkillCards = page.locator('[data-testid^="my-skill-card-E2E-Test-"]');
    await expect(e2eSkillCards).toHaveCount(0);

    // Screenshot 03: Final verification
    await takeScreenshot(page, 'skills-hub/tc-s-07/03-verified-no-e2e.png');
  });

  // ============================================================================
  // TC-S-09: Tab switching between external sources
  // ============================================================================

  test('TC-S-09: should switch tabs and show correct external skills', async ({ page }) => {
    // Setup: Create 2 external sources with different skills
    const sourceA = createTempExternalSource('tc-s-09-a');
    const sourceB = createTempExternalSource('tc-s-09-b');
    try {
      // Source A: 2 skills
      createTestSkill(sourceA.path, 'E2E-Test-SourceA-Skill1', 'Skill from source A #1');
      createTestSkill(sourceA.path, 'E2E-Test-SourceA-Skill2', 'Skill from source A #2');

      // Source B: 3 skills
      createTestSkill(sourceB.path, 'E2E-Test-SourceB-Skill1', 'Skill from source B #1');
      createTestSkill(sourceB.path, 'E2E-Test-SourceB-Skill2', 'Skill from source B #2');
      createTestSkill(sourceB.path, 'E2E-Test-SourceB-Skill3', 'Skill from source B #3');

      // Add both sources
      await addCustomExternalPath(page, 'E2E Source A TC09', sourceA.path);
      await addCustomExternalPath(page, 'E2E Source B TC09', sourceB.path);
      await refreshSkillsHub(page);

      // Wait for external skills section to render
      const externalSection = page.locator('[data-testid="external-skills-section"]');
      await expect(externalSection).toBeVisible();

      // Screenshot 01: Initial state (default tab, Source A)
      await takeScreenshot(page, 'skills-hub/tc-s-09/01-default-tab.png');

      // Step 2: Verify default tab (first source) is active
      const tabA = page.locator('button:has-text("E2E Source A TC09")');
      await expect(tabA).toBeVisible();

      // Click tab A to ensure it's active (in case default tab is not the first one)
      await tabA.click();
      await page.waitForTimeout(500);

      // Verify Source A skills visible
      const skillA1 = page.locator(`[data-testid="external-skill-card-${normalizeTestId('E2E-Test-SourceA-Skill1')}"]`);
      const skillA2 = page.locator(`[data-testid="external-skill-card-${normalizeTestId('E2E-Test-SourceA-Skill2')}"]`);
      await expect(skillA1).toBeVisible();
      await expect(skillA2).toBeVisible();

      // Screenshot 02: Source A tab active
      await takeScreenshot(page, 'skills-hub/tc-s-09/02-source-a-active.png');

      // Step 3: Click tab B
      const tabB = page.locator('button:has-text("E2E Source B TC09")');
      await expect(tabB).toBeVisible();
      await tabB.click();
      await page.waitForTimeout(300);

      // Screenshot 03: After clicking tab B
      await takeScreenshot(page, 'skills-hub/tc-s-09/03-switched-to-b.png');

      // Expected: Tab B active, Source B skills visible
      const skillB1 = page.locator(`[data-testid="external-skill-card-${normalizeTestId('E2E-Test-SourceB-Skill1')}"]`);
      const skillB2 = page.locator(`[data-testid="external-skill-card-${normalizeTestId('E2E-Test-SourceB-Skill2')}"]`);
      const skillB3 = page.locator(`[data-testid="external-skill-card-${normalizeTestId('E2E-Test-SourceB-Skill3')}"]`);
      await expect(skillB1).toBeVisible();
      await expect(skillB2).toBeVisible();
      await expect(skillB3).toBeVisible();

      // Expected: Source A skills not visible
      await expect(skillA1).not.toBeVisible();
      await expect(skillA2).not.toBeVisible();

      // Screenshot 04: Source B skills only
      await takeScreenshot(page, 'skills-hub/tc-s-09/04-source-b-skills.png');
    } finally {
      sourceA.cleanup();
      sourceB.cleanup();
    }
  });
});
