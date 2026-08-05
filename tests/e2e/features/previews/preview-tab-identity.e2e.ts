/**
 * E2E — tab identity: one tab per file, and persistence that stops rewriting it.
 *
 * Three properties, none of which a unit test can establish:
 *
 *   1. **One tab per file, across two entry points.** The Explorer hands the panel
 *      a `project` ref and short-circuits; a `file://` link in a rendered markdown
 *      hands it a `local` ref that needs an async upgrade round trip. Convergence
 *      onto a single tab is a property *of those two paths meeting* — and it is
 *      exactly the seam a unit test mocks away, so mocking either side makes the
 *      assertion pass without proving anything.
 *
 *   2. **Unsaved edits survive a scope round trip as unsaved.** Persistence used to
 *      force `isDirty:false` and copy `content` over `originalContent`, so a tab
 *      came back looking saved while holding edits that were never written. That is
 *      a localStorage serialise/restore round trip; a mocked store does not have it.
 *
 *   3. **Collapsing the panel keeps the tabs.** `closePreview` used to clear tabs
 *      and let the debounced writer persist that empty state over the scope, which
 *      discarded every tab for the project.
 *
 * ⚠️ Asserting (3) means checking the *stored* tabs, not panel visibility. After
 * this block, "closed but holding tabs" is a normal state: the panel is meant to be
 * collapsed while its tabs survive. A test that asserted visibility would report a
 * correct behaviour as a failure.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../../fixtures';
import { goToGuid } from '../../helpers';

/** The hoisted preview region — verified present at `Layout.tsx:550`. */
const PREVIEW_PANEL = '[data-project-preview-region]';

/** `preview.unsavedChangesTitle`, both shipped locales. */
const DIRTY_MARK = /Unsaved Changes|未保存的修改/;

type BackendWindow = Window & { __backendPort?: number };

type ProjectIds = { conversationId: string; projectId: string };

/**
 * Bind a workspace as a project and route to its conversation.
 *
 * `type: 'acp'` with no assistant: the Explorer host only needs a published
 * `currentProject`, which the backend derives from `extra.workspace` on read. A
 * missing agent therefore cannot turn these into silent skips.
 */
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
        name: `E2E identity ${ws}`,
        extra: { workspace: ws, custom_workspace: true },
      }),
    });
    if (!created.ok) throw new Error(`POST /api/conversations failed (${created.status})`);
    const conversationId = ((await created.json()) as { data?: { id?: string } })?.data?.id;
    if (!conversationId) throw new Error('conversation create returned no id');

    // Reading it triggers the lazy project bind, which is what publishes the scope.
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

/** Read the persisted state for a scope — the source of truth for "tabs survived". */
async function readPersistedScope(
  page: import('@playwright/test').Page,
  scope: string
): Promise<{ isOpen: boolean | null; tabCount: number; titles: string[] }> {
  return page.evaluate((s) => {
    const raw = localStorage.getItem(`preview-ui:${s}`);
    if (!raw) return { isOpen: null, tabCount: 0, titles: [] };
    const parsed = JSON.parse(raw) as { isOpen?: boolean; tabs?: Array<{ title?: string }> };
    return {
      isOpen: parsed.isOpen ?? null,
      tabCount: parsed.tabs?.length ?? 0,
      titles: (parsed.tabs ?? []).map((t) => t.title ?? ''),
    };
  }, scope);
}

