import { test, expect } from '../fixtures';
import {
  goToGuid,
  waitForDesktopGuidReady,
  AGENT_PILL,
  selectAgent,
  sendMessageFromGuid,
  waitForConversationAiReply,
  deleteConversation,
  startAutoApprovePermissionMessages,
  goToNewChat,
} from '../helpers';

const TARGET_BACKENDS = ['claude', 'hermes', 'opencode', 'openclaw', 'openclaw-gateway'] as const;

test.describe('CLI backends smoke', () => {
  test.setTimeout(240_000);

  test('list visible guid backends', async ({ page }) => {
    await goToGuid(page);
    await waitForDesktopGuidReady(page);
    await expect(page.locator(AGENT_PILL).first()).toBeVisible({ timeout: 15000 });
    const pills = await page.locator(AGENT_PILL).evaluateAll((els) =>
      els.map((el) => ({
        testid: el.getAttribute('data-testid'),
        key: el.getAttribute('data-agent-key'),
        selected: el.getAttribute('data-agent-selected'),
        text: (el.textContent || '').trim(),
      }))
    );
    console.log('[cli-backends-smoke] pills=', JSON.stringify(pills, null, 2));
    expect(pills.length).toBeGreaterThan(0);
  });

  for (const backend of TARGET_BACKENDS) {
    test(`smoke reply for ${backend}`, async ({ page }) => {
      await goToGuid(page);
      await waitForDesktopGuidReady(page);
      await expect(page.locator(AGENT_PILL).first()).toBeVisible({ timeout: 15000 });

      const visibleBackends = await page.locator(AGENT_PILL).evaluateAll((els) =>
        els
          .map((el) => ({
            key: el.getAttribute('data-agent-key'),
            testid: el.getAttribute('data-testid'),
          }))
          .filter(Boolean)
      );
      console.log(`[cli-backends-smoke] visible before ${backend}=`, JSON.stringify(visibleBackends));

      const hasTarget = visibleBackends.some((item) => item.key === backend || item.testid === `agent-pill-${backend}`);
      if (!hasTarget) {
        test.skip(true, `${backend} pill not visible`);
        return;
      }

      const stopAutoApprove = startAutoApprovePermissionMessages(page, 400);
      try {
        await selectAgent(page, backend);
        const conversationId = await sendMessageFromGuid(page, `Reply with exactly: smoke-${backend}`);
        const reply = await waitForConversationAiReply(page, conversationId, 180_000);
        console.log(`[cli-backends-smoke] reply for ${backend}:`, reply);
        expect(reply.toLowerCase()).toContain(`smoke-${backend}`);
        await deleteConversation(page, conversationId).catch(() => {});
        await goToNewChat(page).catch(() => {});
      } finally {
        stopAutoApprove();
      }
    });
  }
});
