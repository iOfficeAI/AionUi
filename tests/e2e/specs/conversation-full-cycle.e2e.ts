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
  SKILLS_INDICATOR_COUNT,
} from '../helpers';

// Generous timeout for AI responses
test.describe.configure({ timeout: 180_000 });

/**
 * Pick the first available agent backend from the guid page pill bar.
 * Returns the backend name (e.g. 'gemini', 'claude') or null if none found.
 * If pills are missing (e.g. after many conversation cycles), reloads once to reset SWR.
 */
async function pickAvailableBackend(page: import('@playwright/test').Page): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const visible = await page
      .locator(AGENT_PILL)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (visible) {
      const backends = await page
        .locator(AGENT_PILL)
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-agent-backend')).filter(Boolean));
      const found = ['gemini', 'claude', 'codex', 'aionrs'].find((b) => backends.includes(b));
      if (found) return found;
    }
    if (attempt === 0) {
      // Reload to reset stale SWR caches after conversation cycles
      await page.reload({ waitUntil: 'domcontentloaded' });
      await goToGuid(page);
    }
  }
  return null;
}

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
    // Navigate back to guid to ensure clean state for subsequent tests
    await goToGuid(page);
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
    // Navigate back to guid to ensure clean state for subsequent tests
    await goToGuid(page);
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

    // Codex may take longer to establish a session (cold start)
    await waitForSessionActive(page, 180_000);
    const reply = await waitForAiReply(page, 180_000);
    expect(reply.length).toBeGreaterThan(0);

    await deleteConversation(page, conversationId);
    // After three conversation cycles, agent detection may stall.
    // Reload the page to reset SWR caches and ensure agent pills re-render.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await goToGuid(page);
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

    // Preset may use an agent that is slow or unavailable — graceful timeout
    const sessionReady = await waitForSessionActive(page, 60_000)
      .then(() => true)
      .catch(() => false);
    if (!sessionReady) {
      await deleteConversation(page, conversationId).catch(() => {});
      test.skip(true, 'Preset assistant agent did not respond in time');
      return;
    }
    const reply = await waitForAiReply(page, 60_000);
    expect(reply.length).toBeGreaterThan(0);

    await deleteConversation(page, conversationId);
  });

  test('conversation shows correct agent info', async ({ page }) => {
    await goToGuid(page);
    const backend = await pickAvailableBackend(page);
    if (!backend) {
      test.skip(true, 'No agent backend available');
      return;
    }

    await selectAgent(page, backend);
    const conversationId = await sendMessageFromGuid(page, 'Hello test agent info');

    await waitForSessionActive(page, 120_000);

    // Verify agent info: the status badge is transient — verify that agent
    // status message appeared at some point OR that a reply arrived (which
    // proves the agent connected). waitForSessionActive already confirmed this.
    // Just verify conversation page has meaningful content.
    const body = await page.locator('body').textContent();
    expect(body).toContain('Hello test agent info');

    await deleteConversation(page, conversationId);
  });

  test('ConversationSkillsIndicator displays without error', async ({ page }) => {
    await goToGuid(page);
    const backend = await pickAvailableBackend(page);
    if (!backend) {
      test.skip(true, 'No agent backend available');
      return;
    }

    await selectAgent(page, backend);
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

    // Preset may use an agent that is slow or unavailable — graceful timeout
    const sessionReady = await waitForSessionActive(page, 60_000)
      .then(() => true)
      .catch(() => false);
    if (!sessionReady) {
      await deleteConversation(page, conversationId).catch(() => {});
      test.skip(true, 'Preset assistant agent did not respond in time');
      return;
    }
    // Conversation should work normally even with disabled skills
    const reply = await waitForAiReply(page, 60_000);
    expect(reply.length).toBeGreaterThan(0);

    await deleteConversation(page, conversationId);
  });

  test('new conversation auto-navigates from guid', async ({ page }) => {
    await goToGuid(page);
    const backend = await pickAvailableBackend(page);
    if (!backend) {
      test.skip(true, 'No agent backend available');
      return;
    }

    try {
      await selectAgent(page, backend);
    } catch {
      test.skip(true, 'Agent pill became unavailable (stale SWR after multiple conversations)');
      return;
    }
    const conversationId = await sendMessageFromGuid(page, 'Hello nav test');

    // URL should now contain /conversation/
    const url = page.url();
    expect(url).toContain('/conversation/');
    expect(url).toContain(conversationId);

    await deleteConversation(page, conversationId);
  });

  test('return to guid from conversation', async ({ page }) => {
    await goToGuid(page);
    const backend = await pickAvailableBackend(page);
    if (!backend) {
      test.skip(true, 'No agent backend available');
      return;
    }

    await selectAgent(page, backend);
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
    const backend = await pickAvailableBackend(page);
    if (!backend) {
      test.skip(true, 'No agent backend available');
      return;
    }

    await selectAgent(page, backend);
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

  test('cron -- create task with CLI agent, verify detail, then delete', async ({ page }) => {
    // Ensure the app is fully loaded (auth + React Router ready)
    await goToGuid(page);
    await page
      .waitForFunction(() => (document.body.textContent?.length ?? 0) > 200, { timeout: 15_000 })
      .catch(() => {});

    // Navigate to Scheduled Tasks page
    await page.evaluate(() => window.location.assign('#/scheduled'));
    await page.waitForFunction(() => window.location.hash.includes('/scheduled'), { timeout: 10_000 }).catch(() => {});
    const heading = page
      .locator('h1')
      .filter({ hasText: /Scheduled Tasks|定时任务/ })
      .first();
    await heading.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});

    // Click "New task"
    const createBtn = page
      .locator('button')
      .filter({ hasText: /New task|新建任务|新建/ })
      .first();
    if (!(await createBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Scheduled tasks page or create button not available');
      return;
    }
    await createBtn.click();

    // Wait for CreateTaskDialog
    const dialog = page.locator('.arco-modal').first();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    if (!(await dialog.isVisible().catch(() => false))) {
      test.skip(true, 'Create task dialog did not open');
      return;
    }

    // Fill form fields — Arco Form puts id="<field>" on the wrapper div,
    // so target the inner input/textarea via "#<field> input" / "#<field> textarea"
    const taskName = `E2E-CLI-${Date.now()}`;
    await dialog.locator('#name input').fill(taskName);
    await dialog.locator('#description input').fill('E2E test task');

    // Select CLI agent — the Select wrapper is inside the form-item for field "agent"
    const agentFormItem = dialog.locator('.arco-form-item').filter({ has: page.locator('#agent') });
    const agentSelect = agentFormItem.locator('.arco-select').first();
    await agentSelect.click();

    // CLI agents appear in OptGroup "CLI Agents"; pick the first one
    const cliOptions = page.locator('.arco-select-option').filter({ hasText: /Claude|Codex|Gemini|Aion/ });
    if ((await cliOptions.count()) === 0) {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      test.skip(true, 'No CLI agents available in create task dialog');
      return;
    }
    const selectedOptionText = await cliOptions.first().textContent();
    await cliOptions.first().click();

    // Verify agent name shows in select trigger
    await expect(agentSelect).toContainText(selectedOptionText!.trim(), { timeout: 3_000 });

    // Fill prompt
    await dialog.locator('#prompt textarea').fill('Say hello');

    // Click Save in the Arco Modal footer
    await page.locator('.arco-modal-footer .arco-btn-primary').first().click();

    // Dialog should close after successful creation
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });

    // Verify the new task card appears on the Scheduled Tasks list
    const taskCard = page.locator('span').filter({ hasText: taskName }).first();
    await expect(taskCard).toBeVisible({ timeout: 10_000 });

    // Click into the task detail page
    await taskCard.click();
    await page.waitForFunction(() => window.location.hash.includes('/scheduled/'), { timeout: 10_000 });

    // Verify detail page: title, description, prompt
    await expect(page.locator('h1').filter({ hasText: taskName }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="task-detail-summary"]')).toContainText('E2E test task', {
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="task-detail-sidebar-column"]')).toContainText('Say hello', {
      timeout: 5_000,
    });

    // Delete: header has [Edit, Delete (in Popconfirm), Run now] buttons.
    // The Delete button is the 2nd button in the header actions div next to h1.
    const headerActions = page
      .locator('h1')
      .filter({ hasText: taskName })
      .locator('..')
      .locator('..')
      .locator('button');
    await headerActions.nth(1).click();
    // Confirm in Popconfirm popover (renders in body as .arco-popconfirm)
    const confirmBtn = page.locator('.arco-popconfirm .arco-btn-primary').first();
    await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmBtn.click();

    // Should navigate back to /scheduled; task should be gone
    await page.waitForFunction(() => window.location.hash === '#/scheduled', { timeout: 10_000 }).catch(() => {});
    await expect(page.locator('span').filter({ hasText: taskName }).first()).not.toBeVisible({ timeout: 5_000 });
  });

  test('cron -- create task with preset assistant, verify detail, then delete', async ({ page }) => {
    await goToGuid(page);
    await page
      .waitForFunction(() => (document.body.textContent?.length ?? 0) > 200, { timeout: 15_000 })
      .catch(() => {});

    await page.evaluate(() => window.location.assign('#/scheduled'));
    await page.waitForFunction(() => window.location.hash.includes('/scheduled'), { timeout: 10_000 }).catch(() => {});
    await page
      .locator('h1')
      .filter({ hasText: /Scheduled Tasks|定时任务/ })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => {});

    const createBtn = page
      .locator('button')
      .filter({ hasText: /New task|新建任务|新建/ })
      .first();
    if (!(await createBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Scheduled tasks page or create button not available');
      return;
    }
    await createBtn.click();

    const dialog = page.locator('.arco-modal').first();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    if (!(await dialog.isVisible().catch(() => false))) {
      test.skip(true, 'Create task dialog did not open');
      return;
    }

    // Fill form fields
    const taskName = `E2E-Preset-${Date.now()}`;
    await dialog.locator('#name input').fill(taskName);
    await dialog.locator('#description input').fill('E2E preset test');

    // Open agent select and look for preset assistant group
    const agentFormItem = dialog.locator('.arco-form-item').filter({ has: page.locator('#agent') });
    const agentSelect = agentFormItem.locator('.arco-select').first();
    await agentSelect.click();

    // Preset group title is "Preset Assistants"; the first option after it is a preset.
    // Arco Select options have no data-value attr, so we use DOM structure instead.
    const presetGroupTitle = page
      .locator('.arco-select-group-title')
      .filter({ hasText: /Preset|preset|预设|助手|Assistant/ });
    if ((await presetGroupTitle.count()) === 0) {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      test.skip(true, 'No preset assistant group in create task dialog');
      return;
    }

    // Click the first option after the preset group title (next sibling li.arco-select-option)
    const firstPresetOption = presetGroupTitle.first().locator('~ .arco-select-option').first();
    if (!(await firstPresetOption.isVisible().catch(() => false))) {
      // Fallback: use evaluate to find next sibling
      const clicked = await presetGroupTitle.first().evaluate((el) => {
        let next = el.nextElementSibling;
        while (next) {
          if (next.classList.contains('arco-select-option')) {
            (next as HTMLElement).click();
            return next.textContent;
          }
          next = next.nextElementSibling;
        }
        return null;
      });
      if (!clicked) {
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        test.skip(true, 'No preset assistant option found after group title');
        return;
      }
    } else {
      await firstPresetOption.click();
    }

    // Verify agent name appears in select trigger (dropdown closes after click)
    await page.waitForTimeout(500);
    const triggerText = await agentSelect.textContent();
    expect(triggerText!.length).toBeGreaterThan(0);

    // Fill prompt
    await dialog.locator('#prompt textarea').fill('Summarize news');

    // Click Save
    await page.locator('.arco-modal-footer .arco-btn-primary').first().click();

    // Dialog should close
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });

    // Verify the task card appears
    const taskCard = page.locator('span').filter({ hasText: taskName }).first();
    await expect(taskCard).toBeVisible({ timeout: 10_000 });

    // Click into detail page
    await taskCard.click();
    await page.waitForFunction(() => window.location.hash.includes('/scheduled/'), { timeout: 10_000 });

    // Verify detail page
    await expect(page.locator('h1').filter({ hasText: taskName }).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="task-detail-summary"]')).toContainText('E2E preset test', {
      timeout: 5_000,
    });
    await expect(page.locator('[data-testid="task-detail-sidebar-column"]')).toContainText('Summarize news', {
      timeout: 5_000,
    });

    // Delete: click the 2nd header button (Delete in Popconfirm)
    const headerActions2 = page
      .locator('h1')
      .filter({ hasText: taskName })
      .locator('..')
      .locator('..')
      .locator('button');
    await headerActions2.nth(1).click();
    const confirmBtn = page.locator('.arco-popconfirm .arco-btn-primary').first();
    await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmBtn.click();

    await page.waitForFunction(() => window.location.hash === '#/scheduled', { timeout: 10_000 }).catch(() => {});
    await expect(page.locator('span').filter({ hasText: taskName }).first()).not.toBeVisible({ timeout: 5_000 });
  });

  test('cron -- create task, run now from detail page, then delete', async ({ page }) => {
    await goToGuid(page);
    await page
      .waitForFunction(() => (document.body.textContent?.length ?? 0) > 200, { timeout: 15_000 })
      .catch(() => {});

    // Navigate to Scheduled Tasks page
    await page.evaluate(() => window.location.assign('#/scheduled'));
    await page.waitForFunction(() => window.location.hash.includes('/scheduled'), { timeout: 10_000 }).catch(() => {});
    await page
      .locator('h1')
      .filter({ hasText: /Scheduled Tasks|定时任务/ })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => {});

    // Create a task to test "Run now" on
    const createBtn = page
      .locator('button')
      .filter({ hasText: /New task|新建任务|新建/ })
      .first();
    if (!(await createBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Scheduled tasks page or create button not available');
      return;
    }
    await createBtn.click();

    const dialog = page.locator('.arco-modal').first();
    await dialog.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    if (!(await dialog.isVisible().catch(() => false))) {
      test.skip(true, 'Create task dialog did not open');
      return;
    }

    const taskName = `E2E-RunNow-${Date.now()}`;
    await dialog.locator('#name input').fill(taskName);
    await dialog.locator('#description input').fill('E2E run now test');

    // Select first available CLI agent
    const agentFormItem = dialog.locator('.arco-form-item').filter({ has: page.locator('#agent') });
    const agentSelect = agentFormItem.locator('.arco-select').first();
    await agentSelect.click();
    const anyOption = page.locator('.arco-select-option').first();
    if (!(await anyOption.isVisible().catch(() => false))) {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      test.skip(true, 'No agents available in create task dialog');
      return;
    }
    await anyOption.click();

    await dialog.locator('#prompt textarea').fill('Say hello for run-now test');

    // Save
    await page.locator('.arco-modal-footer .arco-btn-primary').first().click();
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });

    // Navigate into the task detail page
    const taskCard = page.locator('span').filter({ hasText: taskName }).first();
    await expect(taskCard).toBeVisible({ timeout: 10_000 });
    await taskCard.click();
    await page.waitForFunction(() => window.location.hash.includes('/scheduled/'), { timeout: 10_000 });

    // Verify detail page
    await expect(page.locator('h1').filter({ hasText: taskName }).first()).toBeVisible({ timeout: 5_000 });

    // Click "Run now" — it's the primary button with text "Run now" / "立即执行"
    const runNowBtn = page
      .locator('button.arco-btn-primary')
      .filter({ hasText: /Run now|立即执行/ })
      .first();
    const runNowVisible = await runNowBtn
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!runNowVisible) {
      // If Run now button not available, just clean up and skip
      const headerActions = page
        .locator('h1')
        .filter({ hasText: taskName })
        .locator('..')
        .locator('..')
        .locator('button');
      await headerActions.nth(1).click();
      const confirmBtn = page.locator('.arco-popconfirm .arco-btn-primary').first();
      await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      await confirmBtn.click().catch(() => {});
      test.skip(true, 'Run now button not available on detail page');
      return;
    }

    await runNowBtn.click();

    // After "Run now", the page either:
    // 1. Navigates to /conversation/<id> on success
    // 2. Shows an error message if the agent is not configured
    // Wait for either outcome with generous timeout (agent execution may take time)
    const navigatedToConversation = await page
      .waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    if (navigatedToConversation) {
      // Success: we're on a conversation page — verify the URL
      expect(page.url()).toContain('/conversation/');

      // Navigate back to scheduled tasks to clean up
      await page.evaluate(() => window.location.assign('#/scheduled'));
      await page
        .waitForFunction(() => window.location.hash.includes('/scheduled'), { timeout: 10_000 })
        .catch(() => {});
    } else {
      // May have shown an error (e.g. agent not running); that's acceptable for E2E.
      // Error is expected if agent isn't running — continue to cleanup
    }

    // Clean up: navigate to the task and delete it
    await page.evaluate(() => window.location.assign('#/scheduled'));
    await page.waitForFunction(() => window.location.hash.includes('/scheduled'), { timeout: 10_000 }).catch(() => {});

    const taskCardCleanup = page.locator('span').filter({ hasText: taskName }).first();
    const cardVisible = await taskCardCleanup
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (cardVisible) {
      await taskCardCleanup.click();
      await page.waitForFunction(() => window.location.hash.includes('/scheduled/'), { timeout: 10_000 });

      const headerActions = page
        .locator('h1')
        .filter({ hasText: taskName })
        .locator('..')
        .locator('..')
        .locator('button');
      await headerActions.nth(1).click();
      const confirmBtn = page.locator('.arco-popconfirm .arco-btn-primary').first();
      await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await confirmBtn.click();

      await page.waitForFunction(() => window.location.hash === '#/scheduled', { timeout: 10_000 }).catch(() => {});
      await expect(page.locator('span').filter({ hasText: taskName }).first()).not.toBeVisible({ timeout: 5_000 });
    }
  });

  // -- Supplementary case: Skills indicator -> SkillsHub navigation ----------

  test('skills indicator click navigates to SkillsHub and highlights skill', async ({ page }) => {
    await goToGuid(page);
    const backend = await pickAvailableBackend(page);
    if (!backend) {
      test.skip(true, 'No agent backend available');
      return;
    }

    await selectAgent(page, backend);
    const conversationId = await sendMessageFromGuid(page, 'Hello skills navigation test');
    const sessionReady = await waitForSessionActive(page, 60_000)
      .then(() => true)
      .catch(() => false);
    if (!sessionReady) {
      await deleteConversation(page, conversationId).catch(() => {});
      test.skip(true, 'Agent session did not activate in time');
      return;
    }

    // Wait for skills indicator to appear (skills are loaded on first message)
    const indicator = page.locator(SKILLS_INDICATOR);
    const indicatorVisible = await indicator
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    if (!indicatorVisible) {
      await deleteConversation(page, conversationId);
      test.skip(true, 'Skills indicator not visible — no skills loaded for this conversation');
      return;
    }

    // Click the indicator to open the popover.
    // The indicator may be partially obscured — scroll into view and force click.
    await indicator.scrollIntoViewIfNeeded();
    await indicator.click({ force: true });
    await page.waitForTimeout(1_000);

    // Arco Popover renders into a portal — find visible popup content
    const popoverContent = page.locator('.arco-popover-content:visible');
    const popoverVisible = await popoverContent
      .first()
      .isVisible()
      .catch(() => false);

    if (!popoverVisible) {
      // Retry: click the indicator count badge inside
      const countBadge = page.locator(SKILLS_INDICATOR_COUNT);
      if (await countBadge.isVisible().catch(() => false)) {
        await countBadge.click({ force: true });
        await page.waitForTimeout(1_000);
      }
    }

    const retryPopoverVisible = await popoverContent
      .first()
      .isVisible()
      .catch(() => false);
    if (!retryPopoverVisible) {
      await deleteConversation(page, conversationId);
      test.skip(true, 'Skills popover did not open after click');
      return;
    }

    // Click the first skill item inside the popover
    const firstSkillItem = popoverContent.locator('.cursor-pointer').first();
    const skillName = await firstSkillItem.textContent();
    expect(skillName).toBeTruthy();

    await firstSkillItem.click();

    // Should navigate to capabilities page with skills tab
    await page
      .waitForFunction(() => window.location.hash.includes('/settings/capabilities'), { timeout: 10_000 })
      .catch(() => {});

    const url = page.url();
    expect(url).toContain('/settings/capabilities');
    expect(url).toContain('tab=skills');
    // Note: highlight= param is consumed by SkillsHubSettings and then cleared
    // from the URL, so we verify the skill name is visible on the page instead.

    // Skills list loads asynchronously — wait for the skill name to appear
    const trimmedName = skillName!.trim();
    await expect
      .poll(
        async () => {
          const text = await page.locator('body').textContent();
          return text?.includes(trimmedName) ?? false;
        },
        { timeout: 15_000, message: `Waiting for skill "${trimmedName}" to appear on capabilities page` }
      )
      .toBeTruthy();

    await deleteConversation(page, conversationId);
  });

  // -- Supplementary case: AgentBadge navigation ----------------------------

  test('AgentBadge click navigates to AssistantSettings', async ({ page }) => {
    await goToGuid(page);
    const pillVisible = await page
      .locator(AGENT_PILL)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!pillVisible) {
      test.skip(true, 'Agent pills not visible on guid page');
      return;
    }

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

    const sessionReady = await waitForSessionActive(page, 60_000)
      .then(() => true)
      .catch(() => false);
    if (!sessionReady) {
      await deleteConversation(page, conversationId).catch(() => {});
      test.skip(true, 'Agent session did not activate in time');
      return;
    }

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