test.describe('Preview — tab identity and persistence', () => {
  let workspace: string;
  let ids: ProjectIds | null = null;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-identity-'));
    /**
     * A `.txt` rather than a `.md`: markdown defaults to the rendered preview
     * (`MarkdownViewer.tsx:239`), so reaching its editor needs an extra
     * source/preview toggle. Code-typed files open straight into the editor,
     * keeping this test about persistence rather than about view modes.
     */
    fs.writeFileSync(path.join(workspace, 'notes.txt'), 'original body\n');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test.afterEach(async ({ page }) => {
    if (ids) {
      await deleteConversation(page, ids.conversationId);
      ids = null;
    }
  });

  /**
   * NOT COVERED — "one tab per file across two entry points" cannot be observed
   * through the entry points available to a test, and is recorded here rather
   * than asserted badly.
   *
   * The plan was: open a file from the Explorer (a `project` ref) and again from a
   * `file://` link in rendered markdown (a `local` ref), then assert a single tab.
   * Measuring that requires both opens to *add* tabs, so that a merge is what
   * reduces two to one.
   *
   * They do not. `useLocalFilePreview` opens with `{ replace: true }`
   * (`useLocalFilePreview.ts:62` and `:80`), so the link replaces the current tab
   * instead of adding one. The count is then 1 no matter what identity the refs
   * carry — verified by a diagnostic that found only `host.md` persisted after the
   * link click, with `target.md` never present as a second tab. An assertion built
   * on it would report success for a reason unrelated to identity, and would keep
   * reporting success if identity convergence regressed.
   *
   * Also worth stating plainly: the front end does not yet call the resolver. A
   * grep for `resolve-ref` under `packages/` returns nothing, so the Explorer's
   * `project\0<pe>\0<rel>` key and a link's `local\0<abs>` key cannot compare
   * equal (`chatFileRefKey`, `chatFile.ts:57-58`) and L1 matching declines to
   * merge them — correctly, on the code as shipped.
   *
   * What would make this testable: an entry point that *adds* a tab while
   * producing a non-project ref. Every current one either short-circuits to a
   * project ref (Explorer) or replaces (links). Reaching one likely means a real
   * chat message carrying a file link, which needs a live agent — the dependency
   * this suite has otherwise avoided. Left to the person wiring the upgrade to
   * decide, with the unit-level identity tests covering key equality meanwhile.
   *
   * When to revisit: when `resolve-ref` gains a caller under `packages/`. At that
   * point the two keys can compare equal, and this gap becomes worth closing —
   * either by finding an adding, non-project-ref entry point, or by asserting the
   * convergence one layer down (that both entry points end up with the same
   * `chatFileRefKey`) instead of counting rendered tabs.
   *
   * Deliberately not left as `test.fail()`: that marker asserts only "this must
   * fail", so any failure satisfies it — a wrong selector, an unopened panel, a
   * timeout. Combined with a `toBe(1)` that is already 1 for an unrelated reason,
   * it would have passed for being broken. An honest gap beats a marker that
   * cannot tell the difference between the bug and the harness.
   */

  test('unsaved edits come back unsaved after leaving and returning to the scope', async ({ page }) => {
    /**
     * The tab must return dirty, holding the edited body. Persistence previously
     * stamped `isDirty:false` and overwrote `originalContent`, so the tab came
     * back looking saved — and the next save compared against the wrong baseline.
     */
    test.setTimeout(120_000);
    await goToGuid(page);
    ids = await createProjectConversation(page, workspace);

    await page.getByText('notes.txt', { exact: true }).first().click();
    const panel = page.locator(PREVIEW_PANEL);
    await expect(panel).toBeVisible({ timeout: 20_000 });

    // Type into the editor without saving.
    const editor = panel.locator('.cm-content').first();
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await editor.click();
    await page.keyboard.type('UNSAVED-EDIT-MARKER');

    /**
     * Confirm the keystrokes landed before relying on them. CodeMirror only takes
     * input once its content element holds focus, and a click that misses leaves
     * the document untouched — which would surface later as "persistence dropped
     * the edit" rather than "the test never typed anything".
     */
    await expect
      .poll(async () => (await editor.innerText().catch(() => '')).includes('UNSAVED-EDIT-MARKER'), {
        timeout: 10_000,
        message: 'the editor never received the typed text',
      })
      .toBe(true);

    // The dirty dot is the user-visible claim that edits are pending.
    await expect(panel.getByTitle(DIRTY_MARK).first()).toBeVisible({ timeout: 10_000 });

    /**
     * Wait for the edit to reach storage before leaving. The persist effect is
     * debounced by ~150ms (`PreviewContext.tsx:445-447`); navigating away sooner
     * would test the debounce window rather than the restore path, and the failure
     * would read as "persistence dropped the edit".
     */
    await expect
      .poll(
        async () => {
          const t = await page.evaluate((scope) => {
            const raw = localStorage.getItem(`preview-ui:${scope}`);
            if (!raw) return '';
            const parsed = JSON.parse(raw) as { tabs?: Array<{ title?: string; content?: string }> };
            return parsed.tabs?.find((x) => x.title === 'notes.txt')?.content ?? '';
          }, ids!.projectId);
          return t.includes('UNSAVED-EDIT-MARKER');
        },
        { timeout: 15_000, message: 'the edit never reached storage while the tab was open' }
      )
      .toBe(true);

    // Leave the scope and come back.
    await goToGuid(page);
    await page.evaluate((id) => window.location.assign(`#/conversation/${id}`), ids.conversationId);
    await page.waitForFunction((id) => window.location.hash === `#/conversation/${id}`, ids.conversationId, {
      timeout: 15_000,
    });
    await expect(page.locator('.workspace-tree').first()).toBeVisible({ timeout: 30_000 });

    /**
     * Assert what was stored, not what is on screen. Leaving the route collapses
     * the panel — that is the intended "closed but holding tabs" state — so
     * waiting for the region to be visible here would fail on correct behaviour.
     * What this test is about is whether the edit came back *as an edit*.
     */
    await expect
      .poll(async () => (await readPersistedScope(page, ids!.projectId)).tabCount, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const restored = await readPersistedScope(page, ids.projectId);
    expect(restored.titles, `restored scope lost the tab: ${JSON.stringify(restored)}`).toContain('notes.txt');

    /**
     * The tab must still be dirty and still hold the edited body. Persistence
     * used to stamp `isDirty:false` and copy `content` over `originalContent`, so
     * the tab returned looking saved while holding unwritten edits — and the next
     * save then compared against the wrong baseline.
     */
    const tab = await page.evaluate((scope) => {
      const raw = localStorage.getItem(`preview-ui:${scope}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        tabs?: Array<{ title?: string; content?: string; originalContent?: string; isDirty?: boolean }>;
      };
      return parsed.tabs?.find((t) => t.title === 'notes.txt') ?? null;
    }, ids.projectId);

    expect(tab, 'persisted scope has no notes.txt tab').not.toBeNull();
    expect(tab!.content, 'the edit itself was not persisted').toContain('UNSAVED-EDIT-MARKER');
    expect(tab!.isDirty, `tab came back looking saved: ${JSON.stringify(tab)}`).toBe(true);
    // The baseline must stay the on-disk body, or the next save diffs against the edit.
    expect(tab!.originalContent, 'originalContent was overwritten with the edit').not.toContain('UNSAVED-EDIT-MARKER');
  });

  test('collapsing the panel keeps the tabs in storage', async ({ page }) => {
    /**
     * Asserts the *stored* tabs, deliberately not panel visibility: collapsing is
     * supposed to hide the panel, so a visibility assertion would fail on the
     * intended behaviour. The bug was that the tabs were dropped along with the
     * view — `closePreview` cleared them and the debounced writer persisted the
     * empty result over the scope.
     */
    test.setTimeout(120_000);
    await goToGuid(page);
    ids = await createProjectConversation(page, workspace);

    await page.getByText('notes.txt', { exact: true }).first().click();
    await expect(page.locator(PREVIEW_PANEL)).toBeVisible({ timeout: 20_000 });

    // Wait for the tab to reach storage before collapsing; the writer is debounced.
    await expect
      .poll(async () => (await readPersistedScope(page, ids!.projectId)).tabCount, { timeout: 15_000 })
      .toBeGreaterThan(0);

    // Leaving the conversation route is one of the paths that used to wipe the
    // scope, and it is reachable without depending on sidebar markup.
    await goToGuid(page);

    /**
     * Give the debounced writer time to run *and* to be wrong: if it still
     * persisted an empty state, the count would drop to 0 within this window.
     */
    await page.waitForTimeout(1_500);
    const stored = await readPersistedScope(page, ids.projectId);
    expect(stored.tabCount, `collapsing the panel dropped the scope's tabs: ${JSON.stringify(stored)}`).toBeGreaterThan(
      0
    );
    expect(stored.titles).toContain('notes.txt');
  });
});
