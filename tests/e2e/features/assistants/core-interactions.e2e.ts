/**
 * Assistant Settings Core Interactions (P0) — E2E tests aligned with the
 * latest single-list + full-page-editor design.
 */
import { test, expect } from '../../fixtures';
import {
  clickCreateAssistant,
  closeAssistantEditor,
  duplicateAssistant,
  fillAssistantDescription,
  fillAssistantName,
  goToAssistantSettings,
  openAssistantEditor,
  saveAssistant,
  takeScreenshot,
  toggleAssistantEnabled,
  waitForAssistantEditorClose,
} from '../../helpers';

test.describe('Assistant Settings Core Interactions (P0)', () => {
  test.setTimeout(90_000);

  test('P0-1: create assistant opens full-page editor and save returns to list', async ({ page }) => {
    await goToAssistantSettings(page);

    const name = `P0 create ${Date.now()}`;
    await clickCreateAssistant(page);
    await expect(page.locator('[data-testid="assistant-editor-page"]')).toBeVisible({ timeout: 5_000 });

    await fillAssistantName(page, name);
    await fillAssistantDescription(page, 'Created by P0-1');
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    await expect(page.locator('[data-testid^="assistant-card-"]').filter({ hasText: name }).first()).toBeVisible({
      timeout: 10_000,
    });
    await takeScreenshot(page, 'assistants/p0-1/01-create-roundtrip.png');
  });

  test('P0-2: card body opens editor, switch toggles in place, builtin duplicate opens create-mode editor', async ({
    page,
  }) => {
    await goToAssistantSettings(page);

    const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const firstId = ((await firstCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');

    await firstCard.click();
    await expect(page.locator('[data-testid="assistant-editor-page"]')).toBeVisible({ timeout: 5_000 });
    await takeScreenshot(page, 'assistants/p0-2/01-card-opens-editor.png');

    await closeAssistantEditor(page);

    const switchElement = page.locator(`[data-testid="switch-enabled-${firstId}"]`);
    const checkedBefore = await switchElement.getAttribute('aria-checked').catch(() => null);
    await toggleAssistantEnabled(page, firstId);
    if (checkedBefore !== null) {
      await expect(page.locator('[data-testid="assistant-editor-page"]')).toBeHidden({ timeout: 5_000 });
    }
    await takeScreenshot(page, 'assistants/p0-2/02-switch-stays-in-list.png');

    const builtinCard = page
      .locator('[data-testid^="assistant-card-"]')
      .filter({ hasText: /官方|Official/i })
      .first();
    await expect(builtinCard).toBeVisible({ timeout: 10_000 });
    const builtinId = ((await builtinCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');
    await duplicateAssistant(page, builtinId);
    await expect(page.locator('[data-testid="btn-save-assistant"]')).toContainText(/Create|创建/i);
    await takeScreenshot(page, 'assistants/p0-2/03-builtin-duplicate-opens-create.png');
  });

  test('P0-3: delete modal shows preview card for custom assistant', async ({ page }) => {
    await goToAssistantSettings(page);

    const name = `P0 delete ${Date.now()}`;
    const desc = 'Delete preview test';
    await clickCreateAssistant(page);
    await fillAssistantName(page, name);
    await fillAssistantDescription(page, desc);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const targetCard = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: name }).first();
    const targetId = ((await targetCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');
    await openAssistantEditor(page, targetId);

    await page.locator('[data-testid="btn-delete-assistant"]').click();
    const modal = page.locator('[data-testid="modal-delete-assistant"]');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal).toContainText(name);
    await expect(modal).toContainText(desc);
    await takeScreenshot(page, 'assistants/p0-3/01-delete-preview.png');

    await modal.locator('.arco-btn-status-danger').click();
    await expect(targetCard).toBeHidden({ timeout: 10_000 });
    await takeScreenshot(page, 'assistants/p0-3/02-deleted.png');
  });

  test('P0-4: highlight query parameter still highlights and clears', async ({ page }) => {
    await goToAssistantSettings(page);

    const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const targetId = ((await firstCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');

    await page.evaluate((id) => {
      window.location.hash = `/settings/assistants?highlight=${id}`;
    }, targetId);

    const targetCard = page.locator(`[data-testid="assistant-card-${targetId}"]`);
    await expect(targetCard).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);

    const highlightedClasses = await targetCard.getAttribute('class');
    expect(highlightedClasses).toContain('border-primary-5');
    expect(highlightedClasses).toContain('bg-primary-1');

    await page.waitForTimeout(2200);
    const clearedClasses = await targetCard.getAttribute('class');
    expect(clearedClasses).not.toContain('border-primary-5');
    expect(page.url()).not.toContain('highlight=');
    await takeScreenshot(page, 'assistants/p0-4/01-highlight-cleared.png');
  });
});
