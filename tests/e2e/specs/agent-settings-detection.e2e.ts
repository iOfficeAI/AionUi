/**
 * Agent Settings Detection — diagnostics-only E2E tests.
 *
 * Phase 2 turns Agent Settings into a management/diagnostics surface rather
 * than a business-facing picker. These tests lock the page to that contract:
 * - sections come from `/api/agents/management`
 * - official/custom buckets stay visible
 * - a troubleshoot/repair affordance exists per agent
 * - legacy market/chat/preset affordances do not reappear
 */
import { test, expect } from '../fixtures';
import { goToSettings, expectUrlContains, settingsSiderItemById, httpGet } from '../helpers';

type ManagedAgent = {
  id: string;
  name: string;
  agent_type?: string;
  backend?: string;
  agent_source: 'internal' | 'builtin' | 'extension' | 'custom';
  status?: 'online' | 'offline' | 'missing';
};

const DEPRECATED_RUNTIME_AGENT_TYPES = new Set(['nanobot', 'openclaw-gateway', 'remote', 'gemini']);

const TEXT = {
  customAgents: ['Custom Agents', '自定义 Agents'],
  setupGuide: ['Setup guide', '查看安装指南'],
  // The custom-agent editor is now opened from an "Add" button in the
  // custom-agents section header (was a "Detect Custom Agent" text link).
  addCustomAgent: ['Add', '添加'],
  testConnection: ['Test Connection', '测试连接'],
  commandLabel: ['Command', '命令'],
  commandPlaceholder: ['e.g. my-agent or /usr/local/bin/my-agent', '例如 my-agent 或 /usr/local/bin/my-agent'],
  installFromMarket: ['Install from Market', '从市场安装'],
  discoverMoreAgents: ['Discover More Agents', '发现更多 Agent'],
  startChat: ['Start Chat', '开始对话'],
} as const;

async function expectAnyText(page: Parameters<typeof test>[0]['page'], candidates: readonly string[]) {
  await expect
    .poll(async () => {
      const body = await page.locator('body').textContent();
      return candidates.some((candidate) => body?.includes(candidate));
    })
    .toBeTruthy();
}

async function expectNoText(page: Parameters<typeof test>[0]['page'], candidates: readonly string[]) {
  const body = (await page.locator('body').textContent()) ?? '';
  for (const candidate of candidates) {
    expect(body).not.toContain(candidate);
  }
}

test.describe('Agent Settings Detection', () => {
  test('renders the management catalog buckets and mirrors diagnostics rows', async ({ page }) => {
    const managedAgents = await httpGet<ManagedAgent[]>(page, '/api/agents/management');

    await goToSettings(page, 'agent');
    await expectUrlContains(page, 'agent');
    await expect(page.locator(settingsSiderItemById('agent')).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="agent-management-page"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="agent-management-custom-section"]')).toBeVisible({ timeout: 8_000 });

    await expectAnyText(page, TEXT.customAgents);
    await expectAnyText(page, TEXT.setupGuide);

    const visibleManagedAgents = managedAgents.filter(
      (agent) =>
        agent.agent_source === 'custom' || !DEPRECATED_RUNTIME_AGENT_TYPES.has(agent.agent_type ?? agent.backend ?? '')
    );

    for (const agent of visibleManagedAgents.slice(0, 4)) {
      await expect(page.locator(`[data-testid="agent-row-${agent.id}"]`)).toBeVisible({ timeout: 8_000 });
      await expect(page.locator(`[data-testid="agent-row-status-${agent.id}"]`)).toBeVisible({ timeout: 8_000 });
      await expect(page.locator(`[data-testid="agent-row-test-${agent.id}"]`)).toBeVisible({ timeout: 8_000 });
    }
  });

  test('keeps the page diagnostics-only and removes legacy market/chat affordances', async ({ page }) => {
    await goToSettings(page, 'agent');

    await expectAnyText(page, TEXT.customAgents);
    await expectNoText(page, TEXT.installFromMarket);
    await expectNoText(page, TEXT.discoverMoreAgents);
    await expectNoText(page, TEXT.startChat);
  });

  test('opens the custom agent editor from the diagnostics page', async ({ page }) => {
    await goToSettings(page, 'agent');

    await page.getByRole('button', { name: new RegExp(`^(${TEXT.addCustomAgent.join('|')})$`) }).click();

    await expectAnyText(page, TEXT.commandLabel);
    await expect(page.getByPlaceholder(new RegExp(TEXT.commandPlaceholder.join('|'))).first()).toBeVisible({
      timeout: 8_000,
    });

    await page.getByRole('button', { name: /Cancel|取消/ }).click();
    await expect(page.getByPlaceholder(new RegExp(TEXT.commandPlaceholder.join('|')))).toHaveCount(0);
  });

  test('re-entering the page keeps the diagnostics surface instead of legacy picker content', async ({ page }) => {
    await goToSettings(page, 'agent');
    await goToSettings(page, 'about');
    await goToSettings(page, 'agent');

    await expectAnyText(page, TEXT.customAgents);
    await expectAnyText(page, TEXT.setupGuide);
    await expectNoText(page, TEXT.installFromMarket);
    await expectNoText(page, TEXT.discoverMoreAgents);
  });
});
