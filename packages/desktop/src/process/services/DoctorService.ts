/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import { captureAgentDiagnosticFailure } from '../../sentry';
import { ipcBridge } from '@/common';
import type { ManagedCliInstallTarget } from '@/common/types/agent/managedCliInstaller';

type RepairAttempt = {
  source: 'bundled' | 'mirror' | 'official';
  success: boolean;
  error?: string;
};

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

type RepairResult = { success: boolean; source: string | null; error: string | null };

// Debounce: don't report the same issue within 24h
const reportedIssues = new Map<string, number>();

function shouldReportIssue(issueKey: string): boolean {
  const lastReported = reportedIssues.get(issueKey);
  if (!lastReported) return true;
  return Date.now() - lastReported > 24 * 60 * 60 * 1000;
}

function markIssueReported(issueKey: string): void {
  reportedIssues.set(issueKey, Date.now());
}

async function diagnose(): Promise<AgentDiagnosticReport> {
  try {
    const report = await httpRequest<AgentDiagnosticReport>('GET', '/api/doctor/diagnose');
    return (
      report ?? {
        agents: [],
        runtimes: {},
        acpBridges: {},
        summary: { healthy: false, issues: ['Backend health check failed'] },
      }
    );
  } catch {
    // Backend not ready or doctor API not available
    return {
      agents: [],
      runtimes: {},
      acpBridges: {},
      summary: { healthy: false, issues: ['Backend health check failed'] },
    };
  }
}

async function repairViaBackend(target: string): Promise<RepairResult> {
  try {
    const result = await httpRequest<RepairResult>('POST', '/api/doctor/repair', { target });
    return result ?? { success: false, source: null, error: 'Empty response from backend' };
  } catch (err) {
    return { success: false, source: null, error: String(err) };
  }
}

/**
 * Map a human-readable agent name or backend id to a managed CLI target.
 * The doctor API returns names like "Claude Code", "Codex CLI", "Hermes",
 * but installManagedCli expects 'claude', 'codex', 'hermes', etc.
 */
function resolveCliTarget(agentName: string, backend: string | null): ManagedCliInstallTarget | null {
  const normalized = (agentName + (backend ?? '')).toLowerCase();
  const targets: ManagedCliInstallTarget[] = ['hermes', 'openclaw', 'claude', 'codex', 'opencode'];
  for (const target of targets) {
    if (normalized.includes(target)) return target;
  }
  // Also try matching by backend directly
  if (backend) {
    const be = backend.toLowerCase();
    for (const target of targets) {
      if (be === target) return target;
    }
  }
  return null;
}

async function repairFromBundled(agentName: string, backend: string | null): Promise<RepairResult> {
  // Try to install from bundled resources
  const target = resolveCliTarget(agentName, backend);
  if (!target) {
    return { success: false, source: 'bundled', error: `No managed CLI target for '${agentName}'` };
  }
  try {
    const result = await ipcBridge.managedCliInstaller.install.invoke({ target });
    return { success: result.success, source: 'bundled', error: result.message };
  } catch (err) {
    return { success: false, source: 'bundled', error: String(err) };
  }
}

/**
 * Startup self-check: diagnose all agents and auto-repair issues.
 * Called from handleAppReady after backend is healthy.
 * Silently fixes issues; only reports to Sentry on total failure.
 */
export async function startupSelfCheck(): Promise<void> {
  console.log('[DoctorService] Running startup self-check...');

  const report = await diagnose();

  if (report.summary.healthy) {
    console.log('[DoctorService] All agents healthy.');
    return;
  }

  const issues = report.summary.issues;
  console.log(`[DoctorService] Found ${issues.length} issues: ${issues.join(', ')}`);

  // Log detailed agent status for diagnostics
  for (const agent of report.agents) {
    console.log(
      `[DoctorService]   ${agent.name} (backend=${agent.backend ?? 'none'}): available=${agent.available}` +
        (agent.reason ? ` error=${agent.reason}` : '')
    );
  }

  for (const agent of report.agents) {
    if (agent.available) continue;

    const repairAttempts: RepairAttempt[] = [];

    // Try bundled
    console.log(`[DoctorService] Repairing ${agent.name}: trying bundled install...`);
    const bundledResult = await repairFromBundled(agent.name, agent.backend);
    repairAttempts.push({ source: 'bundled', success: bundledResult.success, error: bundledResult.error ?? undefined });

    if (!bundledResult.success) {
      // Try backend repair (re-materialize from cached resources)
      console.log(`[DoctorService] Repairing ${agent.name}: bundled failed, trying backend mirror...`);
      const backendResult = await repairViaBackend(agent.name);
      repairAttempts.push({
        source: 'mirror',
        success: backendResult.success,
        error: backendResult.error ?? undefined,
      });
    }

    // If all repair attempts failed, report to Sentry silently
    const allFailed = repairAttempts.every((a) => !a.success);
    if (allFailed) {
      const issueKey = `agent:${agent.name}`;
      const errors = repairAttempts.map((a) => `${a.source}: ${a.error ?? 'unknown error'}`).join('; ');
      console.error(`[DoctorService] All repair attempts failed for ${agent.name}: ${errors}`);
      if (shouldReportIssue(issueKey)) {
        captureAgentDiagnosticFailure(agent, repairAttempts);
        markIssueReported(issueKey);
      }
    } else {
      console.log(`[DoctorService] ${agent.name} repaired successfully`);
    }
  }
}

/**
 * Called when an agent error occurs during runtime.
 * Attempts a quick repair without disrupting the user.
 */
export async function onAgentError(agentName: string, errorCode: string): Promise<void> {
  if (errorCode !== 'CLI_UNAVAILABLE' && errorCode !== 'STARTUP_CRASH') return;

  const issueKey = `agent:${agentName}:${errorCode}`;
  if (!shouldReportIssue(issueKey)) return;

  console.log(`[DoctorService] Agent error: ${agentName} (${errorCode}), attempting repair...`);
  await repairFromBundled(agentName, null);
  markIssueReported(issueKey);
}
