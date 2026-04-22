/**
 * Gemini Chat E2E Tests - Permission Modes (P1 Priority)
 *
 * Test Cases Covered:
 * - TC-G-06: AutoEdit permission mode
 */

import { test, expect } from '../../../fixtures';
import {
  goToGuid,
  selectGeminiAgent,
  selectGeminiMode,
  sendGeminiMessage,
  waitForGeminiReply,
  getGeminiConversationDB,
  cleanupE2EGeminiConversations,
  checkGeminiAuth,
} from '../../../helpers';
import { takeScreenshot } from '../../../helpers/screenshots';

test.describe('Gemini Chat - Permission Modes (P1)', () => {
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
  // TC-G-06: AutoEdit permission mode
  // ============================================================================

  test('TC-G-06: AutoEdit permission mode (auto-approve file edits, commands need approval)', async ({ page }) => {
    // Step 1: Navigate to guid and select Gemini agent
    await goToGuid(page);
    await selectGeminiAgent(page);

    // Screenshot 01: Gemini agent selected
    await takeScreenshot(page, 'tc-g-06/gemini/01-agent-selected.png');

    // Step 2: Select autoEdit permission mode
    await selectGeminiMode(page, 'autoEdit');

    // Screenshot 02: AutoEdit mode selected
    await takeScreenshot(page, 'tc-g-06/gemini/02-autoedit-mode.png');

    // Step 3: Input message and send
    const timestamp = Date.now();
    const conversationName = `E2E-Gemini-AutoEdit-${timestamp}`;
    const messageText = 'Hello Gemini with autoEdit mode!';

    const inputLocator = page.locator('[data-testid="guid-input"]');
    await inputLocator.waitFor({ state: 'visible', timeout: 10_000 });
    await inputLocator.fill(messageText);

    // Screenshot 03: Message input filled
    await takeScreenshot(page, 'tc-g-06/gemini/03-message-input.png');

    const sendBtn = page.locator('[data-testid="guid-send-btn"]');
    await sendBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await sendBtn.click();

    // Step 4: Wait for navigation to conversation page
    await page.waitForURL(/#\/conversation\/[^/]+$/, { timeout: 15_000 });

    // Screenshot 04: Conversation page loaded
    await takeScreenshot(page, 'tc-g-06/gemini/04-conversation-page.png');

    // Step 5: Extract conversation ID from URL
    const currentURL = page.url();
    const conversationIdMatch = currentURL.match(/#\/conversation\/([^/?]+)/);
    expect(conversationIdMatch).not.toBeNull();
    const conversationId = conversationIdMatch![1];

    // Step 6: Wait for AI reply to finish
    await waitForGeminiReply(page, conversationId, 90_000);

    // Screenshot 05: AI reply finished
    await takeScreenshot(page, 'tc-g-06/gemini/05-ai-reply-finished.png');

    // Step 7: Verify conversation data in database
    const conv = await getGeminiConversationDB(page, conversationId);
    expect(conv).toBeDefined();
    expect(conv.type).toBe('gemini');
    expect(conv.model).toBe('auto'); // Default model
    expect(conv.status).toBe('finished');

    // Verify extra.sessionMode is 'autoEdit'
    const extra = typeof conv.extra === 'string' ? JSON.parse(conv.extra) : conv.extra;
    expect(extra.sessionMode).toBe('autoEdit');

    // Verify workspace not set
    expect(extra.workspace).toBeUndefined();

    console.log(`[TC-G-06] Conversation verified:`, {
      id: conversationId,
      type: conv.type,
      model: conv.model,
      sessionMode: extra.sessionMode,
      status: conv.status,
    });
  });
});
