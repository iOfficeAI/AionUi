/**
 * Assistant Settings UI States (P1) — E2E tests aligned with the
 * phase-1 single-list wireframe.
 */
import { test, expect } from '../../fixtures';
import {
  clickCreateAssistant,
  closeAssistantEditor,
  fillAssistantName,
  goToAssistantSettings,
  saveAssistant,
  takeScreenshot,
  waitForAssistantEditorClose,
} from '../../helpers';

test.describe('Assistant Settings UI States (P1)', () => {
  test.setTimeout(90_000);

  test('P1-1: page uses the single-list layout without legacy filters', async ({ page }) => {
    await goToAssistantSettings(page);

    await expect(page.locator('[data-testid="assistant-list-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="assistant-list-body"]')).toBeVisible();
    await expect(page.locator('[data-testid^="assistant-card-"]').first()).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('[data-testid="btn-search-toggle"]')).toHaveCount(0);
    await expect(page.locator('.assistant-filter-tabs')).toHaveCount(0);
    await takeScreenshot(page, 'assistants/p1-1/01-single-list-layout.png');
  });

  test('P1-2: builtin shows official tag and custom shows custom tag', async ({ page }) => {
    await goToAssistantSettings(page);

    const builtinCard = page
      .locator('[data-testid^="assistant-card-"]')
      .filter({ hasText: /官方|Official/i })
      .first();
    await expect(builtinCard).toBeVisible({ timeout: 10_000 });
    await takeScreenshot(page, 'assistants/p1-2/01-builtin-official-tag.png');

    const name = `P1 custom ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, name);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const customCard = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: name }).first();
    await expect(customCard).toBeVisible({ timeout: 10_000 });
    await expect(customCard.locator('.arco-tag')).toContainText(/自定义|Custom/i);
    await takeScreenshot(page, 'assistants/p1-2/02-custom-tag.png');
  });

  test('P1-3: row actions match latest design by assistant type', async ({ page }) => {
    await goToAssistantSettings(page);

    const builtinCard = page
      .locator('[data-testid^="assistant-card-"]')
      .filter({ hasText: /官方|Official/i })
      .first();
    await expect(builtinCard).toBeVisible({ timeout: 10_000 });
    const builtinId = ((await builtinCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');

    await expect(page.locator(`[data-testid="btn-edit-${builtinId}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="btn-duplicate-${builtinId}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="btn-delete-${builtinId}"]`)).toHaveCount(0);
    await takeScreenshot(page, 'assistants/p1-3/01-builtin-actions.png');

    const name = `P1 row actions ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, name);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const customCard = page.locator('[data-testid^="assistant-card-"]').filter({ hasText: name }).first();
    const customId = ((await customCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');

    await expect(page.locator(`[data-testid="btn-edit-${customId}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="btn-delete-${customId}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="btn-duplicate-${customId}"]`)).toHaveCount(0);
    await takeScreenshot(page, 'assistants/p1-3/02-custom-actions.png');
  });

  test('P1-4: extension assistant switch stays checked and disabled when present', async ({ page }) => {
    await goToAssistantSettings(page);

    const cards = page.locator('[data-testid^="assistant-card-"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    const count = await cards.count();
    let extensionId: string | null = null;
    for (let i = 0; i < count; i++) {
      const cardId = await cards.nth(i).getAttribute('data-testid');
      if (cardId?.includes('ext-')) {
        extensionId = cardId.replace('assistant-card-', '');
        break;
      }
    }

    if (!extensionId) {
      test.skip(true, 'No extension assistant available in this run');
      return;
    }

    const switchElement = page.locator(`[data-testid="switch-enabled-${extensionId}"]`);
    await expect(switchElement).toBeChecked();
    await expect(switchElement).toBeDisabled();
    await takeScreenshot(page, 'assistants/p1-4/01-extension-switch.png');
  });

  test('P1-5: list card opens the full-page editor and back closes it', async ({ page }) => {
    await goToAssistantSettings(page);

    const firstCard = page.locator('[data-testid^="assistant-card-"]').first();
    await firstCard.click();

    const editor = page.locator('[data-testid="assistant-editor-page"]');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="assistant-editor-bar"]')).toBeVisible();
    await takeScreenshot(page, 'assistants/p1-5/01-editor-opened.png');

    await closeAssistantEditor(page);
    await expect(editor).toBeHidden({ timeout: 5_000 });
    await takeScreenshot(page, 'assistants/p1-5/02-editor-closed.png');
  });

  test('P1-6: duplicate from builtin card opens create-mode editor', async ({ page }) => {
    await goToAssistantSettings(page);

    const builtinCard = page
      .locator('[data-testid^="assistant-card-"]')
      .filter({ hasText: /官方|Official/i })
      .first();
    await expect(builtinCard).toBeVisible({ timeout: 10_000 });
    const builtinId = ((await builtinCard.getAttribute('data-testid')) ?? '').replace('assistant-card-', '');

    await page.locator(`[data-testid="btn-duplicate-${builtinId}"]`).click();
    const editor = page.locator('[data-testid="assistant-editor-page"]');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="btn-save-assistant"]')).toContainText(/Create|创建/i);
    await takeScreenshot(page, 'assistants/p1-6/01-duplicate-opens-create.png');
  });
});
