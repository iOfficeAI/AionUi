/**
 * E2E: Team empty state greeting.
 *
 * Validates that a freshly-created team's leader chat shows the self-detecting
 * TeamChatEmptyState — the same "Describe your goal…" hero that AcpChat and
 * GeminiChat used to render individually. We now mount it once from
 * TeamChatView, so this spec is the cross-platform smoke test for that wiring.
 *
 * Flow: create team via bridge → navigate to team page → assert greeting,
 * suggestion chips, and that clicking a suggestion fills the chat input.
 */
import { test, expect } from '../fixtures';
import { invokeBridge, navigateTo, TEAM_SUPPORTED_BACKENDS } from '../helpers';

const AGENT_TYPE_MAP: Record<string, { agentType: string; conversationType: string }> = {
  gemini: { agentType: 'gemini', conversationType: 'gemini' },
  claude: { agentType: 'claude', conversationType: 'acp' },
  codex: { agentType: 'codex', conversationType: 'acp' },
};

const SUGGESTION_KEYS = ['debate', 'interview', 'expert_review'] as const;
const SUGGESTION_CLICK_KEY = 'debate';
const EXPECTED_DEBATE_VALUE = /Organize a debate|组织.*辩论/;

for (const leaderType of TEAM_SUPPORTED_BACKENDS) {
  const teamName = `E2E Empty State (${leaderType})`;

  test(`team empty state: ${leaderType} leader renders greeting and suggestions`, async ({ page }) => {
    test.setTimeout(120_000);
    const meta = AGENT_TYPE_MAP[leaderType];
    if (!meta) {
      test.skip(true, `Leader type "${leaderType}" not in AGENT_TYPE_MAP`);
      return;
    }

    // [setup] Always start from a clean slate — a half-initialized team from a prior
    // run can leave the leader conversation stuck on the loading spinner, which
    // prevents the empty state from ever mounting. Remove any same-named team first.
    const teams = await invokeBridge<Array<{ id: string; name: string }>>(page, 'team.list', {
      userId: 'system_default_user',
    });
    for (const stale of teams.filter((t) => t.name === teamName)) {
      await invokeBridge(page, 'team.remove', { id: stale.id }).catch(() => {});
    }

    const created = await invokeBridge<{ id: string } | null>(page, 'team.create', {
      userId: 'system_default_user',
      name: teamName,
      workspace: '',
      workspaceMode: 'shared',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: '',
          role: 'leader',
          agentType: meta.agentType,
          agentName: 'Leader',
          conversationType: meta.conversationType,
          status: 'pending',
        },
      ],
    });
    if (!created?.id) {
      test.skip(true, `team.create returned null for ${leaderType} — agent not installed`);
      return;
    }
    const teamId = created.id;
    expect(teamId).toBeTruthy();

    await navigateTo(page, `#/team/${teamId}`);
    await page.waitForURL(new RegExp(`/team/${teamId}`), { timeout: 10000 });

    // Scope every assertion to the empty-state container. Without this, a leftover
    // sidebar conversation with the same name ("组织一场辩论赛…") will match
    // text-based locators first and the click will navigate away from the team.
    const emptyState = page.locator('[data-testid="team-chat-empty-state"]').first();
    await expect(emptyState).toBeVisible({ timeout: 15000 });

    await expect(emptyState.locator('[data-testid="team-chat-empty-state-subtitle"]')).toHaveText(
      /Describe your goal.*team working|描述你的目标/
    );

    await page.screenshot({ path: `tests/e2e/results/team-empty-${leaderType}-greeting.png` });

    // All three suggestion chips should render in an empty conversation.
    for (const key of SUGGESTION_KEYS) {
      await expect(emptyState.locator(`[data-testid="team-chat-empty-state-suggestion-${key}"]`)).toBeVisible();
    }

    // Clicking a suggestion should populate the chat textarea. This exercises the
    // per-DetectedAgentKind draft wiring introduced when the empty state started
    // self-detecting the conversation type.
    const suggestion = emptyState.locator(`[data-testid="team-chat-empty-state-suggestion-${SUGGESTION_CLICK_KEY}"]`);
    await suggestion.scrollIntoViewIfNeeded();
    await suggestion.click();

    // The chat send-box textarea placeholder starts with "Send message to" / "发送消息到".
    // We scope via this placeholder so the sidebar search textarea never matches first.
    const chatInput = page.locator('textarea[placeholder^="Send message"], textarea[placeholder^="发送消息"]').first();
    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `tests/e2e/results/team-empty-${leaderType}-after-click.png` });
    await expect(chatInput).toHaveValue(EXPECTED_DEBATE_VALUE, { timeout: 5000 });

    await page.screenshot({ path: `tests/e2e/results/team-empty-${leaderType}-filled.png` });

    // Cleanup: remove the team so the sidebar (and global conversation list) doesn't
    // accumulate leftover items that can shadow locators in later runs.
    await invokeBridge(page, 'team.remove', { id: teamId }).catch(() => {});
  });
}
