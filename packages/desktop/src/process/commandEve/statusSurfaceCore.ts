/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolveCommandCenterReadModelSource } from './commandCenterReadModelCore';

export const COMMAND_EVE_STATUS_SURFACE_BRIDGE_VERSION = 'command-eve-status-surface-bridge/v0';
export const COMMAND_EVE_STATUS_SURFACE_SCHEMA_VERSION = 'command-eve-status-surface/v0';

export type CommandEveStatusSurfaceBridgeStatus = 'ready' | 'blocked' | 'failed';

export type CommandEveStatusSurfacePayload = {
  schema_version?: string;
  status?: 'READY' | 'CHECK' | 'BLOCK';
  status_label?: string;
  empty_states?: string[];
  blocked_actions?: string[];
  [key: string]: unknown;
};

export type CommandEveStatusSurfaceCommandResult = {
  ok: boolean;
  status?: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export type CommandEveStatusSurfaceRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }
) => Promise<CommandEveStatusSurfaceCommandResult>;

export type CommandEveStatusSurfaceBridgeResult = {
  version: typeof COMMAND_EVE_STATUS_SURFACE_BRIDGE_VERSION;
  ok: boolean;
  status: CommandEveStatusSurfaceBridgeStatus;
  reason_code?: string;
  message?: string;
  surface?: CommandEveStatusSurfacePayload;
  source: {
    company_os_root?: string;
    event_ledger?: string;
    status_surface_cli?: string;
    generated_by: 'company-os-status-surface-cli';
  };
};

export type CommandEveStatusSurfaceOptions = {
  companyOsRoot?: string;
  eventLedgerPath?: string;
  maxRuns?: number;
  nodeBinary?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  runner?: CommandEveStatusSurfaceRunner;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RUNS = 8;
const STATUS_SURFACE_CLI = 'scripts/operator-shell/command-eve-status-surface.mjs';

function normalizeMaxRuns(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_RUNS;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function baseResult(
  source: CommandEveStatusSurfaceBridgeResult['source']
): Pick<CommandEveStatusSurfaceBridgeResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_STATUS_SURFACE_BRIDGE_VERSION,
    source,
  };
}

export const defaultCommandEveStatusSurfaceRunner: CommandEveStatusSurfaceRunner = (command, args, options) =>
  new Promise((resolve) => {
    childProcess.execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const exitError = error as (Error & { code?: number | string | null; signal?: NodeJS.Signals | null }) | null;
        resolve({
          ok: !error,
          status: typeof exitError?.code === 'number' ? exitError.code : error ? 1 : 0,
          stdout,
          stderr,
          error: error?.message,
        });
      }
    );
  });

export async function buildCommandEveStatusSurface(
  options: CommandEveStatusSurfaceOptions = {}
): Promise<CommandEveStatusSurfaceBridgeResult> {
  const readModelSource = resolveCommandCenterReadModelSource({
    companyOsRoot: options.companyOsRoot,
    eventLedgerPath: options.eventLedgerPath,
    env: options.env,
  });
  const companyOsRoot = readModelSource.company_os_root;
  const cliPath = companyOsRoot ? path.join(companyOsRoot, STATUS_SURFACE_CLI) : undefined;
  const source: CommandEveStatusSurfaceBridgeResult['source'] = {
    company_os_root: companyOsRoot,
    event_ledger: readModelSource.event_ledger,
    status_surface_cli: cliPath,
    generated_by: 'company-os-status-surface-cli',
  };
  const base = baseResult(source);

  if (!companyOsRoot) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'COMPANY_OS_ROOT_MISSING',
      message: 'COMMAND_EVE_COMPANY_OS_ROOT is not set.',
    };
  }

  if (!cliPath || !fs.existsSync(cliPath)) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'STATUS_SURFACE_CLI_MISSING',
      message: `Missing Company.OS status-surface CLI: ${cliPath || STATUS_SURFACE_CLI}`,
    };
  }

  const nodeBinary = options.nodeBinary || process.env.COMMAND_EVE_NODE_BINARY || process.env.NODE_BINARY || 'node';
  const maxRuns = normalizeMaxRuns(options.maxRuns);
  const runner = options.runner ?? defaultCommandEveStatusSurfaceRunner;
  const args = [
    cliPath,
    '--root',
    companyOsRoot,
    '--events',
    readModelSource.event_ledger || 'metrics/agent-events.jsonl',
    '--format',
    'json',
    '--max-runs',
    String(maxRuns),
  ];
  const commandResult = await runner(nodeBinary, args, {
    cwd: companyOsRoot,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    env: options.env ?? process.env,
  });

  if (!commandResult.ok) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'STATUS_SURFACE_CLI_FAILED',
      message:
        commandResult.stderr || commandResult.error || `status-surface CLI failed with status ${commandResult.status}`,
    };
  }

  try {
    const surface = JSON.parse(commandResult.stdout) as CommandEveStatusSurfacePayload;
    if (surface.schema_version !== COMMAND_EVE_STATUS_SURFACE_SCHEMA_VERSION) {
      return {
        ...base,
        ok: false,
        status: 'failed',
        reason_code: 'STATUS_SURFACE_SCHEMA_MISMATCH',
        message: `Unsupported status-surface schema: ${String(surface.schema_version || '')}`,
      };
    }
    return {
      ...base,
      ok: surface.status !== 'BLOCK',
      status: surface.status === 'BLOCK' ? 'blocked' : 'ready',
      surface,
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'STATUS_SURFACE_JSON_INVALID',
      message: error instanceof Error ? error.message : 'Invalid status-surface JSON.',
    };
  }
}
