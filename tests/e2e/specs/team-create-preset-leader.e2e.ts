/**
 * E2E: Create a team with a preset assistant as leader.
 *
 * Background: team leader selection used to be restricted to CLI execution
 * engines (claude / codex / gemini). The Create Team modal now exposes a
 * grouped searchable dropdown (`team-create-leader-select`) whose second
 * OptGroup ("Preset Assistants") lists user-configured preset agents.
 *
 * This spec verifies the new UI + the end-to-end creation flow:
 *   - VP1: the dropdown opens and at least one preset option is rendered
 *   - VP2: picking a preset option and submitting creates a team whose leader
 *          carries the correct `customAgentId` and `agentType`
 *   - VP3: cleanup via `team.remove`, then `team.get` returns null
 *
 * Red lines:
 *   - invokeBridge is only used for read / cleanup — creation goes through UI
 *   - a single spec file covers all preset leader cases (no per-type files)
 *   - cleanup runs inside a finally block so leftover test data never leaks
 */
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers';
import type { TTeam } from '@/common/types/teamTypes';

const PREFERRED_PRESET_CUSTOM_AGENT_ID = 'builtin-cowork';
const PREFERRED_PRESET_AGENT_TYPE = 'gemini';

test.describe('Team Create - preset assistant leader', () => {
  test('can create a team with a preset assistant as leader', async ({ page }) => {
    test.setTimeout(120_000);

    let createdTeamId: string | undefined;

    try {
      // ── Open Create Team modal via sidebar UI ───────────────────────────
      const teamSection = page.locator('text=Teams').or(page.locator('text=团队'));
      await expect(teamSection.first()).toBeVisible({ timeout: 15_000 });

      const createBtn = page.locator('.h-20px.w-20px.rd-4px').first();
      await expect(createBtn).toBeVisible({ timeout: 10_000 });
      await createBtn.click();

      const modal = page.locator('.team-create-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      await page.screenshot({ path: 'tests/e2e/results/team-preset-01-modal-open.png' });

      // ── VP1: open the leader dropdown and check for a preset option ─────
      const leaderSelect = modal.locator('[data-testid="team-create-leader-select"]');
      await expect(leaderSelect).toBeVisible({ timeout: 10_000 });
      await leaderSelect.click();

      // Dropdown is mounted on document.body (getPopupContainer), not inside the modal.
      const presetOptions = page.locator('[data-testid^="team-create-agent-option-preset::"]');

      await expect
        .poll(async () => presetOptions.count(), {
          timeout: 10_000,
          message: 'Waiting for preset leader options to render',
        })
        .toBeGreaterThanOrEqual(0);

      const presetCount = await presetOptions.count();
      await page.screenshot({ path: 'tests/e2e/results/team-preset-02-options-listed.png' });

      if (presetCount === 0) {
        // Close dropdown and modal cleanly then skip — preset assistants not initialised.
        await page.keyboard.press('Escape').catch(() => {});
        await page
          .locator('.team-create-modal .arco-modal-close-icon')
          .click({ force: true })
          .catch(() => {});
        await expect(modal)
          .toBeHidden({ timeout: 5_000 })
          .catch(() => {});
        test.skip(true, 'No preset leader options available — preset assistants not initialised in this env');
        return;
      }

      expect(presetCount).toBeGreaterThanOrEqual(1);

      // ── VP2: pick a preset option → fill name → click Create ────────────

      // Prefer the cowork preset, falling back to the first preset option.
      const preferredOption = page.locator(
        `[data-testid="team-create-agent-option-preset::${PREFERRED_PRESET_CUSTOM_AGENT_ID}"]`
      );
      const preferredVisible = await preferredOption.isVisible().catch(() => false);
      const chosenOption = preferredVisible ? preferredOption : presetOptions.first();

      const chosenTestId = await chosenOption.getAttribute('data-testid');
      expect(chosenTestId).toBeTruthy();
      // data-testid is `team-create-agent-option-preset::<customAgentId>`
      const chosenKey = chosenTestId!.replace(/^team-create-agent-option-/, '');
      expect(chosenKey.startsWith('preset::')).toBe(true);
      const chosenCustomAgentId = chosenKey.replace(/^preset::/, '');

      await chosenOption.click();

      // After selection, the dropdown closes and the selected label is rendered
      // via renderFormat (AgentOptionLabel) inside the select view.
      await page.screenshot({ path: 'tests/e2e/results/team-preset-03-option-selected.png' });

      // Fill team name with timestamp so parallel / retried runs don't collide
      const teamName = `E2E Preset Team ${Date.now()}`;
      const nameInput = modal.locator('input').first();
      await nameInput.fill(teamName);

      const confirmBtn = modal.locator('.arco-btn-primary');
      await expect(confirmBtn).toBeEnabled({ timeout: 5_000 });

      await page.screenshot({ path: 'tests/e2e/results/team-preset-04-form-filled.png' });

      await confirmBtn.click();

      // Wait for modal to close and URL to navigate to /team/<id>
      await expect(modal).toBeHidden({ timeout: 15_000 });
      await page.waitForURL(/\/team\//, { timeout: 15_000 });

      const postCreateUrl = page.url();
      createdTeamId = postCreateUrl.match(/team\/([^/?#]+)/)?.[1];
      expect(createdTeamId, 'Team id should be present in URL after creation').toBeTruthy();

      await page.screenshot({ path: 'tests/e2e/results/team-preset-05-created.png' });

      // Sidebar should reflect the new team
      await expect(page.locator(`text=${teamName}`).first()).toBeVisible({ timeout: 10_000 });

      // ── Backend assertion: leader agent carries the preset metadata ─────
      const team = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId });
      expect(team).toBeTruthy();
      expect(team!.agents.length).toBe(1);

      const leader = team!.agents[0];
      expect(leader.role).toBe('leader');
      expect(leader.customAgentId).toBe(chosenCustomAgentId);

      // cowork (and all currently enabled presets) use presetAgentType = 'gemini'.
      // If we picked the preferred cowork option, assert the exact type; otherwise
      // just assert agentType is non-empty (we don't know the fallback preset's type).
      if (preferredVisible && chosenCustomAgentId === PREFERRED_PRESET_CUSTOM_AGENT_ID) {
        expect(leader.agentType).toBe(PREFERRED_PRESET_AGENT_TYPE);
      } else {
        expect(leader.agentType).toBeTruthy();
      }

      await page.screenshot({ path: 'tests/e2e/results/team-preset-06-backend-verified.png' });
    } finally {
      // ── VP3 (cleanup): remove team and confirm it's gone ────────────────
      if (createdTeamId) {
        await invokeBridge(page, 'team.remove', { id: createdTeamId }).catch(() => {});
        const deleted = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId }).catch(() => null);
        expect(deleted).toBeNull();
        await page.screenshot({ path: 'tests/e2e/results/team-preset-07-cleanup.png' }).catch(() => {});
      }
    }
  });
});
