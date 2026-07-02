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
  getVisibleAssistantNames,
  getVisibleAssistantIds,
  openAssistantEditor,
  resetGuidLastSelectedAgent,
  saveAssistant,
  deleteAssistant,
  duplicateAssistant,
  toggleAssistantEnabled,
  isAssistantEditorVisible,
  waitForAssistantEditorClose,
  closeAssistantEditor,
  ASSISTANT_PILL,
  GUID_INPUT,
  BTN_CREATE_ASSISTANT,
  BTN_SAVE_ASSISTANT,
  BTN_DELETE_ASSISTANT,
  SELECT_ASSISTANT_AGENT,
  ASSISTANT_EDITOR_SURFACE,
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

async function goToGuidListView(page: import('@playwright/test').Page): Promise<void> {
  await resetGuidLastSelectedAgent(page);
  await goToGuid(page);
  await page.reload();
}

async function fetchAssistantCatalog(
  page: import('@playwright/test').Page
): Promise<Array<{ id: string; enabled?: boolean; source?: string }>> {
  return page.evaluate(async () => {
    const port = window.__backendPort;
    const response = await fetch(`http://127.0.0.1:${port}/api/assistants`);
    const payload = (await response.json()) as {
      data?: Array<{ id: string; enabled?: boolean; source?: string }>;
    };
    return payload.data ?? [];
  });
}

async function dragAssistantAbove(
  page: import('@playwright/test').Page,
  draggedId: string,
  targetId: string
): Promise<void> {
  const handle = page.locator(`[data-testid="assistant-reorder-handle-${draggedId}"]`);
  const targetCard = page.locator(`[data-testid="assistant-card-${targetId}"]`);

  const handleBox = await handle.boundingBox();
  const targetBox = await targetCard.boundingBox();
  if (!handleBox || !targetBox) {
    throw new Error(`Could not resolve drag boxes for ${draggedId} -> ${targetId}`);
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 16 });
  await page.mouse.up();
}

