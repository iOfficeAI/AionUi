/**
 * E2E test helpers for Gemini conversations.
 */
import type { Page } from '@playwright/test';
import { invokeBridge } from './bridge';
import { goToGuid } from './navigation';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Check if Gemini OAuth credentials or API key are configured.
 * @param page Playwright page
 * @returns True if Gemini auth is available
 */
export async function checkGeminiAuth(page: Page): Promise<boolean> {
  // Check OAuth credentials file
  const oauthCredsPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
  if (fs.existsSync(oauthCredsPath)) {
    try {
      const content = fs.readFileSync(oauthCredsPath, 'utf-8');
      const creds = JSON.parse(content);
      if (creds && (creds.access_token || creds.refresh_token)) {
        return true;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check if Gemini providers are available via bridge
  try {
    const result = await invokeBridge<{ success: boolean; data?: { backend: string }[] }>(
      page,
      'acpConversation.getAvailableAgents',
      {},
      10_000
    );
    if (result.success && result.data) {
      const hasGemini = result.data.some((agent) => agent.backend === 'gemini');
      return hasGemini;
    }
  } catch {
    // Bridge call failed
  }

  return false;
}

/**
 * Create a Gemini conversation via IPC bridge.
 * @param page Playwright page
 * @param opts Conversation options
 * @returns Conversation ID
 */
export async function createGeminiConversationViaBridge(
  page: Page,
  opts: {
    name?: string;
    workspace?: string;
    model?: string;
    sessionMode?: string;
  }
): Promise<string> {
  const timestamp = Date.now();
  const name = opts.name || `E2E-gemini-${timestamp}`;

  const extra: Record<string, unknown> = {
    sessionMode: opts.sessionMode || 'default',
  };
  if (opts.workspace) {
    extra.workspace = opts.workspace;
  }
  if (opts.model) {
    extra.model = opts.model;
  }

  const result = await invokeBridge<{ id: string }>(
    page,
    'create-conversation',
    {
      type: 'gemini',
      name,
      extra,
      model: opts.model || 'auto',
    },
    15_000
  );
  return result.id;
}

/**
 * Send a message in a Gemini conversation via IPC bridge.
 * @param page Playwright page
 * @param conversationId Conversation ID
 * @param text Message text
 * @param opts Send options (files, etc.)
 */
export async function sendGeminiMessage(
  page: Page,
  conversationId: string,
  text: string,
  opts?: { files?: string[] }
): Promise<void> {
  const msgId = `e2e-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  await invokeBridge(
    page,
    'chat.send.message',
    {
      conversation_id: conversationId,
      content: text,
      msg_id: msgId,
      files: opts?.files || [],
    },
    120_000
  );
}

/**
 * Wait for Gemini AI reply to complete.
 * Polls messages table until an AI message (position='left') with status='finish' appears.
 * @param page Playwright page
 * @param conversationId Conversation ID
 * @param timeoutMs Timeout in milliseconds (default 90s, Gemini API is slower than binary)
 */
export async function waitForGeminiReply(page: Page, conversationId: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await invokeBridge<
      Array<{ id: string; position: string; status: string; content: string; type: string }>
    >(page, 'database.getConversationMessages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    });

    const aiMessage = messages.find((m) => m.position === 'left' && m.type === 'text');
    if (aiMessage && aiMessage.status === 'finish') {
      return;
    }

    // Wait 1s before next poll
    await page.waitForTimeout(1000);
  }

  throw new Error(`Gemini AI reply did not complete within ${timeoutMs}ms for conversation ${conversationId}`);
}

/**
 * Get Gemini conversation from database.
 * @param page Playwright page
 * @param conversationId Conversation ID
 * @returns Conversation object
 */
export async function getGeminiConversationDB(
  page: Page,
  conversationId: string
): Promise<{
  id: string;
  name: string;
  type: string;
  model: string;
  extra: Record<string, unknown>;
  status: string;
  created_at: number;
  updated_at: number;
}> {
  const conv = await invokeBridge<{
    id: string;
    name: string;
    type: string;
    model: string;
    extra: Record<string, unknown>;
    status: string;
    created_at: number;
    updated_at: number;
  }>(page, 'conversation.get', { id: conversationId }, 10_000);

  if (!conv) {
    throw new Error(`Conversation ${conversationId} not found in database`);
  }

  return conv;
}

/**
 * Clean up all E2E Gemini conversations from database.
 * Uses conversation.remove bridge (triggers FK CASCADE for messages).
 * @param page Playwright page
 */
export async function cleanupE2EGeminiConversations(page: Page): Promise<void> {
  // List all conversations for the default user
  const allConvs = await invokeBridge<Array<{ id: string; name: string; type: string }>>(
    page,
    'database.listConversations',
    { userId: 'system_default_user' },
    10_000
  ).catch(() => [] as Array<{ id: string; name: string; type: string }>);

  // Filter E2E conversations
  const e2eConvs = allConvs.filter((c) => c.name.startsWith('E2E-'));

  if (e2eConvs.length === 0) {
    return;
  }

  // Delete each conversation (conversation.remove triggers task cleanup + FK CASCADE)
  const errors: string[] = [];
  for (const conv of e2eConvs) {
    try {
      await invokeBridge(page, 'conversation.remove', { id: conv.id }, 10_000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to delete conversation ${conv.id}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Cleanup failed with ${errors.length} errors:\n${errors.join('\n')}`);
  }

  // Verify cleanup completed (all E2E conversations should be gone)
  const remaining = await invokeBridge<Array<{ id: string; name: string; type: string }>>(
    page,
    'database.listConversations',
    { userId: 'system_default_user' },
    10_000
  ).catch(() => [] as Array<{ id: string; name: string; type: string }>);

  const residual = remaining.filter((c) => c.name.startsWith('E2E-'));
  if (residual.length > 0) {
    throw new Error(`Cleanup verification failed: ${residual.length} E2E conversations remain`);
  }
}

/**
 * Create a temporary workspace directory for Gemini tests.
 * @param scenario Test scenario name (used in directory name)
 * @returns Absolute path to the temporary workspace
 */
export function createTempGeminiWorkspace(scenario: string): string {
  const timestamp = Date.now();
  const tempDir = path.join(os.tmpdir(), `e2e-chat-gemini-${scenario}-${timestamp}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Select Gemini agent on guid page.
 * @param page Playwright page
 */
export async function selectGeminiAgent(page: Page): Promise<void> {
  await goToGuid(page);
  const pill = page.locator('[data-agent-backend="gemini"]');
  await pill.waitFor({ state: 'visible', timeout: 15_000 });
  await pill.click();
  await page.waitForSelector('[data-agent-backend="gemini"][data-agent-selected="true"]', { timeout: 5_000 });
}

/**
 * Select Gemini model on guid page.
 * @param page Playwright page
 * @param modelLabel Model label (e.g., "Auto (Gemini 3)", "gemini-2.5-pro")
 */
export async function selectGeminiModel(page: Page, modelLabel: string): Promise<void> {
  const modelSelectorBtn = page.locator('[data-testid="guid-model-selector"]');
  await modelSelectorBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await modelSelectorBtn.click();

  // Wait for dropdown menu
  await page.waitForSelector('.arco-dropdown-menu', { timeout: 5_000 });

  // Click model option by text
  const modelOption = page.locator('.arco-dropdown-menu-item').filter({ hasText: new RegExp(modelLabel, 'i') });
  await modelOption.first().waitFor({ state: 'visible', timeout: 5_000 });
  await modelOption.first().click();

  // Wait for dropdown to close
  await page.waitForTimeout(500);
}

/**
 * Select Gemini mode (permission level) on guid page.
 * @param page Playwright page
 * @param mode Mode value (camelCase: 'default', 'autoEdit', 'yolo')
 */
export async function selectGeminiMode(page: Page, mode: string): Promise<void> {
  const modeSelector = page.locator('[data-testid="mode-selector"]');
  await modeSelector.waitFor({ state: 'visible', timeout: 10_000 });
  await modeSelector.click();

  // Wait for dropdown menu
  await page.waitForSelector('.arco-dropdown-menu', { timeout: 5_000 });

  // Click mode option by data-mode-value
  const modeOption = page.locator(`[data-mode-value="${mode}"]`);
  await modeOption.waitFor({ state: 'visible', timeout: 5_000 });
  await modeOption.click();

  // Wait for dropdown to close
  await page.waitForTimeout(500);
}
