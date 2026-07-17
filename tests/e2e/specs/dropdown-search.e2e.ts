/**
 * Dropdown search — E2E coverage for the search boxes added to selection dropdowns.
 *
 * Covers:
 * - Guid "+" menu: skills submenu gains a search box above the list when the
 *   skill count exceeds the threshold (5), and typing filters the checkboxes.
 * - Guid "+" menu: MCP submenu gets the same treatment.
 * - Assistant editor: default model / skills / MCP selects become searchable
 *   when their option count exceeds the threshold.
 *
 * The sandboxed E2E environment controls neither the number of skills nor MCP
 * servers, so each test branches on the actual count: above the threshold it
 * asserts search + filtering; at or below it asserts the search box is absent.
 */
import { test, expect, type Page } from '../fixtures';
import { closeAssistantEditor, fillAssistantName, goToGuid } from '../helpers';

const SEARCH_THRESHOLD = 5;

async function openGuidPlusDropdown(page: Page): Promise<void> {
  await page.locator('[data-testid="file-upload-btn"]').waitFor({ state: 'visible', timeout: 15_000 });
  const dropdownMenu = page.locator('.arco-dropdown-menu').last();

  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="file-upload-btn"]');
    const trigger = button?.parentElement;
    if (!trigger) {
      throw new Error('Guid plus dropdown trigger not found');
    }
    ['mouseenter', 'mouseover', 'mousemove'].forEach((type) => {
      trigger.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  });
  try {
    await dropdownMenu.waitFor({ state: 'visible', timeout: 1_500 });
  } catch {
    await page.evaluate(() => {
      const button = document.querySelector('[data-testid="file-upload-btn"]');
      const trigger = button?.parentElement;
      if (!trigger) {
        throw new Error('Guid plus dropdown trigger not found');
      }
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
    await dropdownMenu.waitFor({ state: 'visible', timeout: 5_000 });
  }
}

/** Hover a "+"-menu submenu title like `技能 (5/41)` / `Skills (5/41)` and return its total count. */
async function hoverSubmenuAndGetTotal(page: Page, titlePattern: RegExp): Promise<number | null> {
  const title = page.getByText(titlePattern).first();
  if (!(await title.isVisible().catch(() => false))) return null;
  const text = (await title.textContent()) ?? '';
  const match = text.match(/\((\d+)\/(\d+)\)/);
  await title.hover();
  return match ? Number(match[2]) : null;
}

test.describe('Guid plus-menu submenu search', () => {
  test.setTimeout(60_000);

  test('skills submenu search follows the threshold and filters items', async ({ page }) => {
    await goToGuid(page);
    await openGuidPlusDropdown(page);

    const total = await hoverSubmenuAndGetTotal(page, /Skills \(\d+\/\d+\)|技能 \(\d+\/\d+\)/);
    test.skip(total === null, 'No skills submenu in this environment');

    const search = page.locator('[data-testid="guid-skill-search"]');
    const checkboxes = page.locator('.arco-dropdown-menu:visible .arco-checkbox');
    await checkboxes
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {});

    if (total! > SEARCH_THRESHOLD) {
      await expect(search).toBeVisible();

      const firstName = ((await checkboxes.first().textContent()) ?? '').trim();
      expect(firstName).toBeTruthy();

      await search.fill(firstName);
      await expect(checkboxes.first()).toContainText(firstName);
      const visibleAfter = await checkboxes.count();
      expect(visibleAfter).toBeLessThanOrEqual(total!);

      // Nonsense query shows the empty state instead of stale items.
      await search.fill('zz-no-such-skill-zz');
      await expect(checkboxes).toHaveCount(0);
      await expect(page.getByText(/No matching skills|没有匹配的技能/).first()).toBeVisible();
    } else {
      await expect(search).toHaveCount(0);
    }
  });

  test('mcp submenu search follows the threshold and filters items', async ({ page }) => {
    await goToGuid(page);
    await openGuidPlusDropdown(page);

    const total = await hoverSubmenuAndGetTotal(page, /MCP \(\d+\/\d+\)/);
    test.skip(total === null, 'No MCP submenu in this environment');

    const search = page.locator('[data-testid="guid-mcp-search"]');
    const checkboxes = page.locator('.arco-dropdown-menu:visible .arco-checkbox');
    await checkboxes
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {});

    if (total! > SEARCH_THRESHOLD) {
      await expect(search).toBeVisible();

      await search.fill('zz-no-such-server-zz');
      await expect(checkboxes).toHaveCount(0);
      await expect(page.getByText(/No servers found|未找到符合条件的服务器/).first()).toBeVisible();
    } else {
      await expect(search).toHaveCount(0);
    }
  });
});

test.describe('Assistant editor default selects search', () => {
  test.setTimeout(90_000);

  test('default model / skills / mcp selects expose search above the threshold', async ({ page }) => {
    // Assistants moved from settings to a standalone `#/assistants` page; the
    // legacy goToAssistantSettings helper still walks the settings sider and
    // fails, so navigate directly. Create is now a TalkToButler dropdown —
    // open it and pick "create manually" to reach the editor.
    await page.evaluate(() => window.location.assign('#/assistants'));
    const createButton = page.locator('[data-testid="btn-create-assistant"]');
    await createButton.waitFor({ state: 'visible', timeout: 15_000 });
    await createButton.click();
    await page.locator('[data-testid="btn-create-assistant-manual"]').click();
    await page.locator('[data-testid="input-assistant-name"]').waitFor({ state: 'visible', timeout: 10_000 });
    await fillAssistantName(page, `Dropdown Search ${Date.now()}`);

    for (const testId of [
      'select-assistant-default-model',
      'select-assistant-default-skills',
      'select-assistant-default-mcp',
    ]) {
      const select = page.locator(`[data-testid="${testId}"]`);
      if (!(await select.isVisible().catch(() => false))) continue;

      await select.click();
      const options = page.locator('.arco-select-option:visible');
      await options
        .first()
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {});
      const optionCount = await options.count();

      // Arco showSearch keeps the trigger's inner input editable when open.
      const searchInput = select.locator('input');
      const isSearchable = await searchInput
        .evaluate((node) => !(node as HTMLInputElement).readOnly)
        .catch(() => false);

      if (optionCount > SEARCH_THRESHOLD + 1) {
        // +1: the hidden/auto option is part of the popup but not of the threshold count.
        expect(isSearchable, `${testId} should be searchable with ${optionCount} options`).toBe(true);
      }
      // Below the threshold we don't assert false: optionCount includes the auto
      // option and (for skills) possibly hidden entries, so it over-counts.

      await page.keyboard.press('Escape');
    }

    await closeAssistantEditor(page);
  });
});
