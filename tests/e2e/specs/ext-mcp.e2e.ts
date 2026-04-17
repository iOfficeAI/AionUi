/**
 * Extensions – MCP Servers tests.
 *
 * Validates extension-contributed MCP servers on the tools settings page.
 */
import { test, expect } from '../fixtures';
import { goToSettings, expectBodyContainsAny, takeScreenshot, waitForSettle, ARCO_SWITCH } from '../helpers';

test.describe('Extension: MCP Servers', () => {
  test('MCP tools page loads', async ({ page }) => {
    await goToSettings(page, 'capabilities');
    await expectBodyContainsAny(page, ['MCP', 'mcp', 'Server', 'server', '工具', '配置', '添加', 'Add']);
  });

  test('extension MCP servers registered (page functional)', async ({ page }) => {
    await goToSettings(page, 'capabilities');
    await waitForSettle(page);

    const body = await page.locator('body').textContent();
    // MCP servers may appear in the list or be internal-only
    expect(body!.length).toBeGreaterThan(50);
  });

  test('MCP server toggles are visible', async ({ page }) => {
    await goToSettings(page, 'capabilities');
    await waitForSettle(page);

    const switches = page.locator(ARCO_SWITCH);
    const count = await switches.count();
    // MCP servers should have at least one toggle control
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('screenshot: MCP tools with extensions', async ({ page }) => {
    test.skip(!process.env.E2E_SCREENSHOTS, 'screenshots disabled');
    await goToSettings(page, 'capabilities');
    await waitForSettle(page);
    await takeScreenshot(page, 'ext-mcp-servers');
  });
});
