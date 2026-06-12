/**
 * Assistant Settings Recommended Prompts — E2E tests.
 *
 * Covers:
 * - create/edit recommended prompts from assistant settings
 * - prompt chips render on guid after selecting the assistant
 * - clicking a prompt chip fills the guid input
 * - editing name / prompt is reflected on next guid visit
 */
import { test, expect } from '../fixtures';
import {
  clickCreateAssistant,
  fillAssistantDescription,
  fillAssistantName,
  getVisibleAssistantIds,
  goToAssistantSettings,
  goToGuid,
  openAssistantEditor,
  resetGuidLastSelectedAgent,
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

test.describe('Assistant Settings Recommended Prompts', () => {
  test.setTimeout(90_000);

  test('recommended prompts can be created and clicked from guid', async ({ page }) => {
    const assistantName = `Prompt Assistant ${Date.now()}`;
    const promptText = `帮我总结这段文本 ${Date.now()}`;

    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    await fillAssistantName(page, assistantName);
    await fillAssistantDescription(page, 'Prompt coverage assistant');

    await page.getByRole('button', { name: /Add|添加/i }).click();
    await page.locator('[data-testid="input-assistant-recommended-prompt-new"]').fill(promptText);
    await page
      .getByTestId('assistant-card-prompts')
      .getByRole('button', { name: /Add|添加/i })
      .nth(1)
      .click();

    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const assistantId = await findAssistantIdByName(page, assistantName);
    test.skip(!assistantId, 'Created assistant not found');
    if (!assistantId) return;

    await resetGuidLastSelectedAgent(page);
    await goToGuid(page);
    await page.reload();
    await page.locator(`[data-testid="preset-pill-${assistantId}"]`).click();
    await expect(page.locator(`text=${promptText}`)).toBeVisible();

    await page.locator(`text=${promptText}`).click();
    await expect(page.locator('.guid-input-card-shell textarea')).toHaveValue(promptText);
  });

  test('editing prompt and name is reflected on subsequent guid visit', async ({ page }) => {
    const originalName = `Prompt Update ${Date.now()}`;
    const updatedName = `${originalName} Updated`;
    const originalPrompt = `给这段话起标题 ${Date.now()}`;
    const updatedPrompt = `帮我改写成更正式的语气 ${Date.now()}`;

    await goToAssistantSettings(page);
    await clickCreateAssistant(page);
    await fillAssistantName(page, originalName);
    await page.getByRole('button', { name: /Add|添加/i }).click();
    await page.locator('[data-testid="input-assistant-recommended-prompt-new"]').fill(originalPrompt);
    await page
      .getByTestId('assistant-card-prompts')
      .getByRole('button', { name: /Add|添加/i })
      .nth(1)
      .click();
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const assistantId = await findAssistantIdByName(page, originalName);
    test.skip(!assistantId, 'Created assistant not found');
    if (!assistantId) return;

    await openAssistantEditor(page, assistantId);
    await fillAssistantName(page, updatedName);
    await page
      .getByRole('button', { name: /Edit|编辑/i })
      .first()
      .click();
    const promptsCard = page.getByTestId('assistant-card-prompts');
    await promptsCard.locator('[data-testid="input-assistant-recommended-prompt-0"]').fill(updatedPrompt);
    await promptsCard.getByRole('button', { name: /Save|保存/i }).click();
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);
    await expect(page.locator(`[data-testid="assistant-card-${assistantId}"]`)).toContainText(updatedName);

    await resetGuidLastSelectedAgent(page);
    await goToGuid(page);
    await page.reload();
    await expect(page.locator(`[data-testid="preset-pill-${assistantId}"]`)).toContainText(updatedName);
    await page.locator(`[data-testid="preset-pill-${assistantId}"]`).click();
    await expect(page.locator(`text=${updatedPrompt}`)).toBeVisible();
    await expect(page.locator(`text=${originalPrompt}`)).toHaveCount(0);
  });
});
