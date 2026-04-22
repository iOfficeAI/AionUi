/**
 * Aionrs Chat E2E Tests - Model Selection (P0 + P1)
 *
 * Test Cases Covered:
 * - TC-A-04: Use second model (guid page selection)
 * - TC-A-07: Switch model mid-conversation
 *
 * Prerequisites:
 * - aionrs binary available
 * - User logged in
 * - At least 2 ACP models available (filtered Google Auth)
 *
 * Data-testid references:
 * - AionrsModelSelector: data-testid="aionrs-model-selector"
 * - Model options: data-testid="aionrs-model-option-{modelId}"
 */

import { test, expect } from '../../fixtures';
import {
  resolveAionrsPreconditions,
  cleanupE2EAionrsConversations,
  createAionrsConversationViaBridge,
  sendAionrsMessage,
  waitForAionrsReply,
  getAionrsConversationDB,
  getAionrsMessages,
  createTempWorkspace,
  selectAionrsAgent,
  selectAionrsModel,
  type AionrsTestModels,
} from '../../helpers';
import { takeScreenshot } from '../../helpers/screenshots';

test.describe('Aionrs Chat - Model Selection (P0 + P1)', () => {
  test.setTimeout(120000); // 2 minutes

  let preconditions: { binary: string | null; models: AionrsTestModels | null };

  test.beforeAll(async ({ page }) => {
    preconditions = await resolveAionrsPreconditions(page);
    if (!preconditions.binary || !preconditions.models) {
      test.skip(true, 'No aionrs-compatible provider found, skipping E2E tests');
    }
  });

  test.afterEach(async ({ page }) => {
    // Cleanup order: ESC × 5 → DB → sessionStorage
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
    }

    await cleanupE2EAionrsConversations(page);

    await page.evaluate(() => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith('aionrs_initial_message_') || key.startsWith('aionrs_initial_processed_'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    });
  });

  // ============================================================================
  // TC-A-04: Use second model (guid page selection)
  // ============================================================================

  test.skip('TC-A-04: should use second model selected on guid page', async ({ page }) => {
    // SKIP: Pending aionrs binary investigation - modelB switch causes silent hang on subsequent messages
    // See tests/e2e/docs/chat-aionrs/implementation-mapping.zh.md "Known Issues" section
    // Symptom: Same root cause as TC-A-08/09 - runtime model switching leads to binary hang
    // Next: Product team investigation of aionrs binary runtime state handling

    if (!preconditions.models!.modelB) {
      test.skip(true, 'Need 2nd aionrs-compatible model, modelB is null');
    }

    const timestamp = Date.now();
    const conversationName = `E2E-aionrs-${timestamp}-model-second`;
    const tempWorkspace = createTempWorkspace(`tc-a-04-${timestamp}`);

    try {
      // Screenshot 01: guid page initial
      await page.goto(`${page.url().split('#')[0]}#/guid`);
      await page.waitForLoadState('networkidle');
      await takeScreenshot(page, `chat-aionrs/tc-a-04/01-guid-page-initial.png`);

      // Step 2: Create conversation via bridge using modelB (bypasses UI selector issues)
      const conversationId = await createAionrsConversationViaBridge(page, {
        name: conversationName,
        workspace: tempWorkspace.path,
        provider: preconditions.models!.modelB,
        sessionMode: 'default',
      });
      await takeScreenshot(page, `chat-aionrs/tc-a-04/02-conversation-created.png`);

      // Step 3: Send message
      await sendAionrsMessage(page, conversationId, 'Say hi in one word.');
      await takeScreenshot(page, `chat-aionrs/tc-a-04/03-message-sent.png`);

      // Step 4: Wait for AI reply
      await waitForAionrsReply(page, conversationId);
      await takeScreenshot(page, `chat-aionrs/tc-a-04/04-reply-completed.png`);

      // ============================================================================
      // DB Assertions
      // ============================================================================

      // 1. Verify conversation uses modelB
      const conversation = await getAionrsConversationDB(page, conversationId);
      expect(conversation).toBeDefined();

      const extra = typeof conversation.extra === 'string'
        ? JSON.parse(conversation.extra || '{}')
        : (conversation.extra || {});
      const actualModelUse = String(extra.model?.useModel || '');
      expect(actualModelUse).toBe(preconditions.models!.modelB.useModel);

      // 2. Verify messages exist
      const messages = await getAionrsMessages(page, conversationId);
      expect(messages.length).toBeGreaterThanOrEqual(2);
      const aiMessages = messages.filter((m) => m.position === 'left');
      expect(aiMessages.length).toBeGreaterThanOrEqual(1);
    } finally {
      await tempWorkspace.cleanup();
    }
  });

  // ============================================================================
  // TC-A-07: Switch model mid-conversation
  // ============================================================================

  test.skip('TC-A-07: should switch model mid-conversation and update DB', async ({ page }) => {
    // SKIP: Pending aionrs binary investigation - modelB switch causes silent hang on subsequent messages
    // See tests/e2e/docs/chat-aionrs/implementation-mapping.zh.md "Known Issues" section
    // Symptom: Same root cause as TC-A-08/09 - runtime model switching leads to binary hang
    // Next: Product team investigation of aionrs binary runtime state handling

    if (!preconditions.models!.modelB) {
      test.skip(true, 'Need 2nd aionrs-compatible model for mid-conversation switch');
    }

    const timestamp = Date.now();
    const conversationName = `E2E-aionrs-${timestamp}-switch-model`;
    const tempWorkspace = createTempWorkspace(`tc-a-07-${timestamp}`);

    try {
      // Step 1: Create conversation via bridge with modelA
      const conversationId = await createAionrsConversationViaBridge(page, {
        name: conversationName,
        workspace: tempWorkspace.path,
        provider: preconditions.models!.modelA,
        sessionMode: 'default',
      });

      // Screenshot 01: before first message
      await takeScreenshot(page, `chat-aionrs/tc-a-07/01-conversation-created.png`);

      // Step 2: Send first message
      await sendAionrsMessage(page, conversationId, 'Hello, please respond.');

      // Step 3: Wait for first AI reply
      await waitForAionrsReply(page, conversationId);

      // Screenshot 02: first reply completed
      await takeScreenshot(page, `chat-aionrs/tc-a-07/02-first-reply.png`);

      // Step 4: Navigate to conversation page
      await page.goto(`${page.url().split('#')[0]}#/conversation/${conversationId}`);
      await page.waitForLoadState('networkidle');

      // Step 5: Switch to modelB by exact data-testid
      const modelSelector = page.locator('[data-testid="aionrs-model-selector"]');
      await expect(modelSelector).toBeVisible({ timeout: 10000 });
      await modelSelector.click();
      await page.waitForTimeout(500);

      // Screenshot 03: model selector open
      await takeScreenshot(page, `chat-aionrs/tc-a-07/03-model-selector-open.png`);

      const secondModelOption = page.locator(
        `[data-testid="aionrs-model-option-${preconditions.models!.modelB.useModel}"]`
      );
      await secondModelOption.waitFor({ state: 'visible', timeout: 5000 });
      await secondModelOption.click();
      await page.waitForTimeout(1000);

      // Step 6: Send second message
      await sendAionrsMessage(page, conversationId, 'What model are you using now?');

      // Step 7: Wait for second AI reply
      await waitForAionrsReply(page, conversationId);

      // Screenshot 04: second reply completed
      await takeScreenshot(page, `chat-aionrs/tc-a-07/04-second-reply.png`);

      // ============================================================================
      // DB Assertions
      // ============================================================================

      // 1. Verify model switched to modelB in DB
      const conversation = await getAionrsConversationDB(page, conversationId);
      const extra = typeof conversation.extra === 'string'
        ? JSON.parse(conversation.extra || '{}')
        : (conversation.extra || {});
      const currentModel = extra.model?.useModel;
      expect(currentModel).toBe(preconditions.models!.modelB.useModel);

      // 2. Verify message count (at least 4: user1, ai1, user2, ai2)
      const messages = await getAionrsMessages(page, conversationId);
      expect(messages.length).toBeGreaterThanOrEqual(4);

      // 3. Verify both AI replies exist
      const aiMessages = messages.filter((m) => m.position === 'left');
      expect(aiMessages.length).toBeGreaterThanOrEqual(2);
    } finally {
      await tempWorkspace.cleanup();
    }
  });
});
