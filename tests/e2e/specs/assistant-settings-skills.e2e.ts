/**
 * Assistant Settings Skills / MCP — E2E tests aligned with phase-1 governance UI.
 *
 * Covers:
 * - single-entry default skills / default MCP controls
 * - hub jump links
 * - no legacy collapse / modal structure
 * - builtin assistant read-only summaries for skills / MCP
 * - fixed default skill selection persistence for custom assistants
 */
import { test, expect } from '../fixtures';
import {
  clickCreateAssistant,
  closeAssistantEditor,
  fillAssistantName,
  getVisibleAssistantIds,
  goToAssistantSettings,
  openAssistantEditor,
  saveAssistant,
  waitForAssistantEditorClose,
} from '../helpers';

async function findAssistantIdByName(page: import('@playwright/test').Page, name: string): Promise<string | null> {
  for (const id of await getVisibleAssistantIds(page)) {
    const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
    if (cardText?.includes(name)) {
      return id;
    }
  }
  return null;
}

async function openSelect(page: import('@playwright/test').Page, testId: string): Promise<void> {
  const select = page.locator(`[data-testid="${testId}"]`);
  await select.click();
  await page
    .locator('.arco-select-option, .arco-trigger-popup button')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

test.describe('Assistant Settings Skills / MCP', () => {
  test.setTimeout(90_000);

  test('custom assistant renders single default-skills/default-mcp controls with hub links', async ({ page }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    await fillAssistantName(page, `Skill Layout ${Date.now()}`);

    await expect(page.locator('[data-testid="select-assistant-default-skills"]')).toBeVisible();
    await expect(page.locator('[data-testid="select-assistant-default-mcp"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-open-skills-settings"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-open-mcp-settings"]')).toBeVisible();

    await expect(page.locator('[data-testid="select-assistant-default-skills-mode"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="select-assistant-default-mcp-mode"]')).toHaveCount(0);
    await expect(page.locator('.arco-collapse-item')).toHaveCount(0);

    await closeAssistantEditor(page);
  });

  test('default MCP dropdown exposes remember-last-used option', async ({ page }) => {
    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    await fillAssistantName(page, `MCP Options ${Date.now()}`);

    await openSelect(page, 'select-assistant-default-mcp');
    await expect(page.getByRole('button', { name: /Remember last used automatically|自动记住上次/i })).toBeVisible();
    await page.keyboard.press('Escape');

    await closeAssistantEditor(page);
  });

  test('builtin assistant shows read-only skills and MCP summaries', async ({ page }) => {
    await goToAssistantSettings(page);

    let builtinId: string | null = null;
    for (const id of await getVisibleAssistantIds(page)) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.match(/Official|官方/)) {
        builtinId = id;
        break;
      }
    }

    if (!builtinId) {
      test.skip(true, 'No builtin assistant found');
      return;
    }

    await openAssistantEditor(page, builtinId);

    await expect(page.locator('[data-testid="select-assistant-default-skills"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="select-assistant-default-mcp"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="assistant-card-defaults"]')).toContainText(/Default Skills|默认技能/);
    await expect(page.locator('[data-testid="assistant-card-defaults"]')).toContainText(/Default MCP|默认 MCP/);

    await closeAssistantEditor(page);
  });

  test('custom assistant fixed default skill selection persists after save and reopen', async ({ page }) => {
    await goToAssistantSettings(page);
    const assistantName = `Skill Persist ${Date.now()}`;

    await clickCreateAssistant(page);
    await fillAssistantName(page, assistantName);

    await openSelect(page, 'select-assistant-default-skills');
    const options = page.locator('.arco-select-option');
    const optionCount = await options.count();
    if (optionCount === 0) {
      await closeAssistantEditor(page);
      test.skip(true, 'No skill options available');
      return;
    }

    const firstOptionText = (await options.first().textContent())?.trim() ?? '';
    await options.first().click();
    const selectedSummary = (
      (await page.locator('[data-testid="select-assistant-default-skills"]').textContent()) ?? ''
    ).trim();
    expect(selectedSummary).not.toMatch(/Not configured|暂不设置/i);
    expect(selectedSummary).not.toBe(firstOptionText);

    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const createdId = await findAssistantIdByName(page, assistantName);
    test.skip(!createdId, 'Created assistant not found');
    if (!createdId) return;

    await openAssistantEditor(page, createdId);
    await expect(page.locator('[data-testid="select-assistant-default-skills"]')).toContainText(selectedSummary);

    await closeAssistantEditor(page);
  });
});
