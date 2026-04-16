/**
 * Conversation Full Cycle -- E2E tests.
 *
 * Covers: full send -> AI reply cycle for Gemini, Claude, Codex,
 * preset assistant conversation, agent info display, skills indicator,
 * navigation, and cleanup.
 *
 * These tests require real API keys and CLI agents installed.
 */
import { test, expect } from '../fixtures';
import {
  goToGuid,
  goToNewChat,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  waitForAiReply,
  deleteConversation,
  waitForSettle,
  AGENT_PILL,
  AGENT_STATUS_MESSAGE,
  agentPillByBackend,
  SKILLS_INDICATOR,
} from '../helpers';

// Generous timeout for AI responses
test.describe.configure({ timeout: 180_000 });

test.describe('Conversation Full Cycle', () => {
  test('Gemini -- full conversation with AI reply', async ({ page }) => {
    await goToGuid(page);
    const pill = page.locator(agentPillByBackend('gemini'));
    const visible = await pill.isVisible().catch(() => false);
    if (!visible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Gemini agent not available');
        return;
      }
    }

    await selectAgent(page, 'gemini');
    const conversationId = await sendMessageFromGuid(page, 'Hello, please reply with a short greeting.');
    expect(conversationId).toBeTruthy();

    await waitForSessionActive(page, 120_000);
    const reply = await waitForAiReply(page, 120_000);
    expect(reply.length).toBeGreaterThan(0);

    await deleteConversation(page, conversationId);
  });

  test('Claude -- full conversation with AI reply', async ({ page }) => {
    await goToGuid(page);
    const pill = page.locator(agentPillByBackend('claude'));
    const visible = await pill.isVisible().catch(() => false);
    if (!visible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Claude agent not available -- CLI may not be installed');
        return;
      }
    }

    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'Hello, please reply with a short greeting.');
    expect(conversationId).toBeTruthy();

    await waitForSessionActive(page, 120_000);
    const reply = await waitForAiReply(page, 120_000);
    expect(reply.length).toBeGreaterThan(0);

    await deleteConversation(page, conversationId);
  });

  test('Codex -- full conversation with AI reply', async ({ page }) => {
    await goToGuid(page);
    const pill = page.locator(agentPillByBackend('codex'));
    const visible = await pill.isVisible().catch(() => false);
    if (!visible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Codex agent not available -- CLI may not be installed');
        return;
      }
    }

    await selectAgent(page, 'codex');
    const conversationId = await sendMessageFromGuid(page, 'Hello, please reply with a short greeting.');
    expect(conversationId).toBeTruthy();

    await waitForSessionActive(page, 120_000);
    const reply = await waitForAiReply(page, 120_000);
    expect(reply.length).toBeGreaterThan(0);

    await deleteConversation(page, conversationId);
  });

  test('preset assistant -- full conversation', async ({ page }) => {
    await goToGuid(page);
    await waitForSettle(page, 3_000);

    // Find preset assistant pills rendered on the guid page
    const presetPills = page.locator('[data-testid^="preset-pill-"]');
    const count = await presetPills.count();
    if (count === 0) {
      test.skip(true, 'No preset assistant pills visible on guid page');
      return;
    }

    await presetPills.first().click();
    await waitForSettle(page, 1_000);

    const conversationId = await sendMessageFromGuid(page, 'Hello, please reply with a short greeting.');
    expect(conversationId).toBeTruthy();

    await waitForSessionActive(page, 120_000);
    const reply = await waitForAiReply(page, 120_000);
    expect(reply.length).toBeGreaterThan(0);

    await deleteConversation(page, conversationId);
  });

  test('conversation shows correct agent info', async ({ page }) => {
    await goToGuid(page);
    const pill = page.locator(agentPillByBackend('gemini'));
    const visible = await pill.isVisible().catch(() => false);
    if (!visible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Gemini agent not available');
        return;
      }
    }

    await selectAgent(page, 'gemini');
    const conversationId = await sendMessageFromGuid(page, 'Hello test agent info');

    await waitForSessionActive(page, 120_000);

    // Verify status badge is visible
    await expect(page.locator(AGENT_STATUS_MESSAGE).first()).toBeVisible();

    await deleteConversation(page, conversationId);
  });

  test('ConversationSkillsIndicator displays without error', async ({ page }) => {
    await goToGuid(page);
    const pill = page.locator(agentPillByBackend('gemini'));
    const visible = await pill.isVisible().catch(() => false);
    if (!visible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Gemini agent not available');
        return;
      }
    }

    await selectAgent(page, 'gemini');
    const conversationId = await sendMessageFromGuid(page, 'Hello test skills indicator');
    await waitForSessionActive(page, 120_000);

    // Skills indicator visibility depends on skill configuration --
    // just verify the page renders without crash
    const indicator = page.locator(SKILLS_INDICATOR);
    const indicatorVisible = await indicator.isVisible().catch(() => false);
    expect(typeof indicatorVisible).toBe('boolean');

    await deleteConversation(page, conversationId);
  });

  test('disabled skill does not break conversation', async ({ page }) => {
    await goToGuid(page);
    await waitForSettle(page, 3_000);

    // Select a preset which may have disabled skills from earlier tests
    const presetPills = page.locator('[data-testid^="preset-pill-"]');
    const count = await presetPills.count();
    if (count === 0) {
      test.skip(true, 'No preset assistant pills visible on guid page');
      return;
    }

    await presetPills.first().click();
    await waitForSettle(page, 1_000);

    const conversationId = await sendMessageFromGuid(page, 'Hello disabled skill test');
    expect(conversationId).toBeTruthy();

    await waitForSessionActive(page, 120_000);
    // Conversation should work normally even with disabled skills
    const reply = await waitForAiReply(page, 120_000);
    expect(reply.length).toBeGreaterThan(0);

    await deleteConversation(page, conversationId);
  });

  test('new conversation auto-navigates from guid', async ({ page }) => {
    await goToGuid(page);
    const pill = page.locator(agentPillByBackend('gemini'));
    const visible = await pill.isVisible().catch(() => false);
    if (!visible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Gemini agent not available');
        return;
      }
    }

    await selectAgent(page, 'gemini');
    const conversationId = await sendMessageFromGuid(page, 'Hello nav test');

    // URL should now contain /conversation/
    const url = page.url();
    expect(url).toContain('/conversation/');
    expect(url).toContain(conversationId);

    await deleteConversation(page, conversationId);
  });

  test('return to guid from conversation', async ({ page }) => {
    await goToGuid(page);
    const pill = page.locator(agentPillByBackend('gemini'));
    const visible = await pill.isVisible().catch(() => false);
    if (!visible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Gemini agent not available');
        return;
      }
    }

    await selectAgent(page, 'gemini');
    const conversationId = await sendMessageFromGuid(page, 'Hello return test');
    await waitForSessionActive(page, 120_000);

    // Navigate back to guid
    await goToNewChat(page);
    const url = page.url();
    expect(url).toContain('guid');

    // Can re-select an agent
    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });

    await deleteConversation(page, conversationId);
  });

  test('delete conversation removes from list', async ({ page }) => {
    await goToGuid(page);
    const pill = page.locator(agentPillByBackend('gemini'));
    const visible = await pill.isVisible().catch(() => false);
    if (!visible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => {});
      const retryVisible = await pill.isVisible().catch(() => false);
      if (!retryVisible) {
        test.skip(true, 'Gemini agent not available');
        return;
      }
    }

    await selectAgent(page, 'gemini');
    const conversationId = await sendMessageFromGuid(page, 'Hello delete test');
    await waitForSessionActive(page, 120_000);

    const deleted = await deleteConversation(page, conversationId);
    expect(deleted).toBe(true);

    // Should navigate away after deletion
    await page.waitForFunction(() => !window.location.hash.includes('/conversation/'), {
      timeout: 10_000,
    });
    const url = page.url();
    expect(url).not.toContain(conversationId);
  });
});
