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
  selectAssistantForBackend,
  sendMessageFromGuid,
  waitForSessionActive,
  deleteConversation,
  AGENT_STATUS_MESSAGE,
} from '../helpers';

const ACP_BACKENDS = ['claude', 'codex'] as const;

test.describe('ACP Conversation Lifecycle', () => {
  // These tests hit real ACP backends — allow generous timeouts
  test.setTimeout(180_000);

  for (const backend of ACP_BACKENDS) {
    test(`${backend}: create session, wait for active, then delete`, async ({ page }) => {
      await goToGuid(page);

      const assistantId = await selectAssistantForBackend(page, backend);
      if (!assistantId) {
        test.skip(true, `${backend} assistant pill not available — backend may not be installed`);
        return;
      }

      // Send message to create conversation
      const conversationId = await sendMessageFromGuid(page, `e2e lifecycle test ${backend}`);
      expect(conversationId).toBeTruthy();

      // Wait for session_active status
      await waitForSessionActive(page, 120_000);

      // Verify status badge is visible
      await expect(page.locator(AGENT_STATUS_MESSAGE).first()).toBeVisible();

      // Delete conversation via UI (sidebar menu → confirm modal → auto-navigates away)
      const deleted = await deleteConversation(page, conversationId);
      expect(deleted).toBe(true);
    });
  }
});
