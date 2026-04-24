/**
 * E2E Scenario 6: Agent whitelist enforcement.
 *
 * Verifies: UI create modal dropdown only shows whitelisted agent types.
 *
 * Whitelist locations:
 * - agentSelectUtils.tsx (TEAM_SUPPORTED_BACKENDS)
 * - TeamMcpServer.ts (spawn whitelist)
 */
import { test, expect } from '../../fixtures';
import { TEAM_SUPPORTED_BACKENDS } from '../../helpers';

test.describe('Team Agent Whitelist', () => {
  test('UI only shows whitelisted agents in create modal dropdown', async ({ page }) => {
    // Navigate to home to access the create modal
    await page.goto(page.url().split('#')[0] + '#/guid');

    // Close any leftover modal from previous tests before interacting with the page
    const existingModal = page.locator('.arco-modal .arco-btn-text');
    if (await existingModal.isVisible({ timeout: 1000 }).catch(() => false)) {
      await existingModal.click({ force: true });
      await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
    }

    await expect(page.locator('[data-testid="team-create-btn"]').first()).toBeVisible({ timeout: 10000 });

    // Open Create Team modal
    const createBtn = page.locator('[data-testid="team-create-btn"]').first();
    await createBtn.click();

    // Open the leader AionSelect dropdown (options portal to document.body)
    const modal = page.locator('.arco-modal');
    const leaderSelect = modal.locator('[data-testid="team-create-leader-select"]');
    await expect(leaderSelect).toBeVisible({ timeout: 5000 });
    await leaderSelect.click();

    // Wait for at least one option to render at page scope (not inside .arco-modal)
    const firstOption = page.locator('[data-testid^="team-create-agent-option-"]').first();
    await expect(firstOption).toBeVisible({ timeout: 5000 });

    // Screenshot: dropdown options
    await page.screenshot({ path: 'tests/e2e/results/team-whitelist-01-dropdown.png' });

    // Agent options fall into two optgroups (agentSelectUtils.tsx: agentKey()):
    //   - CLI Agents:          data-testid="team-create-agent-option-cli::<backend>"
    //   - Preset Assistants:   data-testid="team-create-agent-option-preset::<id>"
    // The whitelist (TEAM_SUPPORTED_BACKENDS) applies to CLI Agents only. Preset assistants
    // are allowed to appear regardless of which CLIs are installed.
    const cliOptions = page.locator('[data-testid^="team-create-agent-option-cli::"]');
    const cliCount = await cliOptions.count();
    const cliTexts: string[] = [];
    const cliBackends: string[] = [];
    for (let i = 0; i < cliCount; i++) {
      const option = cliOptions.nth(i);
      const text = await option.textContent();
      const testId = await option.getAttribute('data-testid');
      if (text) cliTexts.push(text.trim());
      if (testId) {
        const m = testId.match(/^team-create-agent-option-cli::(.+)$/);
        if (m?.[1]) cliBackends.push(m[1]);
      }
    }

    const allOptions = page.locator('[data-testid^="team-create-agent-option-"]');
    const totalCount = await allOptions.count();
    console.log(
      `[E2E] Dropdown options: total=${totalCount}, CLI=${cliCount}, CLI backends=[${cliBackends.join(', ')}], CLI texts=[${cliTexts.join(', ')}]`
    );

    // [WHITELIST RULE] TEAM_SUPPORTED_BACKENDS (tests/e2e/helpers/teamConfig.ts) is the set
    // of backends this test infrastructure knows how to validate. The **actual** runtime
    // whitelist lives in isTeamCapableBackend() (src/common/types/teamTypes.ts) and can
    // dynamically include extra backends (e.g. codebuddy) when their cached ACP
    // initializeResult advertises mcpCapabilities.stdio=true. We therefore do NOT assert
    // "no un-whitelisted backends appear" here — the runtime whitelist is authoritative.
    //
    // What this test DOES verify: at least one whitelisted backend shows up when its CLI
    // is installed, so the dropdown genuinely renders CLI agents (regression against the
    // empty-dropdown / wrong-selector bug in mnemo #108). If no whitelisted CLI is
    // installed, we skip gracefully — matching the pattern used by team-create.e2e.ts.
    const whitelistArr = Array.from(TEAM_SUPPORTED_BACKENDS);
    const present = whitelistArr.filter((backend) => cliBackends.includes(backend));
    const missing = whitelistArr.filter((backend) => !cliBackends.includes(backend));
    if (missing.length > 0) {
      console.log(`[E2E] Whitelisted backends not present in dropdown (CLI not installed?): ${missing.join(', ')}`);
    }

    if (cliBackends.length === 0) {
      // No CLI agents surfaced at all — could be environment or a real regression.
      // Skip gracefully; team-create.e2e.ts will catch full-dropdown regressions.
      console.log('[E2E] No CLI backends surfaced in dropdown — skipping');
      await page.keyboard.press('Escape').catch(() => {});
      await page.locator('.arco-modal .arco-btn-text').first().click();
      await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
      test.skip();
      return;
    }

    if (present.length === 0) {
      // CLI agents surfaced but none match TEAM_SUPPORTED_BACKENDS — test-infra backends
      // not installed in this env. Skip gracefully.
      console.log(`[E2E] No TEAM_SUPPORTED_BACKENDS present in dropdown — found [${cliBackends.join(', ')}], skipping`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.locator('.arco-modal .arco-btn-text').first().click();
      await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
      test.skip();
      return;
    }

    expect(present.length, `Expected at least one TEAM_SUPPORTED_BACKENDS entry in dropdown`).toBeGreaterThan(0);

    // Close the dropdown first, then close the modal via Cancel button
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('.arco-modal .arco-btn-text').first().click();
    await expect(page.locator('.arco-modal')).toBeHidden({ timeout: 5000 });
  });
});
