/**
 * Agent Management — Phase 2 diagnostics surface.
 *
 * The old Hub install modal is no longer exposed from Settings -> Agent.
 * This file keeps the branch-added coverage, but aligns it with the current
 * contract: management rows, repair navigation, no market/chat picker affordance,
 * and assistant pill integration from the unified assistant catalog.
 */
import { test, expect } from '../fixtures';
import { ASSISTANT_PILL, goToGuid, goToSettings, httpGet, waitForSettle } from '../helpers';

type ManagedAgent = {
  id: string;
  agent_type?: string;
  backend?: string;
  agent_source: 'internal' | 'builtin' | 'extension' | 'custom';
};

const DEPRECATED_RUNTIME_AGENT_TYPES = new Set(['nanobot', 'openclaw-gateway', 'remote', 'gemini']);

const LEGACY_TEXT = /Install from Market|从市场安装|Discover More Agents|发现更多 Agent|Start Chat|开始对话/;

function isVisibleManagedAgent(agent: ManagedAgent): boolean {
  return (
    agent.agent_source === 'custom' || !DEPRECATED_RUNTIME_AGENT_TYPES.has(agent.agent_type ?? agent.backend ?? '')
  );
}

test.describe('Agent Management Diagnostics — E2E', () => {
  test('settings agent page exposes diagnostics rows and hides legacy market actions', async ({ page }) => {
    const managedAgents = (await httpGet<ManagedAgent[]>(page, '/api/agents/management')).filter(isVisibleManagedAgent);

    await goToSettings(page, 'agent');
    await waitForSettle(page);

    await expect(page.locator('[data-testid="agent-management-page"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="agent-management-official-section"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="agent-management-custom-section"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('body')).not.toContainText(LEGACY_TEXT);

    for (const agent of managedAgents.slice(0, 4)) {
      await expect(page.locator(`[data-testid="agent-row-${agent.id}"]`)).toBeVisible({ timeout: 8_000 });
      await expect(page.locator(`[data-testid="agent-row-test-${agent.id}"]`)).toBeVisible({ timeout: 8_000 });
      await expect(page.locator(`[data-testid="agent-row-edit-${agent.id}"]`)).toBeVisible({ timeout: 8_000 });
    }
  });

  test('agent row edit action opens the repair page', async ({ page }) => {
    const managedAgents = (await httpGet<ManagedAgent[]>(page, '/api/agents/management')).filter(isVisibleManagedAgent);
    const firstAgent = managedAgents[0];
    if (!firstAgent) {
      test.skip(true, 'No visible managed agents in this environment');
      return;
    }

    await goToSettings(page, 'agent');
    const editButton = page.locator(`[data-testid="agent-row-edit-${firstAgent.id}"]`);
    await expect(editButton).toBeVisible({ timeout: 8_000 });
    await editButton.click();

    await page.waitForFunction(
      (agentId) => window.location.hash.includes(`/settings/agent/${agentId}/repair`),
      firstAgent.id,
      { timeout: 8_000 }
    );
  });

  test('assistant pill bar on guid page renders available assistants', async ({ page }) => {
    await goToGuid(page);

    const pills = page.locator(ASSISTANT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });
    await expect.poll(async () => pills.count(), { timeout: 8_000 }).toBeGreaterThanOrEqual(1);
  });

  test('selecting an assistant in pill bar activates chat input', async ({ page }) => {
    await goToGuid(page);

    const pills = page.locator(ASSISTANT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 8_000 });
    await pills.first().click();

    await expect(page.locator('textarea, [contenteditable="true"], [role="textbox"]').first()).toBeVisible({
      timeout: 8_000,
    });
  });
});
