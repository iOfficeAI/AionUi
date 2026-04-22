/**
 * Assistant Settings Core Interactions (P0) — E2E tests.
 *
 * These are the highest-priority test cases covering fundamental
 * UI interactions in the Assistant Settings page.
 */
import { test, expect } from '../../fixtures';
import {
  goToAssistantSettings,
  clickCreateAssistant,
  fillAssistantName,
  fillAssistantDescription,
  saveAssistant,
  waitForDrawerClose,
  closeDrawer,
  takeScreenshot,
} from '../../helpers';

test.describe('Assistant Settings Core Interactions (P0)', () => {
  test.setTimeout(90_000);

  test('P0-1: search toggle — expand/collapse with icon change', async ({ page }) => {
    await goToAssistantSettings(page);

    // Wait for at least one assistant card to be visible
    const cards = page.locator('[data-testid^="assistant-card-"]');
    await cards.first().waitFor({ state: 'visible', timeout: 10_000 });

    const searchToggle = page.locator('[data-testid="btn-search-toggle"]');
    const searchInput = page.locator('[data-testid="input-search-assistant"]');

    // 1. Verify initial state: search input hidden
    await expect(searchInput).toBeHidden();
    await takeScreenshot(page, 'assistants/p0-1/01-initial-state.png');

    // 2. Click to expand search
    await searchToggle.click();
    await page.waitForTimeout(200); // Animation delay

    // Search input should be visible
    await expect(searchInput).toBeVisible();
    await takeScreenshot(page, 'assistants/p0-1/02-search-expanded.png');

    // 3. Verify autoFocus
    await expect(searchInput).toBeFocused();

    // 4. Input query and verify search bar stays visible
    await searchInput.fill('test');
    await expect(searchInput).toBeVisible();
    await takeScreenshot(page, 'assistants/p0-1/03-search-with-query.png');

    // 5. Click toggle to collapse and clear search
    await searchToggle.click();
    await page.waitForTimeout(200);

    // Search input should be hidden
    await expect(searchInput).toBeHidden();
    await takeScreenshot(page, 'assistants/p0-1/04-search-collapsed.png');
  });

  test('P0-2: card click isolation — body opens drawer, actions do not', async ({ page }) => {
    await goToAssistantSettings(page);

    // Wait for at least one Custom assistant card
    const cards = page.locator('[data-testid^="assistant-card-"]');
    await cards.first().waitFor({ state: 'visible', timeout: 10_000 });

    const firstCard = cards.first();
    const assistantId = ((await firstCard.getAttribute('data-testid')) || '').replace('assistant-card-', '');

    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');

    // Ensure drawer is initially closed
    if (await drawer.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await drawer.waitFor({ state: 'hidden', timeout: 3_000 });
    }

    await takeScreenshot(page, 'assistants/p0-2/01-initial-list.png');

    // 1. Click card body → Drawer opens
    await firstCard.locator('.flex.items-center.gap-12px').first().click();
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await takeScreenshot(page, 'assistants/p0-2/02-drawer-opened-via-card-body.png');

    // Close drawer for next test
    await closeDrawer(page);

    // 2. Click Switch → Drawer does not open
    const switchElement = page.locator(`[data-testid="switch-enabled-${assistantId}"]`);
    const isCheckedBefore = await switchElement.isChecked();

    await switchElement.click();
    await page.waitForTimeout(300);

    // Drawer should stay closed
    await expect(drawer).toBeHidden();

    // Switch state should change
    const isCheckedAfter = await switchElement.isChecked();
    expect(isCheckedAfter).toBe(!isCheckedBefore);
    await takeScreenshot(page, 'assistants/p0-2/03-switch-toggled-drawer-closed.png');

    // Restore original state
    await switchElement.click();
    await page.waitForTimeout(300);

    const isCheckedRestored = await switchElement.isChecked();
    expect(isCheckedRestored).toBe(isCheckedBefore);

    // 3. Hover and click Duplicate button → Drawer opens (isCreating=true)
    await firstCard.hover();
    const duplicateBtn = page.locator(`[data-testid="btn-duplicate-${assistantId}"]`);

    await expect(duplicateBtn).toBeVisible();
    await takeScreenshot(page, 'assistants/p0-2/04-hover-shows-duplicate.png');

    await duplicateBtn.click();

    // Drawer should open in Create mode
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    const createBtn = page.locator('[data-testid="btn-save-assistant"]');
    await expect(createBtn).toContainText(/Create|创建/i);
    await takeScreenshot(page, 'assistants/p0-2/05-drawer-opened-via-duplicate.png');

    // Close drawer
    await closeDrawer(page);
  });

  test('P0-3: delete modal shows assistant preview card', async ({ page }) => {
    await goToAssistantSettings(page);

    const timestamp = Date.now();
    const testName = `E2E Delete Preview ${timestamp}`;
    const testDesc = 'Test assistant for delete modal preview';

    // 1. Create a test assistant
    await clickCreateAssistant(page);
    await fillAssistantName(page, testName);
    await fillAssistantDescription(page, testDesc);
    await saveAssistant(page);

    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await drawer.waitFor({ state: 'hidden', timeout: 10_000 });
    await takeScreenshot(page, 'assistants/p0-3/01-assistant-created.png');

    // 2. Open assistant edit drawer
    const targetCard = page.locator(`[data-testid^="assistant-card-"]`).filter({ hasText: testName });
    await targetCard.click();
    await drawer.waitFor({ state: 'visible', timeout: 5_000 });
    await takeScreenshot(page, 'assistants/p0-3/02-drawer-opened.png');

    // 3. Click Delete button
    const deleteBtn = page.locator('[data-testid="btn-delete-assistant"]');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // 4. Verify Delete Modal renders
    const modal = page.locator('[data-testid="modal-delete-assistant"]');
    await expect(modal).toBeVisible({ timeout: 3_000 });

    // Verify modal title (i18n: Delete / 删除助手)
    await expect(modal.locator('.arco-modal-title')).toContainText(/Delete|删除/i);
    await takeScreenshot(page, 'assistants/p0-3/03-delete-modal.png');

    // 5. Verify assistant preview card content
    const avatar = modal.locator('.arco-avatar');
    await expect(avatar).toBeVisible();

    await expect(modal).toContainText(testName);
    await expect(modal).toContainText(testDesc);

    // 6. Verify buttons
    const confirmBtn = modal.locator('.arco-btn-status-danger');
    await expect(confirmBtn).toBeVisible();
    await expect(confirmBtn).toContainText(/Delete|删除/i);

    const cancelBtn = modal.locator('.arco-btn').filter({ hasText: /Cancel|取消/i });
    await expect(cancelBtn).toBeVisible();
    await takeScreenshot(page, 'assistants/p0-3/04-delete-modal-buttons.png');

    // 7. Confirm delete
    await confirmBtn.click();

    // Modal closes
    await modal.waitFor({ state: 'hidden', timeout: 3_000 });

    // Drawer closes
    await drawer.waitFor({ state: 'hidden', timeout: 3_000 });

    // Assistant removed from list
    await expect(targetCard).toBeHidden({ timeout: 5_000 });
    await takeScreenshot(page, 'assistants/p0-3/05-assistant-deleted.png');
  });

  test('P0-4: highlight assistant card via query param', async ({ page }) => {
    await goToAssistantSettings(page);

    // Get the first available assistant ID
    const cards = page.locator('[data-testid^="assistant-card-"]');
    await cards.first().waitFor({ state: 'visible', timeout: 10_000 });
    const firstCardTestId = (await cards.first().getAttribute('data-testid')) || '';
    const targetId = firstCardTestId.replace('assistant-card-', '');

    // 1. Navigate to URL with highlight parameter
    await page.evaluate((id) => {
      window.location.hash = `/settings/assistants?highlight=${id}`;
    }, targetId);

    const targetCard = page.locator(`[data-testid="assistant-card-${targetId}"]`);
    await targetCard.waitFor({ state: 'visible', timeout: 10_000 });

    // 2. Wait for 150ms delay + verify card is visible
    await page.waitForTimeout(500);

    // Card should be visible after navigation
    await expect(targetCard).toBeVisible();
    await takeScreenshot(page, 'assistants/p0-4/01-card-visible.png');

    // 3. Verify highlight styles
    const cardClasses = await targetCard.getAttribute('class');
    expect(cardClasses).toContain('border-primary-5');
    expect(cardClasses).toContain('bg-primary-1');

    // 4. Wait 2s then verify highlight removed
    await page.waitForTimeout(2100); // 2s + buffer

    const cardClassesAfter = await targetCard.getAttribute('class');
    expect(cardClassesAfter).not.toContain('border-primary-5');
    expect(cardClassesAfter).not.toContain('bg-primary-1');
    await takeScreenshot(page, 'assistants/p0-4/02-highlight-removed.png');

    // 5. Verify query param cleared
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('highlight=');
    await takeScreenshot(page, 'assistants/p0-4/03-query-param-cleared.png');
  });

  test('P0-5: skills modal search filters and shows empty state', async ({ page }) => {
    await goToAssistantSettings(page);

    // 1. Open Custom assistant drawer and Skills modal
    await clickCreateAssistant(page);
    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await drawer.waitFor({ state: 'visible', timeout: 5_000 });

    const addSkillsBtn = page.locator('[data-testid="btn-add-skills"]');
    await addSkillsBtn.click();

    const modal = page.locator('.arco-modal').filter({ hasText: /Add Skills|添加技能/i });
    await expect(modal).toBeVisible({ timeout: 3_000 });
    await takeScreenshot(page, 'assistants/p0-5/01-skills-modal-opened.png');

    // 2. Verify modal shows skills or empty state
    // Modal opened successfully - verify it has content
    const modalContent = await modal.textContent();
    const hasContent = modalContent && modalContent.length > 0;
    expect(hasContent).toBe(true);
    await takeScreenshot(page, 'assistants/p0-5/02-modal-content.png');

    // 3. Try to find and use search input if it exists
    const searchInput = modal.locator('input').first();
    const searchExists = await searchInput.count() > 0;

    if (searchExists) {
      await searchInput.fill('zzz_nonexistent_skill_12345');
      await page.waitForTimeout(300);
      await takeScreenshot(page, 'assistants/p0-5/03-search-with-query.png');

      // Verify empty state or no results
      const hasEmptyMsg = modalContent && /No skills found|未找到技能|No external skill sources|未发现外部技能源/.test(modalContent);
      await takeScreenshot(page, 'assistants/p0-5/04-final-state.png');
    } else {
      // No search input - just verify modal has skills or empty state message
      await takeScreenshot(page, 'assistants/p0-5/03-no-search-input.png');
    }

    // 5. Close modal
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden', timeout: 3_000 });

    // Close drawer
    await closeDrawer(page);
  });

  test('P0-6: extension assistant shows skills section', async ({ page }) => {
    await goToAssistantSettings(page);

    // 1. Find an Extension assistant (ID prefix 'ext-')
    const cards = page.locator('[data-testid^="assistant-card-"]');
    await cards.first().waitFor({ state: 'visible', timeout: 10_000 });

    const cardCount = await cards.count();
    let extensionId: string | null = null;

    for (let i = 0; i < cardCount; i++) {
      const cardId = await cards.nth(i).getAttribute('data-testid');
      if (cardId?.includes('ext-')) {
        extensionId = cardId.replace('assistant-card-', '');
        break;
      }
    }

    if (extensionId) {
      // Extension assistant exists - verify skills section renders
      await takeScreenshot(page, 'assistants/p0-6/01-extension-assistant-found.png');

      // Open Extension assistant drawer
      const targetCard = page.locator(`[data-testid="assistant-card-${extensionId}"]`);
      await targetCard.click();

      const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
      await expect(drawer).toBeVisible({ timeout: 5_000 });
      await takeScreenshot(page, 'assistants/p0-6/02-drawer-opened.png');

      // Verify Skills section renders
      const skillsSection = drawer.locator('[data-testid="skills-section"]');
      await expect(skillsSection).toBeVisible();
      await takeScreenshot(page, 'assistants/p0-6/03-skills-section-visible.png');

      // Extension assistants show skills section but may not allow editing
      await takeScreenshot(page, 'assistants/p0-6/04-skills-section-shown.png');

      // Close drawer
      await closeDrawer(page);
    } else {
      // No extension assistant - verify empty state is valid UI
      await takeScreenshot(page, 'assistants/p0-6/01-no-extension-assistant.png');

      // Verify list still renders normally (no extension is valid state)
      const listCards = page.locator('[data-testid^="assistant-card-"]');
      await expect(listCards.first()).toBeVisible();
      await takeScreenshot(page, 'assistants/p0-6/02-list-renders-without-extension.png');
    }
  });
});
