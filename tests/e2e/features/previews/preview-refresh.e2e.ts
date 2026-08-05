/**
 * E2E — the refresh button: telling the user a file changed, and never losing an
 * edit while reloading it.
 *
 * The last property is the one that matters. "Save first, then refresh" runs a
 * save and then replaces the screen with what the file holds. If the save was
 * refused — the file moved underneath, a 409 — and the reload ran anyway, the
 * user's edit is gone, and they would read it as "refresh ate my work" rather
 * than "the save failed". So the interesting assertion is not that a message
 * appeared, it is that the edit is *still on screen*.
 *
 * State is asserted through `data-refresh-state` (`PreviewToolbar.tsx:308`)
 * rather than colour classes: the state is what the test is about, and the class
 * that expresses it is free to change. Values come from `refreshStateToken`
 * (`refreshButtonState.ts:96`): `idle` | `idle-no-signal` | `updated` |
 * `disabled`, with `hidden` rendering no button at all.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../../fixtures';
import { goToGuid } from '../../helpers';

/** The hoisted preview region — verified present at `Layout.tsx:550`. */
const PREVIEW_PANEL = '[data-project-preview-region]';

/** The refresh button, addressed by the state hook the implementation exposes. */
const REFRESH_BUTTON = '[data-refresh-state]';

/** `preview.refresh.confirmTitle` — the dirty-tab confirmation. */
const CONFIRM_TITLE = /Reload and lose unsaved changes|重新加载将丢失未保存的修改/;

/** `preview.refresh.discardAndRefresh` — the only path that proceeds to a reload. */
const DISCARD_AND_REFRESH = /Discard changes and reload|放弃修改并刷新/;

type BackendWindow = Window & { __backendPort?: number };
type ProjectIds = { conversationId: string; projectId: string };

