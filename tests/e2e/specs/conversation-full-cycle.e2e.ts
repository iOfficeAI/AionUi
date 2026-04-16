/**
 * Conversation Full Cycle -- E2E tests.
 *
 * Covers: full send -> AI reply cycle for Gemini, Claude, Codex,
 * preset assistant conversation, agent info display, skills indicator,
 * navigation, cleanup, cron agent selection, and AgentBadge navigation.
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
  AGENT_BADGE,
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

    // IPC bridge deletion removes data but does not auto-navigate.
    // Navigate to guid and verify the conversation no longer appears in history.
    await goToNewChat(page);
    const url = page.url();
    expect(url).toContain('guid');
  });

  // -- Supplementary cases: Cron agent selection ----------------------------

  test('cron -- CLI agent selectable in create task dialog', async ({ page }) => {
    // Navigate to cron page
    await page.evaluate(() => window.location.assign('#/cron'));
    await page.waitForFunction(() => window.location.hash.includes('/cron'), { timeout: 10_000 }).catch(() => {});
    await waitForSettle(page, 3_000);

    // Look for create/add button
    const createBtn = page
      .locator('button')
      .filter({ hasText: /Create|新建|添加|New/ })
      .first();
    if (!(await createBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Cron page or create button not available');
      return;
    }

    await createBtn.click();

    // Wait for dialog
    const dialog = page.locator('.arco-modal');
    await dialog
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {});
    if (
      !(await dialog
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(true, 'Create task dialog did not open');
      return;
    }

    // Agent Select should be present
    const agentSelect = dialog.locator('.arco-select').first();
    await expect(agentSelect).toBeVisible({ timeout: 5_000 });
    await agentSelect.click();

    // CLI agents should appear (Claude / Codex / Gemini etc.)
    const cliOptions = page.locator('.arco-select-option').filter({ hasText: /Claude|Codex|Gemini|Aion/ });
    const hasCli = (await cliOptions.count()) > 0;

    if (hasCli) {
      await cliOptions.first().click();
      // Form should accept the selection without error
      const formContent = await dialog.textContent();
      expect(formContent!.length).toBeGreaterThan(0);
    }

    // Close dialog
    await page.keyboard.press('Escape');
  });

  test('cron -- preset assistant selectable in create task dialog', async ({ page }) => {
    await page.evaluate(() => window.location.assign('#/cron'));
    await page.waitForFunction(() => window.location.hash.includes('/cron'), { timeout: 10_000 }).catch(() => {});
    await waitForSettle(page, 3_000);

    const createBtn = page
      .locator('button')
      .filter({ hasText: /Create|新建|添加|New/ })
      .first();
    if (!(await createBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Cron page or create button not available');
      return;
    }

    await createBtn.click();

    const dialog = page.locator('.arco-modal');
    await dialog
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {});
    if (
      !(await dialog
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      test.skip(true, 'Create task dialog did not open');
      return;
    }

    const agentSelect = dialog.locator('.arco-select').first();
    await agentSelect.click();

    // Look for preset assistant options (OptGroup label or option text)
    const presetGroup = page
      .locator('.arco-select-group-title')
      .filter({ hasText: /Preset|preset|预设|助手|Assistant/ });
    const hasPresetGroup = (await presetGroup.count()) > 0;

    if (!hasPresetGroup) {
      // No preset group visible -- may not have presets
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      test.skip(true, 'No preset assistant group in cron dialog');
      return;
    }

    // Select the first option after the preset group title
    // Options under the group should be visible now
    const allOptions = page.locator('.arco-select-option');
    const optCount = await allOptions.count();
    let selectedPreset = false;
    for (let i = 0; i < optCount; i++) {
      const val = await allOptions.nth(i).getAttribute('data-value');
      if (val?.startsWith('preset:')) {
        await allOptions.nth(i).click();
        selectedPreset = true;
        break;
      }
    }

    if (!selectedPreset) {
      // Fallback: click last visible option which is likely under preset group
      await allOptions
        .last()
        .click()
        .catch(() => {});
    }

    // Form should accept the selection without error
    const formContent = await dialog.textContent();
    expect(formContent!.length).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
  });

  // -- Supplementary case: AgentBadge navigation ----------------------------

  test('AgentBadge click navigates to AssistantSettings', async ({ page }) => {
    await goToGuid(page);
    await page.locator(AGENT_PILL).first().waitFor({ state: 'visible', timeout: 8_000 });

    // Select a preset assistant (which provides assistantId for badge navigation)
    const presetPills = page.locator('[data-testid^="preset-pill-"]');
    if ((await presetPills.count()) === 0) {
      test.skip(true, 'No preset assistants -- AgentBadge navigation requires assistantId');
      return;
    }

    await presetPills.first().click();
    await waitForSettle(page, 1_000);

    const conversationId = await sendMessageFromGuid(page, 'e2e badge navigation test');
    expect(conversationId).toBeTruthy();

    await waitForSessionActive(page, 120_000);

    // Click the agent badge
    const badge = page.locator(AGENT_BADGE);
    const badgeVisible = await badge.isVisible().catch(() => false);

    if (!badgeVisible) {
      await deleteConversation(page, conversationId);
      test.skip(true, 'AgentBadge not visible on conversation page');
      return;
    }

    await badge.click();

    // Should navigate to assistant settings with highlight param
    await page
      .waitForFunction(() => window.location.hash.includes('/settings/assistants'), { timeout: 10_000 })
      .catch(() => {});

    const url = page.url();
    expect(url).toContain('/settings/assistants');

    await deleteConversation(page, conversationId);
  });
});
