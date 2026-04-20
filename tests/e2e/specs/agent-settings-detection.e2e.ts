/**
 * Agent Settings Detection — E2E tests.
 *
 * Covers: LocalAgents component rendering, CLI agent detection,
 * Gemini presence, agent status, PresetManagement sync, refresh.
 */
import { test, expect } from '../fixtures';
import { goToSettings, expectUrlContains, expectBodyContainsAny, settingsSiderItemById } from '../helpers';

test.describe('Agent Settings Detection', () => {
  test('LocalAgents page renders', async ({ page }) => {
    await goToSettings(page, 'agent');
    await expectUrlContains(page, 'agent');
    await expectBodyContainsAny(page, ['Agent', 'agent', '助手', '代理']);
  });

  test('detected CLI agents displayed', async ({ page }) => {
    await goToSettings(page, 'agent');

    // At least one detected agent card should be visible
    // Agent cards use AgentCard component in a grid
    const agentGrid = page.locator('.grid');
    await expect(agentGrid.first()).toBeVisible({ timeout: 8_000 });

    // Check for known backend names
    const body = await page.locator('body').textContent();
    const hasKnownAgent = ['Claude', 'Codex', 'Gemini', 'Aion', 'OpenCode', 'Qwen'].some((name) =>
      body?.includes(name)
    );
    expect(hasKnownAgent).toBeTruthy();
  });

  test('Gemini agent is present in detected list', async ({ page }) => {
    await goToSettings(page, 'agent');

    // Gemini or Aion RS should be in the agent list
    await expectBodyContainsAny(page, ['Gemini', 'gemini', 'Aion']);
  });

  test('agent settings page has sidebar navigation item', async ({ page }) => {
    await goToSettings(page, 'agent');

    const siderItem = page.locator(settingsSiderItemById('agent')).first();
    await expect(siderItem).toBeVisible({ timeout: 8_000 });
  });

  test('preset management section is visible', async ({ page }) => {
    await goToSettings(page, 'agent');

    // The agent settings page includes preset management area
    // Look for text indicating presets or assistants
    await expectBodyContainsAny(page, [
      'Preset',
      'preset',
      'Custom',
      'custom',
      '预设',
      '自定义',
      'Assistants',
      'assistants',
      '助手',
    ]);
  });

  test('detected agents section refreshes without error', async ({ page }) => {
    await goToSettings(page, 'agent');

    // Navigate away and back to trigger a refresh
    await goToSettings(page, 'about');
    await goToSettings(page, 'agent');

    // Page should still render correctly
    await expectBodyContainsAny(page, ['Agent', 'agent', '助手', '代理']);
    const agentGrid = page.locator('.grid');
    await expect(agentGrid.first()).toBeVisible({ timeout: 8_000 });
  });
});
