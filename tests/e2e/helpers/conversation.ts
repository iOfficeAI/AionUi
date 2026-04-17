/**
 * Conversation lifecycle helpers for E2E tests.
 *
 * Provides utilities for creating, waiting on, and deleting ACP conversations
 * through the actual UI flow (guid page → conversation page → cleanup).
 */
import type { Page } from '@playwright/test';
import { expect } from '../fixtures';
import { invokeBridge } from './bridge';
import { goToGuid } from './navigation';
import {
  GUID_INPUT,
  AGENT_PILL,
  AGENT_STATUS_MESSAGE,
  AI_TEXT_MESSAGE,
  MESSAGE_TEXT_CONTENT,
  MODEL_SELECTOR_BTN,
  NEW_CHAT_TRIGGER,
  agentPillByBackend,
} from './selectors';

/** Select an agent on the guid page by backend name (e.g. 'claude', 'codex'). */
export async function selectAgent(page: Page, backend: string, model?: string): Promise<void> {
  const selector = agentPillByBackend(backend);
  // Agent pills may temporarily disappear during SWR revalidation after conversation cleanup.
  // Poll until the pill is visible and clickable, retrying across re-renders.
  const deadline = Date.now() + 20_000;
  let selected = false;
  while (Date.now() < deadline && !selected) {
    const isVisible = await page
      .locator(selector)
      .isVisible()
      .catch(() => false);
    if (!isVisible) {
      await page.waitForTimeout(500);
      continue;
    }
    try {
      await page.locator(selector).click({ force: true, timeout: 3_000 });
      await page.waitForSelector(`${selector}[data-agent-selected="true"]`, { timeout: 3_000 });
      selected = true;
    } catch {
      // Element may have been detached during click — retry
      await page.waitForTimeout(300);
    }
  }
  if (!selected) {
    throw new Error(`Failed to select agent "${backend}" within 20s — pill may not exist on this page`);
  }
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
 * Wait for the agent session to become active.
 *
 * The `.agent-status-message` badge may appear only transiently (or not at
 * all when the agent connects quickly). We therefore look for an AI reply
 * as the primary signal — a `.message-item.text` with `justify-start`
 * (left-aligned = assistant message) proves the agent responded.
 */
export async function waitForSessionActive(page: Page, timeoutMs = 120_000): Promise<void> {
  // The agent_status badge is transient — it may vanish before we can catch it.
  // Primary signal: an AI text reply (left-aligned `.message-item.text.justify-start`)
  // has appeared and contains actual text in its Shadow DOM.
  const aiSelector = '.message-item.text.justify-start';
  const statusSelector = AGENT_STATUS_MESSAGE;

  await expect
    .poll(
      async () => {
        // Check for AI reply with non-empty shadow content
        const hasReply = await page.evaluate((sel) => {
          const items = document.querySelectorAll(sel);
          for (const item of items) {
            const shadow = item.querySelector('.markdown-shadow');
            if (shadow?.shadowRoot && (shadow.shadowRoot.textContent?.trim().length ?? 0) > 0) {
              return true;
            }
            // Also check plain text content (non-shadow messages)
            if ((item.textContent?.trim().length ?? 0) > 0) return true;
          }
          return false;
        }, aiSelector);
        if (hasReply) return true;

        // Fallback: status badge
        const hasStatus = await page
          .locator(statusSelector)
          .filter({ hasText: /Active session|会话活跃/ })
          .first()
          .isVisible()
          .catch(() => false);
        return hasStatus;
      },
      { timeout: timeoutMs, message: 'Waiting for AI reply or session_active status badge' }
    )
    .toBeTruthy();
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
 * Wait for an AI reply to appear in the conversation.
 *
 * AI text replies render as `.message-item.text.justify-start` (left-aligned).
 * The actual text content lives in a nested child element.
 * @returns The text content of the AI reply.
 */
export async function waitForAiReply(page: Page, timeoutMs = 120_000): Promise<string> {
  // AI text messages are left-aligned. The actual reply text is rendered
  // inside a Shadow DOM (`ShadowView` component), so normal textContent /
  // innerText on the host element returns empty. We must pierce the shadow
  // root to read the rendered text.
  const aiSelector = '.message-item.text.justify-start';
  await page.locator(aiSelector).last().waitFor({ state: 'visible', timeout: timeoutMs });

  await expect
    .poll(
      async () => {
        return page.evaluate((sel) => {
          const items = document.querySelectorAll(sel);
          if (!items.length) return '';
          const last = items[items.length - 1];
          // Try shadow DOM first (MarkdownView renders via ShadowView)
          const shadow = last.querySelector('.markdown-shadow');
          if (shadow?.shadowRoot) {
            return shadow.shadowRoot.textContent?.trim() ?? '';
          }
          // Fallback: plain text messages (user messages, non-shadow)
          return last.textContent?.trim() ?? '';
        }, aiSelector);
      },
      { timeout: timeoutMs, message: 'Waiting for AI reply text inside Shadow DOM' }
    )
    .toBeTruthy();

  const text = await page.evaluate((sel) => {
    const items = document.querySelectorAll(sel);
    const last = items[items.length - 1];
    const shadow = last?.querySelector('.markdown-shadow');
    if (shadow?.shadowRoot) {
      return shadow.shadowRoot.textContent?.trim() ?? '';
    }
    return last?.textContent?.trim() ?? '';
  }, aiSelector);
  return text;
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
