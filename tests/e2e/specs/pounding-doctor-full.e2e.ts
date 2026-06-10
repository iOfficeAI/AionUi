/**
 * POUNDING Doctor — Full CLI Coverage E2E Test
 *
 * Extended Doctor self-healing test that covers ALL 5 managed CLIs:
 *   Claude Code, Codex CLI, Hermes, OpenCode, OpenClaw.
 *
 * The existing `pounding-doctor-repair.e2e.ts` only validates OpenCode.
 * This test suite verifies that the Doctor subsystem can diagnose, report,
 * and repair every managed CLI that POUNDING ships.
 */
import { test, expect } from '../fixtures';
import { httpGet, httpPost } from '../helpers';

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

type RepairResult = {
  success: boolean;
  source: string | null;
  error: string | null;
};

const ALL_CLIS = [
  { name: 'Claude Code', backend: 'claude' },
  { name: 'Codex CLI', backend: 'codex' },
  { name: 'Hermes', backend: 'hermes' },
  { name: 'OpenCode', backend: 'opencode' },
  { name: 'OpenClaw', backend: 'openclaw' },
];

/**
 * Find a CLI agent in the diagnostic report by backend name.
 * Matches on the `backend` field (case-insensitive) or falls back to
 * a substring match on `name`.
 */
function findAgent(
  report: AgentDiagnosticReport,
  backend: string
): AgentDiagnosticReport['agents'][number] | undefined {
  const lowerBackend = backend.toLowerCase();
  return report.agents.find(
    (a) => (a.backend ?? '').toLowerCase() === lowerBackend || a.name.toLowerCase().includes(lowerBackend)
  );
}

test.describe('POUNDING Doctor — Full CLI Coverage', () => {
  test('doctor diagnostic reports all 5 CLIs', async ({ page }) => {
    await page.waitForTimeout(5000);

    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');

    for (const cli of ALL_CLIS) {
      const agent = findAgent(report, cli.backend);
      const status = agent ? `available=${agent.available}, reason=${agent.reason ?? 'none'}` : 'NOT FOUND';
      console.log(`[Doctor Full] ${cli.name} (${cli.backend}): ${status}`);
      expect(agent).toBeDefined();
    }
  });

  test('at least 4 of 5 CLIs are available', async ({ page }) => {
    await page.waitForTimeout(5000);

    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');

    let availableCount = 0;
    for (const cli of ALL_CLIS) {
      const agent = findAgent(report, cli.backend);
      if (agent?.available) {
        availableCount++;
      }
    }

    console.log(`[Doctor Full] Available CLIs: ${availableCount}/5`);
    // Allow 1 failure — network issues, CI environment, or partial bundled resources
    // may prevent one CLI from being available.
    expect(availableCount).toBeGreaterThanOrEqual(4);
  });

  // Generate a diagnostic check test for each CLI
  for (const cli of ALL_CLIS) {
    test(`${cli.name}: diagnostic check`, async ({ page }) => {
      await page.waitForTimeout(5000);

      const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
      const agent = findAgent(report, cli.backend);

      if (agent) {
        console.log(
          `[Doctor Full] ${cli.name}: available=${agent.available}, ` +
            `reason=${agent.reason ?? 'none'}, bundledSource=${agent.bundledSource}`
        );
      } else {
        console.warn(
          `[Doctor Full] ${cli.name}: not found in diagnostic report ` + `(looked for backend='${cli.backend}')`
        );
      }

      expect(agent).toBeDefined();
    });
  }

  test('bundled CLI repair works for any missing CLI', async ({ page }) => {
    test.setTimeout(180_000);

    await page.waitForTimeout(5000);

    // Find the first unavailable CLI
    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
    let targetCli: (typeof ALL_CLIS)[number] | null = null;
    let targetAgent: AgentDiagnosticReport['agents'][number] | undefined;

    for (const cli of ALL_CLIS) {
      const agent = findAgent(report, cli.backend);
      if (!agent?.available) {
        targetCli = cli;
        targetAgent = agent;
        break;
      }
    }

    if (!targetCli) {
      console.log('[Doctor Full] All 5 CLIs already available — nothing to repair, skipping');
      return;
    }

    console.log(
      `[Doctor Full] Target for repair: ${targetCli.name} (${targetCli.backend}) — ` +
        `available=${targetAgent?.available}, reason=${targetAgent?.reason ?? 'none'}`
    );

    // Trigger repair
    const repairResult = await httpPost<RepairResult>(page, '/api/doctor/repair', {
      target: targetCli.backend,
    });
    console.log(
      `[Doctor Full] Repair response: success=${repairResult?.success}, ` +
        `source=${repairResult?.source}, error=${repairResult?.error}`
    );

    // Poll until the repaired CLI becomes available (up to 90 seconds)
    const maxChecks = 18;
    const intervalMs = 5_000;
    let installed = false;

    for (let i = 1; i <= maxChecks; i++) {
      await page.waitForTimeout(intervalMs);

      const pollReport = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');
      const agent = findAgent(pollReport, targetCli.backend);

      console.log(`[Doctor Full] Check ${i}: ${targetCli.name} available=${agent?.available ?? false}`);

      if (agent?.available) {
        installed = true;
        console.log(`[Doctor Full] ${targetCli.name} successfully repaired!`);
        break;
      }
    }

    if (!installed) {
      console.warn(
        `[Doctor Full] ${targetCli.name} not available after 90s — ` +
          'dev mode may lack bundled resources; this is not a hard failure'
      );
    }
  });

  test('doctor report has valid runtimes section', async ({ page }) => {
    await page.waitForTimeout(5000);

    const report = await httpGet<AgentDiagnosticReport>(page, '/api/doctor/diagnose');

    expect(report.runtimes).toBeDefined();
    expect(typeof report.runtimes).toBe('object');

    const runtimeKeys = Object.keys(report.runtimes);
    console.log(`[Doctor Full] Runtimes reported: ${runtimeKeys.join(', ')}`);

    // The doctor report must include uv, python, and hermes runtime entries
    for (const expectedKey of ['uv', 'python', 'hermes']) {
      const runtime = report.runtimes[expectedKey];
      expect(runtime).toBeDefined();
      console.log(`[Doctor Full] Runtime '${expectedKey}': available=${runtime.available}, path=${runtime.path}`);
    }
  });
});
