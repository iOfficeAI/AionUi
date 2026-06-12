/**
 * E2E helpers for AssistantSettings pages.
 */
import type { Page } from '@playwright/test';
import { expect } from '../fixtures';
import { goToAssistantSettings as goToAssistantSettingsRoute } from './navigation';

const ASSISTANT_EDITOR = '[data-testid="assistant-editor-page"], [data-testid="assistant-edit-drawer"]';

// ── Navigation ──────────────────────────────────────────────────────────────

/** Navigate to the assistant settings page via UI clicks. */
export async function goToAssistantSettings(page: Page): Promise<void> {
  await goToAssistantSettingsRoute(page);
}

/** Open the assistant editor surface by clicking on an assistant card. */
export async function openAssistantEditor(page: Page, assistant_id: string): Promise<void> {
  const card = page.locator(`[data-testid="assistant-card-${assistant_id}"]`);
  await card.click();
  await page.locator(ASSISTANT_EDITOR).waitFor({ state: 'visible', timeout: 5_000 });
}

/** Click the Create Assistant button. */
export async function clickCreateAssistant(page: Page): Promise<void> {
  const editor = page.locator(ASSISTANT_EDITOR);
  if (await editor.isVisible().catch(() => false)) {
    await closeAssistantEditor(page);
    await editor.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }
  await page.locator('[data-testid="btn-create-assistant"]').click();
  await editor.waitFor({ state: 'visible', timeout: 5_000 });
}

// ── CRUD helpers ────────────────────────────────────────────────────────────

/** Fill the assistant name input. */
export async function fillAssistantName(page: Page, name: string): Promise<void> {
  const input = page.locator('[data-testid="input-assistant-name"]');
  await input.clear();
  await input.fill(name);
}

/** Fill the assistant description input. */
export async function fillAssistantDescription(page: Page, description: string): Promise<void> {
  const input = page.locator('[data-testid="input-assistant-desc"]');
  await input.clear();
  await input.fill(description);
}

/** Click the Save/Create button in the assistant editor. */
export async function saveAssistant(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const button = page.locator('[data-testid="btn-save-assistant"]:visible').last();
    await button.waitFor({ state: 'visible', timeout: 5_000 });

    try {
      await button.click();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('detached from the DOM') || attempt === 2) {
        throw error;
      }
    }
  }
}

/** Click the Delete button in the assistant editor, then confirm. */
export async function deleteAssistant(page: Page): Promise<void> {
  await page.locator('[data-testid="btn-delete-assistant"]').click();
  // Wait for confirm modal (uses wrapClassName='delete-assistant-modal')
  const confirmBtn = page.locator('.delete-assistant-modal .arco-btn-status-danger');
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await confirmBtn.click();
}

/** Click the Duplicate link for an assistant. */
export async function duplicateAssistant(page: Page, assistant_id: string): Promise<void> {
  const dupBtn = page.locator(`[data-testid="btn-duplicate-${assistant_id}"]`);
  await dupBtn.click();
  await page.locator(ASSISTANT_EDITOR).waitFor({ state: 'visible', timeout: 5_000 });
}

/** Toggle the enabled/disabled switch for an assistant. */
export async function toggleAssistantEnabled(page: Page, assistant_id: string): Promise<void> {
  const sw = page.locator(`[data-testid="switch-enabled-${assistant_id}"]`);
  const checkedBefore = await sw.getAttribute('aria-checked').catch(() => null);
  await sw.click();
  if (checkedBefore !== null) {
    await expect
      .poll(async () => sw.getAttribute('aria-checked').catch(() => null), {
        timeout: 5_000,
      })
      .not.toBe(checkedBefore);
  }
}

// ── Search & Filter ─────────────────────────────────────────────────────────

