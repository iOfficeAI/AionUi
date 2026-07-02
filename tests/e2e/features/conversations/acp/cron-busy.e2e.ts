import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import {
  MODE_SELECTOR,
  deleteConversation,
  findAssistantIdForBackend,
  goToGuid,
  httpDelete,
  httpGet,
  httpInvoke,
  httpPost,
  selectAssistantForBackend,
  sendMessageFromGuid,
  waitForPermissionMessageCard,
} from '../../../helpers';

const PREFERRED_ACP_BACKENDS = ['codex', 'claude', 'gemini'] as const;
const SCHEDULE_EVERY_MS = 5_000;

type CronJobResponse = {
  id: string;
  name: string;
  metadata: {
    conversation_id: string;
    agent_config?: {
      assistant_id?: string;
      custom_agent_id?: string;
      preset_agent_type?: string;
    };
  };
};

type AssistantListItem = {
  id: string;
  name: string;
};

type ConversationResponse = {
  id: string;
  name?: string;
  runtime?: {
    turn_id?: string | null;
  } | null;
};

type CancelConversationResponse = {
  runtime?: {
    turn_id?: string | null;
  } | null;
};

type CronDbRow = {
  conversation_id: string;
  run_count: number;
  retry_count: number;
  last_status: string | null;
  last_error: string | null;
};

