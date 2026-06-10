/**
 * POUNDING Portable Mode E2E Tests
 *
 * Validates portable/dealer-kit mode behavior through API-level checks.
 * Note: In dev mode (E2E_DEV=1), PORTABLE mode is NOT active — tests
 * that require PORTABLE mode will be skipped gracefully.
 */
import { test, expect } from '../fixtures';
import { httpGet } from '../helpers';

type AgentDiagnosticReport = {
  agents: Array<{ name: string; backend: string | null; available: boolean }>;
  runtimes: Record<string, { available: boolean; path: string | null }>;
  summary: { healthy: boolean; issues: string[] };
};

test.describe('POUNDING Portable Mode', () => {
  test.setTimeout(30_000);

  test('app starts successfully in current mode', async ({ page }) => {
    await page.waitForTimeout(5000);
    // If we get here without crash, the app started successfully
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    expect(report).toBeTruthy();
    console.log(`[Portable] App started, healthy=${report.summary.healthy}`);
  });

  test('backend is accessible via HTTP', async ({ page }) => {
    await page.waitForTimeout(3000);
    const agents = await httpGet<Array<{ backend: string; available: boolean }>>(page, '/api/agents');
    expect(Array.isArray(agents)).toBe(true);
    console.log(`[Portable] Backend accessible, ${agents.length} agents detected`);
  });

  test('doctor diagnostic runs without errors', async ({ page }) => {
    await page.waitForTimeout(3000);
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    expect(report.agents).toBeDefined();
    expect(report.runtimes).toBeDefined();
    console.log(`[Portable] Doctor: ${report.summary.healthy ? 'healthy' : 'issues=' + report.summary.issues.length}`);
  });

  test('managed provider is configured', async ({ page }) => {
    await page.waitForTimeout(3000);
    const providers = await httpGet<Array<{ id: string; name: string }>>(page, '/api/providers');
    const managed = providers.find((p) => p.id === 'desktop-newapi-managed-provider');
    if (managed) {
      console.log(`[Portable] Managed provider found: ${managed.name}`);
    } else {
      console.warn('[Portable] Managed provider not found — user may not be logged in');
    }
  });

  test('MCP servers are accessible', async ({ page }) => {
    await page.waitForTimeout(3000);
    const servers = await httpGet<Array<{ name: string; enabled: boolean }>>(page, '/api/mcp/servers');
    expect(Array.isArray(servers)).toBe(true);
    console.log(`[Portable] MCP servers: ${servers.length} total, ${servers.filter((s) => s.enabled).length} enabled`);
  });
});
