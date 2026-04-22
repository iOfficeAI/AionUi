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
  cleanupE2EGeminiConversations,
  getGeminiConversationDB,
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
    expect(conv.model).toBe('auto');
    expect(conv.extra.sessionMode).toBe('default');
    expect(conv.extra.workspace).toBeUndefined();

    const messages = await invokeBridge<
      Array<{
        id: string;
        position: string;
        status: string;
        type: string;
        content: string;
        created_at: number;
      }>
    >(page, 'database.get-conversation-messages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    });

    // Verify user message
    const userMsg = messages.find((m) => m.position === 'right');
    expect(userMsg).toBeDefined();
    expect(userMsg!.type).toBe('text');
    expect(userMsg!.status).toBe('finish');
    const userContent = JSON.parse(userMsg!.content);
    expect(userContent.content).toContain('Hello, Gemini!');

    // Verify AI reply
    const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.status).toBe('finish');
    expect(aiMsg!.created_at).toBeGreaterThan(userMsg!.created_at);
    const aiContent = JSON.parse(aiMsg!.content);
    expect(aiContent.content).not.toBe('');

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

    // 1. Navigate and select agent
    await goToGuid(page);
    await selectGeminiAgent(page);
    await takeScreenshot(page, 'tc-g-02', 'gemini', '01-agent-selected');

    // 2. Mock dialog.showOpen to return temp workspace
    await page.evaluate((workspace) => {
      (window as any).electronAPI.dialog = (window as any).electronAPI.dialog || {};
      (window as any).electronAPI.dialog.showOpen = () => Promise.resolve([workspace]);
    }, tempWorkspace);

    // 3. Click workspace selector button
    const workspaceBtn = page.locator('[data-testid="workspace-selector-btn"]');
    await workspaceBtn.click();
    await page.waitForTimeout(500);

    // 4. Verify folder path displayed
    await expect(page.locator('text=' + tempWorkspace)).toBeVisible({ timeout: 5_000 });
    await takeScreenshot(page, 'tc-g-02', 'gemini', '02-folder-selected');

    // 5. Enter message
    const guidInput = page.locator('[data-testid="guid-input"]');
    await guidInput.fill('List files in the workspace.');

    // 6. Send
    const sendBtn = page.locator('[data-testid="guid-send-btn"]');
    await sendBtn.click();

    // 7. Wait for conversation page
    await page.waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 15_000 });
    const conversationId = page.url().split('/conversation/')[1];

    await takeScreenshot(page, 'tc-g-02', 'gemini', '03-conversation-page');

    // 8. Wait for AI reply
    await waitForGeminiReply(page, conversationId, 90_000);

    await takeScreenshot(page, 'tc-g-02', 'gemini', '04-reply-completed');

    // 9. DB assertions
    const conv = await getGeminiConversationDB(page, conversationId);
    expect(conv.type).toBe('gemini');
    expect(conv.extra.workspace).toBeDefined();
    expect(conv.extra.workspace).toMatch(/^\/tmp\/e2e-chat-gemini-/);

    const messages = await invokeBridge<
      Array<{
        position: string;
        type: string;
        status: string;
        content: string;
      }>
    >(page, 'database.get-conversation-messages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    });

    const userMsg = messages.find((m) => m.position === 'right');
    const userContent = JSON.parse(userMsg!.content);
    expect(userContent.content).toContain('List files');

    const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.status).toBe('finish');

    await takeScreenshot(page, 'tc-g-02', 'gemini', '05-db-assertions-passed');
  });

  test('TC-G-03: Upload single file', async ({ page }) => {
    // 1. Create test file in temp workspace
    const testFilePath = path.join(tempWorkspace, 'test.txt');
    fs.writeFileSync(testFilePath, 'This is a test file for E2E');

    // 2. Navigate and select agent
    await goToGuid(page);
    await selectGeminiAgent(page);
    await takeScreenshot(page, 'tc-g-03', 'gemini', '01-agent-selected');

    // 3. Mock dialog.showOpen for file upload
    await page.evaluate((filePath) => {
      (window as any).electronAPI.dialog = (window as any).electronAPI.dialog || {};
      (window as any).electronAPI.dialog.showOpen = () => Promise.resolve([filePath]);
    }, testFilePath);

    // 4. Click file upload button
    const fileUploadBtn = page.locator('[data-testid="file-upload-btn"]');
    await fileUploadBtn.click();
    await page.waitForTimeout(500);

    // 5. Verify file preview displayed
    await expect(page.locator('text=test.txt')).toBeVisible({ timeout: 5_000 });
    await takeScreenshot(page, 'tc-g-03', 'gemini', '02-file-uploaded');

    // 6. Enter message
    const guidInput = page.locator('[data-testid="guid-input"]');
    await guidInput.fill('Read the uploaded file and summarize its content.');

    // 7. Send
    const sendBtn = page.locator('[data-testid="guid-send-btn"]');
    await sendBtn.click();

    // 8. Wait for conversation page
    await page.waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 15_000 });
    const conversationId = page.url().split('/conversation/')[1];

    await takeScreenshot(page, 'tc-g-03', 'gemini', '03-conversation-page');

    // 9. Wait for AI reply
    await waitForGeminiReply(page, conversationId, 90_000);

    await takeScreenshot(page, 'tc-g-03', 'gemini', '04-reply-completed');

    // 10. DB assertions
    const conv = await getGeminiConversationDB(page, conversationId);
    expect(conv.type).toBe('gemini');
    expect(conv.extra.workspace).toBeUndefined();

    const messages = await invokeBridge<
      Array<{
        position: string;
        content: string;
        type: string;
        status: string;
      }>
    >(page, 'database.get-conversation-messages', {
      conversation_id: conversationId,
      page: 0,
      pageSize: 100,
    });

    const userMsg = messages.find((m) => m.position === 'right');
    const userContent = JSON.parse(userMsg!.content);
    expect(userContent.content).toContain('/tmp/e2e-chat-gemini-');
    expect(userContent.content).toContain('test.txt');

    const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.status).toBe('finish');

    await takeScreenshot(page, 'tc-g-03', 'gemini', '05-db-assertions-passed');
  });

  test('TC-G-04: Use gemini-2.5-pro model', async ({ page }) => {
    // 1. Navigate and select agent
    await goToGuid(page);
    await selectGeminiAgent(page);
    await takeScreenshot(page, 'tc-g-04', 'gemini', '01-agent-selected');

    // 2. Select gemini-2.5-pro model (Manual submenu)
    await selectGeminiModel(page, 'gemini-2.5-pro');
    await takeScreenshot(page, 'tc-g-04', 'gemini', '02-model-selected');

    // 3. Verify model selector text
    const modelSelector = page.locator('[data-testid="guid-model-selector"]');
    await expect(modelSelector).toContainText(/gemini-2\.5-pro/i);

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
    expect(conv.model).toBe('gemini-2.5-pro');

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
    expect(aiMsg!.status).toBe('finish');

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
    expect(conv.extra.sessionMode).toBe('yolo');

    const messages = await invokeBridge<
      Array<{
        type: string;
        content: string;
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
      const toolContent = JSON.parse(toolMsg.content);
      const hasConfirming = toolContent.some((tool: any) => tool.status === 'Confirming');
      expect(hasConfirming).toBe(false); // yolo mode should not have Confirming status
    }

    // Verify AI reply exists
    const aiMsg = messages.find((m) => m.position === 'left' && m.type === 'text');
    expect(aiMsg).toBeDefined();
    expect(aiMsg!.status).toBe('finish');

    await takeScreenshot(page, 'tc-g-05', 'gemini', '05-db-assertions-passed');
  });
});
