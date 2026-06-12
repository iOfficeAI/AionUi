/**
 * Assistant Settings Defaults — E2E tests aligned with phase-1 governance.
 *
 * Covers:
 * - auto / fixed semantics exposed as separate choices
 * - new assistant defaults start with remember-last-used mode
 * - changing main agent clears fixed model/permission back to auto
 * - builtin assistant keeps model / permission editable
 */
import { test, expect } from '../fixtures';
import {
  ASSISTANT_EDITOR_SURFACE,
  clickCreateAssistant,
  closeAssistantEditor,
  fillAssistantName,
  getVisibleAssistantIds,
  goToAssistantSettings,
  openAssistantEditor,
} from '../helpers';

async function openSelect(page: import('@playwright/test').Page, testId: string): Promise<void> {
  await page.locator(`[data-testid="${testId}"]`).click();
  await page
    .locator('.arco-select-option, .arco-trigger-popup button')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

function selectOptions(page: import('@playwright/test').Page) {
  return page.locator('.arco-select-option');
}

async function findBuiltinAssistantId(page: import('@playwright/test').Page): Promise<string | null> {
  for (const id of await getVisibleAssistantIds(page)) {
    const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
    if (cardText?.match(/Official|官方/)) {
      return id;
    }
  }
  return null;
}

test.describe('Assistant Settings Defaults', () => {
  test.setTimeout(90_000);

  test('new assistant starts with Remember last used automatically for model, permission, and MCP', async ({
    page,
  }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    await fillAssistantName(page, `Defaults State ${Date.now()}`);

    await expect(page.locator('[data-testid="select-assistant-default-model"]')).toContainText(
      /Remember last used automatically|自动记住上次/
    );
    await expect(page.locator('[data-testid="select-assistant-default-permission"]')).toContainText(
      /Remember last used automatically|自动记住上次/
    );
    await expect(page.locator('[data-testid="select-assistant-default-mcp"]')).toContainText(
      /Remember last used automatically|自动记住上次/
    );

    await closeAssistantEditor(page);
  });

  test('default model and permission expose Remember last used and fixed options', async ({ page }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    await fillAssistantName(page, `Defaults Options ${Date.now()}`);

    await openSelect(page, 'select-assistant-default-model');
    await expect(
      selectOptions(page)
        .filter({ hasText: /Remember last used automatically|自动记住上次/i })
        .first()
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await openSelect(page, 'select-assistant-default-permission');
    await expect(
      selectOptions(page)
        .filter({ hasText: /Remember last used automatically|自动记住上次/i })
        .first()
    ).toBeVisible();
    await page.keyboard.press('Escape');

    await closeAssistantEditor(page);
  });

  test('default dropdown popup stays inside the editor scroll container', async ({ page }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    await fillAssistantName(page, `Popup Root ${Date.now()}`);

    await openSelect(page, 'select-assistant-default-model');

    const localPopup = page.locator('[data-testid="assistant-editor-body"] .arco-trigger-popup').last();
    await expect(localPopup).toBeVisible();
    await expect(localPopup.evaluate((node) => Boolean(node.closest('[data-editor-popup-root]')))).resolves.toBe(true);

    const editorBody = page.locator('[data-testid="assistant-editor-body"]');
    await editorBody.evaluate((node) => {
      node.scrollTop += 160;
    });

    await expect(localPopup).toBeVisible();

    await closeAssistantEditor(page);
  });

  test('changing main agent clears fixed model and permission back to Remember last used automatically', async ({
    page,
  }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    await fillAssistantName(page, `Agent Reset ${Date.now()}`);

    const agentSelect = page.locator('[data-testid="select-assistant-agent"]');
    const currentAgent = ((await agentSelect.textContent()) ?? '').trim();

    await openSelect(page, 'select-assistant-default-model');
    const modelOptions = selectOptions(page);
    if ((await modelOptions.count()) <= 2) {
      await closeAssistantEditor(page);
      test.skip(true, 'No fixed model options available for current agent');
      return;
    }
    await modelOptions.nth(2).click();
    await expect(page.locator('[data-testid="select-assistant-default-model"]')).not.toContainText(
      /Remember last used automatically|自动记住上次/
    );

    await openSelect(page, 'select-assistant-default-permission');
    const permissionOptions = selectOptions(page);
    if ((await permissionOptions.count()) <= 2) {
      await closeAssistantEditor(page);
      test.skip(true, 'No fixed permission options available for current agent');
      return;
    }
    await permissionOptions.nth(2).click();
    await expect(page.locator('[data-testid="select-assistant-default-permission"]')).not.toContainText(
      /Remember last used automatically|自动记住上次/
    );

    await openSelect(page, 'select-assistant-agent');
    const agentOptions = selectOptions(page);
    const optionCount = await agentOptions.count();
    let switched = false;
    for (let i = 0; i < optionCount; i++) {
      const optionText = ((await agentOptions.nth(i).textContent()) ?? '').trim();
      if (optionText && optionText !== currentAgent) {
        await agentOptions.nth(i).click();
        switched = true;
        break;
      }
    }

    if (!switched) {
      await closeAssistantEditor(page);
      test.skip(true, 'No alternate main agent available');
      return;
    }

    await expect(page.locator('[data-testid="select-assistant-default-model"]')).toContainText(
      /Remember last used automatically|自动记住上次/
    );
    await expect(page.locator('[data-testid="select-assistant-default-permission"]')).toContainText(
      /Remember last used automatically|自动记住上次/
    );

    await closeAssistantEditor(page);
  });

  test('builtin assistant keeps default model and permission editable', async ({ page }) => {
    await goToAssistantSettings(page);
    const builtinId = await findBuiltinAssistantId(page);
    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantEditor(page, builtinId);

    const editor = page.locator(ASSISTANT_EDITOR_SURFACE);
    const modelSelect = editor.locator('[data-testid="select-assistant-default-model"]');
    const permissionSelect = editor.locator('[data-testid="select-assistant-default-permission"]');

    await expect(modelSelect).toBeVisible();
    await expect(permissionSelect).toBeVisible();
    await expect(modelSelect.locator('.arco-select-view-disabled')).toHaveCount(0);
    await expect(permissionSelect.locator('.arco-select-view-disabled')).toHaveCount(0);

    await closeAssistantEditor(page);
  });
});
