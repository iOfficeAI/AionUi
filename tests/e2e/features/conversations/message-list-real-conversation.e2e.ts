/**
 * MessageList scroll stability E2E on a real conversation page.
 *
 * Creates a real persisted conversation, navigates to /conversation/:id, then
 * drives a synthetic streaming reply through a test-only injector mounted
 * inside the actual Claude ACP chat tree.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { findAssistantIdForBackend, goToGuid } from '../../helpers';

type ScrollProbeSample = {
  aiTextLength: number;
  at: number;
  bottomGap: number;
  clientHeight: number;
  reason: string;
  scrollHeight: number;
  scrollTop: number;
};

type StreamRegistry = {
  controllers: Record<
    string,
    {
      runScenario: (options?: { historyPairs?: number; lines?: number; seedHistoryOnly?: boolean }) => Promise<void>;
    }
  >;
};

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';
const BACKGROUND_STREAM_PROMISE_KEY = '__messageListStreamRunPromise';

function createFakeClaudeConversation(id: string, assistantId: string) {
  return {
    id,
    name: `E2E MessageList ${id}`,
    assistant: {
      id: assistantId,
    },
    extra: {
      workspace: '/tmp',
      custom_workspace: true,
      session_mode: 'default',
    },
  };
}

async function createConversation(page: Page, conversationId: string): Promise<string> {
  await goToGuid(page);
  const assistantId = await findAssistantIdForBackend(page, 'claude', { requireAvailable: true });
  test.skip(!assistantId, 'No available Claude assistant for message list conversation');
  if (!assistantId) return '';

  return page.evaluate(
    async ({ conversation }) => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort;
      if (!port) {
        throw new Error('window.__backendPort is not available in renderer context');
      }

      const response = await fetch(`http://127.0.0.1:${port}/api/conversations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(conversation),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`POST /api/conversations failed (${response.status}): ${body}`);
      }

      const json = (await response.json()) as { data?: { id?: string } };
      const id = json?.data?.id;
      if (!id) {
        throw new Error('POST /api/conversations succeeded but did not return a conversation id');
      }

      return id;
    },
    {
      conversation: createFakeClaudeConversation(conversationId, assistantId),
    }
  );
}

async function removeConversation(page: Page, conversationId: string): Promise<void> {
  await page.evaluate(
    async ({ id }) => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort;
      if (!port) return;

      await fetch(`http://127.0.0.1:${port}/api/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    },
    { id: conversationId }
  );
}

async function installScrollProbe(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="message-list-scroller"]', { timeout: 30_000 });
  await page.evaluate(() => {
    const existingProbe = (
      window as typeof window & {
        __messageListScrollProbe?: { stop: () => ScrollProbeSample[] };
      }
    ).__messageListScrollProbe;
    if (existingProbe) {
      existingProbe.stop();
    }

    const scroller = document.querySelector<HTMLDivElement>('[data-testid="message-list-scroller"]');
    const content = document.querySelector<HTMLDivElement>('[data-testid="message-list-content"]');
    if (!scroller || !content) {
      throw new Error('MessageList probe could not find the scroll container.');
    }

    const getAiTextLength = (): number => {
      const items = Array.from(document.querySelectorAll<HTMLElement>('.message-item.text.justify-start'));
      const last = items.at(-1);
      if (!last) return 0;

      const shadowHost = last.querySelector<HTMLElement>('.markdown-shadow');
      const shadowText = shadowHost?.shadowRoot?.textContent?.trim() ?? '';
      if (shadowText) return shadowText.length;
      return last.textContent?.trim().length ?? 0;
    };

    const samples: ScrollProbeSample[] = [];
    const pushSample = (reason: string) => {
      samples.push({
        aiTextLength: getAiTextLength(),
        at: Date.now(),
        bottomGap: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        reason,
        scrollHeight: scroller.scrollHeight,
        scrollTop: scroller.scrollTop,
      });
    };

    const handleScroll = () => pushSample('scroll');
    const observer = new ResizeObserver(() => pushSample('resize'));
    const intervalId = window.setInterval(() => pushSample('tick'), 50);

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    observer.observe(scroller);
    observer.observe(content);
    pushSample('start');

    (
      window as typeof window & {
        __messageListScrollProbe?: { stop: () => ScrollProbeSample[] };
      }
    ).__messageListScrollProbe = {
      stop: () => {
        window.clearInterval(intervalId);
        observer.disconnect();
        scroller.removeEventListener('scroll', handleScroll);
        pushSample('stop');
        return samples;
      },
    };
  });
}

async function stopScrollProbe(page: Page): Promise<ScrollProbeSample[]> {
  return page.evaluate(() => {
    const probe = (
      window as typeof window & {
        __messageListScrollProbe?: { stop: () => ScrollProbeSample[] };
      }
    ).__messageListScrollProbe;
    if (!probe) {
      throw new Error('MessageList probe was not installed.');
    }
    return probe.stop();
  });
}

async function openConversationPage(page: Page, targetConversationId: string): Promise<void> {
  await page.evaluate(
    ({ conversationId: currentConversationId, storageKey }) => {
      window.sessionStorage.setItem(storageKey, currentConversationId);
    },
    { conversationId: targetConversationId, storageKey: ENABLED_CONVERSATION_KEY }
  );
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/conversation/${targetConversationId}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="message-list-scroller"]', { timeout: 30_000 });
}

async function waitForStreamController(page: Page, targetConversationId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const registry = (
        window as typeof window & {
          __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
        }
      ).__AIONUI_E2E_MESSAGE_STREAM__;
      return Boolean(registry?.controllers[id]);
    },
    targetConversationId,
    { timeout: 15_000 }
  );
}

async function runScenario(
  page: Page,
  targetConversationId: string,
  options: {
    historyPairs?: number;
    lines?: number;
    seedHistoryOnly?: boolean;
  }
): Promise<void> {
  await page.evaluate(
    async ({ currentConversationId, scenarioOptions }) => {
      const registry = (
        window as typeof window & {
          __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
        }
      ).__AIONUI_E2E_MESSAGE_STREAM__;
      const controller = registry?.controllers[currentConversationId];
      if (!controller) {
        throw new Error(`No E2E stream controller registered for conversation ${currentConversationId}`);
      }
      await controller.runScenario(scenarioOptions);
    },
    { currentConversationId: targetConversationId, scenarioOptions: options }
  );
}

async function startScenarioInBackground(
  page: Page,
  targetConversationId: string,
  options: {
    historyPairs?: number;
    lines?: number;
    seedHistoryOnly?: boolean;
  }
): Promise<void> {
  await page.evaluate(
    ({ currentConversationId, promiseKey, scenarioOptions }) => {
      const registry = (
        window as typeof window & {
          __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
          [BACKGROUND_STREAM_PROMISE_KEY]?: Promise<void>;
        }
      ).__AIONUI_E2E_MESSAGE_STREAM__;
      const controller = registry?.controllers[currentConversationId];
      if (!controller) {
        throw new Error(`No E2E stream controller registered for conversation ${currentConversationId}`);
      }

      (
        window as typeof window & {
          [BACKGROUND_STREAM_PROMISE_KEY]?: Promise<void>;
        }
      )[promiseKey] = controller.runScenario(scenarioOptions);
    },
    { currentConversationId: targetConversationId, promiseKey: BACKGROUND_STREAM_PROMISE_KEY, scenarioOptions: options }
  );
}

async function waitForBackgroundScenario(page: Page): Promise<void> {
  await page.evaluate(async (promiseKey) => {
    const win = window as typeof window & {
      [BACKGROUND_STREAM_PROMISE_KEY]?: Promise<void>;
    };
    await win[promiseKey];
    delete win[promiseKey];
  }, BACKGROUND_STREAM_PROMISE_KEY);
}

async function waitForAiTextLength(page: Page, minLength: number): Promise<void> {
  await page.waitForFunction(
    (targetLength) => {
      const items = Array.from(document.querySelectorAll<HTMLElement>('.message-item.text.justify-start'));
      const last = items.at(-1);
      if (!last) return false;
      const shadowHost = last.querySelector<HTMLElement>('.markdown-shadow');
      const shadowText = shadowHost?.shadowRoot?.textContent?.trim() ?? '';
      const textLength = shadowText ? shadowText.length : (last.textContent?.trim().length ?? 0);
      return textLength >= targetLength;
    },
    minLength,
    { timeout: 15_000 }
  );
}

async function simulateManualScrollIntervention(
  page: Page
): Promise<{ aiTextLength: number; at: number; scrollTop: number }> {
  const scroller = page.locator('[data-testid="message-list-scroller"]');
  await scroller.hover();
  await page.mouse.wheel(0, -320);
  await page.waitForTimeout(120);

  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLDivElement>('[data-testid="message-list-scroller"]');
    const items = Array.from(document.querySelectorAll<HTMLElement>('.message-item.text.justify-start'));
    const last = items.at(-1);
    if (!scroller || !last) {
      throw new Error('Could not simulate manual scroll intervention because the message list was not ready.');
    }

    const shadowHost = last.querySelector<HTMLElement>('.markdown-shadow');
    const shadowText = shadowHost?.shadowRoot?.textContent?.trim() ?? '';
    const aiTextLength = shadowText ? shadowText.length : (last.textContent?.trim().length ?? 0);

    return {
      aiTextLength,
      at: Date.now(),
      scrollTop: scroller.scrollTop,
    };
  });
}

function getDistinctAiLengths(samples: ScrollProbeSample[]): number {
  return new Set(samples.map((sample) => sample.aiTextLength).filter((length) => length > 0)).size;
}

function getDownwardRegressions(samples: ScrollProbeSample[]): number[] {
  const regressions: number[] = [];

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (current.aiTextLength <= 0 || current.aiTextLength < previous.aiTextLength) continue;

    const delta = current.scrollTop - previous.scrollTop;
    if (delta < -24) {
      regressions.push(delta);
    }
  }

  return regressions;
}

test.describe('MessageList real conversation stream', () => {
  let conversationId: string | null = null;

  test.afterEach(async ({ page }) => {
    if (conversationId) {
      await page
        .evaluate((storageKey) => {
          window.sessionStorage.removeItem(storageKey);
        }, ENABLED_CONVERSATION_KEY)
        .catch(() => {});
      await removeConversation(page, conversationId);
      conversationId = null;
    }
  });

  test('keeps scroll progression monotonic on the real conversation page while the assistant message grows', async ({
    page,
  }) => {
    conversationId = await createConversation(page, `e2e-msg-list-${Date.now()}`);

    await openConversationPage(page, conversationId);
    await waitForStreamController(page, conversationId);
    await runScenario(page, conversationId, {
      historyPairs: 18,
      lines: 0,
      seedHistoryOnly: true,
    });

    await page.waitForTimeout(300);
    await installScrollProbe(page);

    await runScenario(page, conversationId, {
      historyPairs: 0,
      lines: 160,
    });

    await page.waitForTimeout(500);

    const samples = await stopScrollProbe(page);
    const distinctAiLengths = getDistinctAiLengths(samples);
    const downwardRegressions = getDownwardRegressions(samples);

    expect(samples.length).toBeGreaterThan(20);
    expect(distinctAiLengths).toBeGreaterThanOrEqual(8);
    expect(
      downwardRegressions,
      `MessageList scroll regressed during simulated streaming: ${JSON.stringify(downwardRegressions)}`
    ).toHaveLength(0);
  });

  test('stops auto-following after the user manually scrolls during Claude streaming', async ({ page }) => {
    conversationId = await createConversation(page, `e2e-msg-list-user-scroll-${Date.now()}`);

    await openConversationPage(page, conversationId);
    await waitForStreamController(page, conversationId);
    await runScenario(page, conversationId, {
      historyPairs: 18,
      lines: 0,
      seedHistoryOnly: true,
    });

    await page.waitForTimeout(300);
    await installScrollProbe(page);
    await startScenarioInBackground(page, conversationId, {
      historyPairs: 0,
      lines: 180,
    });

    await waitForAiTextLength(page, 280);
    const intervention = await simulateManualScrollIntervention(page);

    await waitForAiTextLength(page, intervention.aiTextLength + 280);
    await waitForBackgroundScenario(page);
    await page.waitForTimeout(250);

    const samples = await stopScrollProbe(page);
    const samplesAfterIntervention = samples.filter(
      (sample) => sample.at >= intervention.at && sample.aiTextLength > intervention.aiTextLength
    );
    const postInterventionDistinctAiLengths = getDistinctAiLengths(samplesAfterIntervention);
    const maxPostInterventionScrollTop = samplesAfterIntervention.reduce(
      (max, sample) => Math.max(max, sample.scrollTop),
      intervention.scrollTop
    );

    expect(samplesAfterIntervention.length).toBeGreaterThan(10);
    expect(postInterventionDistinctAiLengths).toBeGreaterThanOrEqual(6);
    expect(
      maxPostInterventionScrollTop,
      `MessageList resumed auto-follow after user scroll intervention. baseline=${intervention.scrollTop}, max=${maxPostInterventionScrollTop}`
    ).toBeLessThanOrEqual(intervention.scrollTop + 4);
  });
});
