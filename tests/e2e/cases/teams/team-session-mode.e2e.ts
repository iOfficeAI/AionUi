/**
 * E2E: Team Session Mode Propagation.
 *
 * Verifies that switching the permission mode on the leader's AgentModeSelector
 * is reflected both in the UI (data-current-mode attribute) and in the persisted
 * team record (team.get → sessionMode field).
 *
 * Only ACP-type backends (claude, codex) show the mode selector in team mode.
 * The test skips when no qualifying backend is available.
 */
import { test, expect } from '../../fixtures';
import { invokeBridge, navigateTo, TEAM_SUPPORTED_BACKENDS, MODE_SELECTOR } from '../../helpers';

const TEAM_NAME = 'E2E Session Mode Team';

/** ACP-capable backends that render the mode selector in team send-box. */
const ACP_BACKENDS = ['claude', 'codex'] as const;

type TeamRecord = {
  id: string;
  name: string;
  sessionMode?: string;
  agents: Array<{
    slotId: string;
    conversationId: string;
    role: string;
    agentType: string;
    agentName: string;
    conversationType: string;
    status: string;
  }>;
};

test.describe('Team Session Mode Propagation', () => {
  test('session mode change on leader UI propagates to team record', async ({ page }) => {
    test.setTimeout(60_000);

    // [setup] Resolve an ACP-capable backend that is also installed/supported.
    const leaderBackend = ACP_BACKENDS.find((b) => TEAM_SUPPORTED_BACKENDS.has(b));
    if (!leaderBackend) {
      test.skip(true, 'No ACP backend (claude/codex) available — skipping session mode test');
      return;
    }

    const conversationType = 'acp';

    // [setup] Find or create the E2E team.
    const teams = await invokeBridge<TeamRecord[]>(page, 'team.list', {
      userId: 'system_default_user',
    });
    const existing = teams.find((t) => t.name === TEAM_NAME);
    let teamId: string;

    if (existing) {
      teamId = existing.id;
    } else {
      const created = await invokeBridge<TeamRecord | null>(page, 'team.create', {
        userId: 'system_default_user',
        name: TEAM_NAME,
        workspace: '',
        workspaceMode: 'shared',
        agents: [
          {
            slotId: 'slot-lead',
            conversationId: '',
            role: 'leader',
            agentType: leaderBackend,
            agentName: 'Leader',
            conversationType,
            status: 'idle',
          },
        ],
      }).catch(() => null);

      if (!created?.id) {
        test.skip(true, `Team "${TEAM_NAME}" could not be created — agent may not be installed`);
        return;
      }
      teamId = created.id;
    }

    // [navigate] Go to team page and wait for the send-box to mount.
    await navigateTo(page, `#/team/${teamId}`);
    await page.waitForURL(/\/team\//, { timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-session-mode-01.png' });

    // [find] Wait for the mode selector pill to appear in the leader's send-box.
    const modeSelector = page.locator(MODE_SELECTOR).first();
    const modeSelectorVisible = await modeSelector
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!modeSelectorVisible) {
      // Mode selector only appears when an ACP session has modes available.
      // If the backend is not initialised (no active session), skip gracefully.
      test.skip(true, 'Mode selector not visible — ACP session may not have modes configured');
      return;
    }

    // [record] Read the current mode so we can switch to a different one.
    const initialMode = (await modeSelector.getAttribute('data-current-mode')) ?? '';

    // [find] Open the dropdown and collect available modes.
    await modeSelector.click();
    const modeItemVisible = await page
      .locator('[data-mode-value]')
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!modeItemVisible) {
      await page.keyboard.press('Escape');
      test.skip(true, 'Mode dropdown did not open — no mode items rendered');
      return;
    }

    const availableModes = await page
      .locator('[data-mode-value]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-mode-value')).filter((v): v is string => v !== null));

    if (availableModes.length < 2) {
      await page.keyboard.press('Escape');
      test.skip(true, `Only ${availableModes.length} mode(s) available — need at least 2 to test switching`);
      return;
    }

    // [action] Pick the first mode that differs from the current one.
    const targetMode = availableModes.find((m) => m !== initialMode) ?? availableModes[0];
    await page.locator(`[data-mode-value="${targetMode}"]`).click();

    await page.screenshot({ path: 'tests/e2e/results/team-session-mode-02.png' });

    // [assert] UI: mode selector reflects the new mode immediately.
    await expect(modeSelector).toHaveAttribute('data-current-mode', targetMode, { timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-session-mode-03.png' });

    // [assert-optional] Backend: team record sessionMode matches the selected mode.
    // propagateMode calls team.set-session-mode (best-effort fire-and-forget), so we
    // poll briefly rather than requiring an instant match.
    await expect
      .poll(
        async () => {
          const team = await invokeBridge<TeamRecord | null>(page, 'team.get', { id: teamId }).catch(() => null);
          return team?.sessionMode;
        },
        {
          timeout: 8_000,
          intervals: [300, 500, 1000],
          message: `team.get sessionMode should be "${targetMode}" within 8 s of mode switch`,
        }
      )
      .toBe(targetMode);

    await page.screenshot({ path: 'tests/e2e/results/team-session-mode-04.png' });
  });
});