/** Expand search and type a query. */
export async function searchAssistants(page: Page, query: string): Promise<void> {
  const searchToggle = page.locator('[data-testid="btn-search-toggle"]');
  const searchInput = page.locator('[data-testid="input-search-assistant"]');
  // If search input not visible, toggle it open
  if (!(await searchInput.isVisible().catch(() => false))) {
    await searchToggle.click();
    await searchInput.waitFor({ state: 'visible', timeout: 3_000 });
  }
  await searchInput.clear();
  await searchInput.fill(query);
}

/** Clear search by clicking the toggle button (closes search). */
export async function clearSearch(page: Page): Promise<void> {
  const searchToggle = page.locator('[data-testid="btn-search-toggle"]');
  await searchToggle.click();
}

/**
 * Tab text mapping: supports both English and Chinese labels.
 * The actual text depends on the app's i18n locale.
 */
const TAB_TEXT_MAP: Record<string, RegExp> = {
  All: /^(All|全部)$/i,
  System: /^(System|系统)$/i,
  Custom: /^(Custom|自定义)$/i,
};

/** Select a filter tab by logical name (All / System / Custom). */
export async function selectFilterTab(page: Page, tabText: string): Promise<void> {
  const pattern = TAB_TEXT_MAP[tabText] ?? new RegExp(tabText, 'i');
  const tab = page.locator('.assistant-filter-tabs .arco-tabs-header-title').filter({ hasText: pattern });
  await tab.first().click();
}

// ── Assertions ──────────────────────────────────────────────────────────────

/** Get all visible assistant card IDs. */
export async function getVisibleAssistantIds(page: Page): Promise<string[]> {
  const cards = page.locator('[data-testid^="assistant-card-"]');
  const count = await cards.count();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const testid = await cards.nth(i).getAttribute('data-testid');
    if (testid) ids.push(testid.replace('assistant-card-', ''));
  }
  return ids;
}

/** Get all visible assistant names from cards. */
export async function getVisibleAssistantNames(page: Page): Promise<string[]> {
  const cards = page.locator('[data-testid^="assistant-card-"]');
  const count = await cards.count();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await cards.nth(i).locator('.font-medium.text-t-primary span.truncate').first().textContent();
    if (text) names.push(text.trim());
  }
  return names;
}

/** Check if the assistant editor surface is visible. */
export async function isAssistantEditorVisible(page: Page): Promise<boolean> {
  return page
    .locator(ASSISTANT_EDITOR)
    .isVisible()
    .catch(() => false);
}

/** Wait for the assistant editor surface to close (max 5s). */
export async function waitForAssistantEditorClose(page: Page): Promise<void> {
  await expect(page.locator(ASSISTANT_EDITOR)).not.toBeVisible({ timeout: 5_000 });
}

/** Force-close the editor via full-page controls or legacy drawer dismissal. */
export async function closeAssistantEditor(page: Page): Promise<void> {
  const editor = page.locator(ASSISTANT_EDITOR);
  if (!(await editor.isVisible().catch(() => false))) return;

  const backButton = page.locator('[data-testid="btn-back-assistant-editor"]');
  if (await backButton.isVisible().catch(() => false)) {
    await Promise.all([
      editor.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {}),
      backButton.click({ force: true }).catch(() => {}),
    ]);
    return;
  }

  const cancelButton = page.locator('[data-testid="btn-cancel-assistant-editor"]');
  if (await cancelButton.isVisible().catch(() => false)) {
    await Promise.all([
      editor.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {}),
      cancelButton.click({ force: true }).catch(() => {}),
    ]);
    return;
  }

  const drawerWrapper = page.locator('.arco-drawer-wrapper');
  if (!(await drawerWrapper.isVisible().catch(() => false))) return;

  const mask = page.locator('.arco-drawer-mask');
  if (await mask.isVisible().catch(() => false)) {
    await mask.click({ force: true });
  } else {
    await page.locator('body').press('Escape');
  }

  await page
    .locator('.arco-drawer-wrapper')
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .catch(() => {});
}
