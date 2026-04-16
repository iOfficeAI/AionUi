/**
 * Extension-Contributed Agents & Assistants -- E2E tests.
 *
 * Covers: extension agents/assistants appearing in agent settings,
 * assistant settings, and guid page; extension assistant read-only editing;
 * duplication to custom; IPC bridge data correctness.
 *
 * Requires: e2e-full-extension loaded (via AIONUI_EXTENSIONS_PATH=examples/).
 */
import { test, expect } from '../fixtures';
import {
  goToSettings,
  goToGuid,
  waitForSettle,
  getExtensionSnapshot,
  expectBodyContainsAny,
  BTN_SAVE_ASSISTANT,
  BTN_DELETE_ASSISTANT,
  goToAssistantSettings,
  openAssistantDrawer,
  closeDrawer,
  getVisibleAssistantIds,
  duplicateAssistant,
  fillAssistantName,
  saveAssistant,
  deleteAssistant,
} from '../helpers';

const TS = Date.now();

test.describe('Extension-Contributed Agents & Assistants', () => {
  test('extension agent appears in agent settings', async ({ page }) => {
    await goToSettings(page, 'agent');
    await waitForSettle(page, 5_000);
    // e2e-full-extension contributes "E2E CLI Agent" and "E2E HTTP Agent"
    await expectBodyContainsAny(page, ['E2E CLI Agent', 'e2e-cli-agent', 'E2E HTTP Agent']);
  });

  test('extension assistant appears in assistant settings', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    // Extension assistants load asynchronously via SWR — poll until the card appears
    let hasExtAssistant = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const ids = await getVisibleAssistantIds(page);
      hasExtAssistant = ids.some((id) => id.includes('e2e-test-assistant'));
      if (hasExtAssistant) break;
      await page.waitForTimeout(1_000);
    }
    // The e2e-full-extension contributes "ext-e2e-test-assistant"
    expect(hasExtAssistant).toBeTruthy();
  });

  test('extension assistant appears on guid page', async ({ page }) => {
    await goToGuid(page);
    await waitForSettle(page, 5_000);
    // Look for the extension assistant name in the page
    await expectBodyContainsAny(page, ['E2E Test Assistant']);
  });

  test('extension assistant edit is read-only', async ({ page }) => {
    await goToAssistantSettings(page);
    await waitForSettle(page, 3_000);
    const ids = await getVisibleAssistantIds(page);
    const extId = ids.find((id) => id.includes('e2e-test-assistant'));
    test.skip(!extId, 'E2E Test Assistant not found');

    await openAssistantDrawer(page, extId!);
    // Save button is disabled for extension assistants
    const saveBtn = page.locator(BTN_SAVE_ASSISTANT);
    await expect(saveBtn).toBeDisabled();
    // No delete button for extension assistants
    const deleteVisible = await page
      .locator(BTN_DELETE_ASSISTANT)
      .isVisible()
      .catch(() => false);
    expect(deleteVisible).toBeFalsy();

    await closeDrawer(page);
  });

  test('duplicate extension assistant to custom', async ({ page }) => {
    await goToAssistantSettings(page);
    await waitForSettle(page, 3_000);
    const ids = await getVisibleAssistantIds(page);
    const extId = ids.find((id) => id.includes('e2e-test-assistant'));
    test.skip(!extId, 'E2E Test Assistant not found');

    await duplicateAssistant(page, extId!);
    await fillAssistantName(page, `E2E Ext Copy ${TS}`);
    await saveAssistant(page);
    await waitForSettle(page, 2_000);

    // Should now have a custom copy
    const idsAfter = await getVisibleAssistantIds(page);
    const body = await page.locator('body').textContent();
    expect(body).toContain(`E2E Ext Copy ${TS}`);

    // Cleanup: find the copy by name and delete it
    for (const id of idsAfter) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(`E2E Ext Copy ${TS}`)) {
        await openAssistantDrawer(page, id);
        await deleteAssistant(page);
        break;
      }
    }
  });

  test('extension data correct via IPC bridge', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    // Verify e2e-full-extension loaded
    const extNames = snapshot.loadedExtensions.map((e) => e.name);
    expect(extNames).toContain('e2e-full-extension');

    // Verify assistant contributed
    const assistantIds = snapshot.assistants.map((a) => a.id);
    expect(assistantIds).toEqual(expect.arrayContaining(['ext-e2e-test-assistant']));

    // Verify ACP adapters contributed
    const adapterIds = snapshot.acpAdapters.map((a) => a.id);
    expect(adapterIds).toEqual(expect.arrayContaining(['e2e-cli-agent', 'e2e-http-agent']));
  });
});
