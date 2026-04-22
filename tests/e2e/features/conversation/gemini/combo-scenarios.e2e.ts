/**
 * Gemini Chat E2E Tests - Combo Scenarios (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-G-10: Folder + file combination
 * - TC-G-11: Multiple files upload (2 files)
 * - TC-G-12: Full combo (folder + multiple files + gemini-2.5-pro + yolo)
 */

import { test, expect } from '../../../fixtures';
import {
  goToGuid,
  selectGeminiAgent,
  selectGeminiModel,
  selectGeminiMode,
  uploadGeminiFiles,
  attachGeminiFolder,
  waitForGeminiReply,
  getGeminiConversationDB,
  readConvModelName,
  readConvExtra,
  getGeminiTestModels,
  cleanupE2EGeminiConversations,
  checkGeminiAuth,
  createTempWorkspace,
  isElectronDesktop,
} from '../../../helpers';
import { takeScreenshot } from '../../../helpers/screenshots';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Gemini Chat - Combo Scenarios (P1)', () => {
  test.setTimeout(240_000); // 4 minutes for combo scenarios
  test.beforeEach(async ({ page }) => {
    const hasAuth = await checkGeminiAuth(page);
    if (!hasAuth) {
      test.skip(true, 'Gemini OAuth or API key not configured');
    }
    // Clear volatile UI state to avoid cross-test contamination.
    await page.evaluate(() => {
      sessionStorage.clear();
    });
  });

  test.afterEach(async ({ page }) => {
    // Cleanup UI state (ESC × 5)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
    }

    // Cleanup database (batch conversation.remove + FK CASCADE)
    await cleanupE2EGeminiConversations(page);

    // Cleanup sessionStorage
    await page.evaluate(() => sessionStorage.clear());
  });

  // ============================================================================
  // TC-G-10: Folder + file combination
  // ============================================================================

  test('TC-G-10: Folder + file combination', async ({ page }) => {
    // Skip if not Desktop (workspace selector only available on Desktop)
    const isDesktop = await isElectronDesktop(page);
    if (!isDesktop) {
      test.skip(true, 'Workspace selector only available on Desktop');
    }

    // Step 1: Create temp workspace with test file
    const workspace = createTempWorkspace('tc-g-10');
    const testFile1Path = path.join(workspace.path, 'test1.txt');
    fs.writeFileSync(testFile1Path, 'Test file 1 content for TC-G-10');

    try {
      // Step 2: Navigate to guid and select Gemini agent
      await goToGuid(page);
      await selectGeminiAgent(page);

      // Screenshot 01: Gemini agent selected
      await takeScreenshot(page, 'tc-g-10/gemini/01-agent-selected.png');

      // Step 3: Attach folder (workspace)
      await attachGeminiFolder(page, workspace.path);

      // Screenshot 02: Folder attached
      await takeScreenshot(page, 'tc-g-10/gemini/02-folder-attached.png');

      // Step 4: Upload file
      await uploadGeminiFiles(page, [testFile1Path]);

      // Screenshot 03: File uploaded
      await takeScreenshot(page, 'tc-g-10/gemini/03-file-uploaded.png');

      // Step 5: Input message and send
      const messageText = 'Hello with folder and file!';

      const inputLocator = page.locator('[data-testid="guid-input"]');
      await inputLocator.waitFor({ state: 'visible', timeout: 10_000 });
      await inputLocator.fill(messageText);

      const sendBtn = page.locator('[data-testid="guid-send-btn"]');
      await sendBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await sendBtn.click();

      // Step 6: Wait for navigation to conversation page
      await page.waitForURL(/#\/conversation\/[^/]+$/, { timeout: 15_000 });

      // Screenshot 04: Conversation page loaded
      await takeScreenshot(page, 'tc-g-10/gemini/04-conversation-page.png');

      // Step 7: Extract conversation ID from URL
      const currentURL = page.url();
      const conversationIdMatch = currentURL.match(/#\/conversation\/([^/?]+)/);
      expect(conversationIdMatch).not.toBeNull();
      const conversationId = conversationIdMatch![1];

      // Step 8: Wait for AI reply to finish
      await waitForGeminiReply(page, conversationId, 90_000);

      // Screenshot 05: AI reply finished
      await takeScreenshot(page, 'tc-g-10/gemini/05-ai-reply-finished.png');

      // Step 9: Verify conversation data in database
      const conv = await getGeminiConversationDB(page, conversationId);
      expect(conv).toBeDefined();
      expect(conv.type).toBe('gemini');

      // Verify workspace set
      const extra = readConvExtra(conv);
      expect(extra.workspace).toBe(workspace.path);

      console.log(`[TC-G-10] Folder + file combo verified:`, {
        id: conversationId,
        workspace: extra.workspace,
      });
    } finally {
      workspace.cleanup();
    }
  });

  // ============================================================================
  // TC-G-11: Multiple files upload (2 files)
  // ============================================================================

  test('TC-G-11: Multiple files upload (2 files)', async ({ page }) => {
    // Step 1: Create temp workspace with 2 test files
    const workspace = createTempWorkspace('tc-g-11');
    const testFile1Path = path.join(workspace.path, 'test1.txt');
    const testFile2Path = path.join(workspace.path, 'test2.txt');
    fs.writeFileSync(testFile1Path, 'Test file 1 content for TC-G-11');
    fs.writeFileSync(testFile2Path, 'Test file 2 content for TC-G-11');

    try {
      // Step 2: Navigate to guid and select Gemini agent
      await goToGuid(page);
      await selectGeminiAgent(page);

      // Screenshot 01: Gemini agent selected
      await takeScreenshot(page, 'tc-g-11/gemini/01-agent-selected.png');

      // Step 3: Upload 2 files
      await uploadGeminiFiles(page, [testFile1Path, testFile2Path]);

      // Screenshot 02: Files uploaded
      await takeScreenshot(page, 'tc-g-11/gemini/02-files-uploaded.png');

      // Step 4: Input message and send
      const messageText = 'Hello with 2 files!';

      const inputLocator = page.locator('[data-testid="guid-input"]');
      await inputLocator.waitFor({ state: 'visible', timeout: 10_000 });
      await inputLocator.fill(messageText);

      const sendBtn = page.locator('[data-testid="guid-send-btn"]');
      await sendBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await sendBtn.click();

      // Step 5: Wait for navigation to conversation page
      await page.waitForURL(/#\/conversation\/[^/]+$/, { timeout: 15_000 });

      // Screenshot 03: Conversation page loaded
      await takeScreenshot(page, 'tc-g-11/gemini/03-conversation-page.png');

      // Step 6: Extract conversation ID from URL
      const currentURL = page.url();
      const conversationIdMatch = currentURL.match(/#\/conversation\/([^/?]+)/);
      expect(conversationIdMatch).not.toBeNull();
      const conversationId = conversationIdMatch![1];

      // Step 7: Wait for AI reply to finish
      await waitForGeminiReply(page, conversationId, 90_000);

      // Screenshot 04: AI reply finished
      await takeScreenshot(page, 'tc-g-11/gemini/04-ai-reply-finished.png');

      // Step 8: Verify conversation data in database
      const conv = await getGeminiConversationDB(page, conversationId);
      expect(conv).toBeDefined();
      expect(conv.type).toBe('gemini');

      console.log(`[TC-G-11] Multiple files upload verified:`, {
        id: conversationId,
      });
    } finally {
      workspace.cleanup();
    }
  });

  // ============================================================================
  // TC-G-12: Full combo (folder + multiple files + gemini-2.5-pro + yolo)
  // ============================================================================

  test('TC-G-12: Full combo (folder + multiple files + specific model + yolo)', async ({ page }) => {
    // Skip if not Desktop (workspace selector only available on Desktop)
    const isDesktop = await isElectronDesktop(page);
    if (!isDesktop) {
      test.skip(true, 'Workspace selector only available on Desktop');
    }

    // Resolve a gemini model from local config (replaces hardcoded 'gemini-2.5-pro').
    const models = await getGeminiTestModels(page);
    if (!models) {
      test.skip(true, 'No gemini provider configured with a usable model');
    }
    const targetModel = models!.modelA;

    // Step 1: Create temp workspace with 2 test files
    const workspace = createTempWorkspace('tc-g-12');
    const testFile1Path = path.join(workspace.path, 'test1.txt');
    const testFile2Path = path.join(workspace.path, 'test2.txt');
    fs.writeFileSync(testFile1Path, 'Test file 1 content for TC-G-12');
    fs.writeFileSync(testFile2Path, 'Test file 2 content for TC-G-12');

    try {
      // Step 2: Navigate to guid and select Gemini agent
      await goToGuid(page);
      await selectGeminiAgent(page);

      // Screenshot 01: Gemini agent selected
      await takeScreenshot(page, 'tc-g-12/gemini/01-agent-selected.png');

      // Step 3: Attach folder
      await attachGeminiFolder(page, workspace.path);

      // Screenshot 02: Folder attached
      await takeScreenshot(page, 'tc-g-12/gemini/02-folder-attached.png');

      // Step 4: Upload 2 files
      await uploadGeminiFiles(page, [testFile1Path, testFile2Path]);

      // Screenshot 03: Files uploaded
      await takeScreenshot(page, 'tc-g-12/gemini/03-files-uploaded.png');

      // Step 5: Select the resolved gemini model
      await selectGeminiModel(page, targetModel);

      // Screenshot 04: Model selected
      await takeScreenshot(page, 'tc-g-12/gemini/04-model-selected.png');

      // Step 6: Select yolo permission mode
      await selectGeminiMode(page, 'yolo');

      // Screenshot 05: Yolo mode selected
      await takeScreenshot(page, 'tc-g-12/gemini/05-yolo-mode.png');

      // Step 7: Input message and send
      const messageText = 'Full combo test!';

      const inputLocator = page.locator('[data-testid="guid-input"]');
      await inputLocator.waitFor({ state: 'visible', timeout: 10_000 });
      await inputLocator.fill(messageText);

      const sendBtn = page.locator('[data-testid="guid-send-btn"]');
      await sendBtn.waitFor({ state: 'visible', timeout: 10_000 });
      await sendBtn.click();

      // Step 8: Wait for navigation to conversation page
      await page.waitForURL(/#\/conversation\/[^/]+$/, { timeout: 15_000 });

      // Screenshot 06: Conversation page loaded
      await takeScreenshot(page, 'tc-g-12/gemini/06-conversation-page.png');

      // Step 9: Extract conversation ID from URL
      const currentURL = page.url();
      const conversationIdMatch = currentURL.match(/#\/conversation\/([^/?]+)/);
      expect(conversationIdMatch).not.toBeNull();
      const conversationId = conversationIdMatch![1];

      // Step 10: Wait for AI reply to finish
      await waitForGeminiReply(page, conversationId, 90_000);

      // Screenshot 07: AI reply finished
      await takeScreenshot(page, 'tc-g-12/gemini/07-ai-reply-finished.png');

      // Step 11: Verify conversation data in database
      const conv = await getGeminiConversationDB(page, conversationId);
      expect(conv).toBeDefined();
      expect(conv.type).toBe('gemini');
      const modelName = readConvModelName(conv);
      expect(modelName).toMatch(/gemini/i);

      // Verify extra fields
      const extra = readConvExtra(conv);
      expect(extra.sessionMode).toBe('yolo');
      expect(extra.workspace).toBe(workspace.path);

      console.log(`[TC-G-12] Full combo verified:`, {
        id: conversationId,
        model: modelName,
        sessionMode: extra.sessionMode,
        workspace: extra.workspace,
      });
    } finally {
      workspace.cleanup();
    }
  });
});
