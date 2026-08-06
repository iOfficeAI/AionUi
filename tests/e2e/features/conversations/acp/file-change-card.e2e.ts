import os from 'os';
import type { Page } from '@playwright/test';
import { expect, test } from '../../../fixtures';
import { findAssistantIdForBackend, goToGuid } from '../../../helpers';
import { httpDelete, httpPost } from '../../../helpers/httpBridge';

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';

type CreatedConversation = {
  id: string;
};

type FileChangeController = {
  emitFileChange: (path: string, oldText: string, newText: string) => Promise<void>;
};

type StreamRegistry = {
  controllers: Record<string, FileChangeController>;
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
  await goToGuid(page);
  await ensureRendererReady(page);
  const assistantId = await findAssistantIdForBackend(page, 'codex');

  if (!assistantId) {
    throw new Error('No builtin Codex assistant found for ACP file-change card rendering');
  }

  const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
    name: `E2E ACP file change ${Date.now()}`,
    assistant: { id: assistantId },
    extra: {
      workspace: os.tmpdir(),
      custom_workspace: true,
      session_mode: 'full-access',
    },
  });

  if (!conversation?.id) {
    throw new Error('POST /api/conversations succeeded but did not return a conversation id');
  }

  return conversation.id;
}

async function openConversationPage(page: Page, conversationId: string): Promise<void> {
  await goToGuid(page);
  await page.evaluate(
    ({ currentConversationId, storageKey }) => {
      window.sessionStorage.setItem(storageKey, currentConversationId);
    },
    { currentConversationId: conversationId, storageKey: ENABLED_CONVERSATION_KEY }
  );

  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/conversation/${conversationId}`);
  await page.waitForSelector('[data-testid="message-list-scroller"]', { timeout: 30_000 });
}

test('shows one compact row for an ACP file change', async ({ page }) => {
  let conversationId: string | null = null;

  try {
    conversationId = await createAcpConversation(page);
    await openConversationPage(page, conversationId);

    await page.waitForFunction(
      (id) => {
        const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
          .__AIONUI_E2E_MESSAGE_STREAM__;
        return Boolean(registry?.controllers[id]);
      },
      conversationId,
      { timeout: 15_000 }
    );

    await page.evaluate(async (id) => {
      const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
        .__AIONUI_E2E_MESSAGE_STREAM__;
      const controller = registry?.controllers[id];
      if (!controller) throw new Error(`No E2E stream controller registered for conversation ${id}`);
      await controller.emitFileChange('/workspace/research-summary.md', 'before', 'after\nsecond line');
    }, conversationId);

    const fileChange = page.locator('[data-testid="message-acp_tool_call-left"]').last();
    await expect(fileChange).toBeVisible();
    await expect(fileChange).toContainText('research-summary.md');
    await expect(fileChange).toContainText('+2');
    await expect(fileChange.getByText('research-summary.md', { exact: true })).toHaveCount(1);
    await expect(fileChange).not.toContainText('Tool Call ID');

    await fileChange.getByText('+2', { exact: true }).click();
    const previewPanel = page.locator('.preview-panel');
    await expect(previewPanel).toBeVisible({ timeout: 10_000 });
    await expect(previewPanel).toContainText('research-summary.md', { timeout: 10_000 });

    await fileChange.getByText(/^Preview$|^预览$/).click();
    await expect(previewPanel).toContainText('research-summary.md', { timeout: 10_000 });
  } finally {
    if (conversationId) {
      await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
    }
  }
});
