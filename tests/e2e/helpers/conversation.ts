/**
 * Conversation lifecycle helpers for E2E tests.
 *
 * Provides utilities for creating, waiting on, and deleting ACP conversations
 * through the actual UI flow (guid page → conversation page → cleanup).
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from '../fixtures';
import { goToGuid } from './navigation';
import { httpGet } from './httpBridge';
import {
  GUID_INPUT,
  AGENT_STATUS_MESSAGE,
  MODEL_SELECTOR_BTN,
  NEW_CHAT_TRIGGER,
  assistantOverflowPillById,
  presetPillById,
} from './selectors';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';

type FindAssistantOptions = {
  requireAvailable?: boolean;
};

function assistantMatchesBackend(assistant: Assistant, backend: string): boolean {
  return assistantRuntimeKey(assistant) === backend;
}

function pickAssistantForBackend(assistants: Assistant[], backend: string, options: FindAssistantOptions = {}) {
  const enabledAssistants = assistants.filter((assistant) => assistant.enabled !== false);
  const candidates = enabledAssistants.filter((assistant) => assistantMatchesBackend(assistant, backend));
  const availabilityFiltered = options.requireAvailable
    ? candidates.filter((assistant) => assistant.agent_status === 'online')
    : candidates;
  const selectableCandidates = options.requireAvailable ? availabilityFiltered : candidates;

  return (
    selectableCandidates.find((assistant) => assistant.source === 'generated') ??
    selectableCandidates.find((assistant) => assistant.source === 'user') ??
    selectableCandidates[0] ??
    null
  );
}

async function clickAssistantPillById(page: Page, assistantId: string): Promise<void> {
  await page.locator(GUID_INPUT).waitFor({ state: 'visible', timeout: 10_000 });

  const isSelected = async () =>
    page
      .locator(`[data-assistant-id="${assistantId}"][data-assistant-selected="true"]`)
      .first()
      .isVisible()
      .catch(() => false);
  const clickPill = async (pill: Locator) => {
    try {
      await pill.click({ timeout: 5_000 });
    } catch {
      if (await isSelected()) return;
      const handle = await pill.elementHandle({ timeout: 1_000 }).catch(() => null);
      if (!handle) {
        throw new Error(`Assistant pill "${assistantId}" detached before click could complete`);
      }
      await handle.evaluate((element) => {
        (element as HTMLElement).click();
      });
    }
  };
  const waitForSelected = async () => {
    await page
      .locator(`[data-assistant-id="${assistantId}"][data-assistant-selected="true"]`)
      .waitFor({ state: 'visible', timeout: 5_000 });
  };
  const visiblePill = page.locator(presetPillById(assistantId));
  const moreButton = page.locator('[data-testid="assistant-more-btn"]');
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (await visiblePill.isVisible().catch(() => false)) {
      await clickPill(visiblePill).catch(async () => {
        await page.waitForTimeout(200);
      });
      if (!(await isSelected())) {
        await page.waitForTimeout(200);
        continue;
      }
      await waitForSelected();
      await page.locator(GUID_INPUT).waitFor({ state: 'visible', timeout: 3_000 });
      return;
    }

    if (await moreButton.isVisible().catch(() => false)) {
      await moreButton.click();
      const overflowPill = page.locator(assistantOverflowPillById(assistantId));
      await overflowPill.waitFor({ state: 'visible', timeout: 5_000 });
      await clickPill(overflowPill).catch(async () => {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
      });
      if (!(await isSelected())) {
        await page.waitForTimeout(200);
        continue;
      }
      await waitForSelected();
      await page
        .locator(presetPillById(assistantId))
        .waitFor({ state: 'visible', timeout: 3_000 })
        .catch(() => {});
      await page.locator(GUID_INPUT).waitFor({ state: 'visible', timeout: 3_000 });
      return;
    }

    await page.waitForTimeout(200);
  }

  throw new Error(`Assistant "${assistantId}" was not rendered as a visible pill or overflow menu item within 10s`);
}

/** Select an assistant on the guid page by backend name (e.g. 'claude', 'codex'). */
export async function selectAgent(page: Page, backend: string, model?: string): Promise<void> {
  // Historical tests still call this helper `selectAgent`, but Phase 2 Guid
  // selection is assistant-first. Resolve the assistant catalog row, then click
  // the assistant pill instead of using the removed direct agent pill bar.
  const deadline = Date.now() + 20_000;
  let selected = false;
  while (Date.now() < deadline && !selected) {
    const assistants = await httpGet<Assistant[]>(page, '/api/assistants').catch(() => [] as Assistant[]);
    const assistant = pickAssistantForBackend(assistants, backend, { requireAvailable: true });
    if (!assistant) {
      await page.waitForTimeout(500);
      continue;
    }

    try {
      await clickAssistantPillById(page, assistant.id);
      selected = true;
    } catch {
      // Element may have been detached during click — retry
      await page.waitForTimeout(300);
    }
  }
  if (!selected) {
    throw new Error(`Failed to select available assistant for backend "${backend}" within 20s`);
  }
  if (model) {
    await selectModel(page, model);
  }
}

