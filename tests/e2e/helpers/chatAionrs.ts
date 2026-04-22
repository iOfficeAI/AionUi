/**
 * E2E test helpers for aionrs (Aion CLI) conversations.
 */
import type { Page } from '@playwright/test';
import { invokeBridge } from './bridge';
import { goToGuid } from './navigation';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Provider with model configuration.
 */
export type TProviderWithModel = {
  id: string;
  name: string;
  platform: string;
  apiKey?: string;
  baseUrl?: string;
  model: string[];
  useModel: string;
  enabled?: boolean;
  [key: string]: any;
};

/**
 * Aionrs test models structure.
 */
export interface AionrsTestModels {
  modelA: TProviderWithModel;
  modelB: TProviderWithModel | null;
}

/**
 * Resolve aionrs binary path using `which aionrs`.
 * @returns Binary path or null if not found
 */
export function resolveAionrsBinary(): string | null {
  try {
    const result = execSync('which aionrs', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && fs.existsSync(result)) {
      return result;
    }
  } catch {
    // Binary not found in PATH
  }
  return null;
}

/**
 * Get aionrs test models (modelA + optional modelB).
 * @param page Playwright page
 * @returns Test models object or null if no compatible provider available
 */
export async function getAionrsTestModels(page: Page): Promise<AionrsTestModels | null> {
  try {
    const providers = await invokeBridge<any[]>(page, 'mode.get-model-config', {});
    if (!Array.isArray(providers)) return null;

    const isAionrsCompatible = (p: any): boolean => {
      const platform = String(p.platform || '').toLowerCase();
      if (platform.includes('gemini-with-google-auth')) return false;
      // `gemini` (OpenAI-compat via /v1beta/openai) has a known aionrs first-send
      // silent-hang bug on preview models, so exclude to keep E2E deterministic.
      if (platform === 'gemini') return false;
      const baseUrl = String(p.baseUrl || '');
      // aionrs appends `/v1/chat/completions`. Compatible when:
      //  - non-openai-compat providers (anthropic/bedrock/vertex) — handled separately
      //  - platform is `new-api` (standard OpenAI-compatible endpoint)
      //  - platform is `custom` AND baseUrl ends with `/v1` (or `/v1/`) so stripTrailingV1 works
      if (['anthropic', 'bedrock', 'gemini-vertex-ai', 'new-api'].includes(platform)) return true;
      if (platform === 'custom') return /\/v1\/?$/.test(baseUrl);
      return false;
    };

    const candidates = providers.filter(
      (p) =>
        p.enabled !== false &&
        Array.isArray(p.model) &&
        p.model.length > 0 &&
        p.apiKey &&
        isAionrsCompatible(p)
    );

    if (candidates.length === 0) return null;

    // Prefer more reliable aionrs-compatible platforms first.
    // Gemini via OpenAI-compat can silently hang on preview models, so it's last.
    const platformPriority: Record<string, number> = {
      'custom': 0,       // Prefer user-configured OpenAI-compat endpoints (e.g. official OpenAI) first
      'anthropic': 1,
      'gemini': 2,
      'new-api': 3,      // Often uses relay gateways with rotating tokens — deprioritize
      'bedrock': 4,
      'gemini-vertex-ai': 5,
    };
    candidates.sort((a, b) => {
      const pa = platformPriority[String(a.platform || '').toLowerCase()] ?? 99;
      const pb = platformPriority[String(b.platform || '').toLowerCase()] ?? 99;
      return pa - pb;
    });

    const p1 = candidates[0];
    const modelA = { ...p1, useModel: p1.model[0] } as TProviderWithModel;

    let modelB: TProviderWithModel | null = null;
    if (p1.model.length >= 2) {
      modelB = { ...p1, useModel: p1.model[1] } as TProviderWithModel;
    } else if (candidates.length >= 2) {
      const p2 = candidates[1];
      modelB = { ...p2, useModel: p2.model[0] } as TProviderWithModel;
    }

    return { modelA, modelB };
  } catch {
    return null;
  }
}

/**
 * Resolve aionrs preconditions (binary + models).
 * @param page Playwright page
 * @returns Object with binary path and models, or null values if not available
 */
export async function resolveAionrsPreconditions(page: Page): Promise<{
  binary: string | null;
  models: AionrsTestModels | null;
}> {
  const binary = resolveAionrsBinary();
  const models = await getAionrsTestModels(page);
  return { binary, models };
}

