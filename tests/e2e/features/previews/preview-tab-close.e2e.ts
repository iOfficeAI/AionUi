/**
 * Middle-click closing, and the confirmation it must not skip.
 *
 * Middle-click is a second way to close a tab, so the risk it carries is not "does it
 * close" but "does it close something the user had not saved". The dirty case is
 * therefore the reason this file exists; the plain case is here to prove the gesture
 * is wired at all, so a failure in the dirty case cannot be explained away as
 * "middle-click just does nothing".
 *
 * Both assertions were mutation-checked: short-circuiting the `isDirty` branch in
 * `handleCloseTab` flips the dirty test from "tab survived" to "tab vanished".
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { expect, test } from '../../fixtures';
import { goToGuid } from '../../helpers';

/** Verified present at Layout.tsx:550 rather than guessed. */
const PREVIEW_PANEL = '[data-project-preview-region]';

/**
 * The clickable tab, not the label inside it.
 *
 * `[title="x"]` matches the inner `<span>` that holds the tab text (PreviewTabs.tsx:209),
 * and a middle-click there does not reach the tab's own `onAuxClick`. Walking up to the
 * nearest `cursor-pointer` ancestor lands on the element that actually carries the
 * handler — a locator aimed at the label passes the "tab closed" assertion for the
 * wrong reason and silently skips the dirty guard.
 */
function tabByTitle(page: import('@playwright/test').Page, title: string) {
  return page
    .locator(`${PREVIEW_PANEL} [title="${title}"]`)
    .first()
    .locator('xpath=ancestor::div[contains(@class,"cursor-pointer")][1]');
}

async function openConversationWithWorkspace(page: import('@playwright/test').Page, workspace: string): Promise<void> {
  await goToGuid(page);
  const id = await page.evaluate(async (ws) => {
    const port = (window as { __backendPort?: number }).__backendPort;
    const created = await fetch(`http://127.0.0.1:${port}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'acp', name: 'tab-close', extra: { workspace: ws, custom_workspace: true } }),
    });
    const conversationId = (await created.json())?.data?.id;
    // Reading the conversation back is what binds the project lazily, which is what
    // makes the explorer tree appear without an agent having to be installed.
    await fetch(`http://127.0.0.1:${port}/api/conversations/${conversationId}`);
    return conversationId as string;
  }, workspace);

  await page.evaluate((i) => window.location.assign(`#/conversation/${i}`), id);
  await page.waitForFunction((i) => window.location.hash === `#/conversation/${i}`, id, { timeout: 15_000 });
  await expect(page.locator('.workspace-tree').first()).toBeVisible({ timeout: 30_000 });
}

test.describe('Preview — closing a tab with the middle mouse button', () => {
  let workspace: string;

  test.beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-tab-close-'));
  });

  test.afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('middle-clicking a clean tab closes that tab and leaves the others', async ({ page }) => {
    test.setTimeout(120_000);
    fs.writeFileSync(path.join(workspace, 'first.md'), '# first\n');
    fs.writeFileSync(path.join(workspace, 'second.md'), '# second\n');
    await openConversationWithWorkspace(page, workspace);

    await page.getByText('first.md', { exact: true }).first().click();
    await page.waitForTimeout(700);
    await page.getByText('second.md', { exact: true }).first().click();

    const first = tabByTitle(page, 'first.md');
    const second = tabByTitle(page, 'second.md');
    await expect(first).toBeVisible({ timeout: 20_000 });
    await expect(second).toBeVisible({ timeout: 20_000 });

    await first.click({ button: 'middle' });

    // The tab that was middle-clicked goes; the other one must not be collateral.
    await expect(first).toHaveCount(0, { timeout: 10_000 });
    await expect(second).toHaveCount(1);
  });

  test('middle-clicking a tab with unsaved edits asks first and keeps the tab open', async ({ page }) => {
    test.setTimeout(120_000);
    // A .txt file opens straight into the editor; a .md file renders instead, so there
    // would be nothing to type into.
    fs.writeFileSync(path.join(workspace, 'editable.txt'), 'saved contents\n');
    await openConversationWithWorkspace(page, workspace);

    await page.getByText('editable.txt', { exact: true }).first().click();

    const tab = tabByTitle(page, 'editable.txt');
    await expect(tab).toBeVisible({ timeout: 20_000 });

    const editor = page.locator(`${PREVIEW_PANEL} .cm-content`).first();
    await editor.click();
    await page.keyboard.type('UNSAVED-MIDDLE-CLICK');
    // Confirm the keystrokes landed before asserting on what closing them does —
    // otherwise a tab that was never dirty would "pass" this test.
    await expect
      .poll(async () => (await editor.innerText().catch(() => '')).includes('UNSAVED-MIDDLE-CLICK'), {
        timeout: 10_000,
        message: 'the editor never received the typed text, so the tab was never dirty',
      })
      .toBe(true);

    await tab.click({ button: 'middle' });

    // The confirmation must appear and the tab must still be there. Asserting only on
    // the dialog would pass even if the tab had already been closed behind it.
    //
    // Matched on the "save and close" button rather than on the word "unsaved": the
    // dialog's title is just "Close Tab" / 「关闭标签页」, while "unsaved" appears on the
    // dirty-marker tooltip — so a looser pattern would have gone green off the marker
    // even with the dialog missing. Both strings checked against zh-CN and en-US.
    await expect(page.getByText(/Save and Close|保存并关闭/).first()).toBeVisible({ timeout: 10_000 });
    await expect(tab).toHaveCount(1);
  });
});
