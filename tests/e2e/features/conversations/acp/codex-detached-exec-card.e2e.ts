/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * codex detached-exec card continuity (ELECTRON-3XC / 3XF / 3XG).
 *
 * codex's unified exec runs the command in a background PTY and hands the model
 * a partial result once the command has been streaming output for a while — the
 * model then ends its prompt turn WHILE THE PROCESS IS STILL RUNNING
 * (live-captured 0.145.0: `turn/completed status=completed` arrives ~40s in, the
 * command keeps emitting outputDelta afterwards).
 *
 * The pump used to cancel every tool call still open at turn end, so a command
 * that was merely still running was painted "cancelled" — the concrete shape of
 * the "AI stopped by itself" reports. It must now stay in a running state.
 *
 * The command MUST stream output continuously. A silent `sleep N` does NOT
 * reproduce this: unified exec then blocks the model until the command exits
 * (verified across three probe prompts, including one that explicitly told the
 * model not to wait).
 */

import os from 'os';
import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { findAssistantIdForBackend, goToGuid } from '../../../helpers';
import { httpGet, httpPost } from '../../../helpers/httpBridge';

type CreatedConversation = { id: string };
type MessageRow = { type: string; status?: string; content?: unknown };
type MessageList = { items: MessageRow[] };

/** Persisted codex tool row: `content.args.command` holds the command line and
 *  `content.status` the tool-call status (`running` / `completed` / `canceled`).
 *  A cancel frame NULLS `args`, so the command text is gone from a cancelled
 *  row — match on the tool name and inspect statuses. */
type ToolCallContent = { name?: string; status?: string; args?: { command?: string } | null };

/** Streams a line per second for 5 minutes — long enough that codex ends its
 *  turn while the process is still running. */
const STREAMING_COMMAND = 'for i in $(seq 1 300); do echo build_line_$i; sleep 1; done';

async function ensureRendererReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number',
    { timeout: 30_000 }
  );
}

function commandExecutionCards(items: MessageRow[]): ToolCallContent[] {
  return items
    .filter((m) => m.type === 'tool_call')
    .map((m) => (m.content ?? {}) as ToolCallContent)
    .filter((c) => c.name === 'commandExecution');
}

test.describe('codex detached exec card', () => {
  test('a still-running command is not cancelled when the prompt turn ends', async ({ page }) => {
    test.setTimeout(420_000);
    await goToGuid(page);
    await ensureRendererReady(page);

    const assistantId = await findAssistantIdForBackend(page, 'codex').catch(() => null);
    test.skip(!assistantId, 'No codex assistant available for detached-exec e2e');
    if (!assistantId) return;

    const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
      name: `E2E codex detached exec ${Date.now()}`,
      assistant: { id: assistantId },
      extra: { workspace: os.tmpdir(), custom_workspace: true, session_mode: 'danger-full-access' },
    });
    expect(conversation?.id).toBeTruthy();
    const conversationId = conversation.id;

    await httpPost(page, `/api/conversations/${conversationId}/messages`, {
      content: `Run exactly this command and tell me what the first lines of output are: \`${STREAMING_COMMAND}\``,
    });

    // Wait for the prompt turn to end. codex reports partial output and calls the
    // turn done while the loop keeps running.
    let turnEnded = false;
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      const detail = await httpGet<{ runtime?: { state?: string } }>(
        page,
        `/api/conversations/${conversationId}`
      ).catch(() => null);
      if (detail?.runtime?.state === 'idle') {
        turnEnded = true;
        break;
      }
      await page.waitForTimeout(5_000);
    }
    test.skip(!turnEnded, 'codex never ended the turn within the window (model chose to wait it out)');

    // The command card must NOT have been settled as cancelled/errored just
    // because the turn ended — the process is still streaming output.
    const messages = await httpGet<MessageList>(page, `/api/conversations/${conversationId}/messages?page_size=50`);
    const cards = commandExecutionCards(messages?.items ?? []);
    expect(cards.length, 'the streaming command must have produced a commandExecution card').toBeGreaterThan(0);
    const statuses = cards.map((c) => c.status ?? 'unknown');
    expect(statuses, 'a still-running command must not be cancelled when the prompt turn ends').not.toContain(
      'canceled'
    );
    // The card that ran our streaming loop must still carry its command line —
    // a cancel frame nulls `args`, so losing it is the same regression.
    expect(
      cards.some((c) => (c.args?.command ?? '').includes('build_line_')),
      'the streaming command card must keep its command line (a cancel frame nulls args)'
    ).toBe(true);
  });
});
