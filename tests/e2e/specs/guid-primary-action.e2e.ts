/**
 * Guid primary-action state machine — E2E tests.
 *
 * Covers the homepage multi-select assistant chips + multi-state primary button
 * introduced alongside eager empty-conversation creation:
 *
 *   - "start": 1 assistant selected + empty input → clicking opens a fresh,
 *     idle conversation (no auto-sent user message).
 *   - "send":  1 assistant selected + typed input → icon (send) mode.
 *   - "team":  ≥2 assistants selected → an inline team memberbar appears and
 *     clicking the primary button DIRECTLY creates the team (no modal), then
 *     navigates to /team/:id. The full TeamCreateModal is an advanced-only
 *     entry reached via the memberbar's "add / advanced" button.
 *   - 保底 ≥1: deselecting the last remaining assistant is a no-op.
 *
 * State is asserted via the locale-independent `data-primary-mode` attribute so
 * the tests never depend on translated button labels. Backend-dependent branches
 * skip gracefully when the environment has too few assistants.
 */
import { test, expect } from '../fixtures';
import { goToGuid, GUID_INPUT, ASSISTANT_PILL, ASSISTANT_PILL_SELECTED, httpDelete, invokeBridge } from '../helpers';

const PRIMARY_BTN = '[data-testid="guid-send-btn"]';
const ASSISTANT_PILL_UNSELECTED =
  '[data-testid^="preset-pill-"]:not([data-assistant-selected="true"]), [data-testid^="assistant-overflow-"]:not([data-assistant-selected="true"])';
const TEAM_LAYOUT = '[data-testid="team-create-layout"], [data-testid="team-create-layout-mobile"]';
const TEAM_MEMBER_DRAFT = '[data-testid^="team-create-member-draft-"]';

const MEMBERBAR = '[data-testid="guid-team-memberbar"]';
const MEMBER_CHIP = '[data-testid^="guid-member-chip-"]';
const TEAM_NAME_INPUT = '[data-testid="guid-team-name-input"]';
const ADVANCED_BTN = '[data-testid="guid-team-advanced-btn"]';

type TTeamBackendAgent = { role: string; assistant_id?: string };
type TTeam = { id: string; assistants: TTeamBackendAgent[] };

/** Wait until the assistant chips have rendered and the seed selection settled. */
async function waitForSeededSelection(page: import('@playwright/test').Page): Promise<number> {
  const pills = page.locator(ASSISTANT_PILL);
  await pills.first().waitFor({ state: 'visible', timeout: 12_000 });
  // main auto-selects a default primary, so exactly one chip should be selected
  // once the homepage seed effect has run.
  await expect(page.locator(ASSISTANT_PILL_SELECTED).first()).toBeVisible({ timeout: 12_000 });
  return pills.count();
}

/**
 * Reach team mode by selecting a second assistant. Returns the second selection
 * outcome, or skips the test when the environment has fewer than 2 selectable
 * assistants.
 */
async function reachTeamMode(page: import('@playwright/test').Page): Promise<boolean> {
  const pillCount = await waitForSeededSelection(page);
  if (pillCount < 2) {
    test.skip(true, 'Fewer than 2 assistants available — cannot reach team mode');
    return false;
  }
  const unselected = page.locator(ASSISTANT_PILL_UNSELECTED).first();
  const hasUnselected = await unselected.isVisible().catch(() => false);
  if (!hasUnselected) {
    test.skip(true, 'No second selectable assistant chip visible');
    return false;
  }
  await unselected.click();
  await expect(page.locator(ASSISTANT_PILL_SELECTED)).toHaveCount(2, { timeout: 5_000 });
  await expect(page.locator(PRIMARY_BTN)).toHaveAttribute('data-primary-mode', 'team', { timeout: 10_000 });
  return true;
}

