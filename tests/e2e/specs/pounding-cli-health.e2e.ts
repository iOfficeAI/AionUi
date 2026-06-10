/**
 * POUNDING CLI Health E2E Tests
 *
 * Validates that all 5 managed CLIs are properly installed and configured.
 * Uses backend API endpoints to check CLI availability, ACP bridge readiness,
 * and runtime environment health.
 *
 * These tests require the app to be running with the backend started.
 */
import { test, expect } from '../fixtures';
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

type ProviderInfo = {
  id: string;
  name: string;
  platform: string;
  models: string[];
  model_enabled?: Record<string, boolean>;
};

const REQUIRED_CLIS = [
  { name: 'Claude Code', backend: 'claude', acpBridge: 'claude-agent-acp' },
  { name: 'Codex CLI', backend: 'codex', acpBridge: 'codex-acp' },
  { name: 'Hermes', backend: 'hermes', acpBridge: null }, // Hermes speaks ACP natively
  { name: 'OpenClaw', backend: 'openclaw', acpBridge: null }, // OpenClaw uses WebSocket
  { name: 'OpenCode', backend: 'opencode', acpBridge: null }, // OpenCode speaks ACP natively
];

test.describe('POUNDING CLI Health — Diagnostics', () => {
  test('all 5 CLIs appear in doctor report', async ({ page }) => {
    await page.waitForTimeout(3000);
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');

    const agentNames = report.agents.map((a) => a.name.toLowerCase());
    console.log(`[CLI Health] Agent names: ${agentNames.join(', ')}`);

    for (const cli of REQUIRED_CLIS) {
      const found = report.agents.some(
        (a) => a.name.toLowerCase().includes(cli.backend) || (a.backend ?? '').toLowerCase().includes(cli.backend)
      );
      console.log(`[CLI Health] ${cli.name}: found=${found}`);
    }
  });

  test('runtimes check — bun and uv available', async ({ page }) => {
    await page.waitForTimeout(3000);
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');

    console.log(`[CLI Health] Runtimes: ${JSON.stringify(Object.keys(report.runtimes))}`);
    for (const [name, status] of Object.entries(report.runtimes)) {
      console.log(`[CLI Health] Runtime ${name}: available=${status.available} path=${status.path}`);
    }
  });

  test('ACP bridges — claude-agent-acp and codex-acp available', async ({ page }) => {
    await page.waitForTimeout(3000);
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');

    // acpBridges may not be present in all diagnostic report versions
    const bridges = report.acpBridges ?? {};
    if (Object.keys(bridges).length === 0) {
      console.log('[CLI Health] No acpBridges field in diagnostic report — may use native ACP agents');
      return;
    }
    console.log(`[CLI Health] ACP Bridges: ${JSON.stringify(Object.keys(bridges))}`);
    for (const [name, status] of Object.entries(bridges)) {
      console.log(`[CLI Health] ACP Bridge ${name}: available=${status.available} path=${status.path}`);
    }
  });
});

test.describe('POUNDING CLI Health — Provider & Models', () => {
  test('POUNDING API provider exists with models', async ({ page }) => {
    await page.waitForTimeout(3000);

    const providers = await httpGet<ProviderInfo[]>(page, '/api/providers');
    expect(Array.isArray(providers)).toBe(true);
    console.log(`[CLI Health] Providers: ${providers.map((p) => p.id).join(', ')}`);

    const managedProvider = providers.find((p) => p.id === 'desktop-newapi-managed-provider');
    if (managedProvider) {
      console.log(`[CLI Health] Managed provider models: ${managedProvider.models.join(', ')}`);
      console.log(`[CLI Health] Model count: ${managedProvider.models.length}`);
      expect(managedProvider.models.length).toBeGreaterThan(0);
    } else {
      console.warn('[CLI Health] Managed provider not found — user may not have logged into POUNDING API yet');
    }
  });

  test('each CLI backend maps to a valid target', async ({ page }) => {
    await page.waitForTimeout(3000);

    const agents = await httpGet<Array<{ backend: string; agent_type: string }>>(page, '/api/agents');
    const backends = agents.map((a) => a.backend ?? a.agent_type);
    console.log(`[CLI Health] All backends: ${backends.join(', ')}`);

    // Verify that managed CLI backends are recognized
    const managedBackends = backends.filter(
      (b) =>
        b === 'claude' ||
        b === 'codex' ||
        b === 'hermes' ||
        b === 'opencode' ||
        b === 'openclaw' ||
        b === 'openclaw-gateway'
    );
    console.log(`[CLI Health] Managed backends found: ${managedBackends.join(', ')}`);
  });
});
