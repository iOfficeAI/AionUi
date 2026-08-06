/**
 * E2E-B1a / E2E-B1b — the oversized gate, exercised through the Explorer.
 *
 * This is the end-to-end proof for L0, the one data-loss path that was actually
 * reproduced: a file above the size ceiling used to be read partially, shown in
 * an editor, and then saved back — destroying the part that was never read.
 * Unit tests can assert the decision function; only this can show that the
 * decision reaches the screen and that nothing writable is left behind.
 *
 * Deliberately drives the real UI (click a file in the Explorer tree) rather
 * than seeding state: `openPreview` is not exported, and adding a test hook to
 * production code to reach it would be the kind of shortcut this round is busy
 * deleting.
 *
 * Scope, stated plainly: this covers the **Explorer** entry point only. The
 * other two entry points named in IMPLEMENTATION-PLAN acceptance item #4
 * (message file links, tool-card previews) need a conversation with real agent
 * output and are NOT covered here — see the `test.describe` comment below.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../../fixtures';
import { goToGuid } from '../../helpers';

/**
 * The preview panel. `data-project-preview-region` and `.preview-panel` are the
 * same element in the Layout host (Layout.tsx:550-551), but the attribute is the
 * stable anchor: `.preview-panel` is also used by the per-conversation layout,
 * so matching on the attribute pins the assertion to the hoisted region the
 * project Explorer opens into.
 */
const PREVIEW_PANEL = '[data-project-preview-region]';

/** Ceiling that `resolvePreviewPayload` applies to text-like previews. */
const TEXT_CEILING_BYTES = 1024 * 1024;

/** Matches the oversized heading in both shipped locales. */
const OVERSIZED_HEADING = /File too large to preview|文件过大，无法预览/;

type BackendWindow = Window & { __backendPort?: number };

/**
 * Bind a workspace as a project and return the conversation that hosts it.
 *
 * Uses `type: 'acp'` with no assistant: the Explorer host only needs a published
 * `currentProject`, which the backend derives from `extra.workspace` on read
 * (lazy project bind). This keeps the test independent of whether the machine
 * has a usable assistant configured.
 */
