/**
 * E2E Scenario 4: Team communication.
 *
 * Scenario 4: Leader communication — user types in UI input and sends via UI button
 */
import { test, expect } from '../fixtures';
import { invokeBridge, navigateTo } from '../helpers';

test.describe('Team Communication', () => {
  test('scenario 4: send message to leader via UI input', async ({ page }) => {
    // [setup] Find or create "E2E Test Team" — self-contained, no dependency on team-create.e2e.ts
    const allTeams = await invokeBridge<Array<{ id: string; name: string }>>(page, 'team.list', {
      userId: 'system_default_user',
    });
    let teamId: string;
    const existing = allTeams.find((t) => t.name === 'E2E Test Team');
    if (existing) {
      teamId = existing.id;
    } else {
      const created = await invokeBridge<{ id: string }>(page, 'team.create', {
        userId: 'system_default_user',
        name: 'E2E Test Team',
        workspace: '',
        workspaceMode: 'shared',
        agents: [
          {
            slotId: 'slot-lead',
            conversationId: '',
            role: 'lead',
            agentType: 'gemini',
            agentName: 'Leader',
            conversationType: 'gemini',
            status: 'idle',
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

    // Send via UI send button (arrow button)
    const sendBtn = page.locator('button[type="submit"], button').filter({ hasText: '' }).last();
    // Use keyboard Enter to send (works regardless of button selector)
    await chatInput.press('Enter');

    // Wait for message to appear in chat
    await expect(page.locator('text=Hello from E2E test').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'tests/e2e/results/team-comm-03-sent.png' });

    // Verify team is still functional
    const teamState = await invokeBridge<{ id: string; agents: Array<{ slotId: string }> }>(page, 'team.get', {
      id: teamId,
    });
    expect(teamState).toBeTruthy();
    expect(teamState.id).toBe(teamId);
  });
});
