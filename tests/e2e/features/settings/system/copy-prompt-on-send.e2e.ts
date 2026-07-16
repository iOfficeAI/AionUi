import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { test, expect } from '../../../fixtures';
import { httpDelete, httpGet, httpPost } from '../../../helpers/httpBridge';
import { waitForAiReply } from '../../../helpers/conversation';
import { goToGuid, goToSettings, waitForSettle } from '../../../helpers/navigation';

const COPY_PROMPT_SWITCH = '[data-testid="copy-prompt-on-send-switch"]';
const FAKE_ACP_CLI = path.resolve(process.cwd(), 'tests/fixtures/fake-acp-cli/index.js');
const BUNDLED_MANAGED_RESOURCES = path.resolve(
  process.cwd(),
  `resources/bundled-aioncore/${process.platform}-${process.arch}/managed-resources`
);

if (fs.existsSync(BUNDLED_MANAGED_RESOURCES)) {
  process.env.AIONUI_BUNDLED_MANAGED_RESOURCES ??= BUNDLED_MANAGED_RESOURCES;
}

type AgentMetadata = {
  id: string;
};

type CreatedConversation = {
  id: string;
};

type TestConversation = {
  conversationId: string;
  customAgentId: string;
};

async function createConversation(page: Page): Promise<TestConversation> {
  await goToGuid(page);
  const agent = await httpPost<AgentMetadata>(page, '/api/agents/custom', {
    name: `E2E Copy Prompt Agent ${Date.now()}`,
    command: process.execPath,
    args: [FAKE_ACP_CLI],
    env: [],
    advanced: {
      description: 'Temporary local fake ACP agent for clipboard E2E coverage.',
    },
  });
  await httpPost(page, `/api/agents/${encodeURIComponent(agent.id)}/health-check`, {});

  const assistantId = `bare:${agent.id}`;
  await expect
    .poll(
      async () => {
        const assistants = await httpGet<Assistant[]>(page, '/api/assistants');
        const assistant = assistants.find((candidate) => candidate.id === assistantId);
        return assistant?.agent_status ?? null;
      },
      {
        timeout: 30_000,
        message: `Waiting for fake ACP assistant ${assistantId} to become online`,
      }
    )
    .toBe('online');

  const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
    name: `E2E Copy Prompt ${Date.now()}`,
    assistant: { id: assistantId },
    extra: {
      workspace: os.tmpdir(),
      custom_workspace: true,
    },
  });

  return {
    conversationId: conversation.id,
    customAgentId: agent.id,
  };
}

async function goToSystemSettings(page: Page): Promise<void> {
  if (!page.url().includes('#/settings/')) {
    await goToGuid(page);
  }
  await goToSettings(page, 'system');
  await waitForSettle(page);
}

async function setCopyPromptPreference(page: Page, enabled: boolean): Promise<void> {
  await goToSystemSettings(page);
  const preferenceSwitch = page.locator(COPY_PROMPT_SWITCH);
  const expectedState = String(enabled);

  if ((await preferenceSwitch.getAttribute('aria-checked')) !== expectedState) {
    await preferenceSwitch.click();
  }
  await expect(preferenceSwitch).toHaveAttribute('aria-checked', expectedState);
}

async function goToConversation(page: Page, conversationId: string): Promise<void> {
  await page.evaluate((id) => {
    window.location.assign(`#/conversation/${id}`);
  }, conversationId);
  await page.waitForFunction((id) => window.location.hash === `#/conversation/${id}`, conversationId, {
    timeout: 15_000,
  });
  await expect(page.locator('[data-testid="sendbox-input"]')).toBeVisible({ timeout: 30_000 });
}

async function readClipboard(electronApp: ElectronApplication): Promise<string> {
  return electronApp.evaluate(async ({ clipboard }) => clipboard.readText());
}

async function writeClipboard(electronApp: ElectronApplication, text: string): Promise<void> {
  await electronApp.evaluate(async ({ clipboard }, value) => clipboard.writeText(value), text);
}

async function sendFromConversation(page: Page, conversationId: string, prompt: string): Promise<void> {
  const sendRequest = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes(`/api/conversations/${conversationId}/messages`)
  );
  await page.locator('[data-testid="sendbox-input"]').fill(prompt);
  await page.locator('[data-testid="sendbox-send-btn"]').click();
  await sendRequest;
}

test.describe('Copy prompt on send', () => {
  test('keeps the clipboard unchanged when the preference is disabled by default', async ({ page, electronApp }) => {
    const previousClipboard = await readClipboard(electronApp);
    const sentinel = `clipboard-sentinel-${Date.now()}`;
    let conversationId: string | null = null;
    let customAgentId: string | null = null;

    try {
      await goToSystemSettings(page);
      await expect(page.locator(COPY_PROMPT_SWITCH)).toHaveAttribute('aria-checked', 'false');
      await page.screenshot({ path: 'tests/e2e/results/copy-prompt-on-send-setting-default.png' });

      ({ conversationId, customAgentId } = await createConversation(page));
      await goToConversation(page, conversationId);
      await writeClipboard(electronApp, sentinel);
      await sendFromConversation(page, conversationId, 'do not copy this prompt');

      await expect.poll(() => readClipboard(electronApp)).toBe(sentinel);
      const reply = await waitForAiReply(page, 30_000);
      expect(reply).toContain('Fake response to:');
      expect(reply).toContain('do not copy this prompt');
    } finally {
      await writeClipboard(electronApp, previousClipboard);
      if (conversationId) {
        await httpDelete(page, `/api/conversations/${conversationId}`).catch(() => {});
      }
      if (customAgentId) {
        await httpDelete(page, `/api/agents/custom/${customAgentId}`).catch(() => {});
      }
    }
  });

  test('persists the preference and copies the exact prompt before sending', async ({ page, electronApp }) => {
    const previousClipboard = await readClipboard(electronApp);
    const prompt = `first line ${Date.now()}\n  indented second line  `;
    let conversationId: string | null = null;
    let customAgentId: string | null = null;

    try {
      await setCopyPromptPreference(page, true);

      await page.reload();
      await goToSystemSettings(page);
      await expect(page.locator(COPY_PROMPT_SWITCH)).toHaveAttribute('aria-checked', 'true');
      await page.screenshot({ path: 'tests/e2e/results/copy-prompt-on-send-setting-enabled.png' });

      ({ conversationId, customAgentId } = await createConversation(page));
      await goToConversation(page, conversationId);
      await writeClipboard(electronApp, 'clipboard-before-enabled-send');
      await sendFromConversation(page, conversationId, prompt);

      await expect.poll(() => readClipboard(electronApp)).toBe(prompt);
      const reply = await waitForAiReply(page, 30_000);
      expect(reply).toContain('Fake response to:');
      expect(reply).toContain(prompt.split('\n')[0]);
      expect(reply).toContain('indented second line');
    } finally {
      await writeClipboard(electronApp, previousClipboard);
      if (conversationId) {
        await httpDelete(page, `/api/conversations/${conversationId}`).catch(() => {});
      }
      if (customAgentId) {
        await httpDelete(page, `/api/agents/custom/${customAgentId}`).catch(() => {});
      }
      await setCopyPromptPreference(page, false);
    }
  });
});
