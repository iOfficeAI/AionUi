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
 * Gemini is a native conversation type (not ACP), so auth goes through two paths:
 *   1. Google OAuth: ~/.gemini/oauth_creds.json with access_token or refresh_token
 *   2. API Key: a configured provider with platform 'gemini' / 'gemini-vertex-ai' /
 *      'gemini-with-google-auth' that has apiKey (or uses OAuth for google-auth variant)
 *      and at least one model entry.
 * @param page Playwright page
 * @returns True if Gemini auth is available
 */
export async function checkGeminiAuth(page: Page): Promise<boolean> {
  // Path 1: OAuth credentials file
  const oauthCredsPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
  if (fs.existsSync(oauthCredsPath)) {
    try {
      const content = fs.readFileSync(oauthCredsPath, 'utf-8');
      const creds = JSON.parse(content);
      if (creds && (creds.access_token || creds.refresh_token)) {
        return true;
      }
    } catch {
      // Ignore parse errors, fall through to API key check
    }
  }

  // Path 2: Check configured Gemini providers via bridge
  try {
    const providers = await invokeBridge<any[]>(page, 'mode.get-model-config', {}, 10_000);
    if (!Array.isArray(providers)) return false;

    const hasGeminiProvider = providers.some((p) => {
      const platform = String(p?.platform || '');
      const isGeminiPlatform =
        platform === 'gemini' || platform === 'gemini-vertex-ai' || platform === 'gemini-with-google-auth';
      if (!isGeminiPlatform) return false;
      if (p.enabled === false) return false;
      if (!Array.isArray(p.model) || p.model.length === 0) return false;
      // gemini-with-google-auth uses OAuth instead of apiKey
      if (platform === 'gemini-with-google-auth') return true;
      return typeof p.apiKey === 'string' && p.apiKey.length > 0;
    });

    return hasGeminiProvider;
  } catch {
    // Bridge call failed
    return false;
  }
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
      input: text,
      msg_id: msgId,
      files: opts?.files || [],
    },
    120_000
  );
}

/**
 * Wait for Gemini AI reply to complete.
 * Polls the conversation.status field (written to conversations table by GeminiAgentManager)
 * and the latest AI text message. Completion is signalled by:
 *   1. conversation.status === 'finished', AND
 *   2. The latest AI text message content has been stable for >= 2s between polls.
 *
 * Note: `status: 'finish'` on messages is a Gemini stream event type, not a DB status —
 * AI text messages do NOT have status='finish' in the DB. Use conversation.status instead.
 * @param page Playwright page
 * @param conversationId Conversation ID
 * @param timeoutMs Timeout in milliseconds (default 90s, Gemini API is slower than binary)
 */
export async function waitForGeminiReply(page: Page, conversationId: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastAiMessageLength = 0;
  let stableSince = 0;

  while (Date.now() < deadline) {
    const messages = await invokeBridge<
      Array<{ id: string; position: string; status: string; content: unknown; type: string }>
    >(page, 'database.get-conversation-messages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    }).catch(() => [] as Array<{ id: string; position: string; status: string; content: unknown; type: string }>);

    const aiTextMsgs = messages.filter((m) => m.position === 'left' && m.type === 'text');

    if (aiTextMsgs.length > 0) {
      const last = aiTextMsgs[aiTextMsgs.length - 1];
      // Gemini message.content can be either a string or an object { content: string }
      const currentText =
        typeof last.content === 'object' && last.content !== null
          ? (last.content as { content?: string }).content ?? ''
          : String(last.content ?? '');

      const conv = await getGeminiConversationDB(page, conversationId).catch(() => null);
      if (conv?.status === 'finished') {
        if (currentText.length === lastAiMessageLength && stableSince > 0 && Date.now() - stableSince >= 2000) {
          return;
        }
        if (currentText.length !== lastAiMessageLength) {
          lastAiMessageLength = currentText.length;
          stableSince = Date.now();
        } else if (stableSince === 0) {
          stableSince = Date.now();
        }
      } else {
        lastAiMessageLength = currentText.length;
        stableSince = 0; // reset while still running
      }
    }

    await page.waitForTimeout(500);
  }

  // Dump final DB state to help diagnose timeout cause
  const finalConv = await getGeminiConversationDB(page, conversationId).catch(() => null);
  const finalMsgs = await invokeBridge<
    Array<{ id: string; position: string; status: string; content: unknown; type: string }>
  >(page, 'database.get-conversation-messages', {
    conversation_id: conversationId,
    page: 0,
    pageSize: 100,
  }).catch(() => [] as Array<{ id: string; position: string; status: string; content: unknown; type: string }>);

  console.error(`[waitForGeminiReply TIMEOUT] conv.status=${finalConv?.status}, msg count=${finalMsgs.length}`);
  for (const m of finalMsgs) {
    const c =
      typeof m.content === 'object' && m.content !== null
        ? (m.content as { content?: string }).content
        : String(m.content ?? '');
    const preview = typeof c === 'string' ? c.slice(0, 120) : JSON.stringify(m.content).slice(0, 120);
    console.error(
      `[waitForGeminiReply TIMEOUT]   - pos=${m.position} type=${m.type} status=${m.status} preview="${preview}"`
    );
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
  }>(page, 'get-conversation', { id: conversationId }, 10_000);

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
    'database.get-user-conversations',
    { page: 0, pageSize: 1000 },
    10_000
  ).catch(() => [] as Array<{ id: string; name: string; type: string }>);

  // Filter E2E conversations
  const e2eConvs = allConvs.filter((c) => c.name.startsWith('E2E-'));

  if (e2eConvs.length === 0) {
    return;
  }

  // Delete each conversation (remove-conversation triggers task cleanup + FK CASCADE)
  const errors: string[] = [];
  for (const conv of e2eConvs) {
    try {
      await invokeBridge(page, 'remove-conversation', { id: conv.id }, 10_000);
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
    'database.get-user-conversations',
    { page: 0, pageSize: 1000 },
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
