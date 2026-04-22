/**
 * Gemini Chat E2E Tests - Mid-Conversation Switch (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-G-07: Switch model during conversation (auto → gemini-2.5-pro)
 * - TC-G-08: Switch permission during conversation (default → autoEdit)
 * - TC-G-09: Switch permission during conversation (autoEdit → yolo)
 */

import { test, expect } from '../../../fixtures';
import {
  goToGuid,
  selectGeminiAgent,
  selectGeminiModel,
  selectGeminiMode,
  sendGeminiMessage,
  waitForGeminiReply,
  getGeminiConversationDB,
  readConvModelName,
  readConvExtra,
  getGeminiTestModels,
  cleanupE2EGeminiConversations,
  checkGeminiAuth,
  invokeBridge,
} from '../../../helpers';
import { takeScreenshot } from '../../../helpers/screenshots';

test.describe('Gemini Chat - Mid-Conversation Switch (P1)', () => {
  test.setTimeout(300_000); // 5 minutes — multi-round AI replies
  test.beforeEach(async ({ page }) => {
    const hasAuth = await checkGeminiAuth(page);
    if (!hasAuth) {
      test.skip(true, 'Gemini OAuth or API key not configured');
    }
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
  // TC-G-07: Switch model during conversation (auto → gemini-2.5-pro)
  // ============================================================================

  test('TC-G-07: Switch model during conversation (auto → modelB)', async ({ page }) => {
    // Pre-resolve a gemini model for the switch target.
    const models = await getGeminiTestModels(page);
    if (!models) {
      test.skip(true, 'No gemini provider configured with a usable model');
    }
    // Prefer modelB (a second model) so we can verify a real switch; fall back to modelA
    // if only one model is available.
    const switchTarget = models!.modelB ?? models!.modelA;

    // Step 1: Navigate to guid and select Gemini agent
    await goToGuid(page);
    await selectGeminiAgent(page);

    // Screenshot 01: Gemini agent selected
    await takeScreenshot(page, 'tc-g-07/gemini/01-agent-selected.png');

    // Step 2: Use default model (auto)
    // No need to select explicitly, auto is default

    // Step 3: Input message and send
    const timestamp = Date.now();
    const messageText1 = 'First message with auto model';

    const inputLocator = page.locator('[data-testid="guid-input"]');
    await inputLocator.waitFor({ state: 'visible', timeout: 10_000 });
    await inputLocator.fill(messageText1);

    const sendBtn = page.locator('[data-testid="guid-send-btn"]');
    await sendBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await sendBtn.click();

    // Step 4: Wait for navigation to conversation page
    await page.waitForURL(/#\/conversation\/[^/]+$/, { timeout: 15_000 });

    // Screenshot 02: Conversation page loaded
    await takeScreenshot(page, 'tc-g-07/gemini/02-conversation-page.png');

    // Step 5: Extract conversation ID from URL
    const currentURL = page.url();
    const conversationIdMatch = currentURL.match(/#\/conversation\/([^/?]+)/);
    expect(conversationIdMatch).not.toBeNull();
    const conversationId = conversationIdMatch![1];

    // Step 6: Wait for AI reply to finish
    await waitForGeminiReply(page, conversationId, 90_000);

    // Screenshot 03: First AI reply finished
    await takeScreenshot(page, 'tc-g-07/gemini/03-first-reply-finished.png');

    // Step 7: Verify conversation model is 'auto' (or default gemini resolution)
    let conv = await getGeminiConversationDB(page, conversationId);
    expect(conv).toBeDefined();
    let modelName = readConvModelName(conv);
    expect(modelName).toMatch(/^(auto|gemini[-\w.]*)$/i);

    // Step 8: Switch model to the resolved target
    await selectGeminiModel(page, switchTarget);

    // Screenshot 04: Model switched
    await takeScreenshot(page, 'tc-g-07/gemini/04-model-switched.png');

    // Step 9: Send second message
    const messageText2 = `Second message with ${switchTarget} model`;
    await sendGeminiMessage(page, conversationId, messageText2);

    // Step 10: Wait for second AI reply
    await waitForGeminiReply(page, conversationId, 90_000);

    // Screenshot 05: Second AI reply finished
    await takeScreenshot(page, 'tc-g-07/gemini/05-second-reply-finished.png');

    // Step 11: Verify conversation model updated (is now a gemini model)
    conv = await getGeminiConversationDB(page, conversationId);
    expect(conv).toBeDefined();
    modelName = readConvModelName(conv);
    expect(modelName).toMatch(/gemini/i);

    console.log(`[TC-G-07] Model switch verified:`, {
      id: conversationId,
      model: modelName,
    });
  });

  // ============================================================================
  // TC-G-08: Switch permission during conversation (default → autoEdit)
  // ============================================================================

  test('TC-G-08: Switch permission during conversation (default → autoEdit)', async ({ page }) => {
    // Step 1: Navigate to guid and select Gemini agent
    await goToGuid(page);
    await selectGeminiAgent(page);

    // Screenshot 01: Gemini agent selected
    await takeScreenshot(page, 'tc-g-08/gemini/01-agent-selected.png');

    // Step 2: Use default permission mode (default)
    // No need to select explicitly, default is default

    // Step 3: Input message and send
    const messageText1 = 'First message with default permission';

    const inputLocator = page.locator('[data-testid="guid-input"]');
    await inputLocator.waitFor({ state: 'visible', timeout: 10_000 });
    await inputLocator.fill(messageText1);

    const sendBtn = page.locator('[data-testid="guid-send-btn"]');
    await sendBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await sendBtn.click();

    // Step 4: Wait for navigation to conversation page
    await page.waitForURL(/#\/conversation\/[^/]+$/, { timeout: 15_000 });

    // Screenshot 02: Conversation page loaded
    await takeScreenshot(page, 'tc-g-08/gemini/02-conversation-page.png');

    // Step 5: Extract conversation ID from URL
    const currentURL = page.url();
    const conversationIdMatch = currentURL.match(/#\/conversation\/([^/?]+)/);
    expect(conversationIdMatch).not.toBeNull();
    const conversationId = conversationIdMatch![1];

    // Step 6: Wait for AI reply to finish
    await waitForGeminiReply(page, conversationId, 90_000);

    // Screenshot 03: First AI reply finished
    await takeScreenshot(page, 'tc-g-08/gemini/03-first-reply-finished.png');

    // Step 7: Verify conversation sessionMode is 'default'
    let conv = await getGeminiConversationDB(page, conversationId);
    expect(conv).toBeDefined();
    let extra = readConvExtra(conv);
    expect(extra.sessionMode).toBe('default');

    // Step 8: Switch permission to autoEdit
    await selectGeminiMode(page, 'autoEdit');

    // Screenshot 04: Permission switched to autoEdit
    await takeScreenshot(page, 'tc-g-08/gemini/04-permission-switched.png');

    // Step 9: Verify permission updated via bridge
    const currentMode = await invokeBridge(page, 'acpConversation.getMode.invoke', {
      conversationId,
    });
    expect(currentMode).toBe('autoEdit');

    // Step 10: Send second message
    const messageText2 = 'Second message with autoEdit permission';
    await sendGeminiMessage(page, conversationId, messageText2);

    // Step 11: Wait for second AI reply
    await waitForGeminiReply(page, conversationId, 90_000);

    // Screenshot 05: Second AI reply finished
    await takeScreenshot(page, 'tc-g-08/gemini/05-second-reply-finished.png');

    // Step 12: Verify conversation sessionMode updated to autoEdit
    conv = await getGeminiConversationDB(page, conversationId);
    expect(conv).toBeDefined();
    extra = readConvExtra(conv);
    expect(extra.sessionMode).toBe('autoEdit');

    console.log(`[TC-G-08] Permission switch verified:`, {
      id: conversationId,
      sessionMode: extra.sessionMode,
    });
  });

  // ============================================================================
  // TC-G-09: Switch permission during conversation (autoEdit → yolo)
  // ============================================================================

  test('TC-G-09: Switch permission during conversation (autoEdit → yolo)', async ({ page }) => {
    // Step 1: Navigate to guid and select Gemini agent
    await goToGuid(page);
    await selectGeminiAgent(page);

    // Screenshot 01: Gemini agent selected
    await takeScreenshot(page, 'tc-g-09/gemini/01-agent-selected.png');

    // Step 2: Select autoEdit permission mode
    await selectGeminiMode(page, 'autoEdit');

    // Screenshot 02: AutoEdit mode selected
    await takeScreenshot(page, 'tc-g-09/gemini/02-autoedit-mode.png');

    // Step 3: Input message and send
    const messageText1 = 'First message with autoEdit permission';

    const inputLocator = page.locator('[data-testid="guid-input"]');
    await inputLocator.waitFor({ state: 'visible', timeout: 10_000 });
    await inputLocator.fill(messageText1);

    const sendBtn = page.locator('[data-testid="guid-send-btn"]');
    await sendBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await sendBtn.click();

    // Step 4: Wait for navigation to conversation page
    await page.waitForURL(/#\/conversation\/[^/]+$/, { timeout: 15_000 });

    // Screenshot 03: Conversation page loaded
    await takeScreenshot(page, 'tc-g-09/gemini/03-conversation-page.png');

    // Step 5: Extract conversation ID from URL
    const currentURL = page.url();
    const conversationIdMatch = currentURL.match(/#\/conversation\/([^/?]+)/);
    expect(conversationIdMatch).not.toBeNull();
    const conversationId = conversationIdMatch![1];

    // Step 6: Wait for AI reply to finish
    await waitForGeminiReply(page, conversationId, 90_000);

    // Screenshot 04: First AI reply finished
    await takeScreenshot(page, 'tc-g-09/gemini/04-first-reply-finished.png');

    // Step 7: Verify conversation sessionMode is 'autoEdit'
    let conv = await getGeminiConversationDB(page, conversationId);
    expect(conv).toBeDefined();
    let extra = readConvExtra(conv);
    expect(extra.sessionMode).toBe('autoEdit');

    // Step 8: Switch permission to yolo
    await selectGeminiMode(page, 'yolo');

    // Screenshot 05: Permission switched to yolo
    await takeScreenshot(page, 'tc-g-09/gemini/05-permission-switched.png');

    // Step 9: Verify permission updated via bridge
    const currentMode = await invokeBridge(page, 'acpConversation.getMode.invoke', {
      conversationId,
    });
    expect(currentMode).toBe('yolo');

    // Step 10: Send second message
    const messageText2 = 'Second message with yolo permission';
    await sendGeminiMessage(page, conversationId, messageText2);

    // Step 11: Wait for second AI reply
    await waitForGeminiReply(page, conversationId, 90_000);

    // Screenshot 06: Second AI reply finished
    await takeScreenshot(page, 'tc-g-09/gemini/06-second-reply-finished.png');

    // Step 12: Verify conversation sessionMode updated to yolo
    conv = await getGeminiConversationDB(page, conversationId);
    expect(conv).toBeDefined();
    extra = readConvExtra(conv);
    expect(extra.sessionMode).toBe('yolo');

    console.log(`[TC-G-09] Permission switch verified:`, {
      id: conversationId,
      sessionMode: extra.sessionMode,
    });
  });
});
