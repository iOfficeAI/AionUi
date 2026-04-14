/**
 * Conversation lifecycle helpers for E2E tests.
 *
 * Provides utilities for creating, waiting on, and deleting ACP conversations
 * through the actual UI flow (guid page → conversation page → cleanup).
 */
import type { Page } from '@playwright/test';
import { invokeBridge } from './bridge';
import { goToGuid } from './navigation';
import {
  GUID_INPUT,
  AGENT_STATUS_MESSAGE,
  MODEL_SELECTOR_BTN,
  NEW_CHAT_TRIGGER,
  agentPillByBackend,
} from './selectors';

/** Select an agent on the guid page by backend name (e.g. 'claude', 'codex'). */
export async function selectAgent(page: Page, backend: string, model?: string): Promise<void> {
  const pill = page.locator(agentPillByBackend(backend));
  await pill.click();
  await page.waitForSelector(`${agentPillByBackend(backend)}[data-agent-selected="true"]`, {
    timeout: 5_000,
  });
  if (model) {
    await selectModel(page, model);
  }
}

/**
 * Select a model from the ACP model dropdown on the guid page.
 * @param modelLabel - The visible model label (e.g. "Sonnet", "Opus", "Haiku").
 *                     Exact match, case-insensitive.
 */
export async function selectModel(page: Page, modelLabel: string): Promise<void> {
  const btn = page.locator(MODEL_SELECTOR_BTN);
  await btn.waitFor({ state: 'visible', timeout: 15_000 });
  await btn.click();
  const menuItem = page
    .locator('.arco-dropdown-menu-item span')
    .filter({ hasText: new RegExp(`^${modelLabel}$`, 'i') })
    .first();
  await menuItem.waitFor({ state: 'visible', timeout: 5_000 });
  await menuItem.click();
}

/**
 * Send a message from the guid page, creating a new conversation.
 * @returns The conversation ID extracted from the URL hash.
 */
export async function sendMessageFromGuid(page: Page, message: string): Promise<string> {
  const textarea = page.locator(GUID_INPUT);
  await textarea.fill(message);
  await textarea.press('Enter');
  // Wait for navigation to conversation page
  await page.waitForFunction(() => window.location.hash.includes('/conversation/'), {
    timeout: 15_000,
  });
  const hash = new URL(page.url()).hash; // #/conversation/<id>
  const id = hash.split('/conversation/')[1];
  if (!id) throw new Error(`Failed to extract conversation ID from URL: ${page.url()}`);
  return id;
}

/**
 * Wait for the agent session_active status badge to appear.
 * Matches both English ("Active session") and Chinese ("会话活跃") text.
 */
export async function waitForSessionActive(page: Page, timeoutMs = 120_000): Promise<void> {
  await page
    .locator(AGENT_STATUS_MESSAGE)
    .filter({ hasText: /Active session|会话活跃/ })
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs });
}

/** Delete a conversation by ID via IPC bridge. */
export async function deleteConversation(page: Page, conversationId: string): Promise<boolean> {
  return invokeBridge<boolean>(page, 'remove-conversation', { id: conversationId });
}

/** Click the sidebar new-chat trigger and wait for the guid page. */
export async function goToNewChat(page: Page): Promise<void> {
  await page.locator(NEW_CHAT_TRIGGER).first().click();
  await page.waitForFunction(() => window.location.hash.startsWith('#/guid'), { timeout: 10_000 });
}

/**
 * Run a full conversation lifecycle: select agent → send message → wait for
 * session_active → then delete the conversation to release resources.
 *
 * Useful as a building block for benchmark loops and smoke tests.
 *
 * @returns The conversation ID and wall-clock duration in milliseconds.
 */
export async function runConversationCycle(
  page: Page,
  backend: string,
  message: string,
  model?: string
): Promise<{ conversationId: string; durationMs: number }> {
  await goToGuid(page);
  await selectAgent(page, backend, model);
  const wallStart = Date.now();
  const conversationId = await sendMessageFromGuid(page, message);
  await waitForSessionActive(page, 180_000);
  const durationMs = Date.now() - wallStart;
  await deleteConversation(page, conversationId);
  return { conversationId, durationMs };
}
