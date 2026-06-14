/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';

export const COMMAND_EVE_COMMAND_CENTER_READ_MODEL_BRIDGE_VERSION = 'command-eve-command-center-read-model/v0';

export type CommandCenterReadModelStatus = 'ready' | 'blocked' | 'failed';

export type CommandCenterReadModelPayload = {
  schema_version?: string;
  [key: string]: unknown;
};

export type CommandCenterReadModelCommandResult = {
  ok: boolean;
  status?: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

export type CommandCenterReadModelRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }
) => Promise<CommandCenterReadModelCommandResult>;

export type CommandCenterReadModelSource = {
  company_os_root?: string;
  event_ledger?: string;
  reducer?: string;
  generated_by: 'company-os-read-model-cli';
};

export type CommandCenterReadModelBridgeResult = {
  version: typeof COMMAND_EVE_COMMAND_CENTER_READ_MODEL_BRIDGE_VERSION;
  status: CommandCenterReadModelStatus;
  ok: boolean;
  reason_code?: string;
  message?: string;
  model?: CommandCenterReadModelPayload;
  source: CommandCenterReadModelSource;
};

export type CommandCenterReadModelOptions = {
  companyOsRoot?: string;
  eventLedgerPath?: string;
  maxRuns?: number;
  nodeBinary?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  runner?: CommandCenterReadModelRunner;
};

const DEFAULT_MAX_RUNS = 20;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_EVENT_LEDGER = 'metrics/agent-events.jsonl';
const READ_MODEL_CLI = 'scripts/command-center/command-center-read-model.mjs';
const READ_MODEL_REDUCER = 'scripts/command-center/command-center-read-model-core.mjs';

function normalizeMaxRuns(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_RUNS;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return undefined;
}

function resultBase(
  source: CommandCenterReadModelSource
): Pick<CommandCenterReadModelBridgeResult, 'version' | 'source'> {
  return {
    version: COMMAND_EVE_COMMAND_CENTER_READ_MODEL_BRIDGE_VERSION,
    source,
  };
}

export function resolveCommandCenterReadModelSource(
  options: Pick<CommandCenterReadModelOptions, 'companyOsRoot' | 'eventLedgerPath' | 'env'> = {}
): CommandCenterReadModelSource {
  const env = options.env ?? process.env;
  const companyOsRoot = firstNonEmpty(
    options.companyOsRoot,
    env.COMMAND_EVE_COMPANY_OS_ROOT,
    env.COMPANY_OS_ROOT,
    env.COMMAND_EVE_SOURCE_ROOT
  );
  const eventLedger = firstNonEmpty(
    options.eventLedgerPath,
    env.COMMAND_EVE_AGENT_EVENTS_PATH,
    companyOsRoot ? path.join(companyOsRoot, DEFAULT_EVENT_LEDGER) : undefined
  );
  return {
    company_os_root: companyOsRoot,
    event_ledger: eventLedger,
    reducer: companyOsRoot ? path.join(companyOsRoot, READ_MODEL_REDUCER) : undefined,
    generated_by: 'company-os-read-model-cli',
  };
}

export const defaultCommandCenterReadModelRunner: CommandCenterReadModelRunner = (command, args, options) =>
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

export async function buildCommandCenterReadModel(
  options: CommandCenterReadModelOptions = {}
): Promise<CommandCenterReadModelBridgeResult> {
  const source = resolveCommandCenterReadModelSource(options);
  const base = resultBase(source);
  const companyOsRoot = source.company_os_root;
  const eventLedger = source.event_ledger;

  if (!companyOsRoot) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'COMPANY_OS_ROOT_MISSING',
      message: 'COMMAND_EVE_COMPANY_OS_ROOT is not set.',
    };
  }

  const cliPath = path.join(companyOsRoot, READ_MODEL_CLI);
  if (!fs.existsSync(cliPath)) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'READ_MODEL_CLI_MISSING',
      message: `Missing Company.OS read-model CLI: ${cliPath}`,
    };
  }

  if (!eventLedger || !fs.existsSync(eventLedger)) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason_code: 'AGENT_EVENTS_LEDGER_MISSING',
      message: `Missing agent event ledger: ${eventLedger || DEFAULT_EVENT_LEDGER}`,
    };
  }

  const nodeBinary = options.nodeBinary || process.env.COMMAND_EVE_NODE_BINARY || process.env.NODE_BINARY || 'node';
  const maxRuns = normalizeMaxRuns(options.maxRuns);
  const runner = options.runner ?? defaultCommandCenterReadModelRunner;
  const args = [cliPath, '--events', eventLedger, '--format', 'json', '--max-runs', String(maxRuns)];
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
      reason_code: 'READ_MODEL_CLI_FAILED',
      message:
        commandResult.stderr || commandResult.error || `read-model CLI failed with status ${commandResult.status}`,
    };
  }

  try {
    const model = JSON.parse(commandResult.stdout) as CommandCenterReadModelPayload;
    if (model.schema_version !== 'command-center-read-model/v0') {
      return {
        ...base,
        ok: false,
        status: 'failed',
        reason_code: 'READ_MODEL_SCHEMA_MISMATCH',
        message: `Unsupported read-model schema: ${String(model.schema_version || '')}`,
      };
    }
    return {
      ...base,
      ok: true,
      status: 'ready',
      model,
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 'failed',
      reason_code: 'READ_MODEL_JSON_INVALID',
      message: error instanceof Error ? error.message : 'Invalid read-model JSON.',
    };
  }
}
