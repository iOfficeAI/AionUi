/**
 * Conversation resources E2E.
 *
 * Creates a real conversation, injects deterministic source/output messages
 * through the test-only ACP stream controller, and verifies that the header
 * panel opens the existing local-file preview.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { findAssistantIdForBackend, goToGuid } from '../../helpers';
import { httpDelete, httpPost } from '../../helpers/httpBridge';

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';

type StreamRegistry = {
  controllers: Record<
    string,
    {
      emitConversationResources: (sourcePath: string, outputPath: string, sourceUrl: string) => Promise<void>;
    }
  >;
};

async function createConversation(page: Page, workspace: string): Promise<string> {
  await goToGuid(page);
  const assistantIds = await Promise.all(
    ['claude', 'codex', 'gemini'].map((backend) =>
      findAssistantIdForBackend(page, backend, { requireAvailable: false }).catch(() => null)
    )
  );
  const assistantId = assistantIds.find((id): id is string => Boolean(id));
  test.skip(!assistantId, 'No configured ACP assistant for conversation resources E2E');
  if (!assistantId) return '';

  const conversation = await httpPost<{ id: string }>(page, '/api/conversations', {
    name: `E2E conversation resources ${Date.now()}`,
    assistant: { id: assistantId },
    extra: { workspace, custom_workspace: true, session_mode: 'default' },
  });
  return conversation.id;
}

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.evaluate(({ id, storageKey }) => window.sessionStorage.setItem(storageKey, id), {
    id: conversationId,
    storageKey: ENABLED_CONVERSATION_KEY,
  });
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/conversation/${conversationId}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="message-list-scroller"]', { timeout: 30_000 });
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

test.describe('Conversation resources panel', () => {
  let conversationId = '';
  let workspace = '';

  test.beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-resources-'));
    fs.writeFileSync(path.join(workspace, 'source.md'), '# Source');
    fs.writeFileSync(path.join(workspace, 'output.md'), '# Generated output');
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate((storageKey) => window.sessionStorage.removeItem(storageKey), ENABLED_CONVERSATION_KEY);
    if (conversationId) await httpDelete(page, `/api/conversations/${conversationId}`).catch(() => undefined);
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
    conversationId = '';
    workspace = '';
  });

  test('opens a completed output in the existing preview panel', async ({ page }) => {
    conversationId = await createConversation(page, workspace);
    await openConversation(page, conversationId);

    const sourcePath = path.join(workspace, 'source.md');
    const outputPath = path.join(workspace, 'output.md');
    await page.evaluate(
      async ({ id, source, output }) => {
        const registry = (
          window as typeof window & {
            __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
          }
        ).__AIONUI_E2E_MESSAGE_STREAM__;
        const controller = registry?.controllers[id];
        if (!controller) throw new Error(`No E2E stream controller registered for conversation ${id}`);
        await controller.emitConversationResources(source, output, 'https://example.com/reference');
      },
      { id: conversationId, source: sourcePath, output: outputPath }
    );

    await page.getByTestId('conversation-resources-trigger').click();
    const panel = page.getByTestId('conversation-resources-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('output.md')).toBeVisible();
    await expect(panel.getByText('source.md')).toBeVisible();
    await expect(panel.getByText('example.com')).toBeVisible();
    const popover = page.locator('.arco-trigger.arco-popover').filter({ has: panel });
    await expect(popover).toHaveCSS('pointer-events', 'auto');
    const sourceRow = panel.locator('button').filter({ hasText: 'source.md' });
    const sourceRowIsTopmost = await sourceRow.evaluate((row) => {
      const rect = row.getBoundingClientRect();
      const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(topmost && row.contains(topmost));
    });
    expect(sourceRowIsTopmost, 'resource popover must render above conversation messages').toBe(true);
    await page.screenshot({ path: 'tests/e2e/results/conversation-resources-panel.png' });

    await panel.getByText('output.md').click();
    await expect(page.locator('.preview-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('output.md').first()).toBeVisible();
    await page.screenshot({ path: 'tests/e2e/results/conversation-resources-preview.png' });
  });
});