async function getUserDataPath(electronApp: ElectronApplication): Promise<string> {
  return electronApp.evaluate(async ({ app }) => app.getPath('userData'));
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

function querySqliteJson<T>(dbPath: string, sql: string): T {
  const out = execFileSync('sqlite3', ['-readonly', dbPath, sql], { encoding: 'utf8' }).trim();
  if (!out) {
    throw new Error(`Expected sqlite row for query: ${sql}`);
  }
  return JSON.parse(out) as T;
}

function queryCronRow(dbPath: string, jobId: string): CronDbRow {
  const id = escapeSql(jobId);
  return querySqliteJson<CronDbRow>(
    dbPath,
    `
      SELECT json_object(
        'conversation_id', conversation_id,
        'run_count', run_count,
        'retry_count', retry_count,
        'last_status', last_status,
        'last_error', last_error
      )
      FROM cron_jobs
      WHERE id = '${id}'
    `
  );
}

async function pickAvailableBackend(page: Page): Promise<(typeof PREFERRED_ACP_BACKENDS)[number] | null> {
  for (const backend of PREFERRED_ACP_BACKENDS) {
    const assistantId = await findAssistantIdForBackend(page, backend, { requireAvailable: true });
    if (assistantId) {
      return backend;
    }
  }

  return null;
}

async function getAvailableModes(page: Page): Promise<string[]> {
  const selector = page.locator(MODE_SELECTOR).first();
  await selector.waitFor({ state: 'visible', timeout: 10_000 });
  await selector.click();
  await page.locator('[data-mode-value]').first().waitFor({ state: 'visible', timeout: 5_000 });
  const modes = await page
    .locator('[data-mode-value]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-mode-value')).filter((v): v is string => Boolean(v)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return modes;
}

async function ensureReadOnlyMode(page: Page): Promise<boolean> {
  const selector = page.locator(MODE_SELECTOR).first();
  const visible = await selector
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) {
    return false;
  }

  const modes = await getAvailableModes(page);
  const readOnlyMode = modes.find((mode) => /read/i.test(mode));
  if (!readOnlyMode) {
    return false;
  }

  const currentMode = (await selector.getAttribute('data-current-mode')) ?? '';
  if (currentMode === readOnlyMode) {
    return true;
  }

  await selector.click();
  await expect
    .poll(
      async () =>
        page.evaluate((targetMode) => {
          const isVisible = (el: Element) => {
            const node = el as HTMLElement;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          };
          return Array.from(document.querySelectorAll('[data-mode-value]')).some(
            (el) => el.getAttribute('data-mode-value') === targetMode && isVisible(el)
          );
        }, readOnlyMode),
      { timeout: 5_000, message: `Waiting for visible mode option ${readOnlyMode}` }
    )
    .toBeTruthy();
  await page.evaluate((targetMode) => {
    const isVisible = (el: Element) => {
      const node = el as HTMLElement;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const target = Array.from(document.querySelectorAll('[data-mode-value]')).find(
      (el) => el.getAttribute('data-mode-value') === targetMode && isVisible(el)
    ) as HTMLElement | undefined;
    if (!target) {
      throw new Error(`Visible mode option ${targetMode} not found`);
    }
    target.click();
  }, readOnlyMode);
  await expect(selector).toHaveAttribute('data-current-mode', readOnlyMode, { timeout: 5_000 });
  return true;
}

async function getConversation(page: Page, conversationId: string): Promise<ConversationResponse> {
  return httpGet<ConversationResponse>(page, `/api/conversations/${encodeURIComponent(conversationId)}`);
}

async function waitForActiveTurn(page: Page, conversationId: string, timeoutMs = 120_000): Promise<string> {
  await expect
    .poll(async () => (await getConversation(page, conversationId)).runtime?.turn_id ?? null, {
      timeout: timeoutMs,
      message: `Waiting for conversation ${conversationId} to enter active-turn state`,
    })
    .not.toBeNull();

  const conversation = await getConversation(page, conversationId);
  const turnId = conversation.runtime?.turn_id ?? null;
  if (!turnId) {
    throw new Error(`Conversation ${conversationId} lost its active turn before assertion`);
  }
  return turnId;
}

async function stopConversationIfActive(page: Page, conversationId: string): Promise<void> {
  const currentTurnId = (await getConversation(page, conversationId).catch(() => null))?.runtime?.turn_id ?? null;
  if (!currentTurnId) {
    return;
  }

  await httpInvoke<CancelConversationResponse>(
    page,
    'POST',
    `/api/conversations/${encodeURIComponent(conversationId)}/cancel`,
    {
      turn_id: currentTurnId,
    }
  ).catch(() => {});

  await expect
    .poll(async () => (await getConversation(page, conversationId).catch(() => null))?.runtime?.turn_id ?? null, {
      timeout: 20_000,
      message: `Waiting for conversation ${conversationId} to release active turn`,
    })
    .toBeNull();
}

async function openScheduledDetail(page: Page, jobId: string): Promise<void> {
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/scheduled/${jobId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((id) => window.location.hash === `#/scheduled/${id}`, jobId, { timeout: 15_000 });
}

test.describe('ACP cron busy handling', () => {
  test.setTimeout(240_000);

  test('run-now conflicts and scheduler retries when the target conversation is busy', async ({
    page,
    electronApp,
  }) => {
    let conversationId: string | null = null;
    let cronJobId: string | null = null;

    try {
      await goToGuid(page);

      const backend = await pickAvailableBackend(page);
      if (!backend) {
        test.skip(true, 'No ACP-backed assistant pill available on the guid page');
        return;
      }

      const selectedAssistantId = await selectAssistantForBackend(page, backend);
      if (!selectedAssistantId) {
        test.skip(true, `No selectable assistant for backend ${backend}`);
        return;
      }
      const assistants = await httpGet<AssistantListItem[]>(page, '/api/assistants');
      const assistant = assistants.find((item) => item.id === selectedAssistantId);
      if (!assistant) {
        test.skip(true, `Assistant ${selectedAssistantId} missing from catalog`);
        return;
      }

      const readOnlyModeReady = await ensureReadOnlyMode(page);
      if (!readOnlyModeReady) {
        test.skip(true, `${backend} does not expose a usable read-only mode on the guid page`);
        return;
      }
      const selectedMode = (await page.locator(MODE_SELECTOR).first().getAttribute('data-current-mode')) ?? undefined;

      const busyPrompt = `Create a file named e2e-cron-busy-${Date.now()}.txt in the current workspace and write the text "busy" into it. If approval is required, ask for it and wait for my response.`;
      conversationId = await sendMessageFromGuid(page, busyPrompt);
      expect(conversationId).toBeTruthy();

      await waitForPermissionMessageCard(page, 120_000);
      await waitForActiveTurn(page, conversationId, 120_000);

      const conversation = await getConversation(page, conversationId);
      const conversationTitle = conversation.name?.trim() || `E2E Busy ${conversationId}`;

      const job = await httpPost<CronJobResponse>(page, '/api/cron/jobs', {
        name: `E2E Busy Cron ${Date.now()}`,
        description: 'Verifies busy handling for run-now and scheduler retry',
        schedule: {
          kind: 'every',
          every_ms: SCHEDULE_EVERY_MS,
          description: `every ${SCHEDULE_EVERY_MS} ms`,
        },
        prompt: 'CRON BUSY E2E',
        conversation_id: conversationId,
        conversation_title: conversationTitle,
        created_by: 'user',
        execution_mode: 'existing',
        agent_config: {
          assistant_id: selectedAssistantId,
          name: assistant.name,
          mode: selectedMode,
        },
      });
      cronJobId = job.id;

      expect(job.metadata.conversation_id).toBe(conversationId);
      expect(job.metadata.agent_config?.assistant_id).toBe(selectedAssistantId);
      expect(job.metadata.agent_config?.custom_agent_id).toBeUndefined();
      expect(job.metadata.agent_config?.preset_agent_type).toBeUndefined();

      const userDataPath = await getUserDataPath(electronApp);
      const dbPath = path.join(userDataPath, 'aionui', 'aionui-backend.db');

      await expect
        .poll(() => queryCronRow(dbPath, job.id).conversation_id, {
          timeout: 10_000,
          message: 'Waiting for cron job row to be persisted',
        })
        .toBe(conversationId);

      await openScheduledDetail(page, job.id);
      await expect(page.locator('h1').filter({ hasText: job.name }).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('body')).toContainText('CRON BUSY E2E');

      const runNowButton = page
        .locator('button')
        .filter({ hasText: /立即执行|Run Now|Run now/i })
        .first();
      await expect(runNowButton).toBeVisible({ timeout: 10_000 });

      const runNowResponsePromise = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().includes(`/api/cron/jobs/${job.id}/run`),
        { timeout: 15_000 }
      );
      await runNowButton.click();

      const runNowResponse = await runNowResponsePromise;
      expect(runNowResponse.status()).toBe(409);

      const runNowBody = (await runNowResponse.json()) as {
        success?: boolean;
        code?: string;
        error?: string;
        message?: string;
      };
      expect(runNowBody.success).toBe(false);
      expect(runNowBody.code).toBe('CONFLICT');
      expect(runNowBody.error ?? runNowBody.message ?? '').toContain(
        `conversation ${conversationId} is already running`
      );

      await expect
        .poll(() => queryCronRow(dbPath, job.id).retry_count, {
          timeout: 25_000,
          message: 'Waiting for scheduler to detect busy conversation and increment retry_count',
        })
        .toBeGreaterThanOrEqual(1);

      const busyRow = queryCronRow(dbPath, job.id);
      expect(busyRow.run_count).toBe(0);
      expect(busyRow.last_status).toBeNull();
      expect(busyRow.last_error).toBeNull();

      await stopConversationIfActive(page, conversationId);

      await expect
        .poll(() => queryCronRow(dbPath, job.id).run_count, {
          timeout: 90_000,
          message: 'Waiting for a scheduled retry to execute successfully after busy state is released',
        })
        .toBeGreaterThanOrEqual(1);

      const successRow = queryCronRow(dbPath, job.id);
      expect(successRow.last_status).toBe('ok');
      expect(successRow.retry_count).toBe(0);
      expect(successRow.last_error).toBeNull();
    } finally {
      if (cronJobId) {
        await httpDelete(page, `/api/cron/jobs/${encodeURIComponent(cronJobId)}`).catch(() => {});
      }
      if (conversationId) {
        await stopConversationIfActive(page, conversationId).catch(() => {});
        await deleteConversation(page, conversationId).catch(async () => {
          await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId!)}`).catch(() => {});
        });
      }
    }
  });
});
