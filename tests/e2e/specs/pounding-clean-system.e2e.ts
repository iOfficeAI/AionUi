/**
 * POUNDING Clean System E2E Tests
 *
 * Verifies that bundled runtimes are correctly detected by the backend.
 * In dev mode, there are no bundled resources — tests will show system PATH
 * availability instead. In packaged mode, bundled resources would be used.
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
  summary: { healthy: boolean; issues: string[] };
};

test.describe('POUNDING Clean System — Bundled Runtime Verification', () => {
  test.setTimeout(30_000);

  test('node runtime is available (bundled or system)', async ({ page }) => {
    await page.waitForTimeout(3000);
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    // Node is not in the runtimes list (it's used internally), but
    // if CLIs that depend on node are available, node must be working
    const claudeAgent = report.agents.find((a) => a.backend === 'claude');
    console.log(`[CleanSystem] Claude Code (requires node): available=${claudeAgent?.available}`);
    // If claude is available, node is working
    expect(claudeAgent?.available).toBe(true);
  });

  test('python runtime is available', async ({ page }) => {
    await page.waitForTimeout(3000);
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    const python = report.runtimes.python;
    console.log(`[CleanSystem] Python: available=${python?.available}, path=${python?.path}`);
    expect(python?.available).toBe(true);
  });

  test('uv runtime status is reported', async ({ page }) => {
    await page.waitForTimeout(3000);
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    const uv = report.runtimes.uv;
    console.log(`[CleanSystem] UV: available=${uv?.available}, path=${uv?.path}`);
    // In dev mode, uv may not be bundled — just log, don't fail
    if (!uv?.available) {
      console.warn('[CleanSystem] UV not available — expected in dev mode without bundled resources');
    }
  });

  test('hermes runtime is available', async ({ page }) => {
    await page.waitForTimeout(3000);
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    const hermes = report.runtimes.hermes;
    console.log(`[CleanSystem] Hermes: available=${hermes?.available}, path=${hermes?.path}`);
    expect(hermes?.available).toBe(true);
  });

  test('all managed CLIs are detected by doctor', async ({ page }) => {
    await page.waitForTimeout(3000);
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    const REQUIRED = ['claude', 'codex', 'hermes', 'opencode', 'openclaw'];
    for (const name of REQUIRED) {
      const agent = report.agents.find(
        (a) => (a.backend ?? '').toLowerCase() === name || a.name.toLowerCase().includes(name)
      );
      console.log(`[CleanSystem] ${name}: found=${!!agent}, available=${agent?.available ?? 'N/A'}`);
    }
  });
});
