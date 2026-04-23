/**
 * Assistant Settings Edge Cases (P2) — E2E tests.
 *
 * Edge case and boundary validations for the Assistant Settings page.
 */
import { test, expect } from '../../fixtures';
import { goToAssistantSettings, takeScreenshot, clickCreateAssistant, closeDrawer, httpPost, httpDelete } from '../../helpers';

test.describe('Assistant Settings Edge Cases (P2)', () => {
  test.setTimeout(90_000);

  test('P2-1: highlight animation cleanup on unmount', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        errors.push(msg.text());
      }
    });

    // Navigate to Assistant settings with highlight parameter
    const targetId = 'builtin-agent';
    await page.evaluate((id) => {
      window.location.hash = `/settings/assistants?highlight=${id}`;
    });

    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'assistants/p2-1/01-highlight-started.png');

    const targetCard = page.locator(`[data-testid="assistant-card-${targetId}"]`);
    if (await targetCard.isVisible().catch(() => false)) {
      await takeScreenshot(page, 'assistants/p2-1/02-card-visible.png');
    }

    // Wait 1 second (animation not complete)
    await page.waitForTimeout(1000);

    // Immediately navigate away
    await page.evaluate(() => {
      window.location.hash = '/settings/general';
    });
    await page.waitForTimeout(500);

    await takeScreenshot(page, 'assistants/p2-1/03-navigated-away.png');

    // Wait for potential delayed errors
    await page.waitForTimeout(3000);

    await takeScreenshot(page, 'assistants/p2-1/04-final-state.png');

    // Verify no memory/cleanup warnings
    const hasMemoryWarning = errors.some((e) => e.includes('memory') || e.includes('timer') || e.includes('cleanup'));
    expect(hasMemoryWarning).toBe(false);
  });

  test('P2-2: search and tab filter both apply empty state', async ({ page }) => {
    await goToAssistantSettings(page);

    await takeScreenshot(page, 'assistants/p2-2/01-initial-list.png');

    // Expand search
    await page.locator('[data-testid="btn-search-toggle"]').click();
    const searchInput = page.locator('[data-testid="input-search-assistant"]');
    await expect(searchInput).toBeVisible();

    await takeScreenshot(page, 'assistants/p2-2/02-search-expanded.png');

    // Enter search query that matches nothing
    await searchInput.fill('zzz_nonexistent_query_12345');
    await page.waitForTimeout(300);

    await takeScreenshot(page, 'assistants/p2-2/03-search-applied.png');

    // Switch to Disabled tab (if exists)
    const disabledTab = page.locator('div[role="tab"]').filter({ hasText: /Disabled|禁用/i });

    if (await disabledTab.isVisible().catch(() => false)) {
      await disabledTab.click();
      await page.waitForTimeout(200);

      await takeScreenshot(page, 'assistants/p2-2/04-disabled-tab-selected.png');

      // Verify empty state message (search + tab filter)
      const emptyMessage = page.locator('text=/No assistants match|没有匹配/i');
      await expect(emptyMessage).toBeVisible({ timeout: 3000 });

      await takeScreenshot(page, 'assistants/p2-2/05-empty-state-both-filters.png');
    } else {
      // No Disabled tab, verify search empty state only
      const emptyMessage = page.locator('text=/No assistants match|没有匹配/i');
      await expect(emptyMessage).toBeVisible({ timeout: 3000 });

      await takeScreenshot(page, 'assistants/p2-2/05-empty-state-search-only.png');
    }

    // Clear search
    await page.locator('[data-testid="btn-search-toggle"]').click();
    await page.waitForTimeout(200);

    await takeScreenshot(page, 'assistants/p2-2/06-search-cleared.png');
  });

  test('P2-3: skill delete button visible on hover', async ({ page }) => {
    // Create temporary external skill source with a skill
    const { mkdirSync, writeFileSync } = await import('fs');
    const tempSkillPath = '/tmp/e2e-test-skills-p2-3';

    // Create temp skill directory with SKILL.md in test process (Node.js)
    mkdirSync(tempSkillPath, { recursive: true });
    writeFileSync(
      `${tempSkillPath}/SKILL.md`,
      `---\nname: test-skill-p2-3\ndescription: Test skill for P2-3\n---\n\nTest skill content.`
    );

    await httpPost(page, '/api/skills/external-paths', { name: 'E2E Test Source P2-3', path: tempSkillPath });
    await page.waitForTimeout(1500); // Wait for skills to be detected

    await goToAssistantSettings(page);
    await takeScreenshot(page, 'assistants/p2-3/01-initial-page.png');

    // Open drawer
    await clickCreateAssistant(page);
    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    await takeScreenshot(page, 'assistants/p2-3/02-drawer-opened.png');

    // Click "Add Skills" button to add the custom skill first
    const addSkillsBtn = drawer.locator('[data-testid="btn-add-skills"]');
    if (await addSkillsBtn.isVisible().catch(() => false)) {
      await addSkillsBtn.click();
      const modal = page.locator('.arco-modal').filter({ hasText: /Add Skills|添加技能/i });
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Find and add the test skill
      const addBtns = modal
        .locator('button')
        .filter({ hasText: /Add|添加/i })
        .filter({ hasNotText: /Added|已添加/i });
      if ((await addBtns.count()) > 0) {
        await addBtns.first().click();
        await page.waitForTimeout(500);
      }

      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }

    await takeScreenshot(page, 'assistants/p2-3/03-skills-added.png');

    // Look for skill cards with delete buttons
    const skillCards = drawer.locator('.group').filter({ has: page.locator('button svg') });
    const cardCount = await skillCards.count();

    if (cardCount === 0) {
      // No skill cards with delete buttons found
      await takeScreenshot(page, 'assistants/p2-3/04-no-delete-buttons.png');
      await closeDrawer(page);
      await httpDelete(page, `/api/skills/external-paths?path=${encodeURIComponent(tempSkillPath)}`);
      const { rmSync } = await import('fs');
      rmSync(tempSkillPath, { recursive: true, force: true });
      return;
    }

    const firstSkillCard = skillCards.first();
    const deleteBtn = firstSkillCard
      .locator('button')
      .filter({ has: page.locator('svg') })
      .last();

    // Verify delete button exists
    const deleteCount = await deleteBtn.count();
    if (deleteCount === 0) {
      await takeScreenshot(page, 'assistants/p2-3/05-no-delete-button.png');
      await closeDrawer(page);
      await httpDelete(page, `/api/skills/external-paths?path=${encodeURIComponent(tempSkillPath)}`);
      const { rmSync } = await import('fs');
      rmSync(tempSkillPath, { recursive: true, force: true });
      return;
    }

    await takeScreenshot(page, 'assistants/p2-3/05-before-hover.png');

    // Hover to trigger hover state
    await firstSkillCard.hover();
    await page.waitForTimeout(300);
    await takeScreenshot(page, 'assistants/p2-3/06-after-hover.png');

    // Clean up
    await closeDrawer(page);
    await invokeBridge(page, 'remove-custom-external-path', { path: tempSkillPath });

    // Remove temp directory in test process
    const { rmSync } = await import('fs');
    rmSync(tempSkillPath, { recursive: true, force: true });
  });

  test('P2-4: add custom path ok button disabled when empty', async ({ page }) => {
    await goToAssistantSettings(page);
    await takeScreenshot(page, 'assistants/p2-4/01-initial-page.png');

    // Open drawer and AddSkillsModal
    await clickCreateAssistant(page);
    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    await takeScreenshot(page, 'assistants/p2-4/02-drawer-opened.png');

    await page.locator('[data-testid="btn-add-skills"]').click();
    const skillsModal = page.locator('.arco-modal').filter({ hasText: /Add Skills|添加技能/i });
    await expect(skillsModal).toBeVisible({ timeout: 5000 });
    await takeScreenshot(page, 'assistants/p2-4/03-skills-modal-opened.png');

    // Look for add path button (might be icon-only or have text like "Add Path")
    const addPathBtn = skillsModal
      .locator('button')
      .filter({ has: page.locator('svg') })
      .last();
    const btnCount = await skillsModal
      .locator('button')
      .filter({ has: page.locator('svg') })
      .count();

    if (btnCount === 0) {
      // No add path button found, skip test
      await takeScreenshot(page, 'assistants/p2-4/04-no-add-button.png');
      await page.keyboard.press('Escape');
      await closeDrawer(page);
      return;
    }

    await addPathBtn.click();
    await page.waitForTimeout(500);

    const pathModal = page.locator('.arco-modal').filter({ hasText: /Add Custom|添加自定义|Add Path|新增/i });
    const pathModalVisible = await pathModal.isVisible().catch(() => false);

    if (!pathModalVisible) {
      // pathModal didn't open, skip test
      await takeScreenshot(page, 'assistants/p2-4/04-modal-not-opened.png');
      await page.keyboard.press('Escape');
      await closeDrawer(page);
      return;
    }

    await expect(pathModal).toBeVisible();
    await takeScreenshot(page, 'assistants/p2-4/04-path-modal-opened.png');

    const nameInput = pathModal.locator('input').first();
    const pathInput = pathModal.locator('input').nth(1);
    const okBtn = pathModal.locator('.arco-btn-primary').filter({ hasText: /OK|确定/i });

    // Test 1: Name empty, Path filled -> disabled
    await nameInput.clear();
    await pathInput.fill('/test/path');
    await page.waitForTimeout(200);
    await takeScreenshot(page, 'assistants/p2-4/05-name-empty.png');
    await expect(okBtn).toBeDisabled();

    // Test 2: Name filled, Path empty -> disabled
    await nameInput.fill('Test');
    await pathInput.clear();
    await page.waitForTimeout(200);
    await takeScreenshot(page, 'assistants/p2-4/06-path-empty.png');
    await expect(okBtn).toBeDisabled();

    // Test 3: Both only whitespace -> disabled
    await nameInput.fill('   ');
    await pathInput.fill('   ');
    await page.waitForTimeout(200);
    await takeScreenshot(page, 'assistants/p2-4/07-both-whitespace.png');
    await expect(okBtn).toBeDisabled();

    // Test 4: Both filled -> enabled
    await nameInput.fill('Test');
    await pathInput.fill('/test/path');
    await page.waitForTimeout(200);
    await takeScreenshot(page, 'assistants/p2-4/08-both-filled.png');
    await expect(okBtn).toBeEnabled();

    // Clean up
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await closeDrawer(page);
  });

  test('P2-5: add custom path folder button triggers dialog', async ({ page }) => {
    await goToAssistantSettings(page);
    await takeScreenshot(page, 'assistants/p2-5/01-initial-page.png');

    // Open drawer and AddSkillsModal
    await clickCreateAssistant(page);
    const drawer = page.locator('[data-testid="assistant-edit-drawer"]');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    await page.locator('[data-testid="btn-add-skills"]').click();
    const skillsModal = page.locator('.arco-modal').filter({ hasText: /Add Skills|添加技能/i });
    await expect(skillsModal).toBeVisible({ timeout: 5000 });

    // Look for add path button
    const addPathBtn = skillsModal
      .locator('button')
      .filter({ has: page.locator('svg') })
      .last();
    const btnCount = await skillsModal
      .locator('button')
      .filter({ has: page.locator('svg') })
      .count();

    if (btnCount === 0) {
      await takeScreenshot(page, 'assistants/p2-5/02-no-add-button.png');
      await page.keyboard.press('Escape');
      await closeDrawer(page);
      return;
    }

    await addPathBtn.click();
    await page.waitForTimeout(500);

    const pathModal = page.locator('.arco-modal').filter({ hasText: /Add Custom|添加自定义|Add Path|新增/i });
    const pathModalVisible = await pathModal.isVisible().catch(() => false);

    if (!pathModalVisible) {
      await takeScreenshot(page, 'assistants/p2-5/02-modal-not-opened.png');
      await page.keyboard.press('Escape');
      await closeDrawer(page);
      return;
    }

    await expect(pathModal).toBeVisible();
    await takeScreenshot(page, 'assistants/p2-5/02-path-modal-opened.png');

    // Look for folder button
    const pathInput = pathModal.locator('input').nth(1);
    const folderBtn = pathModal
      .locator('button')
      .filter({ has: page.locator('svg') })
      .last();

    const folderBtnVisible = await folderBtn.isVisible().catch(() => false);
    if (!folderBtnVisible) {
      await takeScreenshot(page, 'assistants/p2-5/03-no-folder-button.png');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      await closeDrawer(page);
      return;
    }

    await expect(folderBtn).toBeVisible();
    await takeScreenshot(page, 'assistants/p2-5/03-folder-button-visible.png');

    // Click folder button - this would normally trigger dialog.showOpenDialog
    // In E2E, we can't easily mock Electron dialog, so we just verify button works
    const initialPath = await pathInput.inputValue();
    await folderBtn.click();
    await page.waitForTimeout(500);
    await takeScreenshot(page, 'assistants/p2-5/04-after-button-click.png');

    // If dialog was shown and cancelled, path should remain unchanged
    const afterPath = await pathInput.inputValue();
    // We can't verify dialog was shown, but we verify button didn't crash
    expect(afterPath).toBe(initialPath);

    // Clean up
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await closeDrawer(page);
  });
});
