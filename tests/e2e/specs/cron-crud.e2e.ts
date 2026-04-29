/**
 * Cron CRUD E2E tests.
 *
 * Verifies the full lifecycle of scheduled tasks via real AI conversations:
 * 1. Send a message asking AI to create a scheduled task
 * 2. AI outputs [CRON_LIST] → system responds → AI outputs [CRON_CREATE]
 * 3. Verify task appears in sidebar and scheduled tasks page
 * 4. Send a follow-up message to modify the task
 * 5. AI outputs [CRON_UPDATE] preserving conversations
 * 6. Delete task from detail page, verify conversation still accessible
 */
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers/bridge';
import { goToGuid } from '../helpers/navigation';
import {
  AGENT_PILL,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  waitForAiReply,
  deleteConversation,
  startAutoApprovePermissionMessages,
} from '../helpers';

interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; description?: string };
  target: { payload: { kind: string; text: string }; executionMode?: string };
  metadata: { conversation_id: string; [key: string]: unknown };
}

async function pickAvailableBackend(page: import('@playwright/test').Page): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const visible = await page
      .locator(AGENT_PILL)
      .first()
      .waitFor({ state: 'visible', timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    if (visible) {
      const backends = await page
        .locator(AGENT_PILL)
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-agent-backend')).filter(Boolean));
      const preferred = ['gemini', 'claude', 'codex', 'aionrs'].find((backend) => backends.includes(backend));
      const found = preferred ?? backends[0] ?? null;
      if (found) return found;
    }
    if (attempt === 0) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await goToGuid(page);
    }
  }
  return null;
}

// ── Bridge helpers ──────────────────────────────────────────────────────────

async function listCronJobs(page: import('@playwright/test').Page): Promise<CronJob[]> {
  return invokeBridge<CronJob[]>(page, 'cron.list-jobs', undefined, 10_000);
}

async function getCronJob(page: import('@playwright/test').Page, jobId: string): Promise<CronJob | null> {
  return invokeBridge<CronJob | null>(page, 'cron.get-job', { job_id: jobId }, 10_000);
}

async function removeCronJob(page: import('@playwright/test').Page, jobId: string): Promise<void> {
  return invokeBridge<void>(page, 'cron.remove-job', { job_id: jobId }, 10_000);
}

// ── Conversation helpers ───────────────────────────────────────────────────

async function sendFollowUpMessage(page: import('@playwright/test').Page, message: string): Promise<void> {
  const textarea = page.locator('.sendbox-panel textarea');
  await textarea.waitFor({ state: 'visible', timeout: 10_000 });
  await textarea.fill(message);
  await textarea.press('Enter');
}

/**
 * Wait for a cron job to be created in the current conversation.
 * Polls the bridge API until a job appears whose conversationId matches.
 */
async function waitForCronJobCreated(
  page: import('@playwright/test').Page,
  conversationId: string,
  timeoutMs = 120_000
): Promise<CronJob> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const jobs = await listCronJobs(page);
    const found = jobs.find((j) => j.metadata.conversation_id === conversationId);
    if (found) return found;
    await page.waitForTimeout(2_000);
  }
  throw new Error(`No cron job created for conversation ${conversationId} within ${timeoutMs}ms`);
}

/**
 * Wait for a cron job to be updated (name changed).
 * Polls until the job's name differs from the original.
 */
async function waitForCronJobUpdated(
  page: import('@playwright/test').Page,
  jobId: string,
  originalName: string,
  timeoutMs = 120_000
): Promise<CronJob> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getCronJob(page, jobId);
    if (job && job.name !== originalName) return job;
    await page.waitForTimeout(2_000);
  }
  throw new Error(`Cron job ${jobId} was not updated within ${timeoutMs}ms`);
}

// ── UI helpers ─────────────────────────────────────────────────────────────

async function navigateToScheduled(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => window.location.assign('#/scheduled'));
  await page.waitForFunction(() => window.location.hash.includes('/scheduled'), { timeout: 10_000 }).catch(() => {});
}