/**
 * Create an aionrs conversation via IPC bridge.
 * @param page Playwright page
 * @param opts Conversation options
 * @returns Conversation ID
 */
export async function createAionrsConversationViaBridge(
  page: Page,
  opts: {
    name?: string;
    workspace: string;
    provider: TProviderWithModel;
    sessionMode?: string;
  }
): Promise<string> {
  const timestamp = Date.now();
  const name = opts.name || `E2E-aionrs-${timestamp}`;
  const result = await invokeBridge<{ id: string } | undefined>(
    page,
    'create-conversation',
    {
      type: 'aionrs',
      name,
      model: opts.provider,
      extra: {
        workspace: opts.workspace,
        sessionMode: opts.sessionMode || 'default',
      },
    },
    15_000
  );
  if (!result?.id) {
    throw new Error(
      `createAionrsConversationViaBridge: bridge returned no conversation id — check provider apiKey and platform fields`
    );
  }
  return result.id;
}

/**
 * Send a message in an aionrs conversation via IPC bridge.
 * @param page Playwright page
 * @param conversationId Conversation ID
 * @param text Message text
 * @param opts Send options (files, etc.)
 */
export async function sendAionrsMessage(
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
    10_000
  );
}

/**
 * Wait for aionrs AI reply to finish.
 * Polls the conversation until status='finished' and AI message content is stable.
 * @param page Playwright page
 * @param conversationId Conversation ID
 * @param timeoutMs Timeout in milliseconds (default 90s)
 */
