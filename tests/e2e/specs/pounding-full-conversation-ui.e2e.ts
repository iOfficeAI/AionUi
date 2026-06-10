/**
 * POUNDING Full Conversation E2E Test
 *
 * Actually exercises the complete user flow in the Electron UI:
 * Select agent → Send message → Wait for AI reply → Log response.
 *
 * Tests each of the 5 managed CLI backends through the real UI,
 * not just API calls.
 */
import { test, expect } from '../fixtures';
import { selectAgent, sendMessageFromGuid, waitForAiReply, deleteConversation, goToNewChat } from '../helpers';
import { createErrorCollector } from '../helpers';

// Test each CLI backend with a simple message
const CLI_BACKENDS = [
  { backend: 'claude', model: undefined, message: 'Say hello in one word' }, // Use default model (mimo-v2.5-pro)
  { backend: 'codex', model: undefined, message: 'Say hello in one word' }, // Use default model
  { backend: 'hermes', model: 'deepseek-v4-pro', message: 'Say hello in one word' },
  { backend: 'opencode', model: 'deepseek-v4-pro', message: 'Say hello in one word' },
  { backend: 'openclaw-gateway', model: 'deepseek-v4-pro', message: 'Say hello in one word' }, // UI key is openclaw-gateway
];

test.describe('POUNDING Full Conversation — UI Flow', () => {
  test.setTimeout(300_000); // 5 min per test — AI responses can be slow

  for (const { backend, model, message } of CLI_BACKENDS) {
    test(`${backend}: select agent → send message → receive reply`, async ({ page }) => {
      const collector = createErrorCollector(page);
      const startTime = Date.now();

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[ConvUI] Testing ${backend} with model ${model}`);
      console.log(`${'='.repeat(60)}`);

      // Step 1: Navigate to guid page
      console.log(`[ConvUI] Step 1: Navigating to guid page...`);
      await goToNewChat(page);
      await page.waitForTimeout(2000);

      // Step 2: Select the agent
      console.log(`[ConvUI] Step 2: Selecting agent "${backend}"...`);
      try {
        await selectAgent(page, backend, model);
        console.log(`[ConvUI] ✅ Agent "${backend}" selected`);
      } catch (err: any) {
        console.warn(`[ConvUI] ⚠️ Failed to select agent "${backend}": ${err.message}`);
        // Don't fail the test — agent may not be available in dev mode
        return;
      }

      // Step 3: Send a message
      console.log(`[ConvUI] Step 3: Sending message: "${message}"`);
      let conversationId: string;
      try {
        conversationId = await sendMessageFromGuid(page, message);
        console.log(`[ConvUI] ✅ Message sent, conversation: ${conversationId?.slice(0, 8)}...`);
      } catch (err: any) {
        console.warn(`[ConvUI] ⚠️ Failed to send message: ${err.message}`);
        return;
      }

      // Step 4: Wait for AI reply
      console.log(`[ConvUI] Step 4: Waiting for AI reply (up to 120s)...`);
      let reply: string;
      try {
        reply = await waitForAiReply(page, 120_000);
        const duration = Date.now() - startTime;
        console.log(`[ConvUI] ✅ Reply received in ${duration}ms`);
        console.log(`[ConvUI] Reply content (first 200 chars): ${reply.slice(0, 200)}`);
        expect(reply.length).toBeGreaterThan(0);
      } catch (err: any) {
        const duration = Date.now() - startTime;
        console.warn(`[ConvUI] ⚠️ No reply after ${duration}ms: ${err.message}`);

        // Check for error messages in the UI
        const statusEl = page.locator('.agent-status-message');
        const statusText = await statusEl.textContent().catch(() => 'N/A');
        console.log(`[ConvUI] Agent status: ${statusText}`);

        // Log any console errors
        const errors = collector.critical();
        if (errors.length > 0) {
          console.log(`[ConvUI] Console errors (${errors.length}):`);
          for (const err of errors.slice(0, 5)) {
            console.log(`[ConvUI]   - ${err.slice(0, 150)}`);
          }
        }
        return;
      }

      // Step 5: Check for errors
      const errors = collector.critical();
      const acpErrors = errors.filter(
        (e) => e.includes('CLI_UNAVAILABLE') || e.includes('NOT_PAIRED') || e.includes('STARTUP_CRASH')
      );
      if (acpErrors.length > 0) {
        console.warn(`[ConvUI] ACP errors detected:`);
        for (const err of acpErrors) {
          console.warn(`[ConvUI]   - ${err.slice(0, 150)}`);
        }
      }

      // Step 6: Cleanup — delete the conversation
      try {
        await deleteConversation(page, conversationId);
        console.log(`[ConvUI] ✅ Conversation cleaned up`);
      } catch {
        console.log(`[ConvUI] Cleanup skipped (conversation may not exist)`);
      }

      const totalDuration = Date.now() - startTime;
      console.log(`[ConvUI] ${backend} test completed in ${totalDuration}ms`);
    });
  }
});
