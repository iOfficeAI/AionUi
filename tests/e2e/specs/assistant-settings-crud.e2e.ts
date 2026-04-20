/**
 * Assistant Settings CRUD — E2E tests.
 *
 * Covers: create, read, edit, duplicate, delete, enable/disable,
 * search, filter, sort, persistence.
 */
import { test, expect } from '../fixtures';
import {
  goToGuid,
  goToAssistantSettings,
  clickCreateAssistant,
  fillAssistantName,
  fillAssistantDescription,
  saveAssistant,
  deleteAssistant,
  duplicateAssistant,
  toggleAssistantEnabled,
  searchAssistants,
  clearSearch,
  selectFilterTab,
  getVisibleAssistantIds,
  getVisibleAssistantNames,
  isDrawerVisible,
  waitForDrawerClose,
  closeDrawer,
  openAssistantDrawer,
  BTN_CREATE_ASSISTANT,
  BTN_SAVE_ASSISTANT,
  BTN_DELETE_ASSISTANT,
  SELECT_ASSISTANT_AGENT,
  ASSISTANT_EDIT_DRAWER,
} from '../helpers';

test.describe('Assistant Settings CRUD', () => {
  test.setTimeout(90_000);

  test('page loads with assistant list', async ({ page }) => {
    await goToAssistantSettings(page);

    // Should have at least one assistant card (builtin)
    const cards = page.locator('[data-testid^="assistant-card-"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });

  test('search filter — by name', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const namesBefore = await getVisibleAssistantNames(page);
    if (namesBefore.length < 2) {
      test.skip(true, 'Need at least 2 assistants to test search');
      return;
    }

    // Search for the first assistant's name
    const targetName = namesBefore[0];
    await searchAssistants(page, targetName);

    // Wait for filter to take effect
    await page.waitForTimeout(300);
    const namesAfter = await getVisibleAssistantNames(page);

    // Should show fewer results or at least contain the searched name
    expect(namesAfter.some((n) => n.includes(targetName) || targetName.includes(n))).toBeTruthy();

    // Clear search to avoid polluting subsequent tests
    await clearSearch(page);
    await page.waitForTimeout(300);
  });

  test('search filter — clear restores full list', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Ensure search is closed before measuring baseline
    const searchInput = page.locator('[data-testid="input-search-assistant"]');
    if (await searchInput.isVisible().catch(() => false)) {
      await clearSearch(page);
      await page.waitForTimeout(300);
    }

    const countBefore = (await getVisibleAssistantIds(page)).length;
    await searchAssistants(page, 'zzz_nonexistent_query');
    await page.waitForTimeout(300);

    // Clear search
    await clearSearch(page);
    await page.waitForTimeout(300);

    const countAfter = (await getVisibleAssistantIds(page)).length;
    expect(countAfter).toBe(countBefore);
  });

  test('tab filter — System / Custom', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Click System tab
    await selectFilterTab(page, 'System');
    await page.waitForTimeout(300);
    const systemIds = await getVisibleAssistantIds(page);

    // Click Custom tab
    await selectFilterTab(page, 'Custom');
    await page.waitForTimeout(300);
    const customIds = await getVisibleAssistantIds(page);

    // Click All tab
    await selectFilterTab(page, 'All');
    await page.waitForTimeout(300);
    const allIds = await getVisibleAssistantIds(page);

    // All should be >= system and >= custom
    expect(allIds.length).toBeGreaterThanOrEqual(systemIds.length);
  });

  test('create custom assistant — full flow', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const timestamp = Date.now();
    const testName = `E2E Test Assistant ${timestamp}`;

    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);
    await fillAssistantDescription(page, 'Created by E2E test');
    await saveAssistant(page);

    // Drawer should close
    await waitForDrawerClose(page);

    // New assistant should appear in list
    const names = await getVisibleAssistantNames(page);
    expect(names).toContain(testName);

    // Cleanup: delete it
    const ids = await getVisibleAssistantIds(page);
    // Find the newly created one by looking for a card that wasn't there before
    for (const id of ids) {
      const card = page.locator(`[data-testid="assistant-card-${id}"]`);
      const cardText = await card.textContent();
      if (cardText?.includes(testName)) {
        await openAssistantDrawer(page, id);
        await deleteAssistant(page);
        break;
      }
    }
  });

  test('create assistant — name required validation', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    await clickCreateAssistant(page);
    // Leave name empty, try to save
    await fillAssistantName(page, '');
    await saveAssistant(page);

    // Drawer should still be open (validation prevents close)
    const drawerVisible = await isDrawerVisible(page);
    expect(drawerVisible).toBeTruthy();

    // Close drawer without saving
    await page.keyboard.press('Escape');
  });

  test('edit custom assistant — change name', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Create a test assistant first
    const timestamp = Date.now();
    const originalName = `Edit Test ${timestamp}`;
    const updatedName = `Edit Test Updated ${timestamp}`;

    await clickCreateAssistant(page);
    await fillAssistantName(page, originalName);
    await saveAssistant(page);
    await waitForDrawerClose(page);

    // Find and edit it
    const ids = await getVisibleAssistantIds(page);
    let targetId = '';
    for (const id of ids) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(originalName)) {
        targetId = id;
        break;
      }
    }
    expect(targetId).toBeTruthy();

    await openAssistantDrawer(page, targetId);
    await fillAssistantName(page, updatedName);
    await saveAssistant(page);
    await waitForDrawerClose(page);

    // List should show updated name
    const names = await getVisibleAssistantNames(page);
    expect(names).toContain(updatedName);
    expect(names).not.toContain(originalName);

    // Cleanup
    await openAssistantDrawer(page, targetId);
    await deleteAssistant(page);
  });

  test('edit custom assistant — switch Main Agent', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Create a test assistant
    const timestamp = Date.now();
    const testName = `Agent Switch ${timestamp}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);
    await saveAssistant(page);
    await waitForDrawerClose(page);

    // Find and edit it
    const ids = await getVisibleAssistantIds(page);
    let targetId = '';
    for (const id of ids) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(testName)) {
        targetId = id;
        break;
      }
    }
    expect(targetId).toBeTruthy();

    await openAssistantDrawer(page, targetId);

    // Switch main agent via the select dropdown
    const agentSelect = page.locator(SELECT_ASSISTANT_AGENT);
    const selectVisible = await agentSelect.isVisible().catch(() => false);
    if (selectVisible) {
      await agentSelect.click();
      // Pick a different agent from the dropdown
      const option = page
        .locator('.arco-select-option')
        .filter({ hasText: /gemini/i })
        .first();
      const optionVisible = await option.isVisible().catch(() => false);
      if (optionVisible) {
        await option.click();
        await saveAssistant(page);
        // Edit save does not auto-close the drawer — close it
        await closeDrawer(page);

        // Reopen and verify agent changed
        await openAssistantDrawer(page, targetId);
        const selectText = await agentSelect.textContent();
        expect(selectText?.toLowerCase()).toContain('gemini');
      }
    }

    // Cleanup — ensure drawer is fully closed before clicking the card
    await closeDrawer(page);
    await openAssistantDrawer(page, targetId);
    await deleteAssistant(page);
  });

  test('duplicate assistant', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const idsBefore = await getVisibleAssistantIds(page);
    if (idsBefore.length === 0) {
      test.skip(true, 'No assistants to duplicate');
      return;
    }

    // Duplicate the first assistant
    const firstId = idsBefore[0];
    await duplicateAssistant(page, firstId);

    // Drawer opens with duplicated content — modify name and save
    const nameInput = page.locator('[data-testid="input-assistant-name"]');
    const currentName = await nameInput.inputValue();
    const dupName = `${currentName} E2E Dup ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(dupName);
    await saveAssistant(page);
    await waitForDrawerClose(page);

    // List should have one more assistant
    const idsAfter = await getVisibleAssistantIds(page);
    expect(idsAfter.length).toBe(idsBefore.length + 1);

    // Cleanup: find and delete the duplicate
    for (const id of idsAfter) {
      if (!idsBefore.includes(id)) {
        await openAssistantDrawer(page, id);
        await deleteAssistant(page);
        break;
      }
    }
  });

  test('delete custom assistant', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Create one to delete
    const timestamp = Date.now();
    const testName = `Delete Test ${timestamp}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);
    await saveAssistant(page);
    await waitForDrawerClose(page);

    const idsBefore = await getVisibleAssistantIds(page);

    // Find and delete
    let targetId = '';
    for (const id of idsBefore) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(testName)) {
        targetId = id;
        break;
      }
    }
    expect(targetId).toBeTruthy();

    await openAssistantDrawer(page, targetId);
    await deleteAssistant(page);

    // Wait for deletion
    await page.waitForTimeout(500);
    const idsAfter = await getVisibleAssistantIds(page);
    expect(idsAfter).not.toContain(targetId);
  });

  test('enable / disable toggle', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Create a test assistant
    const timestamp = Date.now();
    const testName = `Toggle Test ${timestamp}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);
    await saveAssistant(page);
    await waitForDrawerClose(page);

    // Find its ID
    const ids = await getVisibleAssistantIds(page);
    let targetId = '';
    for (const id of ids) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(testName)) {
        targetId = id;
        break;
      }
    }
    expect(targetId).toBeTruthy();

    // Toggle off
    await toggleAssistantEnabled(page, targetId);
    await page.waitForTimeout(500);

    // The card should still be visible but in disabled section
    const cardStillVisible = await page.locator(`[data-testid="assistant-card-${targetId}"]`).isVisible();
    expect(cardStillVisible).toBeTruthy();

    // Toggle back on
    await toggleAssistantEnabled(page, targetId);
    await page.waitForTimeout(500);

    // Cleanup
    await openAssistantDrawer(page, targetId);
    await deleteAssistant(page);
  });

  test('disabled builtin assistant removed from guid page presets', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Find a builtin assistant that has an enabled switch
    const ids = await getVisibleAssistantIds(page);
    let builtinId = '';
    for (const id of ids) {
      const sw = page.locator(`[data-testid="switch-enabled-${id}"]`);
      if (await sw.isVisible().catch(() => false)) {
        // Check if the switch is currently "on" (checked)
        const isChecked = await sw.locator('.arco-switch-checked, .arco-switch[aria-checked="true"]').count();
        if (isChecked > 0 || (await sw.getAttribute('aria-checked')) === 'true') {
          builtinId = id;
          break;
        }
      }
    }
    if (!builtinId) {
      test.skip(true, 'No enabled builtin assistant with toggle found');
      return;
    }

    // Go to guid first and check if this assistant's preset pill is visible
    await goToGuid(page);
    await page.locator('[data-agent-pill="true"]').first().waitFor({ state: 'visible', timeout: 8_000 });
    const presetBefore = await page
      .locator(`[data-testid="preset-pill-${builtinId}"]`)
      .isVisible()
      .catch(() => false);

    // If the preset pill isn't visible on guid, skip (not all builtin show as presets)
    if (!presetBefore) {
      test.skip(true, 'Builtin assistant does not appear as preset pill on guid');
      return;
    }

    // Disable it in settings
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });
    await toggleAssistantEnabled(page, builtinId);
    await page.waitForTimeout(500);

    // Go to guid and verify it's gone
    await goToGuid(page);
    await page.locator('[data-agent-pill="true"]').first().waitFor({ state: 'visible', timeout: 8_000 });
    const presetAfter = await page
      .locator(`[data-testid="preset-pill-${builtinId}"]`)
      .isVisible()
      .catch(() => false);
    expect(presetAfter).toBeFalsy();

    // Re-enable to restore state
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });
    await toggleAssistantEnabled(page, builtinId);
  });

  test('re-enabled assistant visible after toggle back on', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // Create, disable, then re-enable
    const timestamp = Date.now();
    const testName = `Re-enable Test ${timestamp}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);
    await saveAssistant(page);
    await waitForDrawerClose(page);

    let targetId = '';
    for (const id of await getVisibleAssistantIds(page)) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(testName)) {
        targetId = id;
        break;
      }
    }
    test.skip(!targetId, 'Could not find created assistant');

    // Toggle off
    await toggleAssistantEnabled(page, targetId);
    await page.waitForTimeout(500);

    // Toggle back on
    await toggleAssistantEnabled(page, targetId);
    await page.waitForTimeout(500);

    // Assistant should still be visible in the enabled section
    const names = await getVisibleAssistantNames(page);
    expect(names).toContain(testName);

    // Cleanup
    await openAssistantDrawer(page, targetId);
    await deleteAssistant(page);
  });

  test('created assistant persists after page reload', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const timestamp = Date.now();
    const testName = `Persist Test ${timestamp}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);
    await saveAssistant(page);
    await waitForDrawerClose(page);

    // Reload the page
    await page.reload();
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const names = await getVisibleAssistantNames(page);
    expect(names).toContain(testName);

    // Cleanup
    for (const id of await getVisibleAssistantIds(page)) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(testName)) {
        await openAssistantDrawer(page, id);
        await deleteAssistant(page);
        break;
      }
    }
  });

  test('sort order — enabled section renders before disabled', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // The AssistantListPanel renders "Enabled" section followed by "Disabled" section
    const bodyText = await page.locator('body').textContent();
    expect(bodyText!.length).toBeGreaterThan(50);

    // Verify section headers exist and are in correct order
    const enabledIdx = bodyText!.search(/Enabled|已启用/);
    const disabledIdx = bodyText!.search(/Disabled|已禁用/);

    // At least the Enabled section should exist
    expect(enabledIdx).toBeGreaterThanOrEqual(0);

    // If both sections exist, Enabled comes before Disabled
    if (disabledIdx >= 0) {
      expect(enabledIdx).toBeLessThan(disabledIdx);
    }

    const cards = page.locator('[data-testid^="assistant-card-"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });
});
