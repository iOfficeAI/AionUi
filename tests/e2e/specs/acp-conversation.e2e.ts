/**
 * ACP Conversation Lifecycle – E2E tests.
 *
 * Covers the full conversation lifecycle for ACP-backed agents:
 *   - Select agent on guid page
 *   - Send a message to create a conversation
 *   - Wait for the ACP session to become active
 *   - Delete the conversation to release resources
 *
 * These tests require the corresponding ACP backends (Claude Code CLI,
 * Codex CLI) to be installed and authenticated on the machine.
 * Skip in CI unless the backends are explicitly available.
 */
import { test, expect } from '../fixtures';
import {
  goToGuid,
  findAssistantIdForBackend,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  deleteConversation,
} from '../helpers';

const ACP_BACKENDS = ['claude'] as const;

test.describe.skip('ACP Conversation Lifecycle', () => {
  // These tests hit real ACP backends — allow generous timeouts
  test.setTimeout(180_000);

  for (const backend of ACP_BACKENDS) {
    test(`${backend}: create session, wait for active, then delete`, async ({ page }) => {
      await goToGuid(page);

      const assistantId = await findAssistantIdForBackend(page, backend, { requireAvailable: true });
      if (!assistantId) {
        test.skip(true, `${backend} assistant pill not available — backend may not be installed`);
        return;
      }
      await selectAgent(page, backend);

      // Send message to create conversation
      const conversationId = await sendMessageFromGuid(page, `e2e lifecycle test ${backend}`);
      expect(conversationId).toBeTruthy();

      // Wait for session_active status
      await waitForSessionActive(page, 120_000);

      // Delete conversation via UI (sidebar menu → confirm modal → auto-navigates away)
      const deleted = await deleteConversation(page, conversationId);
      expect(deleted).toBe(true);
    });
  }
});
