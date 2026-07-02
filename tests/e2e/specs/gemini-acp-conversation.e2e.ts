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
  selectAssistantForBackend,
  sendMessageFromGuid,
  waitForSessionActive,
  deleteConversation,
} from '../helpers';

test.describe('Gemini (ACP) Conversation Lifecycle', () => {
  // Real Gemini CLI is slow on cold start (OAuth, token refresh)
  test.setTimeout(180_000);

  test('gemini backend routes through the generic ACP pipeline', async ({ page }) => {
    await goToGuid(page);

    const assistantId = await selectAssistantForBackend(page, 'gemini');
    if (!assistantId) {
      test.skip(true, 'gemini assistant pill not available — backend may not be installed');
      return;
    }

    const conversationId = await sendMessageFromGuid(page, 'e2e lifecycle test gemini');
    expect(conversationId).toBeTruthy();

    // Generic ACP session status flow is the whole point — Gemini must look
    // identical to claude/codex here. Long timeout because Gemini auth can
    // require a token refresh on first use.
    await waitForSessionActive(page, 150_000);

    const deleted = await deleteConversation(page, conversationId);
    expect(deleted).toBe(true);
  });
});
