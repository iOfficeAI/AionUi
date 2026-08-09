/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-hosted terminal E2E (ACP clientCapabilities.terminal).
 *
 * codebuddy delegates command execution via terminal/create when the client
 * declares the capability. The UI must render a live terminal card (mono
 * command header + output pane) driven by acp_terminal_output frames, and
 * the card's Stop button must kill just that command while the agent and
 * turn continue.
 *
 * Backend witnesses (grepped from the aioncore log after a run):
 *   "client terminal created"  /  "client terminal killed" (source=user)
 */

import os from 'os';
import { test, expect } from '../../../fixtures';
import { CHAT_INPUT, findAssistantIdForBackend, goToGuid, waitForAiReply } from '../../../helpers';
import { httpPost } from '../../../helpers/httpBridge';

type CreatedConversation = { id: string };

async function ensureRendererReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number',
    { timeout: 30_000 }
  );
}

async function resolveAssistant(page: import('@playwright/test').Page, backend: string): Promise<string | null> {
  // Availability is probed lazily; poll, tolerating transient bridge errors
  // while the renderer is still settling.
  let assistantId: string | null = null;
  const deadline = Date.now() + 30_000;
  while (!assistantId && Date.now() < deadline) {
    assistantId = await findAssistantIdForBackend(page, backend, { requireAvailable: true }).catch(() => null);
    if (!assistantId) await page.waitForTimeout(3_000);
  }
  return assistantId ?? (await findAssistantIdForBackend(page, backend).catch(() => null));
}

async function createConversation(page: import('@playwright/test').Page, assistantId: string): Promise<string> {
  const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
    name: `E2E terminal card ${Date.now()}`,
    assistant: { id: assistantId },
    extra: { workspace: os.tmpdir(), custom_workspace: true },
  });
  expect(conversation?.id).toBeTruthy();
  // Hash routing occasionally swallows a single assign when the app is
  // already sitting on another conversation (previous test's page); retry
  // until the router actually lands.
  const target = `#/conversation/${conversation.id}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate((hash) => {
      window.location.hash = hash.slice(1);
    }, target);
    const landed = await page
      .waitForFunction((hash) => window.location.hash === hash, target, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (landed) return conversation.id;
    await page.waitForTimeout(1_000);
  }
  throw new Error(`router never landed on ${target}`);
}

/**
 * The send box mounts after the conversation page settles, and the guid
 * page's input can still be in the DOM — pick the VISIBLE editable one.
 */
async function visibleChatInput(page: import('@playwright/test').Page) {
  const input = page.locator(`${CHAT_INPUT} >> visible=true`).first();
  await input.waitFor({ state: 'visible', timeout: 60_000 });
  return input;
}

/**
 * Approve permission cards as codebuddy asks to run its command. Options are
 * rendered by MessageAcpPermission with stable testids
 * (`message-acp-permission-option-<option_id>`); codebuddy's allow option is
 * `allow`, with `allow_always` as the broader variant.
 */
async function autoApprove(page: import('@playwright/test').Page, durationMs: number): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    for (const optionId of ['allow_always', 'allow']) {
      const option = page.locator(`[data-testid="message-acp-permission-option-${optionId}"]`).last();
      if (await option.isVisible().catch(() => false)) {
        await option.click().catch(() => undefined);
        break;
      }
    }
    await page.waitForTimeout(1_000);
  }
}

test.describe('ACP client-hosted terminal', () => {
  test('delegated command renders a live terminal card with output', async ({ page }) => {
    test.setTimeout(300_000);
    await goToGuid(page);
    await ensureRendererReady(page);

    const assistantId = await resolveAssistant(page, 'codebuddy');
    test.skip(!assistantId, 'No codebuddy assistant for terminal e2e');
    if (!assistantId) return;

    await createConversation(page, assistantId);

    const input = await visibleChatInput(page);
    await input.fill('Run the shell command `echo terminal_card_ok` and tell me its exact output.');
    await input.press('Enter');

    // Approve the Bash permission in the background while waiting for the card.
    const approval = autoApprove(page, 60_000);

    // The terminal card shows the mono "$ <command>" header once
    // terminal/create lands, and the output pane fills from the buffer.
    const commandHeader = page.getByTestId('terminal-card-command').filter({ hasText: 'terminal_card_ok' }).first();
    await expect(commandHeader).toBeVisible({ timeout: 120_000 });
    const outputPane = page.getByTestId('terminal-card-output').filter({ hasText: 'terminal_card_ok' }).first();
    await expect(outputPane).toBeVisible({ timeout: 60_000 });
    await approval;

    const reply = await waitForAiReply(page, 180_000);
    expect(reply).toContain('terminal_card_ok');
  });

  test('stop button kills the command and the agent continues', async ({ page }) => {
    test.setTimeout(300_000);
    await goToGuid(page);
    await ensureRendererReady(page);

    const assistantId = await resolveAssistant(page, 'codebuddy');
    test.skip(!assistantId, 'No codebuddy assistant for terminal stop e2e');
    if (!assistantId) return;

    await createConversation(page, assistantId);

    const input = await visibleChatInput(page);
    // A streaming loop rather than a bare `sleep`: codebuddy treats a long
    // sleep as a timeout risk and reroutes it to its own background-task
    // tool (live-observed: no terminal/create at all), while a ticking loop
    // goes through the delegated terminal and stays killable mid-stream.
    await input.fill(
      'Run `for i in $(seq 1 120); do echo tick_$i; sleep 1; done` and afterwards summarise what happened to the command.'
    );
    await input.press('Enter');

    const approval = autoApprove(page, 60_000);

    // Wait for the running card's Stop button, then kill the command.
    const stopButton = page.getByTestId('terminal-card-stop').first();
    await expect(stopButton).toBeVisible({ timeout: 120_000 });
    await approval;
    await stopButton.click();

    // Card flips to the Stopped tag; the turn must still complete (the agent
    // observes the signal exit and reports instead of dying).
    await expect(
      page
        .getByTestId('terminal-card-status')
        .filter({ hasText: /Stopped|已停止/ })
        .first()
    ).toBeVisible({
      timeout: 30_000,
    });
    // The loop is killed early, so its tail must never appear.
    const output = await page.getByTestId('terminal-card-output').first().textContent();
    expect(output ?? '').not.toContain('tick_120');

    const reply = await waitForAiReply(page, 180_000);
    expect(reply.length).toBeGreaterThan(0);
  });
});
