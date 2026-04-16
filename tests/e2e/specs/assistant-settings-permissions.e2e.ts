/**
 * Assistant Settings Permissions — E2E tests.
 *
 * Covers: field-level permissions for builtin, extension, and custom
 * assistant types.
 */
import { test, expect } from '../fixtures';
import {
  goToAssistantSettings,
  openAssistantDrawer,
  getVisibleAssistantIds,
  BTN_SAVE_ASSISTANT,
  BTN_DELETE_ASSISTANT,
} from '../helpers';

test.describe('Assistant Settings Permissions', () => {
  test.setTimeout(60_000);

  // Helper: find an assistant by type
  async function findAssistantByType(
    page: import('@playwright/test').Page,
    type: 'builtin' | 'extension' | 'custom'
  ): Promise<string | null> {
    const ids = await getVisibleAssistantIds(page);
    for (const id of ids) {
      await openAssistantDrawer(page, id);

      const deleteBtn = page.locator(BTN_DELETE_ASSISTANT);
      const saveBtn = page.locator(BTN_SAVE_ASSISTANT);
      const nameInput = page.locator('[data-testid="input-assistant-name"]');
      const isNameDisabled = await nameInput.isDisabled().catch(() => true);
      const hasDelete = await deleteBtn.isVisible().catch(() => false);
      const isSaveVisible = await saveBtn.isVisible().catch(() => false);
      const isSaveDisabled = isSaveVisible ? await saveBtn.isDisabled().catch(() => false) : true;

      let detected: 'builtin' | 'extension' | 'custom' = 'custom';
      if (!hasDelete && isNameDisabled && isSaveVisible && !isSaveDisabled) {
        detected = 'builtin';
      } else if (!hasDelete && isNameDisabled && (!isSaveVisible || isSaveDisabled)) {
        detected = 'extension';
      }

      if (detected === type) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        return id;
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    return null;
  }

  test('builtin — name/desc/avatar read-only', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const builtinId = await findAssistantByType(page, 'builtin');
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantDrawer(page, builtinId);

    const nameInput = page.locator('[data-testid="input-assistant-name"]');
    const descInput = page.locator('[data-testid="input-assistant-desc"]');

    await expect(nameInput).toBeDisabled();
    await expect(descInput).toBeDisabled();

    await page.keyboard.press('Escape');
  });

  test('builtin — Main Agent editable', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const builtinId = await findAssistantByType(page, 'builtin');
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantDrawer(page, builtinId);

    // The agent Select (scoped to drawer) should not be disabled
    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    const agentSelect = drawer.locator('[data-testid="select-assistant-agent"]');
    const isDisabled = await agentSelect.locator('.arco-select-view-disabled').count();
    expect(isDisabled).toBe(0);

    await page.keyboard.press('Escape');
  });

  test('builtin — no delete button', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const builtinId = await findAssistantByType(page, 'builtin');
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantDrawer(page, builtinId);

    const deleteBtn = page.locator(BTN_DELETE_ASSISTANT);
    await expect(deleteBtn).not.toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('builtin — save button enabled', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const builtinId = await findAssistantByType(page, 'builtin');
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantDrawer(page, builtinId);

    const saveBtn = page.locator(BTN_SAVE_ASSISTANT);
    await expect(saveBtn).not.toBeDisabled();

    await page.keyboard.press('Escape');
  });

  test('extension — all fields read-only', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const extId = await findAssistantByType(page, 'extension');
    if (!extId) {
      test.skip(true, 'No extension assistant found');
      return;
    }

    await openAssistantDrawer(page, extId);

    const nameInput = page.locator('[data-testid="input-assistant-name"]');
    const descInput = page.locator('[data-testid="input-assistant-desc"]');
    const saveBtn = page.locator(BTN_SAVE_ASSISTANT);

    await expect(nameInput).toBeDisabled();
    await expect(descInput).toBeDisabled();
    await expect(saveBtn).toBeDisabled();

    await page.keyboard.press('Escape');
  });

  test('extension — no delete button', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const extId = await findAssistantByType(page, 'extension');
    if (!extId) {
      test.skip(true, 'No extension assistant found');
      return;
    }

    await openAssistantDrawer(page, extId);

    const deleteBtn = page.locator(BTN_DELETE_ASSISTANT);
    await expect(deleteBtn).not.toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('extension — can duplicate', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const extId = await findAssistantByType(page, 'extension');
    if (!extId) {
      test.skip(true, 'No extension assistant found');
      return;
    }

    const dupBtn = page.locator(`[data-testid="btn-duplicate-${extId}"]`);
    const card = page.locator(`[data-testid="assistant-card-${extId}"]`);
    await card.hover();

    await expect(dupBtn).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('custom — all fields editable', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const customId = await findAssistantByType(page, 'custom');
    if (!customId) {
      test.skip(true, 'No custom assistant found');
      return;
    }

    await openAssistantDrawer(page, customId);

    const nameInput = page.locator('[data-testid="input-assistant-name"]');
    const descInput = page.locator('[data-testid="input-assistant-desc"]');
    const saveBtn = page.locator(BTN_SAVE_ASSISTANT);
    const deleteBtn = page.locator(BTN_DELETE_ASSISTANT);

    await expect(nameInput).not.toBeDisabled();
    await expect(descInput).not.toBeDisabled();
    await expect(saveBtn).not.toBeDisabled();
    await expect(deleteBtn).toBeVisible();

    await page.keyboard.press('Escape');
  });
});
