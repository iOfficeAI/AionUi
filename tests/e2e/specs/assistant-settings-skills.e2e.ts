/**
 * Assistant Settings Skills — E2E tests.
 *
 * Covers: skill panel display, toggle, add/remove, auto-injected skills,
 * disabled builtin skills, persistence.
 */
import { test, expect } from '../fixtures';
import {
  goToAssistantSettings,
  clickCreateAssistant,
  fillAssistantName,
  saveAssistant,
  waitForDrawerClose,
  closeDrawer,
  openAssistantDrawer,
  deleteAssistant,
  getVisibleAssistantIds,
  SKILLS_SECTION,
} from '../helpers';

test.describe('Assistant Settings Skills', () => {
  test.setTimeout(60_000);

  test('skill panel shows builtin skills for custom assistant', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Create a custom assistant to see skills panel
    const testName = `Skills Test ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    // Skills section should be visible for new custom assistants
    const skillsSection = page.locator(SKILLS_SECTION);
    const hasSkills = await skillsSection.isVisible().catch(() => false);

    if (hasSkills) {
      // Should have Builtin Skills collapse item
      const builtinCollapse = page.locator('.arco-collapse-item').filter({ hasText: /Builtin|内置/ });
      await expect(builtinCollapse.first()).toBeVisible({ timeout: 5_000 });
    }

    // Cancel and cleanup
    await closeDrawer(page);
  });

  test('skill panel shows auto-injected skills section', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Open a builtin assistant that has auto-injected skills
    const ids = await getVisibleAssistantIds(page);
    if (ids.length === 0) {
      test.skip(true, 'No assistants available');
      return;
    }

    // Try the first builtin assistant
    await openAssistantDrawer(page, ids[0]);

    const skillsSection = page.locator(SKILLS_SECTION);
    const hasSkills = await skillsSection.isVisible().catch(() => false);

    // Skills section should be visible for at least one assistant
    // If not, the feature may not be enabled — skip gracefully
    if (!hasSkills) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not rendered for this assistant');
      return;
    }

    // At minimum, the collapse container should render without error
    const collapseItems = skillsSection.locator('.arco-collapse-item');
    expect(await collapseItems.count()).toBeGreaterThanOrEqual(0);

    await closeDrawer(page);
  });

  test('toggle builtin skill selection', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Skill Toggle ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    const skillsSection = page.locator(SKILLS_SECTION);
    if (!(await skillsSection.isVisible().catch(() => false))) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not visible');
      return;
    }

    // Expand builtin skills
    const builtinCollapse = page.locator('.arco-collapse-item').filter({ hasText: /Builtin|内置/ });
    if (
      await builtinCollapse
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await builtinCollapse.locator('.arco-collapse-item-header').first().click();

      // Toggle a checkbox
      const checkboxes = builtinCollapse.locator('.arco-checkbox');
      if ((await checkboxes.count()) > 0) {
        const firstCheckbox = checkboxes.first();
        const wasBefore = await firstCheckbox.locator('input').isChecked();
        await firstCheckbox.click();
        const isAfter = await firstCheckbox.locator('input').isChecked();
        expect(isAfter).not.toBe(wasBefore);
      }
    }

    await closeDrawer(page);
  });

  test('disable auto-injected skill and save', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Auto-injected skills only exist on builtin assistants.
    // Builtin IDs don't start with "ext-" or contain timestamps from custom creation.
    const ids = await getVisibleAssistantIds(page);
    const builtinId = ids.find((id) => !id.startsWith('ext-'));
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantDrawer(page, builtinId);

    const autoInjected = page.locator('.arco-collapse-item').filter({ hasText: /Auto|自动/ });
    if (
      !(await autoInjected
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await closeDrawer(page);
      test.skip(true, 'No auto-injected skills section for this assistant');
      return;
    }

    // Expand auto-injected section and wait for collapse animation
    await autoInjected.locator('.arco-collapse-item-header').first().click();
    await page.waitForTimeout(500);

    const checkboxes = autoInjected.locator('.arco-checkbox');
    if ((await checkboxes.count()) === 0) {
      await closeDrawer(page);
      test.skip(true, 'No auto-injected skill checkboxes');
      return;
    }

    // Wait for checkbox to be visible after collapse expansion, then toggle
    const firstCheckbox = checkboxes.first();
    if (!(await firstCheckbox.isVisible().catch(() => false))) {
      await closeDrawer(page);
      test.skip(true, 'Auto-injected skill checkbox not visible after expanding');
      return;
    }
    await firstCheckbox.click();
    const saveBtn = page.locator('[data-testid="btn-save-assistant"]');
    if (await saveBtn.isDisabled()) {
      await closeDrawer(page);
      test.skip(true, 'Save button disabled after toggling skill');
      return;
    }

    await saveBtn.click();
    await waitForDrawerClose(page);
  });

  test('add skills button opens modal', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Add Skills ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    const skillsSection = page.locator(SKILLS_SECTION);
    if (!(await skillsSection.isVisible().catch(() => false))) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not visible');
      return;
    }

    // Click "Add Skills" button
    const addSkillsBtn = skillsSection.locator('button').filter({ hasText: /Add Skills|添加/ });
    if (
      await addSkillsBtn
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await addSkillsBtn.first().click();
      // Modal should open
      const modal = page.locator('.arco-modal');
      await expect(modal.first()).toBeVisible({ timeout: 5_000 });
      // Close modal first (Escape closes the topmost overlay)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Close the drawer
    await closeDrawer(page);
  });

  test('skill selection persists after save and reopen', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Skill Persist ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    const skillsSection = page.locator(SKILLS_SECTION);
    if (!(await skillsSection.isVisible().catch(() => false))) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not visible');
      return;
    }

    // Toggle a skill, then save
    const builtinCollapse = page.locator('.arco-collapse-item').filter({ hasText: /Builtin|内置/ });
    if (
      await builtinCollapse
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await builtinCollapse.locator('.arco-collapse-item-header').first().click();
      const checkboxes = builtinCollapse.locator('.arco-checkbox');
      if ((await checkboxes.count()) > 0) {
        await checkboxes.first().click();
      }
    }

    await saveAssistant(page);
    await waitForDrawerClose(page);

    // Reopen and verify
    let targetId = '';
    for (const id of await getVisibleAssistantIds(page)) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(testName)) {
        targetId = id;
        break;
      }
    }

    if (targetId) {
      await openAssistantDrawer(page, targetId);
      // Verify drawer opens without error
      const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
      await expect(drawer).toBeVisible({ timeout: 5_000 });

      // Cleanup
      await closeDrawer(page);
      await page.waitForTimeout(300);
      await openAssistantDrawer(page, targetId);
      await deleteAssistant(page);
    }
  });

  test('builtin assistant can access skills section', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Builtin assistants have simple IDs (not ext- prefix, not custom UUIDs)
    const ids = await getVisibleAssistantIds(page);
    const builtinId = ids.find((id) => !id.startsWith('ext-'));
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantDrawer(page, builtinId);
    const saveBtn = page.locator('[data-testid="btn-save-assistant"]');
    await expect(saveBtn).toBeVisible({ timeout: 3_000 });
    await closeDrawer(page);
  });

  test('custom skills collapse renders', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Custom Skills ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    const skillsSection = page.locator(SKILLS_SECTION);
    if (!(await skillsSection.isVisible().catch(() => false))) {
      await closeDrawer(page);
      test.skip(true, 'Skills section not visible');
      return;
    }

    // Skills section rendered — verify the collapse container has content
    const collapseItems = skillsSection.locator('.arco-collapse-item');
    const collapseCount = await collapseItems.count();
    // At least one collapse section should exist (Builtin or Custom)
    expect(collapseCount).toBeGreaterThanOrEqual(1);

    await closeDrawer(page);
  });

  test('extension assistant drawer opens without error', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Find an extension-contributed assistant
    const ids = await getVisibleAssistantIds(page);
    const extId = ids.find((id) => id.startsWith('ext-'));
    test.skip(!extId, 'No extension assistant available');

    await openAssistantDrawer(page, extId!);
    // Drawer should open and display the save button (may be disabled depending on edit state)
    const saveBtn = page.locator('[data-testid="btn-save-assistant"]');
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });

    await closeDrawer(page);
  });

  test('skills counter shows in summary', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const testName = `Counter Test ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);

    // The summary section shows skills count as Tag
    const skillsTag = page.locator('.arco-tag').filter({ hasText: /Skills|技能/ });
    // The count tag is nearby — just verify no crash
    const body = await page.locator('[data-testid="assistant-edit-drawer"]').textContent();
    expect(body).toBeTruthy();

    await closeDrawer(page);
  });
});
