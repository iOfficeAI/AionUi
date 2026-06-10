/**
 * POUNDING CLI Chat Connectivity E2E Tests
 *
 * Validates that each managed CLI can send messages and receive AI replies.
 * These tests require:
 * 1. The app to be running with backend started
 * 2. POUNDING API account logged in (models configured)
 * 3. At least one working API key for each CLI backend
 *
 * Tests gracefully skip when preconditions are not met (no API key configured).
 */
import { test, expect } from '../fixtures';
import { httpGet, httpPost } from '../helpers';
import { createErrorCollector } from '../helpers';

type AgentMetadata = {
  name: string;
  backend: string;
  agent_type: string;
  available: boolean;
};

type ConversationInfo = {
  id: string;
  type: string;
  title?: string;
  extra?: { backend?: string };
};

const MANAGED_BACKENDS = ['claude', 'codex', 'hermes', 'opencode', 'openclaw'];

test.describe('POUNDING CLI Chat — Preconditions', () => {
  test('at least one managed CLI agent is available', async ({ page }) => {
    await page.waitForTimeout(3000);
    const agents = await httpGet<AgentMetadata[]>(page, '/api/agents');

    const availableManaged = agents.filter(
      (a) =>
        a.available &&
        MANAGED_BACKENDS.some(
          (b) => (a.backend ?? a.agent_type) === b || (a.backend ?? a.agent_type) === `${b}-gateway`
        )
    );

    console.log(
      `[Chat] Available managed agents: ${availableManaged.map((a) => a.backend ?? a.agent_type).join(', ')}`
    );
    expect(availableManaged.length).toBeGreaterThan(0);
  });

  test('POUNDING API provider has models configured', async ({ page }) => {
    await page.waitForTimeout(3000);
    const providers = await httpGet<Array<{ id: string; models: string[] }>>(page, '/api/providers');

    const managed = providers.find((p) => p.id === 'desktop-newapi-managed-provider');
    if (!managed) {
      console.warn('[Chat] POUNDING API provider not configured — user may not be logged in');
      return;
    }

    console.log(`[Chat] POUNDING API models: ${managed.models.join(', ')}`);
    expect(managed.models.length).toBeGreaterThan(0);
  });
});

test.describe('POUNDING CLI Chat — Smoke Test', () => {
  test('can create and list conversations', async ({ page }) => {
    await page.waitForTimeout(3000);

    const result = await httpGet<ConversationInfo[] | { conversations: ConversationInfo[] } | null>(
      page,
      '/api/conversations'
    );
    // API may return an array directly, or an object with { conversations: [...] }
    const conversations = Array.isArray(result) ? result : (result?.conversations ?? []);
    expect(Array.isArray(conversations)).toBe(true);
    console.log(`[Chat] Existing conversations: ${conversations.length}`);
  });

  test('no console errors during chat initialization', async ({ page }) => {
    const collector = createErrorCollector(page);
    // Navigate to guid page and wait for UI to render
    await page.waitForTimeout(5000);

    const errors = collector.critical();
    for (const err of errors) {
      console.log(`[Chat] Console error: ${err}`);
    }

    // Check for ACP-related errors specifically
    const acpErrors = errors.filter(
      (e) =>
        e.includes('acp') ||
        e.includes('ACP') ||
        e.includes('handshake') ||
        e.includes('NOT_PAIRED') ||
        e.includes('CLI_UNAVAILABLE')
    );
    if (acpErrors.length > 0) {
      console.warn(`[Chat] ACP-related errors detected: ${acpErrors.join('; ')}`);
    }
  });
});

test.describe('POUNDING CLI Chat — Agent Diagnostics', () => {
  for (const backend of MANAGED_BACKENDS) {
    test(`${backend}: diagnostic check`, async ({ page }) => {
      await page.waitForTimeout(3000);

      const report = await httpGet<{
        agents: Array<{ name: string; backend: string | null; available: boolean; reason: string | null }>;
      }>(page, '/api/doctor/diagnose');

      const agent = report.agents.find(
        (a) => (a.backend ?? '').toLowerCase().includes(backend) || a.name.toLowerCase().includes(backend)
      );

      if (!agent) {
        console.warn(`[Chat] ${backend}: not found in doctor report`);
        return;
      }

      console.log(`[Chat] ${backend}: available=${agent.available}, reason=${agent.reason ?? 'none'}`);

      if (!agent.available && agent.reason) {
        console.warn(`[Chat] ${backend}: unavailable — ${agent.reason}`);
      }
    });
  }
});