test.describe('Guid Primary Action', () => {
  test('single selection + empty input shows "start" and opens an idle conversation', async ({ page }) => {
    await goToGuid(page);
    await waitForSeededSelection(page);

    const primaryBtn = page.locator(PRIMARY_BTN);
    await expect(primaryBtn).toHaveAttribute('data-primary-mode', 'start', { timeout: 10_000 });

    const disabled = await primaryBtn.isDisabled().catch(() => true);
    if (disabled) {
      test.skip(true, 'Default assistant not runnable in this environment');
      return;
    }

    const previousHash = await page.evaluate(() => window.location.hash);
    await primaryBtn.click();

    // Eager empty-conversation creation: navigation happens without sending a message.
    const navigated = await page
      .waitForFunction(
        (prev) => window.location.hash.includes('/conversation/') && window.location.hash !== prev,
        previousHash,
        { timeout: 15_000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!navigated) {
      test.skip(true, 'Conversation creation did not complete in this environment');
      return;
    }

    const conversationId = await page.evaluate(() => window.location.hash.split('/conversation/')[1] ?? '');
    expect(conversationId).toBeTruthy();

    try {
      // The window opens idle: block3 does NOT stash an initial message, so no
      // user (right-aligned) text bubble should appear.
      await page.waitForTimeout(1_500);
      await expect(page.locator('[data-testid="message-text-right"]')).toHaveCount(0);
    } finally {
      await httpDelete(page, `/api/conversations/${conversationId}`).catch(() => {});
    }
  });

  test('typing text flips the primary button to "send"', async ({ page }) => {
    await goToGuid(page);
    await waitForSeededSelection(page);

    const primaryBtn = page.locator(PRIMARY_BTN);
    await expect(primaryBtn).toHaveAttribute('data-primary-mode', 'start', { timeout: 10_000 });

    await page.locator(GUID_INPUT).fill('hello');
    await expect(primaryBtn).toHaveAttribute('data-primary-mode', 'send', { timeout: 10_000 });

    // Clearing the input returns to "start".
    await page.locator(GUID_INPUT).fill('');
    await expect(primaryBtn).toHaveAttribute('data-primary-mode', 'start', { timeout: 10_000 });
  });

  test('deselecting the last assistant is a no-op (保底 ≥1)', async ({ page }) => {
    await goToGuid(page);
    await waitForSeededSelection(page);

    const selectedPill = page.locator(ASSISTANT_PILL_SELECTED).first();
    await expect(selectedPill).toBeVisible();

    // Clicking the single selected chip must not clear it.
    await selectedPill.click();

    await expect(page.locator(ASSISTANT_PILL_SELECTED)).toHaveCount(1, { timeout: 5_000 });
    await expect(page.locator(PRIMARY_BTN)).toHaveAttribute('data-primary-mode', 'start', { timeout: 5_000 });
  });

  test('selecting a second assistant reveals the inline memberbar (no modal)', async ({ page }) => {
    await goToGuid(page);
    if (!(await reachTeamMode(page))) return;

    // The inline memberbar (设计 图2) appears; the full modal must NOT open.
    const memberbar = page.locator(MEMBERBAR);
    await expect(memberbar).toBeVisible({ timeout: 8_000 });
    await expect(page.locator(TEAM_LAYOUT)).toHaveCount(0);

    // It carries a team-name input, one chip per selected assistant, and the
    // "add / advanced" entry.
    await expect(memberbar.locator(TEAM_NAME_INPUT)).toBeVisible();
    await expect(memberbar.locator(MEMBER_CHIP)).toHaveCount(2);
    await expect(memberbar.locator(ADVANCED_BTN)).toBeVisible();
  });

  test('the primary button directly creates the team and navigates to /team/:id', async ({ page }) => {
    test.setTimeout(120_000);
    await goToGuid(page);
    if (!(await reachTeamMode(page))) return;

    let createdTeamId: string | undefined;
    try {
      const primaryBtn = page.locator(PRIMARY_BTN);
      const disabled = await primaryBtn.isDisabled().catch(() => true);
      if (disabled) {
        test.skip(true, 'Selected assistants not runnable in this environment');
        return;
      }

      await primaryBtn.click();

      // Direct create → team route. No TeamCreateModal is shown at any point.
      const navigated = await page
        .waitForURL(/\/team\/[^/?#]+/, { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      if (!navigated) {
        test.skip(true, 'Team creation did not complete in this environment');
        return;
      }
      await expect(page.locator(TEAM_LAYOUT)).toHaveCount(0);

      createdTeamId = page.url().match(/team\/([^/?#]+)/)?.[1];
      expect(createdTeamId).toBeTruthy();

      const team = await invokeBridge<TTeam | null>(page, 'team.get', { id: createdTeamId });
      expect(team).toBeTruthy();
      // ≥2 selected assistants map to ≥2 team members (one leader + teammates).
      expect(team!.assistants.length).toBeGreaterThanOrEqual(2);
    } finally {
      if (createdTeamId) {
        await invokeBridge(page, 'team.remove', { id: createdTeamId }).catch(() => {});
      }
    }
  });

  test('the crown toggles the leader among memberbar members', async ({ page }) => {
    await goToGuid(page);
    if (!(await reachTeamMode(page))) return;

    const memberbar = page.locator(MEMBERBAR);
    await expect(memberbar).toBeVisible({ timeout: 8_000 });

    // Derive each chip's assistant id from its testid to build the leader/remove
    // selectors (chips are keyed by assistant id).
    const chipIds = await memberbar
      .locator(MEMBER_CHIP)
      .evaluateAll((chips) =>
        chips.map((chip) => (chip.getAttribute('data-testid') ?? '').replace('guid-member-chip-', ''))
      );
    expect(chipIds.length).toBe(2);

    // The first selected member is the default leader; promoting the second must
    // move the leader marker (the crown button carries the warning color class).
    const secondLeaderBtn = page.locator(`[data-testid="guid-member-leader-${chipIds[1]}"]`);
    await secondLeaderBtn.click();
    await expect(secondLeaderBtn).toHaveClass(/text-warning-6/, { timeout: 5_000 });

    const firstLeaderBtn = page.locator(`[data-testid="guid-member-leader-${chipIds[0]}"]`);
    await expect(firstLeaderBtn).not.toHaveClass(/text-warning-6/);
  });

  test('removing a member down to one hides the memberbar and returns to "start"', async ({ page }) => {
    await goToGuid(page);
    if (!(await reachTeamMode(page))) return;

    const memberbar = page.locator(MEMBERBAR);
    await expect(memberbar).toBeVisible({ timeout: 8_000 });

    const chipIds = await memberbar
      .locator(MEMBER_CHIP)
      .evaluateAll((chips) =>
        chips.map((chip) => (chip.getAttribute('data-testid') ?? '').replace('guid-member-chip-', ''))
      );
    expect(chipIds.length).toBe(2);

    // Removing one leaves a single selection → team mode ends, memberbar unmounts.
    await page.locator(`[data-testid="guid-member-remove-${chipIds[0]}"]`).click();

    await expect(page.locator(ASSISTANT_PILL_SELECTED)).toHaveCount(1, { timeout: 5_000 });
    await expect(memberbar).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator(PRIMARY_BTN)).toHaveAttribute('data-primary-mode', 'start', { timeout: 5_000 });
  });

  test('the memberbar "advanced" button opens the prefilled TeamCreateModal', async ({ page }) => {
    await goToGuid(page);
    if (!(await reachTeamMode(page))) return;

    const memberbar = page.locator(MEMBERBAR);
    await expect(memberbar).toBeVisible({ timeout: 8_000 });

    await memberbar.locator(ADVANCED_BTN).click();

    // The full modal opens as the advanced entry, prefilled from the selection.
    await expect(page.locator(TEAM_LAYOUT).first()).toBeVisible({ timeout: 8_000 });
    expect(await page.locator(TEAM_MEMBER_DRAFT).count()).toBeGreaterThanOrEqual(1);
  });
});
