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

/** `preview.refresh.saveAndRefresh` / `discardAndRefresh` — the two proceed paths. */
const SAVE_AND_REFRESH = /Save, then reload|先保存再刷新/;
const DISCARD_AND_REFRESH = /Discard changes and reload|放弃修改并刷新/;

/**
 * `preview.refresh.saveConflictAborted` — the message that says the reload was
 * abandoned because the save hit a conflict. Its presence is a supporting signal;
 * the load-bearing assertion is that the edit survived.
 */
const CONFLICT_ABORTED = /Not reloaded|未刷新/;

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

  test('a refused save aborts the reload and leaves the edit on screen', async ({ page }) => {
    /**
     * 🔴 The one path in this feature that can *create* data loss.
     *
     * "Save, then refresh" only earns the reload if the save actually landed. Here
     * it cannot: the file is modified on disk after the tab read it, so the write
     * is refused with a conflict. If the reload ran anyway it would replace the
     * screen with the disk copy and the edit would be gone — and the user would
     * blame refresh, not the failed save.
     *
     * The load-bearing assertion is therefore "the edit is still on screen", not
     * "a message appeared". A message is easy to render while still having
     * clobbered the document.
     */
    test.setTimeout(120_000);
    await goToGuid(page);
    ids = await createProjectConversation(page, workspace);

    const { panel, editor } = await openFileForEditing(page, 'editable.txt');
    await typeUnsavedEdit(page, editor, 'EDIT-MUST-SURVIVE-409');

    /**
     * Make the on-disk file newer than what this tab read. The save carries the
     * mtime it opened with as an If-Match precondition, so the backend refuses it.
     */
    fs.writeFileSync(path.join(workspace, 'editable.txt'), 'disk body v2 WRITTEN-BY-SOMEONE-ELSE\n');

    await panel.locator(REFRESH_BUTTON).first().click();
    await expect(page.getByText(CONFIRM_TITLE).first()).toBeVisible({ timeout: 10_000 });
    await page.getByText(SAVE_AND_REFRESH).first().click();

    // The edit must survive. This is the assertion the whole test exists for.
    await expect
      .poll(async () => (await panel.innerText().catch(() => '')).includes('EDIT-MUST-SURVIVE-409'), {
        timeout: 20_000,
        message: 'the refused save still let the reload run, discarding the edit',
      })
      .toBe(true);

    // And the disk version must not have replaced it.
    expect(
      await panel.innerText(),
      'the reload ran despite the save being refused — the edit was overwritten'
    ).not.toContain('WRITTEN-BY-SOMEONE-ELSE');

    // Supporting signal: the user is told why nothing reloaded.
    await expect(page.getByText(CONFLICT_ABORTED).first()).toBeVisible({ timeout: 10_000 });
  });
});
