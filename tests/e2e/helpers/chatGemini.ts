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
 * Note: `model` is stored as either a string ('auto') or a serialized provider
 * object (e.g. `{ platform, apiKey, useModel, model, baseUrl, ... }`). Tests must
 * use `readConvModelName()` / `readConvExtra()` to normalize before asserting.
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
  model: unknown;
  extra: unknown;
  status: string;
  created_at: number;
  updated_at: number;
}> {
  const conv = await invokeBridge<{
    id: string;
    name: string;
    type: string;
    model: unknown;
    extra: unknown;
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
 * Extract the resolved model name from a conversation.
 * Handles all three stored shapes:
 *   1. string 'auto' / 'gemini-2.5-pro' — legacy raw value
 *   2. string JSON of provider object — after serialization round-trip
 *   3. object { useModel, model, platform, ... } — provider with selected model
 * Falls back to checking `extra.model` when the top-level `model` is not informative.
 *
 * @param conv Conversation object returned by getGeminiConversationDB
 * @returns Normalized model name (e.g. 'auto', 'gemini-2.5-pro'), or empty string if unresolvable
 */
export function readConvModelName(conv: { model: unknown; extra: unknown }): string {
  const rawModel = conv.model;
  let fromModel = '';
  if (typeof rawModel === 'string') {
    // Could be a plain name or a JSON-stringified provider
    if (rawModel.startsWith('{') || rawModel.startsWith('[')) {
      try {
        const parsed = JSON.parse(rawModel) as { useModel?: string; model?: unknown };
        fromModel = typeof parsed?.useModel === 'string' ? parsed.useModel : '';
      } catch {
        fromModel = rawModel;
      }
    } else {
      fromModel = rawModel;
    }
  } else if (rawModel && typeof rawModel === 'object') {
    const obj = rawModel as { useModel?: unknown; model?: unknown };
    if (typeof obj.useModel === 'string') {
      fromModel = obj.useModel;
    } else if (typeof obj.model === 'string') {
      fromModel = obj.model;
    }
  }
  if (fromModel) return fromModel;

  // Fallback: check extra.model
  const extra = readConvExtra(conv);
  const extraModel = extra.model;
  if (typeof extraModel === 'string') return extraModel;
  if (extraModel && typeof extraModel === 'object') {
    const em = extraModel as { useModel?: unknown };
    if (typeof em.useModel === 'string') return em.useModel;
  }
  return '';
}

/**
 * Parse conversation.extra into a plain object regardless of storage shape
 * (either JSON string or already-deserialized object).
 * @param conv Conversation object
 * @returns Normalized extra record
 */
export function readConvExtra(conv: { extra: unknown }): Record<string, unknown> {
  const raw = conv.extra;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
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
 * Gemini test models resolved from the local environment (first enabled gemini
 * provider). Mirrors the aionrs `AionrsTestModels` pattern.
 */
export interface GeminiTestModels {
  provider: {
    platform: string;
    apiKey?: string;
    model: string[];
    useModel: string;
    baseUrl?: string;
    [key: string]: unknown;
  };
  modelA: string; // First model in the provider's list
  modelB: string | null; // Second model, or null if provider has only one
}

/**
 * Get gemini test models from an enabled gemini provider on the local machine.
 * Returns the first configured provider with at least one model.
 *
 * @param page Playwright page
 * @returns Resolved test models, or null if no usable provider is available.
 */
export async function getGeminiTestModels(page: Page): Promise<GeminiTestModels | null> {
  try {
    const providers = await invokeBridge<unknown[]>(page, 'mode.get-model-config', {}, 10_000);
    if (!Array.isArray(providers)) return null;

    const usable = providers.find((raw) => {
      const p = raw as { platform?: unknown; enabled?: unknown; model?: unknown; apiKey?: unknown };
      const platform = String(p?.platform || '');
      const isGemini =
        platform === 'gemini' || platform === 'gemini-vertex-ai' || platform === 'gemini-with-google-auth';
      if (!isGemini) return false;
      if (p.enabled === false) return false;
      if (!Array.isArray(p.model) || p.model.length === 0) return false;
      if (platform === 'gemini-with-google-auth') return true;
      return typeof p.apiKey === 'string' && (p.apiKey as string).length > 0;
    }) as GeminiTestModels['provider'] | undefined;

    if (!usable) return null;

    const models = usable.model as string[];
    const modelA = models[0];
    const modelB = models.length >= 2 ? models[1] : null;
    return {
      provider: { ...usable, useModel: modelA },
      modelA,
      modelB,
    };
  } catch {
    return null;
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
 * Detect whether the renderer is running in Electron Desktop (vs. WebUI) mode.
 * In the E2E harness, electronAPI is always present; fall back to checking that
 * `show-open` is functional (desktop-only bridge).
 * @param page Playwright page
 * @returns True if desktop
 */
export async function isElectronDesktop(page: Page): Promise<boolean> {
  const hasAPI = await page.evaluate(() => !!(window as unknown as { electronAPI?: unknown }).electronAPI);
  return hasAPI;
}

/**
 * Mock the `show-open` bridge to return a fixed list of paths.
 * This intercepts the native file/folder dialog so tests can attach
 * folders or upload files without driver-level OS dialog automation.
 * Must be called AFTER navigation (page-scoped patch).
 * @param page Playwright page
 * @param paths Paths to return from the next `show-open` invocation
 */
async function mockShowOpenReturn(page: Page, paths: string[]): Promise<void> {
  await page.evaluate((returnPaths) => {
    const api = (window as unknown as { electronAPI?: { emit?: (name: string, data: unknown) => Promise<unknown>; on?: (cb: (p: { event: unknown; value: unknown }) => void) => () => void } }).electronAPI;
    if (!api || !api.emit) return;
    // Save original emit only once.
    const win = window as unknown as {
      __originalEmit?: (name: string, data: unknown) => Promise<unknown>;
      __showOpenQueue?: string[][];
    };
    if (!win.__originalEmit) {
      win.__originalEmit = api.emit.bind(api);
    }
    win.__showOpenQueue = win.__showOpenQueue || [];
    win.__showOpenQueue.push(returnPaths);

    // Wrap emit: intercept subscribe-show-open by synthesizing a callback event
    api.emit = async function patchedEmit(name: string, data: unknown) {
      if (name === 'subscribe-show-open') {
        const payload = data as { id?: string };
        const id = payload?.id;
        const queue = (window as unknown as { __showOpenQueue?: string[][] }).__showOpenQueue || [];
        const resolvedPaths = queue.length > 0 ? queue.shift()! : [];
        // Simulate the provider callback on next tick
        setTimeout(() => {
          // Dispatch a mock "on" event via the existing listeners.
          // We can't call listeners directly (they're captured inside api.on),
          // so send a synthetic callback via the real transport if possible.
          // Fallback: stash the response on window for poll-based checks.
          (window as unknown as { __lastShowOpenId?: string; __lastShowOpenPaths?: string[] }).__lastShowOpenId = id;
          (window as unknown as { __lastShowOpenId?: string; __lastShowOpenPaths?: string[] }).__lastShowOpenPaths = resolvedPaths;
          // Best-effort: try to locate electronAPI listener registry and fire
          const apiAny = api as unknown as { _listeners?: Set<(p: { event: unknown; value: unknown }) => void> };
          const listeners = apiAny._listeners;
          if (listeners && listeners.size > 0) {
            const evtName = `subscribe.callback-show-open${id}`;
            const listenerArr = Array.from(listeners);
            for (const l of listenerArr) {
              try {
                l({ event: evtName, value: JSON.stringify({ name: evtName, data: resolvedPaths }) });
              } catch {
                /* swallow */
              }
            }
          }
        }, 10);
        return Promise.resolve();
      }
      return win.__originalEmit!(name, data);
    };
  }, paths);
}

/**
 * Attach a folder as workspace via the guid `workspace-selector-btn`.
 * Requires pre-mocking the underlying `show-open` bridge (done automatically).
 * NOTE: Due to preload boundaries, dialog mock may fail silently on some
 * harness versions — in that case, callers should fall back to using
 * `createGeminiConversationViaBridge({ workspace })` for deterministic tests.
 * @param page Playwright page
 * @param folderPath Absolute folder path to return from the dialog
 */
export async function attachGeminiFolder(page: Page, folderPath: string): Promise<void> {
  await mockShowOpenReturn(page, [folderPath]);
  const btn = page.locator('[data-testid="workspace-selector-btn"]');
  await btn.waitFor({ state: 'visible', timeout: 10_000 });
  await btn.click();
  // Wait for the workspace path to appear in the UI (best-effort)
  await page.waitForTimeout(1000);
}

/**
 * Upload files via the guid file-upload button. In desktop mode this triggers
 * the show-open bridge (mocked); in webui mode, uses the hidden file input.
 * @param page Playwright page
 * @param filePaths Absolute file paths
 */
export async function uploadGeminiFiles(page: Page, filePaths: string[]): Promise<void> {
  // Detect webui (hidden file input) vs desktop (dialog) by checking DOM presence.
  const hasHiddenInput = await page.evaluate(() => !!document.querySelector('input[type="file"]'));

  if (hasHiddenInput) {
    // Webui path: use playwright setInputFiles on hidden <input type=file>.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(filePaths);
    await page.waitForTimeout(800);
    return;
  }

  // Desktop path: mock show-open dialog and click the "File" menu item.
  await mockShowOpenReturn(page, filePaths);
  const uploadBtn = page.locator('[data-testid="file-upload-btn"]');
  await uploadBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await uploadBtn.hover();
  await page.waitForTimeout(300);
  // Click the "file" menu item from the dropdown
  const fileItem = page.locator('.arco-dropdown-menu-item').filter({ hasText: /file|host/i }).first();
  const visible = await fileItem.isVisible().catch(() => false);
  if (visible) {
    await fileItem.click();
    await page.waitForTimeout(1000);
  } else {
    // Fallback: click the button (menu may auto-select first item)
    await uploadBtn.click();
    await page.waitForTimeout(1000);
  }
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
