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
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  deleteConversation,
  AGENT_PILL,
  AGENT_STATUS_MESSAGE,
  agentPillByBackend,
} from '../helpers';

const ACP_BACKENDS = ['claude', 'codex'] as const;

test.describe('ACP Conversation Lifecycle', () => {
  // These tests hit real ACP backends — allow generous timeouts
  test.setTimeout(180_000);

  for (const backend of ACP_BACKENDS) {
    test(`${backend}: create session, wait for active, then delete`, async ({ page }) => {
      await goToGuid(page);

      // Skip if this backend pill is not available (CLI not installed)
      const pill = page.locator(agentPillByBackend(backend));
      const pillVisible = await pill.isVisible().catch(() => false);
      if (!pillVisible) {
        // Wait a moment for lazy-loaded pills
        await page
          .locator(AGENT_PILL)
          .first()
          .waitFor({ state: 'visible', timeout: 8_000 })
          .catch(() => {});
        const retryVisible = await pill.isVisible().catch(() => false);
        if (!retryVisible) {
          test.skip(true, `${backend} agent pill not available — CLI may not be installed`);
          return;
        }
      }

      // Select agent
      await selectAgent(page, backend);

      // Send message to create conversation
      const conversationId = await sendMessageFromGuid(page, `e2e lifecycle test ${backend}`);
      expect(conversationId).toBeTruthy();

      // Wait for session_active status
      await waitForSessionActive(page, 120_000);

      // Verify status badge is visible
      await expect(page.locator(AGENT_STATUS_MESSAGE).first()).toBeVisible();

      // Delete conversation (cleanup + verify IPC works)
      const deleted = await deleteConversation(page, conversationId);
      expect(deleted).toBe(true);

      // Navigate back to guid after deletion (IPC bridge delete does not auto-navigate)
      await page.evaluate(() => window.location.assign('#/guid'));
      await page.waitForFunction(() => !window.location.hash.includes('/conversation/'), {
        timeout: 10_000,
      });
    });
  }
});
