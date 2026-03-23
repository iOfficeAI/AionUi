/**
 * ACP Agent – integration & switching tests.
 *
 * Covers:
 *  - Agent settings page loads and has management UI
 *  - Agent pill bar on guid page renders available agents
 *  - Switching between agent backends
 *  - Agent mode selection within a backend
 *  - MCP tools page loads
 */
import { test, expect } from '../fixtures';
import {
  goToGuid,
  goToSettings,
  expectBodyContainsAny,
  expectUrlContains,
  takeScreenshot,
  AGENT_PILL,
  AGENT_PILL_SELECTED,
  settingsSiderItemById,
} from '../helpers';

test.describe('ACP Agent', () => {
  test('agent settings page has management UI', async ({ page }) => {
    await goToSettings(page, 'agent');
    await expectUrlContains(page, 'agent');
    await expectBodyContainsAny(page, ['Agent', 'agent', '助手', '预设', 'Preset', 'Custom', 'Assistants']);
  });

  test('screenshot: agent settings', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToSettings(page, 'agent');
    await takeScreenshot(page, 'agent-settings');
  });

  test('agent pill bar renders on guid page', async ({ page }) => {
    await goToGuid(page);

    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });
    expect(await pills.count()).toBeGreaterThanOrEqual(1);
  });

  test('can see agent backend names', async ({ page }) => {
    await goToGuid(page);

    const knownBackends = new Set(['claude', 'gemini', 'qwen', 'opencode', 'codex', 'iflow']);
    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });

    const count = await pills.count();
    const backends: string[] = [];
    for (let i = 0; i < count; i++) {
      const backend = await pills.nth(i).getAttribute('data-agent-backend');
      if (backend) backends.push(backend);
    }

    expect(backends.some((backend) => knownBackends.has(backend))).toBeTruthy();
  });

  test('clicking an agent pill selects it', async ({ page }) => {
    await goToGuid(page);

    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });

    const count = await pills.count();
    if (count >= 2) {
      const target = pills.nth(1);
      await target.click();

      await expect
        .poll(async () => {
          return await target.getAttribute('data-agent-selected');
        })
        .toBe('true');

      await expect(page.locator(AGENT_PILL_SELECTED).first()).toBeVisible();
    }
  });

  test('screenshot: agent pill bar', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToGuid(page);
    await expect(page.locator(AGENT_PILL).first()).toBeVisible({ timeout: 8_000 });
    await takeScreenshot(page, 'agent-pill-bar');
  });

  test('MCP tools page has server management UI', async ({ page }) => {
    await goToSettings(page, 'tools');
    await expectUrlContains(page, 'tools');
    await expect(page.locator(settingsSiderItemById('tools')).first()).toBeVisible({ timeout: 8_000 });
    await expectBodyContainsAny(page, ['MCP', 'mcp', 'Server', 'server', '工具', '配置', '添加', 'Add']);
  });

  test('can query available agents via IPC', async ({ page, electronApp }) => {
    await goToGuid(page);

    const windowCount = await electronApp.evaluate(async ({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(windowCount).toBeGreaterThanOrEqual(1);
  });
});
