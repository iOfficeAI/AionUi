/**
 * Assistant Settings Permissions — E2E tests.
 *
 * Covers: field-level permissions for builtin and custom assistant types.
 */
import { test, expect } from '../fixtures';
import {
  goToAssistantSettings,
  openAssistantEditor,
  closeAssistantEditor,
  getVisibleAssistantIds,
  BTN_SAVE_ASSISTANT,
  BTN_DELETE_ASSISTANT,
  ASSISTANT_EDITOR_SURFACE,
} from '../helpers';

test.describe('Assistant Settings Permissions', () => {
  test.setTimeout(90_000);

  // Helper: find an assistant by type.
  // Uses ID prefix heuristics to minimise drawer open/close cycles.
  async function findAssistantByType(
    page: import('@playwright/test').Page,
    type: 'builtin' | 'custom'
  ): Promise<string | null> {
    const ids = await getVisibleAssistantIds(page);

    // Prioritise IDs that are likely the target type (avoids opening every drawer)
    const prioritised = ids.toSorted((a, b) => {
      const score = (id: string) => {
        if (type === 'builtin' && id.startsWith('builtin-')) return 0;
        if (type === 'custom' && id.startsWith('custom-')) return 0;
        return 1;
      };
      return score(a) - score(b);
    });

    for (const id of prioritised) {
      await openAssistantEditor(page, id);

      const deleteBtn = page.locator(BTN_DELETE_ASSISTANT);
      const saveBtn = page.locator(BTN_SAVE_ASSISTANT);
      const agentSelect = page.locator('[data-testid="select-assistant-agent"]');
      const nameInput = page.locator('[data-testid="input-assistant-name"]');
      const isNameDisabled = await nameInput.isDisabled().catch(() => true);
      const hasDelete = await deleteBtn.isVisible().catch(() => false);
      const isSaveVisible = await saveBtn.isVisible().catch(() => false);
      const isSaveDisabled = isSaveVisible ? await saveBtn.isDisabled().catch(() => false) : true;
      const isAgentDisabled =
        (await agentSelect
          .locator('.arco-select-view-disabled')
          .count()
          .catch(() => 0)) > 0;

      // Detection:
      // builtin = profile readonly + main agent editable + no delete
      // custom = editable profile + delete
      let detected: 'builtin' | 'custom' = 'custom';
      if (isNameDisabled && !hasDelete && !isAgentDisabled && !isSaveDisabled) {
        detected = 'builtin';
      }

      if (detected === type) {
        await closeAssistantEditor(page);
        return id;
      }

      await closeAssistantEditor(page);
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

    await openAssistantEditor(page, builtinId);

    const nameInput = page.locator('[data-testid="input-assistant-name"]');
    const descInput = page.locator('[data-testid="input-assistant-desc"]');

    await expect(nameInput).toBeDisabled();
    await expect(descInput).toBeDisabled();

    await closeAssistantEditor(page);
  });

  test('builtin — Main Agent editable', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const builtinId = await findAssistantByType(page, 'builtin');
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantEditor(page, builtinId);

    const editor = page.locator(ASSISTANT_EDITOR_SURFACE);
    const agentSelect = editor.locator('[data-testid="select-assistant-agent"]');
    const isDisabled = await agentSelect.locator('.arco-select-view-disabled').count();
    expect(isDisabled).toBe(0);

    await closeAssistantEditor(page);
  });

  test('builtin — no delete button', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const builtinId = await findAssistantByType(page, 'builtin');
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantEditor(page, builtinId);

    const deleteBtn = page.locator(BTN_DELETE_ASSISTANT);
    await expect(deleteBtn).not.toBeVisible();

    await closeAssistantEditor(page);
  });

  test('builtin — save button enabled', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const builtinId = await findAssistantByType(page, 'builtin');
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantEditor(page, builtinId);

    const saveBtn = page.locator(BTN_SAVE_ASSISTANT);
    await expect(saveBtn).not.toBeDisabled();

    await closeAssistantEditor(page);
  });

  test('custom — all fields editable', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 10_000 });

    const customId = await findAssistantByType(page, 'custom');
    if (!customId) {
      test.skip(true, 'No custom assistant found');
      return;
    }

    await openAssistantEditor(page, customId);

    const nameInput = page.locator('[data-testid="input-assistant-name"]');
    const descInput = page.locator('[data-testid="input-assistant-desc"]');
    const saveBtn = page.locator(BTN_SAVE_ASSISTANT);
    const deleteBtn = page.locator(BTN_DELETE_ASSISTANT);

    await expect(nameInput).not.toBeDisabled();
    await expect(descInput).not.toBeDisabled();
    await expect(saveBtn).not.toBeDisabled();
    await expect(deleteBtn).toBeVisible();

    await closeAssistantEditor(page);
  });
});