export async function findAssistantIdForBackend(
  page: Page,
  backend: string,
  options: FindAssistantOptions = {}
): Promise<string | null> {
  const assistants = await httpGet<Assistant[]>(page, '/api/assistants');
  return pickAssistantForBackend(assistants, backend, options)?.id ?? null;
}

export async function selectAssistantForBackend(page: Page, backend: string): Promise<string | null> {
  const assistantId = await findAssistantIdForBackend(page, backend, { requireAvailable: true });
  if (!assistantId) return null;
  await clickAssistantPillById(page, assistantId);
  return assistantId;
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
  const previousHash = await page.evaluate(() => window.location.hash);
  const textarea = page.locator(GUID_INPUT);
  await textarea.fill(message);
  await textarea.press('Enter');
  // Wait for navigation to a new conversation route instead of reusing a stale hash.
  await page.waitForFunction(
    (prevHash) => window.location.hash.includes('/conversation/') && window.location.hash !== prevHash,
    previousHash,
    {
      timeout: 15_000,
    }
  );

  let persistedConversationId: string | null = null;
  await expect
    .poll(
      async () => {
        const hash = await page.evaluate(() => window.location.hash);
        const id = hash.split('/conversation/')[1];
        if (!id) return null;

        const exists = await page.evaluate(async (conversationId) => {
          const port = (window as unknown as { __backendPort?: number }).__backendPort;
          if (!port) return false;
          const res = await fetch(`http://127.0.0.1:${port}/api/conversations/${encodeURIComponent(conversationId)}`);
          return res.ok;
        }, id);

        if (exists) {
          persistedConversationId = id;
        }

        return exists ? id : null;
      },
      {
        timeout: 30_000,
        message: 'Waiting for guid send to land on a persisted conversation',
      }
    )
    .not.toBeNull();

  if (!persistedConversationId) {
    throw new Error(`Failed to extract persisted conversation ID from URL: ${page.url()}`);
  }

  await page.waitForFunction(
    (conversationId) => {
      const hash = window.location.hash;
      return hash.includes('/conversation/') && hash.split('/conversation/')[1] === conversationId;
    },
    persistedConversationId,
    {
      timeout: 15_000,
    }
  );

  return persistedConversationId;
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

/**
 * Delete a conversation through the UI: open the sidebar context menu,
 * click "Delete", then confirm in the modal dialog.
 *
 * Requires the conversation to be visible in the sidebar history.
 */
export async function deleteConversation(page: Page, conversationId: string): Promise<boolean> {
  const row = page.locator(`#c-${conversationId}`);
  await row.waitFor({ state: 'visible', timeout: 10_000 });

  await row.hover();

  const menuTrigger = row.locator(`[data-testid="conversation-row-menu-${conversationId}"]`).first();
  await menuTrigger.waitFor({ state: 'visible', timeout: 5_000 });
  await menuTrigger.click();

  const deleteItem = page.locator('.arco-dropdown-menu-item').filter({ hasText: /Delete|删除/ });
  await deleteItem.waitFor({ state: 'visible', timeout: 5_000 });
  await deleteItem.click();

  const confirmBtn = page.locator('.arco-modal .arco-btn-primary.arco-btn-status-warning');
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await confirmBtn.click();

  await page
    .waitForFunction(() => !window.location.hash.includes('/conversation/'), { timeout: 10_000 })
    .catch(() => {});

  return true;
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
