/**
 * Gemini-as-ACP Conversation Lifecycle — E2E test.
 *
 * Verifies that after the Gemini→ACP migration, creating and running a
 * conversation against the `gemini` backend flows through the same
 * code path as every other ACP agent (claude, codex, …).
 *
 * Requires a local `gemini` CLI on PATH and a usable authentication
 * (Google OAuth via `gemini auth login` or GEMINI_API_KEY env var).
 * Skips when the gemini agent pill is not detected — e.g. on CI
 * without the CLI installed.
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

test.describe('Gemini (ACP) Conversation Lifecycle', () => {
  // Real Gemini CLI is slow on cold start (OAuth, token refresh)
  test.setTimeout(180_000);

  test('gemini backend routes through the generic ACP pipeline', async ({ page }) => {
    await goToGuid(page);

    const pill = page.locator(agentPillByBackend('gemini'));
    const pillVisible = await pill.isVisible().catch(() => false);
    if (!pillVisible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'gemini agent pill not available — CLI may not be installed');
        return;
      }
    }

    await selectAgent(page, 'gemini');

    const conversationId = await sendMessageFromGuid(page, 'e2e lifecycle test gemini');
    expect(conversationId).toBeTruthy();

    // Generic ACP session status flow is the whole point — Gemini must look
    // identical to claude/codex here. Long timeout because Gemini auth can
    // require a token refresh on first use.
    await waitForSessionActive(page, 150_000);

    await expect(page.locator(AGENT_STATUS_MESSAGE).first()).toBeVisible();

    const deleted = await deleteConversation(page, conversationId);
    expect(deleted).toBe(true);
  });
});
