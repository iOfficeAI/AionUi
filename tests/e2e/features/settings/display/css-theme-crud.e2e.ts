import { test, expect } from '../../../fixtures';
import { goToSettings } from '../../../helpers/navigation';
import { takeScreenshot } from '../../../helpers/screenshots';

const CUSTOM_THEME_NAME = `E2E Custom Theme ${Date.now()}`;
const EDITED_THEME_NAME = `E2E Edited Theme ${Date.now()}`;
const CUSTOM_CSS = ':root { --bg-1: #1a1a2e; }';

async function navigateToCssThemes(page: import('@playwright/test').Page) {
  await goToSettings(page, 'display');
  await page.locator('.grid > div.cursor-pointer').first().waitFor({ state: 'visible', timeout: 15_000 });
}

function themeCard(page: import('@playwright/test').Page, name: string) {
  return page.locator('.grid > div.cursor-pointer').filter({ hasText: name });
}

async function createCustomTheme(page: import('@playwright/test').Page) {
  const addBtn = page
    .locator('.arco-btn-outline')
    .filter({ hasText: /Add|手动添加/i })
    .first();
  if (!(await addBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(true, 'CSS theme add button not found');
    return;
  }
  await addBtn.scrollIntoViewIfNeeded();
  await addBtn.click();
  const modal = page.locator('.arco-modal:visible');
  await modal.waitFor({ state: 'visible', timeout: 5_000 });
  await modal.locator('.arco-input').first().fill(CUSTOM_THEME_NAME);
  await modal.locator('.cm-editor .cm-content').click();
  await page.keyboard.type(CUSTOM_CSS);
  await modal.locator('.arco-btn-primary').click();
  await modal.waitFor({ state: 'hidden', timeout: 5_000 });
  await page.locator('.arco-message-success').first().waitFor({ state: 'visible', timeout: 5_000 });
}

async function deleteCustomThemeViaModal(page: import('@playwright/test').Page, name: string) {
  const card = themeCard(page, name);
  if ((await card.count()) === 0) return;
  await card.hover();
  const editIcon = card.locator('[class*="bg-white"]').last();
  await editIcon.waitFor({ state: 'visible', timeout: 3_000 });
  await editIcon.click();
  const modal = page.locator('.arco-modal').filter({ hasText: /CSS/i });
  await modal.waitFor({ state: 'visible', timeout: 5_000 });
  const deleteBtn = modal.locator('.arco-btn-text').filter({ hasText: /Delete|删除/i });
  if ((await deleteBtn.count()) > 0) {
    await deleteBtn.click();
    await page.locator('.arco-modal').last().locator('.arco-btn-status-danger').click();
    await modal.waitFor({ state: 'hidden', timeout: 5_000 });
  } else {
    await modal
      .locator('.arco-btn')
      .filter({ hasText: /Cancel|取消/i })
      .click();
  }
}

test.describe('CSS Theme CRUD', () => {
  test.setTimeout(90_000);

  test.afterEach(async ({ page }) => {
    try {
      await navigateToCssThemes(page);
      await deleteCustomThemeViaModal(page, CUSTOM_THEME_NAME);
      await deleteCustomThemeViaModal(page, EDITED_THEME_NAME);
    } catch {
      /* best-effort cleanup */
    }
  });

  test('select a preset CSS theme and verify active indicator', async ({ page }) => {
    await navigateToCssThemes(page);
    const cards = page.locator('.grid > div.cursor-pointer');
    await cards.first().waitFor({ state: 'visible', timeout: 10_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(2);
    await takeScreenshot(page, 'css-theme-crud/01-initial.png');

    let targetIndex = 1;
    const cardCount = await cards.count();
    for (let i = 0; i < cardCount; i++) {
      const cls = await cards.nth(i).getAttribute('class');
      if (cls?.includes('border-[var(--color-primary)]')) {
        targetIndex = i === 0 ? 1 : 0;
        break;
      }
    }

    const targetCard = cards.nth(targetIndex);
    await targetCard.click();
    await page.locator('.arco-message-success').first().waitFor({ state: 'visible', timeout: 5_000 });

    const cls = await targetCard.getAttribute('class');
    expect(cls).toContain('border-[var(--color-primary)]');
    await expect(targetCard.locator('svg').first()).toBeVisible();
    await takeScreenshot(page, 'css-theme-crud/02-preset-selected.png');

    await cards.first().click();
    await page
      .locator('.arco-message-success')
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {});
  });

  test('create a custom CSS theme via modal', async ({ page }) => {
    await navigateToCssThemes(page);
    const addBtn = page
      .locator('.arco-btn-outline')
      .filter({ hasText: /Add|手动添加/i })
      .first();
    await addBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await addBtn.scrollIntoViewIfNeeded();
    await addBtn.click();

    const modal = page.locator('.arco-modal:visible');
    await modal.waitFor({ state: 'visible', timeout: 5_000 });
    await takeScreenshot(page, 'css-theme-crud/03-add-modal-opened.png');

    await modal.locator('.arco-input').first().fill(CUSTOM_THEME_NAME);
    await modal.locator('.cm-editor .cm-content').click();
    await page.keyboard.type(CUSTOM_CSS);
    await modal.locator('.arco-btn-primary').click();
    await modal.waitFor({ state: 'hidden', timeout: 5_000 });

    await page.locator('.arco-message-success').first().waitFor({ state: 'visible', timeout: 5_000 });
    const newCard = themeCard(page, CUSTOM_THEME_NAME);
    await expect(newCard).toBeVisible({ timeout: 5_000 });
    await takeScreenshot(page, 'css-theme-crud/04-theme-created.png');
  });

  test('delete a custom CSS theme', async ({ page }) => {
    await navigateToCssThemes(page);
    await createCustomTheme(page);

    const newCard = themeCard(page, CUSTOM_THEME_NAME);
    await expect(newCard).toBeVisible({ timeout: 5_000 });
    await takeScreenshot(page, 'css-theme-crud/05-before-delete.png');

    await newCard.hover();
    const editIcon = newCard.locator('[class*="bg-white"]').last();
    await editIcon.waitFor({ state: 'visible', timeout: 5_000 });
    await editIcon.click();

    const editModal = page.locator('.arco-modal:visible');
    await editModal.waitFor({ state: 'visible', timeout: 5_000 });

    const deleteBtn = editModal.locator('.arco-btn-text').filter({ hasText: /Delete|删除/i });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const confirmModal = page.locator('.arco-modal').last();
    await confirmModal.waitFor({ state: 'visible', timeout: 3_000 });
    await confirmModal.locator('.arco-btn-status-danger').click();

    await page.locator('.arco-message-success').first().waitFor({ state: 'visible', timeout: 5_000 });
    await expect(newCard).toBeHidden({ timeout: 5_000 });
    await takeScreenshot(page, 'css-theme-crud/06-theme-deleted.png');
  });

  test('edit a custom CSS theme name via modal', async ({ page }) => {
    await navigateToCssThemes(page);
    await createCustomTheme(page);

    const card = themeCard(page, CUSTOM_THEME_NAME);
    await expect(card).toBeVisible({ timeout: 5_000 });

    await card.hover();
    await page.waitForFunction(
      (name: string) => {
        const el = [...document.querySelectorAll('.grid > div.cursor-pointer')].find((d) =>
          d.textContent?.includes(name)
        );
        return el?.querySelector('[class*="bg-white"]') !== null;
      },
      CUSTOM_THEME_NAME,
      { timeout: 5_000 }
    );
    await card.locator('[class*="bg-white"]').last().click();

    const modal = page.locator('.arco-modal:visible');
    await modal.waitFor({ state: 'visible', timeout: 5_000 });
    await takeScreenshot(page, 'css-theme-crud/07-edit-modal-opened.png');

    const nameInput = modal.locator('.arco-input').first();
    await nameInput.clear();
    await nameInput.fill(EDITED_THEME_NAME);
    await modal.locator('.arco-btn-primary').click();
    await modal.waitFor({ state: 'hidden', timeout: 5_000 });

    await page.locator('.arco-message-success').first().waitFor({ state: 'visible', timeout: 5_000 });
    await expect(themeCard(page, EDITED_THEME_NAME)).toBeVisible({ timeout: 5_000 });
    await expect(themeCard(page, CUSTOM_THEME_NAME)).toBeHidden({ timeout: 3_000 });
    await takeScreenshot(page, 'css-theme-crud/08-theme-renamed.png');
  });
});
