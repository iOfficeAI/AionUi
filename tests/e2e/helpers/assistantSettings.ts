/**
 * E2E helpers for AssistantSettings pages.
 */
import type { Page } from '@playwright/test';
import { expect } from '../fixtures';
import { navigateTo } from './navigation';

// ── Navigation ──────────────────────────────────────────────────────────────

/** Navigate to the assistant settings page. */
export async function goToAssistantSettings(page: Page): Promise<void> {
  await navigateTo(page, '#/settings/assistants');
}

/** Open the assistant edit drawer by clicking on an assistant card. */
export async function openAssistantDrawer(page: Page, assistantId: string): Promise<void> {
  const card = page.locator(`[data-testid="assistant-card-${assistantId}"]`);
  await card.click();
  await page.locator('[data-testid="assistant-edit-drawer"]').waitFor({ state: 'visible', timeout: 5_000 });
}

/** Click the Create Assistant button. */
export async function clickCreateAssistant(page: Page): Promise<void> {
  await page.locator('[data-testid="btn-create-assistant"]').click();
  await page.locator('[data-testid="assistant-edit-drawer"]').waitFor({ state: 'visible', timeout: 5_000 });
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

/** Click the Save/Create button in the edit drawer. */
export async function saveAssistant(page: Page): Promise<void> {
  await page.locator('[data-testid="btn-save-assistant"]').click();
}

/** Click the Delete button in the edit drawer, then confirm. */
export async function deleteAssistant(page: Page): Promise<void> {
  await page.locator('[data-testid="btn-delete-assistant"]').click();
  // Wait for confirm modal
  const confirmBtn = page.locator('.arco-modal-footer .arco-btn-status-danger, .arco-modal-footer .arco-btn-primary').last();
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await confirmBtn.click();
}

/** Click the Duplicate link for an assistant. */
export async function duplicateAssistant(page: Page, assistantId: string): Promise<void> {
  const card = page.locator(`[data-testid="assistant-card-${assistantId}"]`);
  await card.hover();
  const dupBtn = page.locator(`[data-testid="btn-duplicate-${assistantId}"]`);
  await dupBtn.click();
  await page.locator('[data-testid="assistant-edit-drawer"]').waitFor({ state: 'visible', timeout: 5_000 });
}

/** Toggle the enabled/disabled switch for an assistant. */
export async function toggleAssistantEnabled(page: Page, assistantId: string): Promise<void> {
  const sw = page.locator(`[data-testid="switch-enabled-${assistantId}"]`);
  await sw.click();
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

/** Select a filter tab by matching text content (All / System / Custom). */
export async function selectFilterTab(page: Page, tabText: string): Promise<void> {
  const tab = page.locator('.assistant-filter-tabs .arco-tabs-header-title').filter({ hasText: tabText });
  await tab.click();
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

/** Check if the assistant edit drawer is visible. */
export async function isDrawerVisible(page: Page): Promise<boolean> {
  return page.locator('[data-testid="assistant-edit-drawer"]').isVisible().catch(() => false);
}

/** Wait for the drawer to close. */
export async function waitForDrawerClose(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="assistant-edit-drawer"]')).not.toBeVisible({ timeout: 5_000 });
}
