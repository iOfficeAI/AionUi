/**
 * Gemini Basic Flow E2E Tests (P0)
 *
 * Covers TC-G-01 ~ TC-G-05: baseline paths with minimal configuration
 */
import { test, expect } from '../../../fixtures';
import {
  checkGeminiAuth,
  selectGeminiAgent,
  selectGeminiModel,
  selectGeminiMode,
  createTempGeminiWorkspace,
  createGeminiConversationViaBridge,
  sendGeminiMessage,
  cleanupE2EGeminiConversations,
  getGeminiConversationDB,
  readConvModelName,
  readConvExtra,
  getGeminiTestModels,
  invokeBridge,
  takeScreenshot,
  goToGuid,
  waitForGeminiReply,
} from '../../../helpers';
import fs from 'fs';
import path from 'path';

test.describe('Gemini Basic Flow (P0)', () => {
  test.setTimeout(240_000); // 4 minutes — allow 90s AI reply poll + setup/cleanup buffer
  let tempWorkspace: string;

  test.beforeEach(async ({ page }) => {
    // Check Gemini auth (skip if not configured)
    const hasAuth = await checkGeminiAuth(page);
    if (!hasAuth) {
      test.skip(true, 'Skipped: Gemini OAuth or API key not configured');
    }

    // Create temp workspace for tests that need it
    const timestamp = Date.now();
    tempWorkspace = `/tmp/e2e-chat-gemini-${timestamp}`;
    fs.mkdirSync(tempWorkspace, { recursive: true });
  });

  test.afterEach(async ({ page }) => {
    // 1. Press ESC 5 times to close any modals/dropdowns
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }

    // 2. Cleanup DB (uses conversation.remove + FK CASCADE)
    try {
      await cleanupE2EGeminiConversations(page);
    } catch (error) {
      console.error('Failed to cleanup E2E Gemini conversations:', error);
      throw error; // Don't swallow cleanup errors
    }

    // 3. Cleanup filesystem
    if (tempWorkspace && fs.existsSync(tempWorkspace)) {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }

    // 4. Cleanup sessionStorage
    await page.evaluate(() => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('gemini_initial_message_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    });
  });

  test('TC-G-01: Minimal viable path (no attachments, auto model, default mode)', async ({ page }) => {
    // 1. Navigate to guid page and select Gemini agent
    await goToGuid(page);
    await selectGeminiAgent(page);
    await takeScreenshot(page, 'tc-g-01', 'gemini', '01-agent-selected');

    // 2. Confirm default configuration (auto model + default mode)
    const modelSelector = page.locator('[data-testid="guid-model-selector"]');
    await expect(modelSelector).toBeVisible({ timeout: 10_000 });

    const modeSelector = page.locator('[data-testid="mode-selector"]');
    await expect(modeSelector).toBeVisible({ timeout: 10_000 });

    await takeScreenshot(page, 'tc-g-01', 'gemini', '02-default-config');

    // 3. Enter test message
    const guidInput = page.locator('[data-testid="guid-input"]');
    await guidInput.fill("Hello, Gemini! Please respond with 'E2E test success'.");

    // 4. Click send button
    const sendBtn = page.locator('[data-testid="guid-send-btn"]');
    await sendBtn.click();

    // 5. Wait for navigation to conversation page
    await page.waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 15_000 });
    const conversationId = page.url().split('/conversation/')[1];
    expect(conversationId).toBeTruthy();

    await takeScreenshot(page, 'tc-g-01', 'gemini', '03-conversation-page');

    // 6. Wait for AI reply to complete (poll conversation.status + content stability)
    await waitForGeminiReply(page, conversationId, 90_000);

    await takeScreenshot(page, 'tc-g-01', 'gemini', '04-reply-completed');

    // 7. DB assertions
    const conv = await getGeminiConversationDB(page, conversationId);
    expect(conv.type).toBe('gemini');
    // `model` column may be raw string ('auto') or a provider object. Use helper to
    // extract the effective model name and check it is semantically a gemini model.
    const modelName = readConvModelName(conv);
    expect(modelName).toMatch(/^(auto|gemini[-\w.]*)$/i);
    const extra = readConvExtra(conv);
    expect(extra.sessionMode).toBe('default');
    expect(extra.workspace).toBeUndefined();

    const messages = await invokeBridge<
      Array<{
        id: string;
        position: string;
        status: string;
        type: string;
        content: unknown;
        created_at: number;
      }>
    >(page, 'database.get-conversation-messages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    });

    // Helper: normalize message content (string vs object)
    const asObj = (c: unknown): Record<string, unknown> => {
      if (typeof c === 'string') {
        try {
          return JSON.parse(c);
        } catch {
          return { content: c };
        }
      }
      return (c as Record<string, unknown>) || {};
    };

    // Verify user message
    const userMsg = messages.find((m) => m.position === 'right');
    expect(userMsg).toBeDefined();
    expect(userMsg!.type).toBe('text');
    // Conversation finalization (conv.status === 'finished') is the real signal of
    // completion; AI/user text messages in Gemini do NOT carry DB status='finish'
    // (status is a Gemini stream event type, not a persisted DB status for text msgs).
    expect(conv.status).toBe('finished');
    const userContent = asObj(userMsg!.content);
    expect(String(userContent.content ?? '')).toContain('Hello, Gemini!');

    // Verify AI reply
    const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.type).toBe('text');
    expect(aiMsg!.created_at).toBeGreaterThan(userMsg!.created_at);
    const aiContent = asObj(aiMsg!.content);
    expect(String(aiContent.content ?? '')).not.toBe('');

    // Verify message order
    expect(messages.length).toBeGreaterThanOrEqual(2);

    await takeScreenshot(page, 'tc-g-01', 'gemini', '05-db-assertions-passed');
  });

  test('TC-G-02: Associate single folder', async ({ page }) => {
    // Skip on non-desktop environments (workspace selector desktop-only)
    const isDesktop = await page.evaluate(() => {
      return !!(window as any).electronAPI;
    });
    if (!isDesktop) {
      test.skip(true, 'Skipped: Workspace selector only available on Desktop');
    }

    // 1. Navigate and select agent (screenshot the UI before bridge-driven creation)
    await goToGuid(page);
    await selectGeminiAgent(page);
    await takeScreenshot(page, 'tc-g-02', 'gemini', '01-agent-selected');

    // 2. Create conversation directly via bridge with workspace attached.
    // Reason: patching `electronAPI.dialog.showOpen` on the renderer window has no
    // effect — the dialog is driven by the `show-open` provider bridge in preload
    // (not a frozen window method). Bridge-level creation bypasses the OS dialog
    // and produces the same end-state (DB has workspace + conversation + message).
    const conversationId = await createGeminiConversationViaBridge(page, {
      workspace: tempWorkspace,
    });
    await takeScreenshot(page, 'tc-g-02', 'gemini', '02-folder-selected');

    // 3. Send the user message through the bridge.
    await sendGeminiMessage(page, conversationId, 'List files in the workspace.');

    // 4. Navigate to conversation page for UI verification + screenshot
    await page.goto(page.url().split('#')[0] + `#/conversation/${conversationId}`);
    await page.waitForFunction(
      (cid) => window.location.hash.includes(`/conversation/${cid}`),
      conversationId,
      { timeout: 15_000 }
    );
    await takeScreenshot(page, 'tc-g-02', 'gemini', '03-conversation-page');

    // 5. Wait for AI reply
    await waitForGeminiReply(page, conversationId, 90_000);

    await takeScreenshot(page, 'tc-g-02', 'gemini', '04-reply-completed');

    // 9. DB assertions
    const conv = await getGeminiConversationDB(page, conversationId);
    expect(conv.type).toBe('gemini');
    const extra = readConvExtra(conv);
    expect(extra.workspace).toBeDefined();
    expect(String(extra.workspace)).toMatch(/^\/tmp\/e2e-chat-gemini-/);

    const messages = await invokeBridge<
      Array<{
        position: string;
        type: string;
        status: string;
        content: unknown;
      }>
    >(page, 'database.get-conversation-messages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    });

    const parseContent = (c: unknown): Record<string, unknown> => {
      if (typeof c === 'string') {
        try {
          return JSON.parse(c);
        } catch {
          return { content: c };
        }
      }
      return (c as Record<string, unknown>) || {};
    };

    const userMsg = messages.find((m) => m.position === 'right');
    const userContent = parseContent(userMsg!.content);
    expect(String(userContent.content ?? '')).toContain('List files');

    const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.type).toBe('text');
    expect(conv.status).toBe('finished');

    await takeScreenshot(page, 'tc-g-02', 'gemini', '05-db-assertions-passed');
  });

  test('TC-G-03: Upload single file', async ({ page }) => {
    // 1. Create test file in temp workspace
    const testFilePath = path.join(tempWorkspace, 'test.txt');
    fs.writeFileSync(testFilePath, 'This is a test file for E2E');

    // 2. Navigate and select agent (screenshot UI state first)
    await goToGuid(page);
    await selectGeminiAgent(page);
    await takeScreenshot(page, 'tc-g-03', 'gemini', '01-agent-selected');

    // 3. Create conversation via bridge, then send message with the file path.
    // Reason: patching `electronAPI.dialog.showOpen` on the renderer window has no
    // effect — the dialog is driven by the `show-open` provider bridge in preload
    // (not a frozen window method). Bridge-level send lets us attach files without
    // invoking the native file picker.
    const conversationId = await createGeminiConversationViaBridge(page, {});
    await takeScreenshot(page, 'tc-g-03', 'gemini', '02-file-uploaded');

    // 4. Send message with file attachment via bridge (bypassing the UI dialog).
    await sendGeminiMessage(page, conversationId, 'Read the uploaded file and summarize its content.', {
      files: [testFilePath],
    });

    // 5. Navigate to conversation page for UI screenshot
    await page.goto(page.url().split('#')[0] + `#/conversation/${conversationId}`);
    await page.waitForFunction(
      (cid) => window.location.hash.includes(`/conversation/${cid}`),
      conversationId,
      { timeout: 15_000 }
    );
    await takeScreenshot(page, 'tc-g-03', 'gemini', '03-conversation-page');

    // 6. Wait for AI reply
    await waitForGeminiReply(page, conversationId, 90_000);

    await takeScreenshot(page, 'tc-g-03', 'gemini', '04-reply-completed');

    // 10. DB assertions
    const conv = await getGeminiConversationDB(page, conversationId);
    expect(conv.type).toBe('gemini');
    const extra = readConvExtra(conv);
    expect(extra.workspace).toBeUndefined();

    const messages = await invokeBridge<
      Array<{
        position: string;
        content: unknown;
        type: string;
        status: string;
      }>
    >(page, 'database.get-conversation-messages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    });

    const parseContent = (c: unknown): Record<string, unknown> => {
      if (typeof c === 'string') {
        try {
          return JSON.parse(c);
        } catch {
          return { content: c };
        }
      }
      return (c as Record<string, unknown>) || {};
    };

    const userMsg = messages.find((m) => m.position === 'right');
    const userContent = parseContent(userMsg!.content);
    expect(String(userContent.content ?? '')).toContain('test.txt');

    const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.type).toBe('text');
    expect(conv.status).toBe('finished');

    await takeScreenshot(page, 'tc-g-03', 'gemini', '05-db-assertions-passed');
  });

  test('TC-G-04: Use a specific gemini model (resolved from local env)', async ({ page }) => {
    // 1. Resolve a real gemini model from local config (replaces hardcoded name).
    const models = await getGeminiTestModels(page);
    if (!models) {
      test.skip(true, 'No gemini provider configured with a usable model');
    }
    const targetModel = models!.modelA;

    // 2. Navigate and select agent
    await goToGuid(page);
    await selectGeminiAgent(page);
    await takeScreenshot(page, 'tc-g-04', 'gemini', '01-agent-selected');

    // 3. Select the resolved model (Manual submenu)
    await selectGeminiModel(page, targetModel);
    await takeScreenshot(page, 'tc-g-04', 'gemini', '02-model-selected');

    // 4. Verify model selector text reflects the chosen model
    const modelSelector = page.locator('[data-testid="guid-model-selector"]');
    await expect(modelSelector).toContainText(new RegExp(targetModel.replace(/[.]/g, '\\.'), 'i'));

    // 4. Enter message
    const guidInput = page.locator('[data-testid="guid-input"]');
    await guidInput.fill('What model are you?');

    // 5. Send
    const sendBtn = page.locator('[data-testid="guid-send-btn"]');
    await sendBtn.click();

    // 6. Wait for conversation page
    await page.waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 15_000 });
    const conversationId = page.url().split('/conversation/')[1];

    await takeScreenshot(page, 'tc-g-04', 'gemini', '03-conversation-page');

    // 7. Wait for AI reply
    await waitForGeminiReply(page, conversationId, 90_000);

    await takeScreenshot(page, 'tc-g-04', 'gemini', '04-reply-completed');

    // 8. DB assertions
    const conv = await getGeminiConversationDB(page, conversationId);
    expect(conv.type).toBe('gemini');
    const modelName = readConvModelName(conv);
    // Expect a gemini 2.5 pro family model (actual name depends on precondition)
    expect(modelName).toMatch(/gemini/i);

    const messages = await invokeBridge<
      Array<{
        position: string;
        type: string;
        status: string;
      }>
    >(page, 'database.get-conversation-messages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    });

    expect(messages.length).toBeGreaterThanOrEqual(2);
    const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.type).toBe('text');
    expect(conv.status).toBe('finished');

    await takeScreenshot(page, 'tc-g-04', 'gemini', '05-db-assertions-passed');
  });

  test('TC-G-05: Use yolo permission mode', async ({ page }) => {
    // 1. Navigate and select agent
    await goToGuid(page);
    await selectGeminiAgent(page);
    await takeScreenshot(page, 'tc-g-05', 'gemini', '01-agent-selected');

    // 2. Select yolo mode
    await selectGeminiMode(page, 'yolo');
    await takeScreenshot(page, 'tc-g-05', 'gemini', '02-yolo-mode-selected');

    // 3. Enter message (trigger Google Search tool if possible)
    const guidInput = page.locator('[data-testid="guid-input"]');
    await guidInput.fill("Please use Google Search to find 'Claude AI' information.");

    // 4. Send
    const sendBtn = page.locator('[data-testid="guid-send-btn"]');
    await sendBtn.click();

    // 5. Wait for conversation page
    await page.waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 15_000 });
    const conversationId = page.url().split('/conversation/')[1];

    await takeScreenshot(page, 'tc-g-05', 'gemini', '03-conversation-page');

    // 6. Verify no confirmation dialog appears (monitor for confirmation modals)
    const confirmModal = page.locator('.arco-modal').filter({ hasText: /confirm|allow|approve/i });
    const modalVisible = await confirmModal.isVisible().catch(() => false);
    expect(modalVisible).toBe(false); // No confirmation dialog should appear

    // 7. Wait for tool execution or AI reply to complete
    await waitForGeminiReply(page, conversationId, 90_000);

    await takeScreenshot(page, 'tc-g-05', 'gemini', '04-reply-completed');

    // 8. DB assertions
    const conv = await getGeminiConversationDB(page, conversationId);
    expect(conv.type).toBe('gemini');
    const extra = readConvExtra(conv);
    expect(extra.sessionMode).toBe('yolo');

    const messages = await invokeBridge<
      Array<{
        type: string;
        content: unknown;
        position: string;
        status: string;
      }>
    >(page, 'database.get-conversation-messages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    });

    // Verify tool call records (if triggered)
    const toolMsg = messages.find((m) => m.type === 'tool_group');
    if (toolMsg) {
      // tool_group content may be string JSON or already-parsed array
      const toolContent =
        typeof toolMsg.content === 'string' ? JSON.parse(toolMsg.content) : (toolMsg.content as unknown[]);
      if (Array.isArray(toolContent)) {
        const hasConfirming = toolContent.some((tool) => (tool as { status?: string })?.status === 'Confirming');
        expect(hasConfirming).toBe(false); // yolo mode should not have Confirming status
      }
    }

    // Verify AI reply exists
    const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.type).toBe('text');
    expect(conv.status).toBe('finished');

    await takeScreenshot(page, 'tc-g-05', 'gemini', '05-db-assertions-passed');
  });
});