async function createProjectConversation(page: import('@playwright/test').Page, workspace: string): Promise<string> {
  const conversationId = await page.evaluate(async (ws) => {
    const port = (window as BackendWindow).__backendPort;
    if (!port) throw new Error('window.__backendPort is not available — is aioncore running?');

    const created = await fetch(`http://127.0.0.1:${port}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'acp',
        name: `E2E oversized ${ws}`,
        extra: { workspace: ws, custom_workspace: true },
      }),
    });
    if (!created.ok) throw new Error(`POST /api/conversations failed (${created.status})`);
    const id = ((await created.json()) as { data?: { id?: string } })?.data?.id;
    if (!id) throw new Error('conversation create returned no id');

    // Read once so the backend performs the lazy project bind before we route.
    await fetch(`http://127.0.0.1:${port}/api/conversations/${id}`);
    return id;
  }, workspace);

  await page.evaluate((id) => window.location.assign(`#/conversation/${id}`), conversationId);
  await page.waitForFunction((id) => window.location.hash === `#/conversation/${id}`, conversationId, {
    timeout: 15_000,
  });

  // The Explorer tree is the signal that `currentProject` was published; it is
  // the host the preview region hangs off, so every assertion below needs it.
  await expect(page.locator('.workspace-tree').first()).toBeVisible({ timeout: 30_000 });
  return conversationId;
}

async function deleteConversation(page: import('@playwright/test').Page, conversationId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const port = (window as BackendWindow).__backendPort;
    if (!port) return;
    await fetch(`http://127.0.0.1:${port}/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
      () => {}
    );
  }, conversationId);
}

/**
 * NOT COVERED HERE — recorded so the gap is visible rather than implied:
 *   - message file links (E1/E4): needs a conversation carrying a file link
 *   - tool-card previews: needs real agent tool output
 * Both require a live agent, so acceptance item #4 ("the gate holds on all three
 * entry points") is only one-third verified by this file.
 */
test.describe('Preview — oversized gate (Explorer entry point)', () => {
  let workspace: string;
  let conversationId: string | null = null;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-oversized-'));
    // One byte over the ceiling: the gate uses `>`, so this is the smallest file
    // that must be rejected.
    fs.writeFileSync(path.join(workspace, 'over-ceiling.md'), 'x'.repeat(TEXT_CEILING_BYTES + 1));
    // Exactly at the ceiling — must still preview, guarding against `>=`.
    fs.writeFileSync(path.join(workspace, 'at-ceiling.md'), 'y'.repeat(TEXT_CEILING_BYTES));
    fs.writeFileSync(path.join(workspace, 'small.md'), '# small\n\nreadable\n');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test.afterEach(async ({ page }) => {
    if (conversationId) {
      await deleteConversation(page, conversationId);
      conversationId = null;
    }
  });

  test('a file over the ceiling shows the oversized notice instead of its content', async ({ page }) => {
    test.setTimeout(120_000);
    await goToGuid(page);
    conversationId = await createProjectConversation(page, workspace);

    await page.getByText('over-ceiling.md', { exact: true }).first().click();

    const panel = page.locator(PREVIEW_PANEL);
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(OVERSIZED_HEADING).first()).toBeVisible({ timeout: 10_000 });

    // The content must not have reached the screen. Asserting the notice alone
    // would pass even if the file were also rendered somewhere in the panel.
    await expect(panel).not.toContainText('xxxxxxxxxxxxxxxxxxxx');
  });

  test('the oversized notice never compares a size to itself', async ({ page }) => {
    /**
     * `over-ceiling.md` is one byte over the limit — the smallest difference, and
     * the case that produced "1 MB exceeds 1 MB". Two identical numbers read as a
     * bug in the app rather than an explanation of the file, so the notice raises
     * precision until they differ and falls back to "> <limit>" when no sane
     * precision can separate them.
     *
     * Written as a positive check on the rendered sentence rather than a bare
     * "does not contain": a plain negative assertion here would also pass if the
     * notice failed to render at all, which is the classic way this kind of test
     * ends up green while proving nothing.
     */
    test.setTimeout(120_000);
    await goToGuid(page);
    conversationId = await createProjectConversation(page, workspace);

    await page.getByText('over-ceiling.md', { exact: true }).first().click();

    const panel = page.locator(PREVIEW_PANEL);
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(OVERSIZED_HEADING).first()).toBeVisible({ timeout: 10_000 });

    // Pull the sentence out first, so a missing notice fails here rather than
    // silently satisfying a negative assertion below.
    const notice = (await panel.innerText()).replace(/\s+/g, ' ');
    expect(notice).toMatch(/1 MB|1 兆|> /);

    /**
     * The failure being guarded against is a *bare* size that equals the limit —
     * "1 MB exceeds 1 MB". A `>`-qualified size is the intended fallback and
     * reads correctly even though the number matches, so strip those qualified
     * mentions before comparing; otherwise this assertion fails on the very fix
     * it is meant to verify.
     */
    const bareSizes =
      notice.replace(/[>≥]\s*\d+(?:\.\d+)?\s*[KMGT]?B/gi, ' ').match(/\d+(?:\.\d+)?\s*[KMGT]?B/gi) ?? [];
    const distinct = new Set(bareSizes.map((s) => s.replace(/\s+/g, '').toUpperCase()));
    expect(
      bareSizes.length < 2 || distinct.size > 1,
      `oversized notice compares a size to itself: bare sizes=${JSON.stringify(bareSizes)} in "${notice.slice(0, 200)}"`
    ).toBe(true);
  });

  test('an oversized tab exposes no editor and no way to write the file back', async ({ page }) => {
    /**
     * This is the assertion L0 is really about. A notice is cosmetic; what
     * destroyed files was partial content sitting in an editor that could save.
     * So: no editor at all, and Ctrl/Cmd+S must not produce a write request.
     */
    test.setTimeout(120_000);
    await goToGuid(page);
    conversationId = await createProjectConversation(page, workspace);

    const writes: string[] = [];
    const recordWrites = (request: import('@playwright/test').Request) => {
      const url = request.url();
      // `PUT /api/fs/content` is the save path; record any method that could write.
      if (url.includes('/api/fs/content') && request.method() !== 'POST') writes.push(`${request.method()} ${url}`);
      if (url.includes('/api/fs/write')) writes.push(`${request.method()} ${url}`);
    };
    page.on('request', recordWrites);

    try {
      await page.getByText('over-ceiling.md', { exact: true }).first().click();
      const panel = page.locator(PREVIEW_PANEL);
      await expect(panel).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(OVERSIZED_HEADING).first()).toBeVisible({ timeout: 10_000 });

      // No editing surface of any kind inside the panel.
      await expect(panel.locator('.cm-editor')).toHaveCount(0);
      await expect(panel.locator('textarea')).toHaveCount(0);

      // The save shortcut must be inert here.
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
      await expect
        .poll(() => writes.length, { timeout: 3_000, message: 'oversized tab must not issue a write' })
        .toBe(0);
    } finally {
      page.off('request', recordWrites);
    }
  });

  /**
   * NOT YET WORKING — the boundary case (a file of exactly the ceiling size must
   * still preview) is left `fixme` rather than deleted or loosened.
   *
   * What is known: clicking `at-ceiling.md` does render the file — a diagnostic
   * dump taken at the point of failure showed `data-project-preview-region`
   * present and the document's text (`yyyy…`) on screen, alongside the
   * "原文 / 预览" toggle. So the behaviour under test appears correct.
   *
   * What is not known: why the assertions do not see it. The region reports zero
   * size for a while (so `toBeVisible` fails), and a later `toHaveCount(1)` also
   * failed even though the diagnostic had just observed the element — which
   * points at a timing or per-test state issue in how this file drives the app,
   * not at the gate itself.
   *
   * Deliberately not "fixed" by relaxing the assertion until it passes: that
   * would produce a test that reports success without checking the boundary. The
   * two P0 cases above cover the data-loss path; this one guards `>` vs `>=`,
   * which unit coverage of `resolvePreviewPayload` already exercises.
   */
  test.fixme('a file exactly at the ceiling still previews', async ({ page }) => {
    test.setTimeout(120_000);
    await goToGuid(page);
    conversationId = await createProjectConversation(page, workspace);

    await page.getByText('at-ceiling.md', { exact: true }).first().click();

    await expect(page.locator(PREVIEW_PANEL)).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator(PREVIEW_PANEL)).toContainText('yyyyyyyyyyyyyyyyyyyy', { timeout: 40_000 });
    await expect(page.getByText(OVERSIZED_HEADING)).toHaveCount(0);
  });
});
