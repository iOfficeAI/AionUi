/**
 * ACP send error surfacing E2E.
 *
 * Verifies the conversation UI shows the backend's raw error text instead of a
 * generic retry prompt when ACP message sending fails.
 */

import os from 'os';
import { test, expect } from '../../../fixtures';
import { CHAT_INPUT, goToGuid } from '../../../helpers';
import { httpDelete, httpPost } from '../../../helpers/httpBridge';

const RAW_BACKEND_ERROR =
  'Error: error loading config: C:\\Users\\tester\\.codex\\config.toml:12:12: `wire_api = "chat"` is no longer supported.';

type CreatedConversation = {
  id: string;
};

async function ensureRendererReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number',
    { timeout: 30_000 }
  );
}

async function createAcpConversation(page: import('@playwright/test').Page): Promise<string> {
  await goToGuid(page);
  await ensureRendererReady(page);

  const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
    type: 'acp',
    name: `E2E ACP send error ${Date.now()}`,
    extra: {
      workspace: os.tmpdir(),
      custom_workspace: true,
      backend: 'codex',
      session_mode: 'full-access',
    },
  });

  if (!conversation?.id) {
    throw new Error('POST /api/conversations succeeded but did not return a conversation id');
  }

  return conversation.id;
}

async function goToConversation(page: import('@playwright/test').Page, conversationId: string): Promise<void> {
  await page.evaluate((id) => {
    window.location.assign(`#/conversation/${id}`);
  }, conversationId);

  await page.waitForFunction((id) => window.location.hash === `#/conversation/${id}`, conversationId, {
    timeout: 15_000,
  });
}

async function installAcpFailureRoutes(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/conversations/*/warmup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: null,
      }),
    });
  });

  await page.route('**/api/conversations/*/slash-commands', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [],
      }),
    });
  });

  await page.route('**/api/conversations/*/messages', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        code: 'ACP_INIT_FAILED',
        error: RAW_BACKEND_ERROR,
      }),
    });
  });
}

async function expectLatestErrorTipToContain(
  page: import('@playwright/test').Page,
  expectedText: string
): Promise<void> {
  const latestTip = page.locator('[data-testid="message-tips-center"]').last();
  await expect(latestTip).toBeVisible({ timeout: 15_000 });
  await expect(latestTip).toContainText(expectedText);
}

test.describe('ACP send error surfacing', () => {
  test('shows raw backend error for guid initial message send failures', async ({ page }) => {
    let conversationId: string | null = null;

    try {
      await ensureRendererReady(page);
      await goToGuid(page);
      await installAcpFailureRoutes(page);
      conversationId = await createAcpConversation(page);

      await page.evaluate(
        ({ id, input }) => {
          sessionStorage.setItem(
            `acp_initial_message_${id}`,
            JSON.stringify({
              input,
            })
          );
        },
        {
          id: conversationId,
          input: 'run Roastedai',
        }
      );

      await goToConversation(page, conversationId);
      await expectLatestErrorTipToContain(page, RAW_BACKEND_ERROR);
    } finally {
      if (conversationId) {
        await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
      }
      await page.unroute('**/api/conversations/*/warmup').catch(() => {});
      await page.unroute('**/api/conversations/*/slash-commands').catch(() => {});
      await page.unroute('**/api/conversations/*/messages').catch(() => {});
    }
  });

  test('shows raw backend error for in-conversation send failures', async ({ page }) => {
    let conversationId: string | null = null;

    try {
      await ensureRendererReady(page);
      await goToGuid(page);
      await installAcpFailureRoutes(page);
      conversationId = await createAcpConversation(page);
      await goToConversation(page, conversationId);

      const chatInput = page.locator(CHAT_INPUT).first();
      await chatInput.waitFor({ state: 'visible', timeout: 15_000 });
      await chatInput.fill('run Roastedai');
      await chatInput.press('Enter');

      await expectLatestErrorTipToContain(page, RAW_BACKEND_ERROR);
    } finally {
      if (conversationId) {
        await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
      }
      await page.unroute('**/api/conversations/*/warmup').catch(() => {});
      await page.unroute('**/api/conversations/*/slash-commands').catch(() => {});
      await page.unroute('**/api/conversations/*/messages').catch(() => {});
    }
  });
});