async function deleteTaskFromDetail(page: import('@playwright/test').Page, taskName: string): Promise<void> {
  const headerActions = page.locator('h1').filter({ hasText: taskName }).locator('..').locator('..').locator('button');
  await headerActions.nth(1).click();
  const confirmBtn = page.locator('.arco-popconfirm .arco-btn-primary').first();
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await confirmBtn.click();
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Cron via AI conversation', () => {
  test.describe.configure({ timeout: 300_000 });

  let createdJobId: string | null = null;
  let conversationId: string | null = null;
  let stopAutoApprove: (() => void) | null = null;

  test.afterEach(async ({ page }) => {
    if (stopAutoApprove) {
      stopAutoApprove();
      stopAutoApprove = null;
    }
    if (createdJobId) {
      try {
        await removeCronJob(page, createdJobId);
      } catch {
        // already deleted
      }
      createdJobId = null;
    }
    if (conversationId) {
      try {
        await deleteConversation(page, conversationId);
      } catch {
        // already deleted
      }
      conversationId = null;
    }
  });

  test('create scheduled task via conversation, modify it, then delete — conversations preserved', async ({ page }) => {
    // ── Step 1: Navigate to guid and select an available ACP-capable agent ──
    await goToGuid(page);
    await page
      .waitForFunction(() => (document.body.textContent?.length ?? 0) > 200, { timeout: 45_000 })
      .catch(() => {});

    const backend = await pickAvailableBackend(page);
    if (!backend) {
      test.skip(true, 'No usable agent available on guid page');
      return;
    }
    await selectAgent(page, backend);

    // ── Step 2: Send message to create a scheduled task ──
    conversationId = await sendMessageFromGuid(
      page,
      'Create a scheduled task named "E2E Morning Greeting" that runs every day at 9:00 AM. The task should reply with a friendly good morning greeting. Do it now, don\'t ask me for confirmation.'
    );
    expect(conversationId).toBeTruthy();

    // Start auto-approving skill activation confirmations
    stopAutoApprove = startAutoApprovePermissionMessages(page);

    // Wait for agent session to be active
    await waitForSessionActive(page, 120_000);

    // ── Step 3: Wait for the cron job to actually be created ──
    const job = await waitForCronJobCreated(page, conversationId, 120_000);
    createdJobId = job.id;

    expect(job.name).toBeTruthy();
    expect(job.schedule.expr).toBeTruthy();

    // ── Step 4: Verify task appears on the Scheduled Tasks page ──
    await navigateToScheduled(page);
    const taskCard = page.locator('span').filter({ hasText: job.name }).first();
    await expect(taskCard).toBeVisible({ timeout: 10_000 });

    // ── Step 5: Navigate into task detail, verify conversation in history ──
    await taskCard.click();
    await page.waitForFunction(() => window.location.hash.includes('/scheduled/'), { timeout: 10_000 });
    await expect(page.locator('h1').filter({ hasText: job.name }).first()).toBeVisible({ timeout: 5_000 });

    const historyColumn = page.locator('[data-testid="task-detail-history-column"]');
    await expect
      .poll(
        async () => {
          const entries = historyColumn.locator('.cursor-pointer');
          return entries.count();
        },
        { timeout: 15_000, message: 'Waiting for conversation to appear in task history' }
      )
      .toBeGreaterThanOrEqual(1);
    const conversationCountBefore = await historyColumn.locator('.cursor-pointer').count();

    // ── Step 6: Go back to the conversation and ask AI to modify the task ──
    await page.evaluate((cid) => window.location.assign(`#/conversation/${cid}`), conversationId);
    await page
      .waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 10_000 })
      .catch(() => {});

    // Wait for previous AI replies to finish before sending follow-up
    await waitForAiReply(page, 60_000).catch(() => {});

    const originalName = job.name;
    await sendFollowUpMessage(
      page,
      'Please change the scheduled task name to "E2E Updated Greeting" and change the schedule to every weekday at 10:00 AM. Update the existing task, do not create a new one.'
    );

    // ── Step 7: Wait for the cron job to be updated ──
    const updatedJob = await waitForCronJobUpdated(page, job.id, originalName, 120_000);
    expect(updatedJob.id).toBe(job.id);
    expect(updatedJob.name).not.toBe(originalName);

    // ── Step 8: Verify the updated task on the Scheduled Tasks page ──
    await navigateToScheduled(page);
    await expect(page.locator('span').filter({ hasText: updatedJob.name }).first()).toBeVisible({ timeout: 10_000 });

    // ── Step 9: Verify conversations are preserved after update ──
    // Navigate into updated task detail
    await page.locator('span').filter({ hasText: updatedJob.name }).first().click();
    await page.waitForFunction(() => window.location.hash.includes('/scheduled/'), { timeout: 10_000 });

    // Re-locate historyColumn on the new page
    const historyColumnAfter = page.locator('[data-testid="task-detail-history-column"]');
    const conversationCountAfter = await expect
      .poll(
        async () => {
          const entries = historyColumnAfter.locator('.cursor-pointer');
          return entries.count();
        },
        { timeout: 15_000, message: 'Waiting for conversation history to reload after cron update' }
      )
      .toBeGreaterThanOrEqual(conversationCountBefore)
      .then(async () => historyColumnAfter.locator('.cursor-pointer').count());
    expect(conversationCountAfter).toBe(conversationCountBefore);

    // ── Step 10: Verify job ID preserved (same job, not delete+recreate) ──
    const fetchedJob = await getCronJob(page, job.id);
    expect(fetchedJob).not.toBeNull();
    expect(fetchedJob!.id).toBe(job.id);

    // ── Step 11: Delete the task from detail page ──
    await deleteTaskFromDetail(page, updatedJob.name);

    await page.waitForFunction(() => window.location.hash === '#/scheduled', { timeout: 10_000 }).catch(() => {});
    await expect(page.locator('span').filter({ hasText: updatedJob.name }).first()).not.toBeVisible({ timeout: 5_000 });

    // Verify task gone via bridge API
    const fetchedAfterDelete = await getCronJob(page, job.id).catch(() => null);
    expect(fetchedAfterDelete).toBeNull();

    // ── Step 12: Verify conversation is still accessible after task deletion ──
    await page.evaluate((cid) => window.location.assign(`#/conversation/${cid}`), conversationId);
    await page
      .waitForFunction(() => window.location.hash.includes('/conversation/'), { timeout: 10_000 })
      .catch(() => {});

    // The conversation page should still load with the original message content
    await expect
      .poll(
        async () => {
          const text = await page.locator('body').textContent();
          return (text?.length ?? 0) > 100;
        },
        { timeout: 10_000, message: 'Waiting for conversation page to load after task deletion' }
      )
      .toBeTruthy();

    // Mark as cleaned up so afterEach doesn't double-delete
    createdJobId = null;
  });

  test('AI creates task in conversation — sidebar shows task with child conversation', async ({ page }) => {
    await goToGuid(page);
    await page
      .waitForFunction(() => (document.body.textContent?.length ?? 0) > 200, { timeout: 45_000 })
      .catch(() => {});

    const backend = await pickAvailableBackend(page);
    if (!backend) {
      test.skip(true, 'No usable agent available on guid page');
      return;
    }
    await selectAgent(page, backend);

    conversationId = await sendMessageFromGuid(
      page,
      'Create a scheduled task called "E2E Sidebar Check" that runs hourly. The task should say hello. Create it immediately without asking.'
    );
    expect(conversationId).toBeTruthy();

    // Start auto-approving skill activation confirmations
    stopAutoApprove = startAutoApprovePermissionMessages(page);

    await waitForSessionActive(page, 120_000);

    const job = await waitForCronJobCreated(page, conversationId, 120_000);
    createdJobId = job.id;

    // Verify the sidebar shows the cron job with child conversation
    const siderJobName = page.locator('.font-medium.truncate').filter({ hasText: job.name }).first();
    await expect(siderJobName).toBeVisible({ timeout: 15_000 });

    // The child conversation should appear under the cron job in sidebar
    const childEntry = page.locator(`[data-testid="cron-child-sortable-${conversationId}"]`);
    await expect(childEntry).toBeVisible({ timeout: 10_000 });
  });
});