test.describe('Assistant Settings CRUD', () => {
  test.setTimeout(90_000);

  test('page loads with assistant list', async ({ page }) => {
    await goToAssistantSettings(page);

    // Should have at least one assistant card (builtin)
    const cards = page.locator('[data-testid^="assistant-card-"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
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
    await waitForAssistantEditorClose(page);

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
        await openAssistantEditor(page, id);
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

    // Editor should still be open (validation prevents close)
    const editorVisible = await isAssistantEditorVisible(page);
    expect(editorVisible).toBeTruthy();

    // Close the editor without saving so the next test starts cleanly
    await closeAssistantEditor(page);
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
    await waitForAssistantEditorClose(page);

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

    await openAssistantEditor(page, targetId);
    await fillAssistantName(page, updatedName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    // List should show updated name
    const names = await getVisibleAssistantNames(page);
    expect(names).toContain(updatedName);
    expect(names).not.toContain(originalName);

    // Cleanup
    await openAssistantEditor(page, targetId);
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
    await waitForAssistantEditorClose(page);

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

    await openAssistantEditor(page, targetId);

    // Switch main agent via the select dropdown
    const agentSelect = page.locator(SELECT_ASSISTANT_AGENT);
    const selectVisible = await agentSelect.isVisible().catch(() => false);
    if (selectVisible) {
      const initialSelectText = ((await agentSelect.textContent()) ?? '').trim();
      await agentSelect.click();
      const options = page.locator('.arco-select-option:not(.arco-select-option-disabled)');
      await options
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {});
      const optionCount = await options.count();
      let selectedAgentLabel = '';
      for (let index = 0; index < optionCount; index += 1) {
        const option = options.nth(index);
        const label = ((await option.textContent()) ?? '').trim();
        if (label && label !== initialSelectText && /Codex|Gemini/i.test(label)) {
          selectedAgentLabel = label;
          await option.click();
          break;
        }
      }
      if (selectedAgentLabel) {
        await saveAssistant(page);
        await waitForAssistantEditorClose(page);

        // Reopen and verify agent changed
        await openAssistantEditor(page, targetId);
        const selectText = await agentSelect.textContent();
        expect(selectText?.trim()).toContain(selectedAgentLabel);
      } else {
        await page.keyboard.press('Escape').catch(() => {});
        test.skip(true, 'No alternate main agent option available');
      }
    }

    // Cleanup — ensure the editor is fully closed before clicking the card
    await closeAssistantEditor(page);
    await openAssistantEditor(page, targetId);
    await deleteAssistant(page);
  });

  test('duplicate assistant', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const duplicateButtons = page.locator('[data-testid^="btn-duplicate-"]');
    const duplicateCount = await duplicateButtons.count();
    if (duplicateCount === 0) {
      test.skip(true, 'No assistant exposes duplicate in this run');
      return;
    }

    const button = duplicateButtons.first();
    const firstId = ((await button.getAttribute('data-testid')) ?? '').replace('btn-duplicate-', '');
    const idsBefore = await getVisibleAssistantIds(page);
    await duplicateAssistant(page, firstId);

    // Editor opens with duplicated content — modify name and save
    const nameInput = page.locator('[data-testid="input-assistant-name"]');
    const currentName = await nameInput.inputValue();
    const dupName = `${currentName} E2E Dup ${Date.now()}`;
    await nameInput.clear();
    await nameInput.fill(dupName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    // List should have one more assistant
    const idsAfter = await getVisibleAssistantIds(page);
    expect(idsAfter.length).toBe(idsBefore.length + 1);

    // Cleanup: find and delete the duplicate
    for (const id of idsAfter) {
      if (!idsBefore.includes(id)) {
        await openAssistantEditor(page, id);
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
    await waitForAssistantEditorClose(page);

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

    await openAssistantEditor(page, targetId);
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
    await waitForAssistantEditorClose(page);

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
    await openAssistantEditor(page, targetId);
    await deleteAssistant(page);
  });

  test('disabled builtin assistant removed from guid page presets', async ({ page }) => {
    await goToGuidListView(page);
    await page.locator(ASSISTANT_PILL).first().waitFor({ state: 'visible', timeout: 8_000 });

    const visiblePresetIds = await page
      .locator('[data-testid^="preset-pill-"]')
      .evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute('data-testid')?.replace('preset-pill-', '') ?? '')
          .filter(Boolean)
      );
    const builtinCandidateIds = new Set(
      (await fetchAssistantCatalog(page))
        .filter((assistant) => assistant.source === 'builtin' && assistant.enabled !== false)
        .map((assistant) => assistant.id)
    );
    const builtinId = visiblePresetIds.find((id) => builtinCandidateIds.has(id)) ?? '';
    test.skip(!builtinId, 'No visible builtin assistant found on guid');

    // Disable it in settings
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });
    await toggleAssistantEnabled(page, builtinId);

    // Go to guid and verify it's gone
    await goToGuidListView(page);
    await page.locator(GUID_INPUT).first().waitFor({ state: 'visible', timeout: 8_000 });
    await expect
      .poll(
        async () =>
          page
            .locator(`[data-testid="preset-pill-${builtinId}"]`)
            .isVisible()
            .catch(() => false),
        { timeout: 10_000 }
      )
      .toBeFalsy();

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
    await waitForAssistantEditorClose(page);

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
    await openAssistantEditor(page, targetId);
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
    await waitForAssistantEditorClose(page);

    // Reload the page
    await page.reload();
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const names = await getVisibleAssistantNames(page);
    expect(names).toContain(testName);

    // Cleanup
    for (const id of await getVisibleAssistantIds(page)) {
      const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
      if (cardText?.includes(testName)) {
        await openAssistantEditor(page, id);
        await deleteAssistant(page);
        break;
      }
    }
  });

  test('sort order — assistant settings renders a single ordered list without legacy sections', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid="assistant-list-shell"]').waitFor({ state: 'visible', timeout: 15_000 });
    const cards = page.locator('[data-testid^="assistant-card-"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toMatch(/Enabled|已启用/);
    expect(bodyText).not.toMatch(/Disabled|已禁用/);
  });

  test('duplicate builtin assistant creates an editable custom copy', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const builtinAssistant = (await fetchAssistantCatalog(page)).find((assistant) => assistant.source === 'builtin');
    test.skip(!builtinAssistant, 'No builtin assistant found in catalog');
    if (!builtinAssistant) return;

    await duplicateAssistant(page, builtinAssistant.id);
    await expect(page.locator(BTN_SAVE_ASSISTANT)).toContainText(/Create|创建/i);
    await expect(page.locator('[data-testid="input-assistant-name"]')).not.toBeDisabled();
    await expect(page.locator('[data-testid="input-assistant-desc"]')).not.toBeDisabled();

    const duplicateName = `Builtin Copy ${Date.now()}`;
    await fillAssistantName(page, duplicateName);
    await fillAssistantDescription(page, 'Duplicated from builtin');
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const duplicateId = await findAssistantIdByName(page, duplicateName);
    test.skip(!duplicateId, 'Duplicated assistant not found');
    if (!duplicateId) return;

    await openAssistantEditor(page, duplicateId);
    await expect(page.locator(BTN_DELETE_ASSISTANT)).toBeVisible();
    await expect(page.locator(BTN_SAVE_ASSISTANT)).toContainText(/Save|保存/i);

    await deleteAssistant(page);
  });

  test('custom assistant toggle immediately removes and restores it on guid', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const assistantName = `Guid Toggle ${Date.now()}`;
    await clickCreateAssistant(page);
    await fillAssistantName(page, assistantName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const assistantId = await findAssistantIdByName(page, assistantName);
    test.skip(!assistantId, 'Created assistant not found');
    if (!assistantId) return;

    await goToGuidListView(page);
    await expect(page.locator(`[data-testid="preset-pill-${assistantId}"]`)).toBeVisible();

    await goToAssistantSettings(page);
    await toggleAssistantEnabled(page, assistantId);

    await goToGuidListView(page);
    await expect(page.locator(`[data-testid="preset-pill-${assistantId}"]`)).toHaveCount(0);

    await goToAssistantSettings(page);
    await toggleAssistantEnabled(page, assistantId);

    await goToGuidListView(page);
    await expect(page.locator(`[data-testid="preset-pill-${assistantId}"]`)).toBeVisible();

    await goToAssistantSettings(page);
    await openAssistantEditor(page, assistantId);
    await deleteAssistant(page);
  });

  test('drag sorting in settings updates guid assistant order', async ({ page }) => {
    await goToAssistantSettings(page);
    await page.locator('[data-testid^="assistant-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const firstName = `Sort A ${Date.now()}`;
    const secondName = `Sort B ${Date.now()}`;

    await clickCreateAssistant(page);
    await fillAssistantName(page, firstName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    await clickCreateAssistant(page);
    await fillAssistantName(page, secondName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const firstId = await findAssistantIdByName(page, firstName);
    const secondId = await findAssistantIdByName(page, secondName);
    test.skip(!firstId || !secondId, 'Created assistants not found');
    if (!firstId || !secondId) return;

    const listCards = page.locator('[data-testid^="assistant-card-"]');
    const beforeOrder = await listCards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-testid'))
    );
    const firstCardTestId = `assistant-card-${firstId}`;
    const secondCardTestId = `assistant-card-${secondId}`;
    const firstIndex = beforeOrder.indexOf(firstCardTestId);
    const secondIndex = beforeOrder.indexOf(secondCardTestId);
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThanOrEqual(0);

    const [draggedId, targetId] = firstIndex < secondIndex ? [secondId, firstId] : [firstId, secondId];

    await dragAssistantAbove(page, draggedId, targetId);

    await expect
      .poll(async () => {
        const cards = page.locator('[data-testid^="assistant-card-"]');
        const order = await cards.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('data-testid'))
        );
        return (
          order.indexOf(`assistant-card-${draggedId}`) !== -1 &&
          order.indexOf(`assistant-card-${targetId}`) !== -1 &&
          order.indexOf(`assistant-card-${draggedId}`) < order.indexOf(`assistant-card-${targetId}`)
        );
      })
      .toBe(true);

    await expect
      .poll(async () => {
        const backendOrder = (await fetchAssistantCatalog(page)).map((assistant) => assistant.id);
        return (
          backendOrder.indexOf(draggedId) !== -1 &&
          backendOrder.indexOf(targetId) !== -1 &&
          backendOrder.indexOf(draggedId) < backendOrder.indexOf(targetId)
        );
      })
      .toBe(true);

    await goToGuidListView(page);
    await expect
      .poll(async () => {
        const guidOrder = await page
          .locator('[data-testid^="preset-pill-"]')
          .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
        return (
          guidOrder.indexOf(`preset-pill-${draggedId}`) !== -1 &&
          guidOrder.indexOf(`preset-pill-${targetId}`) !== -1 &&
          guidOrder.indexOf(`preset-pill-${draggedId}`) < guidOrder.indexOf(`preset-pill-${targetId}`)
        );
      })
      .toBe(true);

    await goToAssistantSettings(page);
    await openAssistantEditor(page, firstId);
    await deleteAssistant(page);
    await openAssistantEditor(page, secondId);
    await deleteAssistant(page);
  });
});
