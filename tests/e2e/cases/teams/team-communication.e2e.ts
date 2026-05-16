/**
 * E2E Scenario 4: Team communication.
 *
 * Scenario 4: Leader communication — user types in UI input and sends via UI button
 */
import { test, expect } from '../../fixtures';
import { invokeBridge, navigateTo } from '../../helpers';

test.describe('Team Communication', () => {
  test('scenario 4: send message to leader via UI input', async ({ page }) => {
    test.setTimeout(120_000);
    // [setup] Find or create "E2E Test Team" — self-contained, no dependency on team-create.e2e.ts
    const allTeams = await invokeBridge<Array<{ id: string; name: string }>>(page, 'team.list', {
      user_id: 'system_default_user',
    });
    let teamId: string;
    const existing = allTeams.find((t) => t.name === 'E2E Test Team');
    if (existing) {
      teamId = existing.id;
    } else {
      const created = await invokeBridge<{ id: string }>(page, 'team.create', {
        name: 'E2E Test Team',
        agents: [
          {
            name: 'Leader',
            role: 'lead',
            backend: 'gemini',
            // Send a real gemini model alias. 'auto' maps to aioncli-core
            // PREVIEW_GEMINI_MODEL_AUTO (gemini-3.1-pro-preview). Sending just
            // "gemini" (the backend type) persists as use_model: null and
            // disables the sendbox. See mnemo #297.
            model: 'auto',
          },
        ],
      });
      teamId = created.id;
    }
    expect(teamId).toBeTruthy();

    // Navigate to team page by clicking sidebar entry
    await navigateTo(page, '#/team/' + teamId);
    await page.waitForURL(/\/team\//, { timeout: 10000 });

    // Screenshot: team page loaded
    await page.screenshot({ path: 'tests/e2e/results/team-comm-01-before.png' });

    // Find the leader chat input and type a message via UI
    const chatInput = page.locator('textarea').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('Hello from E2E test');
    await page.screenshot({ path: 'tests/e2e/results/team-comm-02-typed.png' });

    // Use keyboard Enter to send (works regardless of button selector)
    await chatInput.press('Enter');

    // Wait for message to appear in chat
    await expect(page.locator('text=Hello from E2E test').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/e2e/results/team-comm-03-sent.png' });

    // Wait for leader AI reply
    // Source: src/renderer/pages/conversation/Messages/MessageList.tsx L101-109
    // MessageItem wrapper renders `message-item <message.type> justify-start` for left-positioned replies.
    // Using `.justify-start` without `.text` so tips/thinking/text all count as an AI reply.
    const aiMsgSelector = '.message-item.justify-start';
    const msgCountBefore = await page.locator(aiMsgSelector).count();
    await expect
      .poll(async () => page.locator(aiMsgSelector).count(), {
        timeout: 90_000,
        message: 'Waiting for leader AI reply',
      })
      .toBeGreaterThan(msgCountBefore);
    await page.screenshot({ path: 'tests/e2e/results/team-comm-04-ai-replied.png' });

    // Verify team is still functional
    const teamState = await invokeBridge<{ id: string; agents: Array<{ slot_id: string }> }>(page, 'team.get', {
      id: teamId,
    });
    expect(teamState).toBeTruthy();
    expect(teamState.id).toBe(teamId);
  });
});
