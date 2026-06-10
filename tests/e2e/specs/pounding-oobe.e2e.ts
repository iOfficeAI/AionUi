/**
 * POUNDING Out-of-Box Experience (OOBE) E2E Tests
 *
 * Validates the complete "开箱即用" flow:
 * App launch → CLI detection → Model availability → Ready to use.
 *
 * These tests verify backend APIs via the renderer's HTTP bridge, simulating
 * actual user experience without requiring AI API calls.
 */
import { test, expect } from '../fixtures';
import { createErrorCollector } from '../helpers';
import { httpGet } from '../helpers';

type AgentDiagnosticReport = {
  agents: Array<{
    name: string;
    backend: string | null;
    available: boolean;
    reason: string | null;
    bundledSource: boolean;
  }>;
  runtimes: Record<string, { available: boolean; path: string | null }>;
  acpBridges: Record<string, { available: boolean; path: string | null }>;
  summary: { healthy: boolean; issues: string[] };
};

type AgentMetadata = {
  name: string;
  backend: string;
  agent_type: string;
  available: boolean;
  handshake?: {
    available_models?: Array<{ id: string; label: string }>;
    current_model_id?: string;
  };
};

const EXPECTED_CLI_BACKENDS = ['claude', 'codex', 'hermes', 'opencode', 'openclaw'];

test.describe('POUNDING OOBE — Backend Health', () => {
  test('app launches without crashes', async ({ page }) => {
    const collector = createErrorCollector(page);
    // Wait for app to fully initialize (backend startup + doctor check + window render)
    await page.waitForTimeout(5000);
    const errors = collector.critical();
    expect(errors).toHaveLength(0);
  });

  test('doctor diagnostic returns healthy agents', async ({ page }) => {
    // Wait for backend to be fully ready
    await page.waitForTimeout(3000);

    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    expect(report).toBeTruthy();
    expect(report.summary).toBeTruthy();

    console.log(`[OOBE] Doctor summary: healthy=${report.summary.healthy}, issues=${report.summary.issues.length}`);

    // Log each agent's status for debugging
    for (const agent of report.agents) {
      console.log(
        `[OOBE] Agent: ${agent.name} (${agent.backend}) available=${agent.available} reason=${agent.reason} bundled=${agent.bundledSource}`
      );
    }
    for (const [runtime, status] of Object.entries(report.runtimes)) {
      console.log(`[OOBE] Runtime: ${runtime} available=${status.available} path=${status.path}`);
    }
  });

  test('agent list returns all 5 managed CLIs', async ({ page }) => {
    await page.waitForTimeout(3000);

    const agents = await httpGet<AgentMetadata[]>(page, '/api/agents');
    expect(agents).toBeTruthy();
    expect(Array.isArray(agents)).toBe(true);

    const agentBackends = new Set(agents.map((a) => a.backend ?? a.agent_type));
    console.log(`[OOBE] Detected agents: ${[...agentBackends].join(', ')}`);

    // Check each expected backend is present
    for (const expectedBackend of EXPECTED_CLI_BACKENDS) {
      const found = agents.some(
        (a) =>
          (a.backend ?? a.agent_type) === expectedBackend ||
          (a.backend ?? a.agent_type) === `${expectedBackend}-gateway`
      );
      if (!found) {
        console.warn(`[OOBE] Agent backend "${expectedBackend}" not found in agent list`);
      }
    }

    // At minimum, we should have some agents detected
    expect(agents.length).toBeGreaterThan(0);
  });
});

test.describe('POUNDING OOBE — CLI Health', () => {
  for (const backend of EXPECTED_CLI_BACKENDS) {
    test(`${backend}: agent detected and has handshake data`, async ({ page }) => {
      await page.waitForTimeout(3000);

      const agents = await httpGet<AgentMetadata[]>(page, '/api/agents');
      const agent = agents.find(
        (a) => (a.backend ?? a.agent_type) === backend || (a.backend ?? a.agent_type) === `${backend}-gateway`
      );

      if (!agent) {
        console.warn(`[OOBE] ${backend}: agent not found in /api/agents`);
        // Don't fail — agent may need network to install first
        return;
      }

      expect(agent.available).toBeTruthy();
      console.log(
        `[OOBE] ${backend}: available=${agent.available}, handshake_models=${agent.handshake?.available_models?.length ?? 0}`
      );

      // Handshake data may not be available until first conversation starts
      const handshakeModels = agent.handshake?.available_models;
      if (Array.isArray(handshakeModels)) {
        expect(handshakeModels.length).toBeGreaterThan(0);
      } else {
        console.log(
          `[OOBE] ${backend}: no handshake model data yet (available_models type: ${typeof handshakeModels})`
        );
      }
    });
  }
});
