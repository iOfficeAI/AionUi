/**
 * Skills Hub E2E Tests - Search功能 (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-S-02: Search My Skills (match scenario)
 * - TC-S-03: Search My Skills (no match scenario)
 * - TC-S-12: Search external skills (match scenario)
 * - TC-S-13: Search external skills (no match scenario)
 */

import { test, expect } from '../../../fixtures';
import {
  goToSkillsHub,
  refreshSkillsHub,
  getMySkills,
  importSkillViaBridge,
  addCustomExternalPath,
  searchMySkills,
  searchExternalSkills,
  createTempExternalSource,
  createTestSkill,
  cleanupTestSkills,
  normalizeTestId,
} from '../../../helpers/skillsHub';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as path from 'path';

test.describe('Skills Hub - Search (P1)', () => {
  test.beforeEach(async ({ page }) => {
    await goToSkillsHub(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupTestSkills(page);
  });

  // ============================================================================
  // TC-S-02: Search My Skills (match scenario)
  // ============================================================================

  test('TC-S-02: should filter My Skills list by search keyword', async ({ page }) => {
    // Setup: Create 3 test skills with unique names
    const timestamp = Date.now();
    const tempSource = createTempExternalSource('tc-s-02');
    try {
      const skill1 = `E2E-Test-Search-Target-${timestamp}`;
      const skill2 = `E2E-Test-Alpha-${timestamp}`;
      const skill3 = `E2E-Test-Beta-${timestamp}`;

      createTestSkill(tempSource.path, skill1, 'target skill for search test');
      createTestSkill(tempSource.path, skill2, 'Alpha skill');
      createTestSkill(tempSource.path, skill3, 'Beta skill');

      const import1 = await importSkillViaBridge(page, path.join(tempSource.path, skill1));
      const import2 = await importSkillViaBridge(page, path.join(tempSource.path, skill2));
      const import3 = await importSkillViaBridge(page, path.join(tempSource.path, skill3));

      expect(import1.success).toBe(true);
      expect(import2.success).toBe(true);
      expect(import3.success).toBe(true);

      await refreshSkillsHub(page);

      // Wait for My Skills section to load
      const mySkillsSection = page.locator('[data-testid="my-skills-section"]');
      await expect(mySkillsSection).toBeVisible();

      // Verify 3 skills exist via Bridge before UI search
      const mySkills = await getMySkills(page);
      const testSkills = mySkills.filter((s) => s.name.includes(`-${timestamp}`));
      expect(testSkills.length).toBe(3);

      // Screenshot 01: Initial state with 3 skills
      await takeScreenshot(page, 'skills-hub/tc-s-02/01-before-search.png');

      // Step 2: Enter search keyword in My Skills search box
      await searchMySkills(page, 'Search');

      // Wait for search results to render
      await page.waitForTimeout(500);

      // Screenshot 02: After search
      await takeScreenshot(page, 'skills-hub/tc-s-02/02-search-results.png');

      // Expected: Only skill with "Search" in name visible
      const targetCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skill1)}"]`);
      await expect(targetCard).toBeVisible();

      // Expected: Other cards not visible
      const alphaCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skill2)}"]`);
      const betaCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId(skill3)}"]`);
      await expect(alphaCard).not.toBeVisible();
      await expect(betaCard).not.toBeVisible();

      // Screenshot 03: Only target card visible
      await takeScreenshot(page, 'skills-hub/tc-s-02/03-filtered-result.png');
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-03: Search My Skills (no match scenario)
  // ============================================================================

  test('TC-S-03: should show empty state when search has no match', async ({ page }) => {
    // Setup: Create 1 test skill
    const tempSource = createTempExternalSource('tc-s-03');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-Skill', 'Test skill');
      await importSkillViaBridge(page, path.join(tempSource.path, 'E2E-Test-Skill'));

      await refreshSkillsHub(page);

      // Screenshot 01: Initial state
      await takeScreenshot(page, 'skills-hub/tc-s-03/01-before-search.png');

      // Step 2: Search with non-existent keyword
      await searchMySkills(page, 'NonExistentKeyword');
      await page.waitForTimeout(300);

      // Screenshot 02: After search
      await takeScreenshot(page, 'skills-hub/tc-s-03/02-no-results.png');

      // Expected: Skill card not visible
      const skillCard = page.locator(`[data-testid="my-skill-card-${normalizeTestId('E2E-Test-Skill')}"]`);
      await expect(skillCard).not.toBeVisible();

      // Expected: Empty state message visible (note: don't match i18n text)
      const mySkillsSection = page.locator('[data-testid="my-skills-section"]');
      await expect(mySkillsSection).toBeVisible();

      // Screenshot 03: Empty state
      await takeScreenshot(page, 'skills-hub/tc-s-03/03-empty-state.png');
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-12: Search external skills (match scenario)
  // ============================================================================

  test('TC-S-12: should filter external skills list by search keyword', async ({ page }) => {
    // Setup: Create external source with 3 skills
    const tempSource = createTempExternalSource('tc-s-12');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-External-Alpha', 'Alpha external skill');
      createTestSkill(tempSource.path, 'E2E-Test-External-Beta', 'Beta external skill');
      createTestSkill(tempSource.path, 'E2E-Test-External-Search-Target', 'target for search');

      await addCustomExternalPath(page, 'E2E Test Source TC12', tempSource.path);
      await refreshSkillsHub(page);

      // Click source tab
      const sourceTab = page.locator('button:has-text("E2E Test Source TC12")');
      await expect(sourceTab).toBeVisible();
      await sourceTab.click();
      await page.waitForTimeout(300);

      // Screenshot 01: Initial state with 3 external skills
      await takeScreenshot(page, 'skills-hub/tc-s-12/01-before-search.png');

      // Step 2: Search external skills
      await searchExternalSkills(page, 'Search');
      await page.waitForTimeout(300);

      // Screenshot 02: After search
      await takeScreenshot(page, 'skills-hub/tc-s-12/02-search-results.png');

      // Expected: Only E2E-Test-External-Search-Target visible
      const targetCard = page.locator(
        `[data-testid="external-skill-card-${normalizeTestId('E2E-Test-External-Search-Target')}"]`
      );
      await expect(targetCard).toBeVisible();

      // Expected: Other cards not visible
      const alphaCard = page.locator(
        `[data-testid="external-skill-card-${normalizeTestId('E2E-Test-External-Alpha')}"]`
      );
      const betaCard = page.locator(`[data-testid="external-skill-card-${normalizeTestId('E2E-Test-External-Beta')}"]`);
      await expect(alphaCard).not.toBeVisible();
      await expect(betaCard).not.toBeVisible();

      // Screenshot 03: Only target card visible
      await takeScreenshot(page, 'skills-hub/tc-s-12/03-filtered-result.png');
    } finally {
      tempSource.cleanup();
    }
  });

  // ============================================================================
  // TC-S-13: Search external skills (no match scenario)
  // ============================================================================

  test('TC-S-13: should show empty state when external search has no match', async ({ page }) => {
    // Setup: Create external source with 1 skill
    const tempSource = createTempExternalSource('tc-s-13');
    try {
      createTestSkill(tempSource.path, 'E2E-Test-External-Skill', 'External skill');
      await addCustomExternalPath(page, 'E2E Test Source TC13', tempSource.path);
      await refreshSkillsHub(page);

      // Click source tab
      const sourceTab = page.locator('button:has-text("E2E Test Source TC13")');
      await expect(sourceTab).toBeVisible();
      await sourceTab.click();
      await page.waitForTimeout(300);

      // Screenshot 01: Initial state
      await takeScreenshot(page, 'skills-hub/tc-s-13/01-before-search.png');

      // Step 2: Search with non-existent keyword
      await searchExternalSkills(page, 'NonExistentKeyword');
      await page.waitForTimeout(300);

      // Screenshot 02: After search
      await takeScreenshot(page, 'skills-hub/tc-s-13/02-no-results.png');

      // Expected: Skill card not visible
      const skillCard = page.locator(
        `[data-testid="external-skill-card-${normalizeTestId('E2E-Test-External-Skill')}"]`
      );
      await expect(skillCard).not.toBeVisible();

      // Expected: External skills section still visible
      const externalSection = page.locator('[data-testid="external-skills-section"]');
      await expect(externalSection).toBeVisible();

      // Screenshot 03: Empty state
      await takeScreenshot(page, 'skills-hub/tc-s-13/03-empty-state.png');
    } finally {
      tempSource.cleanup();
    }
  });
});
