import os from 'os';
import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { goToGuid } from '../../../helpers';
import { takeScreenshot } from '../../../helpers/screenshots';

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';
const EMPTY_TURN_TEXT = '模型已结束本轮，但没有产生任何回复。';
const CTX_FLUSH_TEXT = '当前会话的上下文已清空。';

type CreatedConversation = {
  id: string;
};

type EmptyTurnController = {
  emitInfoTip: (code: string, fallbackContent: string) => Promise<void>;
  emitFollowUpExchange: () => Promise<void>;
};

type StreamRegistry = {
  controllers: Record<string, EmptyTurnController>;
};

async function ensureRendererReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number',
    { timeout: 30_000 }
  );
}

async function createAcpConversation(page: Page): Promise<string> {
  return page.evaluate(
    async ({ workspacePath }) => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort;
      if (!port) {
        throw new Error('window.__backendPort is not available in renderer context');
      }

      const response = await fetch(`http://127.0.0.1:${port}/api/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'acp',
          name: `E2E ACP empty turn info ${Date.now()}`,
          extra: {
            workspace: workspacePath,
            custom_workspace: true,
            backend: 'codex',
            session_mode: 'full-access',
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`POST /api/conversations failed (${response.status}): ${body}`);
      }

      const json = (await response.json()) as { data?: CreatedConversation };
      const id = json?.data?.id;
      if (!id) {
        throw new Error('POST /api/conversations succeeded but did not return a conversation id');
      }

      return id;
    },
    {
      workspacePath: os.tmpdir(),
    }
  );
}

async function removeConversation(page: Page, conversationId: string): Promise<void> {
  await page.evaluate(
    async ({ id }) => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort;
      if (!port) return;

      await fetch(`http://127.0.0.1:${port}/api/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    },
    { id: conversationId }
  );
}

async function openConversationPage(page: Page, conversationId: string): Promise<void> {
  await ensureRendererReady(page);
  await goToGuid(page);
  await page.evaluate(
    ({ currentConversationId, storageKey }) => {
      window.sessionStorage.setItem(storageKey, currentConversationId);
    },
    { currentConversationId: conversationId, storageKey: ENABLED_CONVERSATION_KEY }
  );

  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/conversation/${conversationId}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="message-list-scroller"]', { timeout: 30_000 });
}

async function waitForEmptyTurnController(page: Page, conversationId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const registry = (
        window as typeof window & {
          __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
        }
      ).__AIONUI_E2E_MESSAGE_STREAM__;
      return Boolean(registry?.controllers[id]);
    },
    conversationId,
    { timeout: 15_000 }
  );
}

async function emitInfoTip(
  page: Page,
  conversationId: string,
  code: string,
  fallbackContent: string
): Promise<void> {
  await page.evaluate(
    async ({ id, code, fallbackContent }) => {
      const registry = (
        window as typeof window & {
          __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
        }
      ).__AIONUI_E2E_MESSAGE_STREAM__;
      const controller = registry?.controllers[id];
      if (!controller) {
        throw new Error(`No E2E stream controller registered for conversation ${id}`);
      }
      await controller.emitInfoTip(code, fallbackContent);
    },
    { id: conversationId, code, fallbackContent }
  );
}

async function emitFollowUpExchange(page: Page, conversationId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const registry = (
      window as typeof window & {
        __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
      }
    ).__AIONUI_E2E_MESSAGE_STREAM__;
    const controller = registry?.controllers[id];
    if (!controller) {
      throw new Error(`No E2E stream controller registered for conversation ${id}`);
    }
    await controller.emitFollowUpExchange();
  }, conversationId);
}

test.describe('ACP empty turn info tips', () => {
  test('shows a localized neutral info tip without icon or feedback UI for benign empty turns', async ({ page }) => {
    let conversationId: string | null = null;

    try {
      conversationId = await createAcpConversation(page);
      await openConversationPage(page, conversationId);
      await waitForEmptyTurnController(page, conversationId);

      await emitInfoTip(page, conversationId, 'ACP_EMPTY_TURN', 'The model finished without producing any reply.');

      const latestTip = page.locator('[data-testid="message-tips-center"]').last();
      await expect(latestTip).toBeVisible({ timeout: 15_000 });
      await expect(latestTip).toContainText(EMPTY_TURN_TEXT);
      await expect(latestTip.locator('button')).toHaveCount(0);
      await expect(latestTip.locator('svg')).toHaveCount(0);
      await takeScreenshot(page, 'acp-empty-turn-info-tip');
    } finally {
      if (conversationId) {
        await removeConversation(page, conversationId);
      }
    }
  });

  test('keeps the conversation usable after a localized ctx-flush info tip', async ({ page }) => {
    let conversationId: string | null = null;

    try {
      conversationId = await createAcpConversation(page);
      await openConversationPage(page, conversationId);
      await waitForEmptyTurnController(page, conversationId);

      await emitInfoTip(page, conversationId, 'ACP_CTX_FLUSH_COMPLETED', 'Context was cleared for this conversation.');
      await emitFollowUpExchange(page, conversationId);

      const latestTip = page.locator('[data-testid="message-tips-center"]').last();
      await expect(latestTip).toBeVisible({ timeout: 15_000 });
      await expect(latestTip).toContainText(CTX_FLUSH_TEXT);
      await expect(page.locator('[data-testid="message-text-right"]').last()).toContainText(
        'Please continue after the neutral info tip.'
      );
      await expect(page.locator('[data-testid="message-text-left"]').last()).toContainText(
        'Follow-up reply arrived after the neutral empty-turn tip.'
      );
      await takeScreenshot(page, 'acp-empty-turn-info-follow-up');
    } finally {
      if (conversationId) {
        await removeConversation(page, conversationId);
      }
    }
  });
});
