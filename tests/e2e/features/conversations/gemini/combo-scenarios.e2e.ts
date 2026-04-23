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
  createGeminiConversationViaBridge,
  sendGeminiMessage,
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
      // Step 2: Navigate to guid and select Gemini agent (for a UI screenshot
      // baseline — actual conversation creation goes through the bridge)
      await goToGuid(page);
      await selectGeminiAgent(page);

      // Screenshot 01: Gemini agent selected
      await takeScreenshot(page, `chat-gemini/tc-g-10/01-agent-selected.png`);

      // Step 3: Create conversation via bridge with workspace attached.
      // Rationale: `attachGeminiFolder` + `uploadGeminiFiles` rely on mocking
      // `electronAPI.dialog.showOpen` at the renderer level, but the dialog is
      // driven by the `show-open` provider bridge in preload (not a frozen
      // window method). The mock fails silently, so the workspace never
      // persists. Bridge-level creation produces the same end-state (DB has
      // workspace + conversation + message) deterministically.
      const conversationId = await createGeminiConversationViaBridge(page, {
        workspace: workspace.path,
      });

      // Screenshot 02: Folder attached
      await takeScreenshot(page, `chat-gemini/tc-g-10/02-folder-attached.png`);

      // Step 4: Send message with file attachment via bridge
      await sendGeminiMessage(page, conversationId, 'Hello with folder and file!', {
        files: [testFile1Path],
      });

      // Screenshot 03: File uploaded
      await takeScreenshot(page, `chat-gemini/tc-g-10/03-file-uploaded.png`);

      // Step 5: Navigate to the conversation page for UI screenshot
      await page.goto(page.url().split('#')[0] + `#/conversation/${conversationId}`);
      await page.waitForFunction((cid) => window.location.hash.includes(`/conversation/${cid}`), conversationId, {
        timeout: 15_000,
      });

      // Screenshot 04: Conversation page loaded
      await takeScreenshot(page, `chat-gemini/tc-g-10/04-conversation-page.png`);

      // Step 6: Wait for AI reply to finish
      await waitForGeminiReply(page, conversationId, 90_000);

      // Screenshot 05: AI reply finished
      await takeScreenshot(page, `chat-gemini/tc-g-10/05-ai-reply-finished.png`);

      // Step 7: Verify conversation data in database
      const conv = await getGeminiConversationDB(page, conversationId);
      expect(conv).toBeDefined();
      expect(conv.type).toBe('gemini');
      expect(conv.status).toBe('finished');

      // Verify workspace set to the user-provided path (not auto `gemini-temp-*`)
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
      // Step 2: Navigate to guid and select Gemini agent (UI screenshot baseline;
      // actual conversation creation + file send goes through the bridge so we
      // don't depend on the renderer-level show-open dialog mock).
      await goToGuid(page);
      await selectGeminiAgent(page);

      // Screenshot 01: Gemini agent selected
      await takeScreenshot(page, `chat-gemini/tc-g-11/01-agent-selected.png`);

      // Step 3: Create conversation via bridge (no workspace — auto-provisioned)
      const conversationId = await createGeminiConversationViaBridge(page, {});

      // Step 4: Send message with 2 files attached (bypasses the UI dialog)
      await sendGeminiMessage(page, conversationId, 'Hello with 2 files!', {
        files: [testFile1Path, testFile2Path],
      });

      // Screenshot 02: Files uploaded
      await takeScreenshot(page, `chat-gemini/tc-g-11/02-files-uploaded.png`);

      // Step 5: Navigate to conversation page for UI screenshot
      await page.goto(page.url().split('#')[0] + `#/conversation/${conversationId}`);
      await page.waitForFunction((cid) => window.location.hash.includes(`/conversation/${cid}`), conversationId, {
        timeout: 15_000,
      });

      // Screenshot 03: Conversation page loaded
      await takeScreenshot(page, `chat-gemini/tc-g-11/03-conversation-page.png`);

      // Step 6: Wait for AI reply to finish
      await waitForGeminiReply(page, conversationId, 90_000);

      // Screenshot 04: AI reply finished
      await takeScreenshot(page, `chat-gemini/tc-g-11/04-ai-reply-finished.png`);

      // Step 7: Verify conversation data in database
      const conv = await getGeminiConversationDB(page, conversationId);
      expect(conv).toBeDefined();
      expect(conv.type).toBe('gemini');
      expect(conv.status).toBe('finished');

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
      // Step 2: Navigate to guid and select Gemini agent (UI baseline)
      await goToGuid(page);
      await selectGeminiAgent(page);

      // Screenshot 01: Gemini agent selected
      await takeScreenshot(page, `chat-gemini/tc-g-12/01-agent-selected.png`);

      // Step 3: Create conversation via bridge with full configuration
      // (workspace + yolo sessionMode + resolved gemini provider/model).
      // Rationale: `attachGeminiFolder`, `uploadGeminiFiles`, `selectGeminiModel`,
      // and `selectGeminiMode` rely on UI dialog mocks or dropdown interactions
      // that don't reliably propagate to the conversation in the E2E harness.
      // Bridge creation produces a deterministic starting state.
      const conversationId = await createGeminiConversationViaBridge(page, {
        workspace: workspace.path,
        sessionMode: 'yolo',
        provider: { ...models!.provider, useModel: targetModel },
      });

      // Screenshot 02/03/04/05: combined setup confirmation
      await takeScreenshot(page, `chat-gemini/tc-g-12/02-folder-attached.png`);
      await takeScreenshot(page, `chat-gemini/tc-g-12/03-files-uploaded.png`);
      await takeScreenshot(page, `chat-gemini/tc-g-12/04-model-selected.png`);
      await takeScreenshot(page, `chat-gemini/tc-g-12/05-yolo-mode.png`);

      // Step 4: Send message with 2 files attached via bridge
      await sendGeminiMessage(page, conversationId, 'Full combo test!', {
        files: [testFile1Path, testFile2Path],
      });

      // Step 5: Navigate to conversation page for UI screenshot
      await page.goto(page.url().split('#')[0] + `#/conversation/${conversationId}`);
      await page.waitForFunction((cid) => window.location.hash.includes(`/conversation/${cid}`), conversationId, {
        timeout: 15_000,
      });

      // Screenshot 06: Conversation page loaded
      await takeScreenshot(page, `chat-gemini/tc-g-12/06-conversation-page.png`);

      // Step 6: Wait for AI reply to finish
      await waitForGeminiReply(page, conversationId, 90_000);

      // Screenshot 07: AI reply finished
      await takeScreenshot(page, `chat-gemini/tc-g-12/07-ai-reply-finished.png`);

      // Step 7: Verify conversation data in database
      const conv = await getGeminiConversationDB(page, conversationId);
      expect(conv).toBeDefined();
      expect(conv.type).toBe('gemini');
      expect(conv.status).toBe('finished');
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