export async function waitForAionrsReply(page: Page, conversationId: string, timeoutMs = 150_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastAiMessageLength = 0;
  let stableSince = 0;

  while (Date.now() < deadline) {
    const messages = await getAionrsMessages(page, conversationId);
    const aiTextMsgs = messages.filter((m) => m.position === 'left' && m.type === 'text');

    if (aiTextMsgs.length > 0) {
      const last = aiTextMsgs[aiTextMsgs.length - 1];
      // content is already an object (rowToMessage does JSON.parse)
      const currentText =
        typeof last.content === 'object' && last.content !== null
          ? (last.content as { content?: string }).content ?? ''
          : String(last.content ?? '');

      // Primary signal: conv.status === 'finished' + has AI text + content stable for 2s
      const conv = await getAionrsConversationDB(page, conversationId);
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
  const finalConv = await getAionrsConversationDB(page, conversationId);
  const finalMsgs = await getAionrsMessages(page, conversationId);
  console.error(`[waitForAionrsReply TIMEOUT] conv.status=${finalConv?.status}, msg count=${finalMsgs.length}`);
  for (const m of finalMsgs) {
    const c = typeof m.content === 'object' ? (m.content as any)?.content : String(m.content);
    const preview = typeof c === 'string' ? c.slice(0, 120) : JSON.stringify(m.content).slice(0, 120);
    console.error(`[waitForAionrsReply TIMEOUT]   - pos=${m.position} type=${m.type} status=${m.status} preview="${preview}"`);
  }
  throw new Error(`Aionrs reply timeout after ${timeoutMs}ms for conversation ${conversationId}`);
}

/**
 * Get aionrs conversation from database via IPC bridge.
 * @param page Playwright page
 * @param conversationId Conversation ID
 * @returns Conversation object or null if not found
 */
export async function getAionrsConversationDB(page: Page, conversationId: string): Promise<any> {
  try {
    const result = await invokeBridge(page, 'get-conversation', { id: conversationId }, 5_000);
    return result;
  } catch {
    return null;
  }
}

/**
 * Get all messages for an aionrs conversation from database.
 * @param page Playwright page
 * @param conversationId Conversation ID
 * @returns Array of message objects
 */
export async function getAionrsMessages(page: Page, conversationId: string): Promise<any[]> {
  try {
    const result = await invokeBridge<any>(
      page,
      'database.get-conversation-messages',
      { conversation_id: conversationId, page: 0, pageSize: 100 },
      10_000
    );
    return Array.isArray(result) ? result : (result?.data ?? []);
  } catch {
    return [];
  }
}

/**
 * Clean up all E2E aionrs conversations from database.
 * Deletes conversations with name pattern 'E2E-aionrs-%'.
 * Throws error if deletion fails (no silent failures).
 * @param page Playwright page
 */
export async function cleanupE2EAionrsConversations(page: Page): Promise<void> {
  // Get all conversations using database.get-user-conversations
  const conversations = await invokeBridge<any[]>(
    page,
    'database.get-user-conversations',
    { page: 0, pageSize: 1000 },
    10_000
  );

  if (!conversations || !Array.isArray(conversations)) {
    throw new Error('Failed to get conversations for cleanup');
  }

  // Filter E2E conversations
  const e2eConversations = conversations.filter((conv: any) => conv.name?.startsWith('E2E-aionrs-'));

  // Delete each E2E conversation using remove-conversation bridge
  for (const conv of e2eConversations) {
    await invokeBridge(page, 'remove-conversation', { id: conv.id }, 5_000);
  }
}

/**
 * Create a temporary workspace directory for E2E tests.
 * @param scenario Test scenario name (e.g., 'basic', 'upload')
 * @returns Object with path and cleanup function
 */
export function createTempWorkspace(scenario: string): { path: string; cleanup: () => void } {
  const timestamp = Date.now();
  const dirPath = `/tmp/e2e-chat-aionrs-${scenario}-${timestamp}`;
  fs.mkdirSync(dirPath, { recursive: true });

  return {
    path: dirPath,
    cleanup: () => {
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } catch (err) {
        console.warn(`Failed to cleanup temp workspace ${dirPath}:`, err);
      }
    },
  };
}

/**
 * Select aionrs agent on guid page.
 * @param page Playwright page
 */
export async function selectAionrsAgent(page: Page): Promise<void> {
  await goToGuid(page);
  const pill = page.locator('[data-agent-pill="true"][data-agent-backend="aionrs"]');
  await pill.waitFor({ state: 'visible', timeout: 15_000 });
  await pill.click();
  await page.waitForSelector('[data-agent-pill="true"][data-agent-backend="aionrs"][data-agent-selected="true"]', {
    timeout: 5_000,
  });
}

/**
 * Select aionrs model from dropdown.
 * Can be used on guid page or conversation page.
 * @param page Playwright page
 * @param modelId Model ID (e.g., 'claude-opus-4-7')
 */
export async function selectAionrsModel(page: Page, modelId: string): Promise<void> {
  const modelBtn = page.locator('[data-testid="aionrs-model-selector"]');
  await modelBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await modelBtn.click();

  const modelOption = page.locator(`[data-testid="aionrs-model-option-${modelId}"]`);
  await modelOption.waitFor({ state: 'visible', timeout: 5_000 });
  await modelOption.click();

  // Wait for dropdown to close
  await page.waitForTimeout(500);
}

/**
 * Select aionrs mode (permission level) from dropdown.
 * @param page Playwright page
 * @param mode Mode value ('default', 'auto_edit', 'yolo')
 */
export async function selectAionrsMode(page: Page, mode: string): Promise<void> {
  const modeBtn = page.locator('[data-testid="agent-mode-selector-aionrs"]');
  await modeBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await modeBtn.click();

  const modeOption = page.locator(`[data-testid="aionrs-mode-option-${mode}"]`);
  await modeOption.waitFor({ state: 'visible', timeout: 5_000 });
  await modeOption.click();

  // Wait for dropdown to close
  await page.waitForTimeout(500);
}

/**
 * Attach a folder to aionrs conversation by clicking the file attach button.
 * NOTE: This requires the file tree or folder selector UI to be available.
 * For testing purposes, we skip actual folder selection and just verify the button exists.
 * @param page Playwright page
 * @param folderPath Absolute path to folder (currently not used, reserved for future UI interaction)
 */
export async function attachAionrsFolder(page: Page, folderPath: string): Promise<void> {
  // For now, just verify the attach button exists and is clickable
  // Real folder attachment requires either:
  // 1. Mocking the file dialog (electronApp.evaluate)
  // 2. Programmatic injection via renderer context
  // TODO: Implement actual folder attachment when UI flow is clarified
  const attachBtn = page.locator('[data-testid="aionrs-attach-folder-btn"]');
  await attachBtn.waitFor({ state: 'visible', timeout: 10_000 });

  // Skip actual click for smoke test (would trigger file dialog)
  console.log(`[attachAionrsFolder] Attach button found (folder: ${folderPath})`);
}

/**
 * Upload files to aionrs conversation using file input.
 * @param page Playwright page
 * @param filePaths Array of absolute file paths
 */
export async function uploadAionrsFiles(page: Page, filePaths: string[]): Promise<void> {
  const fileInput = page.locator('[data-testid="aionrs-file-upload-input"]');
  await fileInput.setInputFiles(filePaths);

  // Wait for file preview tags to appear
  await page.waitForSelector('[data-testid^="aionrs-file-tag-"]', { timeout: 5_000 });
}
