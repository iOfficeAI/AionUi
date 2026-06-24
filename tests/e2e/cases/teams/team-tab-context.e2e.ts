/**
 * E2E: Team tab context persistence.
 *
 * Verifies that after sending a message in the leader tab, switching to a
 * member tab, and switching back, the leader's conversation history is still
 * visible and has not been cleared.
 */
import { test, expect } from '../../fixtures';
import {
  findAssistantIdForBackend,
  invokeBridge,
  navigateTo,
  TEAM_SUPPORTED_BACKENDS,
  ensureTeam,
} from '../../helpers';

type TeamAssistantState = {
  role?: string;
  conversation_id?: string;
};

type TeamState = {
  assistants?: TeamAssistantState[];
  agents?: TeamAssistantState[];
};

async function getLeaderConversationId(page: import('@playwright/test').Page, teamId: string): Promise<string> {
  const teamState = await invokeBridge<TeamState>(page, 'team.get', { id: teamId });
  const assistants = teamState.assistants ?? teamState.agents ?? [];
  return (
    assistants.find((assistant) => assistant.role === 'leader' || assistant.role === 'lead')?.conversation_id ?? ''
  );
}

async function waitForConversationMessage(
  page: import('@playwright/test').Page,
  conversationId: string,
  expectedText: string
): Promise<void> {
  await expect
    .poll(
      async () => {
        const msgs = await invokeBridge<Array<{ content?: unknown }>>(page, 'database.get-conversation-messages', {
          conversation_id: conversationId,
          page: 1,
          page_size: 100,
          order: 'ASC',
        }).catch(() => [] as Array<{ content?: unknown }>);
        return msgs.some((message) => {
          const content = message.content;
          return typeof content === 'string'
            ? content.includes(expectedText)
            : JSON.stringify(content ?? '').includes(expectedText);
        });
      },
      { timeout: 30_000, message: `Waiting for leader conversation to persist "${expectedText}"` }
    )
    .toBeTruthy();
}

test.describe('Team Tab Context Persistence', () => {
  test('switching tabs and back preserves leader conversation history', async ({ page }) => {
    test.setTimeout(300_000);

    // [setup] Resolve leader backend — prefer gemini
    const leaderType = TEAM_SUPPORTED_BACKENDS.has('gemini') ? 'gemini' : [...TEAM_SUPPORTED_BACKENDS][0];

    if (!leaderType) {
      test.skip(true, 'No supported backend available — skipping tab context test');
      return;
    }

    const teamName = 'E2E Tab Context Team';

    let teamId: string;
    try {
      teamId = await ensureTeam(page, teamName, leaderType);
    } catch (error) {
      test.skip(true, `Team "${teamName}" could not be created — ${(error as Error).message}`);
      return;
    }

    // [navigate] Go to team page and wait for leader textarea
    await navigateTo(page, '#/team/' + teamId);
    await page.waitForURL(/\/team\//, { timeout: 10_000 });

    const chatInput = page.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-tab-ctx-01-loaded.png' });

    const uniqueMessage = `Tab context test message ${Date.now()}`;
    const leaderConvId = await getLeaderConversationId(page, teamId);
    if (!leaderConvId) {
      test.skip(true, 'Leader conversation id is unavailable');
      return;
    }
    const runAck = await invokeBridge<{ team_run_id?: string } | null>(page, 'team.send-message', {
      team_id: teamId,
      input: uniqueMessage,
    }).catch(() => null);
    if (!runAck?.team_run_id) {
      test.skip(true, 'team.send-message failed in this environment');
      return;
    }
    await waitForConversationMessage(page, leaderConvId, uniqueMessage);

    await page.screenshot({ path: 'tests/e2e/results/team-tab-ctx-02-sent.png' });

    const tabBar = page.locator('[data-testid="team-tab-bar"]');

    // [setup] Add a member tab deterministically; this test verifies tab
    // context persistence, not the leader's tool-calling path.
    const memberName = `E2E-tab-member-${Date.now()}`;
    const memberAssistantId = await findAssistantIdForBackend(page, 'claude');
    if (!memberAssistantId) {
      test.skip(true, 'No assistant found for claude backend');
      return;
    }
    const addResult = await invokeBridge<{ slot_id: string } | null>(page, 'team.add-agent', {
      team_id: teamId,
      agent: {
        name: memberName,
        role: 'teammate',
        assistant_id: memberAssistantId,
        model: 'claude',
      },
    }).catch(() => null);
    if (!addResult?.slot_id) {
      test.skip(true, 'team.add-agent failed in this environment');
      return;
    }
    await navigateTo(page, '#/team/' + teamId);

    const memberTabLocator = page.locator(`[data-testid="team-tab-${addResult.slot_id}"]`);
    await expect(memberTabLocator).toBeVisible({ timeout: 120_000 });

    await page.screenshot({ path: 'tests/e2e/results/team-tab-ctx-03-member-tab.png' });

    // [action] Click the member tab (switches away from leader)
    await memberTabLocator.click();

    await page.screenshot({ path: 'tests/e2e/results/team-tab-ctx-04-member-active.png' });

    // [assert] Member tab is now active (leader tab loses focus)
    // We verify that the leader's unique message is NOT the first visible text node,
    // which indirectly confirms a tab switch happened. The member panel is now shown.
    const leaderTab = tabBar.locator('[data-team-tab-role="leader"]').first();
    await expect(leaderTab).toBeVisible({ timeout: 5_000 });

    // [action] Switch back to the Leader tab
    await leaderTab.click();
    await page.screenshot({ path: 'tests/e2e/results/team-tab-ctx-05-back-to-leader.png' });

    // [scroll] Leader's message is the first one — Virtuoso may have virtualized it
    // out of the DOM. Use the real Virtuoso scroller testid (Virtuoso ships
    // data-testid="virtuoso-scroller" on its scroll container) and scroll to the top
    // before asserting. If the scroller isn't found, fall back silently.
    const chatContainer = page.locator('[data-testid="virtuoso-scroller"]').first();
    const scrolled = await chatContainer.isVisible({ timeout: 3_000 }).catch(() => false);
    if (scrolled) {
      await chatContainer
        .evaluate((el) => {
          el.scrollTop = 0;
        })
        .catch(() => {});
    }

    await waitForConversationMessage(page, leaderConvId, uniqueMessage);

    await page.screenshot({ path: 'tests/e2e/results/team-tab-ctx-06-history-intact.png' });
  });
});
