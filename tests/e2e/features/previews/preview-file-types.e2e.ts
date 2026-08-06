/**
 * E2E — file-type routing: unsupported formats and csv.
 *
 * Covers the two user-visible outcomes of routing types to renderers that can
 * actually open them:
 *
 *   1. **The escape hatch.** A format the panel cannot render must still leave the
 *      user a way to reach their own file. "Open in system app" is that way, and
 *      it is offered for two independent reasons whose order matters: the escape
 *      hatch is unconditional, the by-type convenience is not. A unit test can
 *      check that ordering in `shouldOfferOpenInSystem`; only this can show it
 *      survives the real toolbar, which renders that button from two separate
 *      blocks depending on whether the viewer injected extras.
 *
 *   2. **csv renders.** `.csv` used to be typed as `excel` and handed to
 *      officecli, which rejects CSV outright — so every csv failed in the
 *      renderer despite being plain text. The assertion here is that the content
 *      appears, not merely that nothing errored: "no error" and "rendered" are
 *      different claims, and only the second is the fix.
 *
 * Drives the real UI through the Explorer, the same entry point as
 * `preview-oversized-gate.e2e.ts`. Explorer-opened tabs carry no `file_path`,
 * which is exactly the case where the escape-hatch button used to disappear, so
 * this is the entry point worth testing.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../../fixtures';
import { goToGuid } from '../../helpers';

/**
 * The hoisted preview region. Verified present in the source
 * (`Layout.tsx:550`) rather than guessed: a selector that does not exist yields
 * a falsy result that reads exactly like a broken feature.
 */
const PREVIEW_PANEL = '[data-project-preview-region]';

/** `preview.unsupported.title`, both shipped locales. */
const UNSUPPORTED_TITLE = /Preview not supported for this format|暂不支持预览此格式/;

/** `preview.openInSystemApp`, both shipped locales. */
const OPEN_IN_SYSTEM = /Open in system app|使用系统默认应用打开/;

type BackendWindow = Window & { __backendPort?: number };

/**
 * One representative per unsupported branch, because they are not equivalent:
 *
 *   - `.heic` is an image the renderer cannot decode.
 *   - `.doc` is legacy Office.
 *   - `.odt` is ODF.
 *   - `.docm` is macro-enabled Office — the interesting one, since officecli's
 *     factory claims to support it while its watch path refuses it. A type that
 *     looks supported one layer down is the most likely to slip back into a
 *     renderer that cannot open it.
 *
 * Covering one per branch rather than all ten keeps the run short while still
 * exercising each path; the full ten-extension mapping is asserted at the unit
 * layer (`tests/unit/previews/fileTypeMatrix.test.ts`).
 */
const UNSUPPORTED_SAMPLES = [
  { file: 'legacy.doc', label: 'DOC', why: 'legacy Office' },
  { file: 'opendoc.odt', label: 'ODT', why: 'ODF' },
  { file: 'macro.docm', label: 'DOCM', why: 'macro-enabled: officecli factory accepts, watch rejects' },
  { file: 'photo.heic', label: 'HEIC', why: 'image the renderer cannot decode' },
] as const;

/**
 * Bind a workspace as a project and route to its conversation.
 *
 * `type: 'acp'` with no assistant: the Explorer host only needs a published
 * `currentProject`, which the backend derives from `extra.workspace` on read. This
 * keeps the test independent of whether a usable assistant is configured, so a
 * missing agent cannot turn these into silent skips.
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
        name: `E2E file types ${ws}`,
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

  // The Explorer tree mounting is the signal that `currentProject` was published.
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

test.describe('Preview — file type routing', () => {
  let workspace: string;
  let conversationId: string | null = null;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-filetypes-'));
    // Contents are irrelevant: routing is by extension, and these formats are
    // never parsed. Small stubs keep the tree fast to load.
    for (const { file } of UNSUPPORTED_SAMPLES) {
      fs.writeFileSync(path.join(workspace, file), 'stub');
    }
    fs.writeFileSync(path.join(workspace, 'table.csv'), 'name,qty\nwidget,4\ngadget,7\n');
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

  for (const sample of UNSUPPORTED_SAMPLES) {
    test(`${sample.file} is declined with an escape hatch (${sample.why})`, async ({ page }) => {
      test.setTimeout(120_000);
      await goToGuid(page);
      conversationId = await createProjectConversation(page, workspace);

      await page.getByText(sample.file, { exact: true }).first().click();

      const panel = page.locator(PREVIEW_PANEL);
      await expect(panel).toBeVisible({ timeout: 20_000 });

      // Told why, in terms of the format rather than a generic failure.
      await expect(page.getByText(UNSUPPORTED_TITLE).first()).toBeVisible({ timeout: 10_000 });
      await expect(panel).toContainText(sample.label);

      /**
       * The point of the whole test: the way out is present. An Explorer-opened
       * tab carries no `file_path`, so this button exists only because the
       * escape-hatch reason is checked before any type filtering.
       */
      await expect(panel.getByTitle(OPEN_IN_SYSTEM).first()).toBeVisible({ timeout: 10_000 });
    });
  }

  test('csv renders its contents as text', async ({ page }) => {
    /**
     * Asserts the cells are on screen. Checking only that no error appeared would
     * pass for a blank panel, which is the state this change exists to end.
     */
    test.setTimeout(120_000);
    await goToGuid(page);
    conversationId = await createProjectConversation(page, workspace);

    await page.getByText('table.csv', { exact: true }).first().click();

    const panel = page.locator(PREVIEW_PANEL);
    await expect(panel).toBeVisible({ timeout: 20_000 });

    // Content, not absence of an error.
    await expect(panel).toContainText('widget', { timeout: 20_000 });
    await expect(panel).toContainText('gadget');

    // And it must not have landed in the declined branch on the way.
    await expect(page.getByText(UNSUPPORTED_TITLE)).toHaveCount(0);
  });
});
