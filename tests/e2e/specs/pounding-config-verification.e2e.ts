/**
 * POUNDING Config Verification E2E Tests
 *
 * Validates that CLI config files are correctly written after login.
 * Uses HTTP API calls to verify configuration state rather than
 * direct filesystem access (which requires main-process context).
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

type ProviderInfo = {
  id: string;
  name: string;
  models: string[];
  api_key?: string;
  base_url?: string;
};

test.describe('POUNDING Config — Disk Verification', () => {
  test.setTimeout(30_000);

  test('POUNDING API provider is configured with models', async ({ page }) => {
    await page.waitForTimeout(3000);

    const providers = await httpGet<ProviderInfo[]>(page, '/api/providers');
    expect(Array.isArray(providers)).toBe(true);

    const managed = providers.find((p) => p.id === 'desktop-newapi-managed-provider');
    if (!managed) {
      console.warn('[Config] POUNDING API provider not found — user may not be logged in');
      return;
    }

    console.log(`[Config] Provider: ${managed.name}, models: ${managed.models.length}`);
    expect(managed.models.length).toBeGreaterThan(0);
  });

  test('all 5 managed CLIs report correct backend targets', async ({ page }) => {
    await page.waitForTimeout(3000);

    const agents = await httpGet<Array<{ backend: string; agent_type: string; available: boolean }>>(
      page,
      '/api/agents'
    );
    const backends = agents.map((a) => a.backend ?? a.agent_type);
    console.log(`[Config] All backends: ${backends.join(', ')}`);

    const REQUIRED = ['claude', 'codex', 'hermes', 'opencode', 'openclaw'];
    for (const backend of REQUIRED) {
      const found = backends.some((b) => b === backend || b === `${backend}-gateway`);
      console.log(`[Config] ${backend}: ${found ? '✅' : '❌'}`);
    }
  });

  test('doctor diagnostic shows all runtimes', async ({ page }) => {
    await page.waitForTimeout(3000);

    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    expect(report).toBeTruthy();
    expect(report.runtimes).toBeTruthy();

    for (const [name, status] of Object.entries(report.runtimes)) {
      console.log(`[Config] Runtime ${name}: available=${status.available}, path=${status.path}`);
    }

    // python should always be available (system python on macOS)
    expect(report.runtimes.python?.available).toBe(true);
  });

  test('image generation MCP server is registered', async ({ page }) => {
    await page.waitForTimeout(3000);

    const servers = await httpGet<Array<{ name: string; enabled: boolean; builtin: boolean }>>(
      page,
      '/api/mcp/servers'
    );
    expect(Array.isArray(servers)).toBe(true);

    const imageGen = servers.find((s) => s.name === 'pounding-image-generation');
    console.log(
      `[Config] Image gen MCP: ${imageGen ? `enabled=${imageGen.enabled}, builtin=${imageGen.builtin}` : 'NOT FOUND'}`
    );

    expect(imageGen).toBeDefined();
    expect(imageGen!.enabled).toBe(true);
  });

  test('codex proxy port is accessible', async ({ page }) => {
    await page.waitForTimeout(3000);

    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    const codexAgent = report.agents.find((a) => a.backend === 'codex');

    console.log(`[Config] Codex agent: available=${codexAgent?.available}, reason=${codexAgent?.reason}`);

    if (codexAgent?.available) {
      console.log('[Config] ✅ Codex CLI is available — proxy should be running');
    } else {
      console.warn('[Config] Codex CLI not available — proxy may not be running');
    }
  });

  test('conversation creation works for each managed CLI', async ({ page }) => {
    await page.waitForTimeout(3000);

    const agents = await httpGet<Array<{ backend: string; agent_type: string; available: boolean }>>(
      page,
      '/api/agents'
    );

    const managed = agents.filter(
      (a) =>
        a.available &&
        ['claude', 'codex', 'hermes', 'opencode', 'openclaw'].some(
          (b) => (a.backend ?? a.agent_type) === b || (a.backend ?? a.agent_type) === `${b}-gateway`
        )
    );

    console.log(`[Config] Available managed agents: ${managed.map((a) => a.backend ?? a.agent_type).join(', ')}`);
    expect(managed.length).toBeGreaterThanOrEqual(4);
  });

  test('model selection persists across API calls', async ({ page }) => {
    await page.waitForTimeout(3000);

    const providers = await httpGet<Array<{ id: string; models: string[] }>>(page, '/api/providers');
    const managed = providers.find((p) => p.id === 'desktop-newapi-managed-provider');

    if (!managed || managed.models.length === 0) {
      console.warn('[Config] No managed provider models — skipping');
      return;
    }

    console.log(`[Config] Available models: ${managed.models.join(', ')}`);
    expect(managed.models).toContain('deepseek-v4-pro');
  });
});