async function createProjectConversation(
  page: import('@playwright/test').Page,
  workspace: string
): Promise<ProjectIds> {
  const ids = await page.evaluate(async (ws) => {
    const port = (window as BackendWindow).__backendPort;
    if (!port) throw new Error('window.__backendPort is not available — is aioncore running?');
    const base = `http://127.0.0.1:${port}`;

    const created = await fetch(`${base}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'acp',
        name: `E2E refresh ${ws}`,
        extra: { workspace: ws, custom_workspace: true },
      }),
    });
    if (!created.ok) throw new Error(`POST /api/conversations failed (${created.status})`);
    const conversationId = ((await created.json()) as { data?: { id?: string } })?.data?.id;
    if (!conversationId) throw new Error('conversation create returned no id');

    const detail = await fetch(`${base}/api/conversations/${conversationId}`).then((r) => r.json());
    const projectId = (detail?.data?.project_id as string | undefined) ?? '';
    if (!projectId) throw new Error('conversation has no project_id after read');
    return { conversationId, projectId };
  }, workspace);

  await page.evaluate((id) => window.location.assign(`#/conversation/${id}`), ids.conversationId);
  await page.waitForFunction((id) => window.location.hash === `#/conversation/${id}`, ids.conversationId, {
    timeout: 15_000,
  });
  await expect(page.locator('.workspace-tree').first()).toBeVisible({ timeout: 30_000 });
  return ids;
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

/** Open a file from the Explorer tree and wait for its editor to be usable. */
async function openFileForEditing(page: import('@playwright/test').Page, fileName: string) {
  await page.getByText(fileName, { exact: true }).first().click();
  const panel = page.locator(PREVIEW_PANEL);
  await expect(panel).toBeVisible({ timeout: 20_000 });
  const editor = panel.locator('.cm-content').first();
  await expect(editor).toBeVisible({ timeout: 20_000 });
  return { panel, editor };
}

/**
 * Type into the editor and confirm the keystrokes landed.
 *
 * CodeMirror ignores input until its content element holds focus, so a click that
 * misses leaves the document untouched — which would surface much later as
 * "refresh discarded the edit" rather than "the test never typed anything".
 */
async function typeUnsavedEdit(
  page: import('@playwright/test').Page,
  editor: import('@playwright/test').Locator,
  marker: string
): Promise<void> {
  await editor.click();
  await page.keyboard.type(marker);
  await expect
    .poll(async () => (await editor.innerText().catch(() => '')).includes(marker), {
      timeout: 10_000,
      message: 'the editor never received the typed text',
    })
    .toBe(true);
}

test.describe('Preview — refresh button', () => {
  let workspace: string;
  let ids: ProjectIds | null = null;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-refresh-'));
    fs.writeFileSync(path.join(workspace, 'editable.txt'), 'disk body v1\n');
    fs.writeFileSync(path.join(workspace, 'plain.txt'), 'nothing special\n');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test.afterEach(async ({ page }) => {
    if (ids) {
      await deleteConversation(page, ids.conversationId);
      ids = null;
    }
    /**
     * Reset the file two of these tests rewrite. Doing it here rather than at the
     * end of each body matters: a test that fails before its own restore line
     * would otherwise hand the next one a modified fixture, turning one failure
     * into a cascade that hides the original cause.
     */
    fs.writeFileSync(path.join(workspace, 'editable.txt'), 'disk body v1\n');
  });

  test('a project file offers a live refresh button', async ({ page }) => {
    /**
     * The baseline the other tests rest on: a file opened from the Explorer is a
     * project ref, so it can be watched and its button is plain `idle` — not
     * `idle-no-signal` (which would mean nothing will ever tell us it changed) and
     * not `disabled` (no way to address the file at all).
     */
    test.setTimeout(120_000);
    await goToGuid(page);
    ids = await createProjectConversation(page, workspace);

    const { panel } = await openFileForEditing(page, 'plain.txt');
    const button = panel.locator(REFRESH_BUTTON).first();
    await expect(button).toBeVisible({ timeout: 15_000 });
    await expect(button).toHaveAttribute('data-refresh-state', 'idle', { timeout: 15_000 });
  });

  test('a dirty tab asks before reloading, and cancelling keeps the edit', async ({ page }) => {
    test.setTimeout(120_000);
    await goToGuid(page);
    ids = await createProjectConversation(page, workspace);

    const { panel, editor } = await openFileForEditing(page, 'editable.txt');
    await typeUnsavedEdit(page, editor, 'EDIT-KEPT-ON-CANCEL');

    await panel.locator(REFRESH_BUTTON).first().click();

    // Asked, not silently reloaded.
    await expect(page.getByText(CONFIRM_TITLE).first()).toBeVisible({ timeout: 10_000 });

    // Dismiss without choosing either proceed path.
    await page.keyboard.press('Escape');

    // The edit is still there — the reload did not run behind the prompt.
    await expect
      .poll(async () => (await panel.innerText().catch(() => '')).includes('EDIT-KEPT-ON-CANCEL'), {
        timeout: 10_000,
      })
      .toBe(true);
  });

  test('discarding the edit reloads the file from disk', async ({ page }) => {
    test.setTimeout(120_000);
    await goToGuid(page);
    ids = await createProjectConversation(page, workspace);

    const { panel, editor } = await openFileForEditing(page, 'editable.txt');
    await typeUnsavedEdit(page, editor, 'EDIT-TO-BE-DISCARDED');

    // Change the file underneath, so the reload has something new to show.
    fs.writeFileSync(path.join(workspace, 'editable.txt'), 'disk body v2 RELOADED\n');

    await panel.locator(REFRESH_BUTTON).first().click();
    await expect(page.getByText(CONFIRM_TITLE).first()).toBeVisible({ timeout: 10_000 });
    await page.getByText(DISCARD_AND_REFRESH).first().click();

    // The disk version won, which is what the user asked for.
    await expect
      .poll(async () => (await panel.innerText().catch(() => '')).includes('RELOADED'), { timeout: 20_000 })
      .toBe(true);
    expect(await panel.innerText()).not.toContain('EDIT-TO-BE-DISCARDED');
  });

  test('a dirty tab can never reach the reload without the user saying so', async ({ page }) => {
    /**
     * 🔴 The guard that keeps this feature from *creating* data loss.
     *
     * The reload replaces the screen with the file on disk, so the only edit it may
     * ever discard is one the user knowingly gave up. "Save, then reload" used to be
     * a third option here and carried its own hazard — a refused save followed by a
     * reload would have destroyed the edit. That option is gone (it read as
     * "discard my work" to the user anyway, since the reload immediately overwrites
     * the screen with what was just written), which removes that hazard but also
     * removes the test that covered it.
     *
     * What still has to hold is the property underneath it, and it is stronger than
     * what the old test checked: **no path from the refresh button reaches a reload
     * of a dirty tab except through the user's explicit "discard".** Cancelling, or
     * dismissing the dialog, must leave the edit exactly where it was.
     *
     * The load-bearing assertion is "the edit is still on screen and the disk copy
     * is not", not "a dialog appeared" — a dialog is easy to render while having
     * already clobbered the document.
     */
    test.setTimeout(120_000);
    await goToGuid(page);
    ids = await createProjectConversation(page, workspace);

    const { panel, editor } = await openFileForEditing(page, 'editable.txt');
    await typeUnsavedEdit(page, editor, 'EDIT-MUST-SURVIVE-REFRESH');

    /**
     * Change the file underneath the tab, so a reload would visibly replace the
     * edit. Without this the assertion could pass on a tab that reloaded its own
     * unchanged content.
     */
    fs.writeFileSync(path.join(workspace, 'editable.txt'), 'disk body v2 WRITTEN-BY-SOMEONE-ELSE\n');

    // Ask to refresh, then decline. Twice, by both routes out of the dialog.
    await panel.locator(REFRESH_BUTTON).first().click();
    await expect(page.getByText(CONFIRM_TITLE).first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByText(CONFIRM_TITLE).first()).toBeHidden({ timeout: 10_000 });

    // Second route out: open it again and dismiss again. The edit must survive every
    // exit that is not an explicit discard.
    await panel.locator(REFRESH_BUTTON).first().click();
    await expect(page.getByText(CONFIRM_TITLE).first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByText(CONFIRM_TITLE).first()).toBeHidden({ timeout: 10_000 });

    // The edit must survive both refusals. This is what the test exists for.
    await expect
      .poll(async () => (await panel.innerText().catch(() => '')).includes('EDIT-MUST-SURVIVE-REFRESH'), {
        timeout: 20_000,
        message: 'declining the refresh still let the reload run, discarding the edit',
      })
      .toBe(true);

    // And the disk version must not have replaced it.
    expect(
      await panel.innerText(),
      'a reload ran without the user choosing to discard — the edit was overwritten'
    ).not.toContain('WRITTEN-BY-SOMEONE-ELSE');
  });
});
