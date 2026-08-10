/**
 * The refresh button notices a file that changed on disk.
 *
 * This is the one behaviour in the preview rework that was verified by hand and then
 * had nothing watching it. It is also a behaviour whose history is unexplained: an
 * earlier run on an older baseline saw the button stay `idle`, and none of the commits
 * in between touched the signal path (`monitorTransport.ts`, `previewWatchStore.ts`) —
 * so whether that run failed for a code reason or an environment one was never
 * settled. A behaviour that started working for unknown reasons can stop working for
 * unknown reasons, which is the whole argument for this file.
 *
 * Two things here are load-bearing and easy to get wrong:
 *
 *  1. **The control uses a file that was never touched from outside.** Re-opening the
 *     same file does NOT work as a control — the tab keeps the `updated` state it
 *     already earned, so the control reports "went updated anyway" and appears to
 *     prove the assertion is noise. It isn't; the control was.
 *  2. **Every assertion reads the DOM.** An earlier attempt to corroborate through
 *     recorded WebSocket frames returned zero `fs/delta` frames twice, both times for
 *     tooling reasons (`fs/subscribe` is per-connection, so a second socket that
 *     subscribed to nothing can never receive one; hooking the page's own socket ran
 *     after it was already open). Zero frames said nothing about the signal path.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { expect, test } from '../../fixtures';
import { goToGuid } from '../../helpers';

/** Verified present at Layout.tsx:550 rather than guessed. */
const PREVIEW_PANEL = '[data-project-preview-region]';

/**
 * `refreshStateToken` exposes the state machine as an attribute so a test does not have
 * to read colour off a class name: `idle` | `idle-no-signal` | `updated` | `disabled` |
 * `hidden`.
 */
const REFRESH_BUTTON = '[data-refresh-state]';

type BackendWindow = Window & { __backendPort?: number };

async function openConversationOn(page: import('@playwright/test').Page, workspace: string): Promise<void> {
  await goToGuid(page);
  const id = await page.evaluate(async (ws) => {
    const port = (window as BackendWindow).__backendPort;
    if (!port) throw new Error('window.__backendPort is not available — is aioncore running?');
    const created = await fetch(`http://127.0.0.1:${port}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'acp', name: 'watch-signal', extra: { workspace: ws, custom_workspace: true } }),
    });
    if (!created.ok) throw new Error(`POST /api/conversations failed (${created.status})`);
    const conversationId = ((await created.json()) as { data?: { id?: string } })?.data?.id;
    if (!conversationId) throw new Error('conversation create returned no id');
    // Reading it back binds the project lazily, which is what makes the explorer tree
    // appear without an agent having to be installed.
    await fetch(`http://127.0.0.1:${port}/api/conversations/${conversationId}`);
    return conversationId;
  }, workspace);

  await page.evaluate((i) => window.location.assign(`#/conversation/${i}`), id);
  await page.waitForFunction((i) => window.location.hash === `#/conversation/${i}`, id, { timeout: 15_000 });
  await expect(page.locator('.workspace-tree').first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Open a file and wait for the button to settle on a state that can still change.
 *
 * The identity upgrade that makes a file watchable is async, so the button starts
 * without a signal and becomes `idle` once the file is known to be inside the project.
 * Asserting before it settles would test the wrong state.
 */
async function openFileAndSettle(page: import('@playwright/test').Page, fileName: string) {
  await page.getByText(fileName, { exact: true }).first().click();
  const button = page.locator(`${PREVIEW_PANEL} ${REFRESH_BUTTON}`).first();
  await expect(button).toBeVisible({ timeout: 20_000 });
  await expect(button).toHaveAttribute('data-refresh-state', 'idle', { timeout: 20_000 });
  return button;
}

test.describe('Preview — the refresh button notices a change on disk', () => {
  let workspace: string;

  test.beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-watch-signal-'));
  });

  test.afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('a file edited outside the app turns the button to "updated"', async ({ page }) => {
    test.setTimeout(150_000);
    fs.writeFileSync(path.join(workspace, 'watched.txt'), 'first version\n');
    await openConversationOn(page, workspace);

    const button = await openFileAndSettle(page, 'watched.txt');

    // Written from the test process, not through the app — this is the "someone else
    // changed the file" case the button exists for.
    fs.writeFileSync(path.join(workspace, 'watched.txt'), 'changed from outside the app\n');

    await expect(button).toHaveAttribute('data-refresh-state', 'updated', { timeout: 30_000 });
  });

  test('a file nobody touched stays un-updated', async ({ page }) => {
    test.setTimeout(150_000);
    fs.writeFileSync(path.join(workspace, 'watched.txt'), 'first version\n');
    fs.writeFileSync(path.join(workspace, 'untouched.txt'), 'never modified\n');
    await openConversationOn(page, workspace);

    // Change one file so the watch is demonstrably live in this session: without this,
    // "untouched stayed idle" would also pass on a build where the signal never works
    // at all, which is the failure this control has to be able to see past.
    const watched = await openFileAndSettle(page, 'watched.txt');
    fs.writeFileSync(path.join(workspace, 'watched.txt'), 'changed from outside the app\n');
    await expect(watched).toHaveAttribute('data-refresh-state', 'updated', { timeout: 30_000 });

    // Now the actual control, on a *different* file that was never written from
    // outside. Re-opening `watched.txt` would not work here — it keeps the `updated`
    // state it already earned.
    const untouched = await openFileAndSettle(page, 'untouched.txt');
    await expect(untouched).not.toHaveAttribute('data-refresh-state', 'updated');

    // And it holds, rather than merely not having arrived yet.
    await page.waitForTimeout(5_000);
    await expect(untouched).not.toHaveAttribute('data-refresh-state', 'updated');
  });
});
