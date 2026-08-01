/**
 * Antigravity (agy CLI) Chat E2E — Basic Flow
 *
 * Covers the path a real user takes: pick the Antigravity assistant on the guid
 * page, type a message, get a reply. Deliberately UI-driven — both bugs this
 * guards against only exist on the UI path, and a bridge-created conversation
 * passes straight through them:
 *
 *  1. The guid page creates the conversation WITHOUT a type; the backend derives
 *     it from the assistant's agent, so it comes back as `antigravity`.
 *     `ChatConversation` switched on that type and fell to `default: null` —
 *     the chat area rendered empty, no send box mounted, and the queued initial
 *     message in `acp_initial_message_<id>` was never delivered. The turn never
 *     started at all.
 *  2. Server-side, an agy conversation reaches the ACP factory. agy does not
 *     speak ACP, so routing it to the ACP manager hung on an initialize
 *     handshake and surfaced as "The selected Agent failed to start".
 *
 * Both were invisible to bridge-driven tests and to every backend test, which
 * created conversations with an explicit type the UI never sends.
 *
 * Prerequisites:
 * - `agy` on PATH and signed in (otherwise the assistant is not `online`)
 * - `aioncore` on PATH with Antigravity support
 */

import { test, expect } from '../../../fixtures';
import { goToGuid, selectAgent, sendMessageFromGuid, waitForAiReply, deleteConversation } from '../../../helpers';
import { httpGet, httpPost } from '../../../helpers/httpBridge';
import { takeScreenshot } from '../../../helpers/screenshots';

type Assistant = {
  id: string;
  enabled?: boolean;
  agent_id?: string;
  agent_status?: string;
  agent?: { type?: string; acp_backend?: string };
};

test.describe('Antigravity Chat - Basic Flow', () => {
  // agy spawns a fresh process per turn and the first turn pays model discovery.
  test.setTimeout(240_000);

  let conversationId: string | null = null;

  test.beforeAll(async ({ page }) => {
    const assistants = await httpGet<Assistant[]>(page, '/api/assistants').catch(() => [] as Assistant[]);
    const agy = assistants.find(
      (a) => (a.agent?.acp_backend || a.agent?.type) === 'antigravity' && a.enabled !== false
    );
    if (!agy) {
      test.skip(true, 'No Antigravity assistant in the catalog — is this aioncore built with Antigravity support?');
      return;
    }

    // Builtin agents start `unchecked` and nothing on the guid page probes them,
    // so settle availability first — the same state a user reaches once the
    // agent has been checked. Skips (rather than fails) when agy is absent or
    // signed out, because that is an environment gap, not a product defect.
    if (agy.agent_status !== 'online' && agy.agent_id) {
      const probed = await httpPost<{ status?: string }>(page, `/api/agents/${agy.agent_id}/health-check`).catch(
        () => null
      );
      if (probed?.status !== 'online') {
        test.skip(true, `agy did not probe online (got "${probed?.status}") — is agy installed and signed in?`);
      }
    }
  });

  test.afterEach(async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
    }
    if (conversationId) {
      await deleteConversation(page, conversationId).catch(() => false);
      conversationId = null;
    }
  });

  test('selecting Antigravity in the UI completes a turn', async ({ page }) => {
    await goToGuid(page);
    await takeScreenshot(page, 'chat-antigravity/basic/01-guid-page.png');

    // Selects the assistant pill whose runtime key is `antigravity`.
    await selectAgent(page, 'antigravity');
    await takeScreenshot(page, 'chat-antigravity/basic/02-agent-selected.png');

    conversationId = await sendMessageFromGuid(page, 'Reply with exactly: E2E_AGY_OK');
    expect(conversationId).toBeTruthy();
    await takeScreenshot(page, 'chat-antigravity/basic/03-message-sent.png');

    const reply = await waitForAiReply(page);
    await takeScreenshot(page, 'chat-antigravity/basic/04-reply.png');

    // The regression showed up as a rendered error bubble rather than a missing
    // one, so assert on the failure text explicitly — a non-empty reply alone
    // would have passed while the product was broken.
    expect(reply).not.toContain('failed to start');
    expect(reply).toContain('E2E_AGY_OK');
  });
});
