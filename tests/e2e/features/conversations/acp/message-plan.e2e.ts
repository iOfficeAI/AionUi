/**
 * ACP long-task plan UI on a real conversation page.
 *
 * Uses the existing test-only message injector to exercise the production
 * MessageList and MessagePlan components without calling an external agent.
 */

import os from 'os';
import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { goToGuid, navigateTo } from '../../../helpers';
import { httpDelete, httpPost } from '../../../helpers/httpBridge';
import { takeScreenshot } from '../../../helpers/screenshots';

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';

type PlanEntry = {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
};

type StreamRegistry = {
  controllers: Record<
    string,
    {
      emitPlan: (entries: PlanEntry[]) => Promise<void>;
      runScenario: (options: { historyPairs: number; seedHistoryOnly: boolean }) => Promise<void>;
    }
  >;
};

async function ensureRendererReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number',
    { timeout: 30_000 }
  );
}

async function createConversation(page: Page): Promise<string> {
  await goToGuid(page);
  await ensureRendererReady(page);

  const conversation = await httpPost<{ id?: string }>(page, '/api/conversations', {
    name: `E2E ACP plan ${Date.now()}`,
    type: 'acp',
    extra: {
      workspace: os.tmpdir(),
      custom_workspace: true,
      backend: 'codex',
      session_mode: 'full-access',
    },
  });

  if (!conversation?.id) throw new Error('Failed to create ACP plan conversation');
  return conversation.id;
}

async function openConversation(page: Page, conversationId: string): Promise<void> {
  await page.evaluate(({ id, storageKey }) => window.sessionStorage.setItem(storageKey, id), {
    id: conversationId,
    storageKey: ENABLED_CONVERSATION_KEY,
  });
  const targetHash = `#/conversation/${conversationId}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Navigation retries must be sequential because each attempt depends on the current hash route.
    // eslint-disable-next-line no-await-in-loop
    await navigateTo(page, targetHash);
    // eslint-disable-next-line no-await-in-loop
    const arrived = await page
      .waitForFunction((id) => window.location.hash === `#/conversation/${id}`, conversationId, {
        timeout: 10_000,
      })
      .then(() => true)
      .catch(() => false);
    if (arrived) break;
    if (attempt === 2) throw new Error(`Failed to navigate to ${targetHash}`);
  }
  await page.waitForSelector('[data-testid="sendbox-input"]', { timeout: 30_000 });
  await page.waitForFunction(
    (id) => {
      const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
        .__AIONUI_E2E_MESSAGE_STREAM__;
      return Boolean(registry?.controllers[id]);
    },
    conversationId,
    { timeout: 15_000 }
  );
}

async function emitPlan(page: Page, conversationId: string, entries: PlanEntry[]): Promise<void> {
  await page.evaluate(
    async ({ id, nextEntries }) => {
      const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
        .__AIONUI_E2E_MESSAGE_STREAM__;
      const controller = registry?.controllers[id];
      if (!controller) throw new Error(`No E2E stream controller registered for ${id}`);
      await controller.emitPlan(nextEntries);
    },
    { id: conversationId, nextEntries: entries }
  );
}

async function seedScrollableHistory(page: Page, conversationId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
      .__AIONUI_E2E_MESSAGE_STREAM__;
    const controller = registry?.controllers[id];
    if (!controller) throw new Error(`No E2E stream controller registered for ${id}`);
    await controller.runScenario({ historyPairs: 18, seedHistoryOnly: true });
  }, conversationId);
}

test('floats above the composer and reveals long-task details on hover', async ({ page }) => {
  test.setTimeout(120_000);
  let conversationId: string | null = null;

  try {
    conversationId = await createConversation(page);
    await openConversation(page, conversationId);
    await seedScrollableHistory(page, conversationId);

    const entries: PlanEntry[] = [
      { content: '调整聚焦测试，区分未配置与实际读取失败', status: 'in_progress' },
      { content: '最小修改 official_sql 未配置分支', status: 'pending' },
      { content: '运行完整契约、静态与 Skill 校验', status: 'pending' },
      { content: '重新只读验证差旅样本 2588333', status: 'pending' },
    ];
    await emitPlan(page, conversationId, entries);

    const plan = page.getByTestId('message-plan');
    const toggle = plan.getByRole('button');
    await expect(plan).toBeVisible();
    await expect(plan.getByRole('listitem')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toContainText(/1.*4/);
    await expect(plan.getByTestId('message-plan-progress-icon').locator('.arco-spin')).toBeVisible();
    expect(await plan.evaluate((element) => element.closest('[data-testid="message-list-content"]'))).toBeNull();

    const sendBox = page.getByTestId('sendbox-input');
    const scroller = page.getByTestId('message-list-scroller');
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });

    await expect(page.getByTestId('message-list-running-indicator')).toHaveCount(0);
    await expect(page.getByTestId('message-list-scroll-to-bottom')).toHaveCount(0);
    const planBox = await toggle.boundingBox();
    const sendBoxBox = await sendBox.boundingBox();
    expect(planBox).not.toBeNull();
    expect(sendBoxBox).not.toBeNull();
    expect(planBox!.y + planBox!.height).toBeLessThan(sendBoxBox!.y);
    await takeScreenshot(page, 'acp-message-plan-running-at-bottom');

    await scroller.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(page.getByTestId('message-list-scroll-to-bottom')).toHaveCount(0);
    await toggle.click();
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
      .toBeLessThanOrEqual(4);
    await takeScreenshot(page, 'acp-message-plan-floating-collapsed');

    await toggle.hover();
    await expect(plan.getByRole('listitem')).toHaveCount(4);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const lastTwoCharactersShareLine = await plan.getByText(entries[0].content, { exact: true }).evaluate((element) => {
      const textNode = element.firstChild;
      if (!textNode?.textContent || textNode.textContent.length < 2) return false;

      const range = document.createRange();
      range.setStart(textNode, textNode.textContent.length - 2);
      range.setEnd(textNode, textNode.textContent.length);
      return range.getClientRects().length === 1;
    });
    expect(lastTwoCharactersShareLine).toBe(true);
    await plan.getByRole('list').hover();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await takeScreenshot(page, 'acp-message-plan-hover-expanded');

    await sendBox.hover();
    await expect(plan.getByRole('listitem')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await emitPlan(page, conversationId, [
      { ...entries[0], status: 'completed' },
      { ...entries[1], status: 'in_progress' },
      entries[2],
      entries[3],
    ]);
    await expect(toggle).toContainText(/2.*4/);

    await emitPlan(
      page,
      conversationId,
      entries.map((entry) => ({ content: entry.content, status: 'completed' }))
    );
    await expect(plan).toHaveCount(0);
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(page.getByTestId('message-list-scroll-to-bottom')).toBeVisible();
  } finally {
    if (conversationId) {
      await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
    }
  }
});
