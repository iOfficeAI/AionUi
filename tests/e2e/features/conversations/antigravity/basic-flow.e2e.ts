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

  test('the usage indicator reports the tokens agy actually spent', async ({ page }) => {
    // agy reports token counts but NO context window and no cost, so the
    // indicator must render the hollow-ring form: raw counts, never a
    // percentage against a guessed denominator.
    await goToGuid(page);
    await selectAgent(page, 'antigravity');
    conversationId = await sendMessageFromGuid(page, 'Say OK');
    await waitForAiReply(page);

    // Usage is persisted by the session pump AFTER the turn's relay finishes,
    // so it is not readable the instant the reply renders.
    let usage: { used?: number; size?: number } | null = null;
    for (let i = 0; i < 40 && !(usage?.used ?? 0); i++) {
      usage = await httpGet<{ used?: number; size?: number }>(page, `/api/conversations/${conversationId}/usage`).catch(
        () => null
      );
      if (!(usage?.used ?? 0)) await page.waitForTimeout(1000);
    }
    expect(usage?.used ?? 0).toBeGreaterThan(0);
    // agy reports no window; a fabricated denominator would be worse than none.
    expect(usage?.size ?? 0).toBe(0);

    const ring = page.locator('.context-usage-indicator').first();
    await ring.waitFor({ state: 'visible', timeout: 20_000 });
    await takeScreenshot(page, 'chat-antigravity/basic/06-usage-ring.png');
  });

  test("the backend offers agy's models as switchable config options", async ({ page }) => {
    // The models the backend discovers must reach the same `config_options`
    // contract the ACP picker consumes — that is what makes them switchable at
    // all, and `ChatConversation` used to hand any non-`acp` conversation a
    // permanently disabled Google selector instead.
    //
    // Asserted at the contract rather than through the picker on purpose: model
    // discovery starts when the session opens (~3s), the renderer fetches these
    // options once, and a first-ever conversation can therefore latch onto an
    // empty list and show "use the CLI's model" for its lifetime. The backend
    // now caches the list process-wide so later sessions are unaffected, but the
    // very first one still races. Asserting on the picker here would encode that
    // race as expected behaviour.
    await goToGuid(page);
    await selectAgent(page, 'antigravity');
    conversationId = await sendMessageFromGuid(page, 'Say OK');
    await waitForAiReply(page);

    const ensured = await httpPost<{ config_options?: Array<{ id: string; options?: unknown[] }> }>(
      page,
      `/api/conversations/${conversationId}/runtime/ensure`
    );
    const model = (ensured?.config_options ?? []).find((o) => o.id === 'model');
    expect(model, 'no model config option was offered').toBeTruthy();
    expect((model?.options ?? []).length).toBeGreaterThan(0);

    const mode = (ensured?.config_options ?? []).find((o) => o.id === 'mode');
    expect((mode?.options ?? []).length).toBe(3); // agy's default / accept-edits / plan
  });
});
