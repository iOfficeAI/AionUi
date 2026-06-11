/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildCommandCenterReadModel,
  resolveCommandCenterReadModelSource,
  type CommandCenterReadModelRunner,
} from '@/process/commandEve/commandCenterReadModelCore';

const tempRoots: string[] = [];

const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-command-center-test-'));
  tempRoots.push(root);
  return root;
};

const prepareCompanyOsRoot = (): { root: string; ledger: string } => {
  const root = makeRoot();
  const script = path.join(root, 'scripts', 'command-center', 'command-center-read-model.mjs');
  const reducer = path.join(root, 'scripts', 'command-center', 'command-center-read-model-core.mjs');
  const ledger = path.join(root, 'metrics', 'agent-events.jsonl');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(script, '#!/usr/bin/env node\n');
  fs.writeFileSync(reducer, '// reducer\n');
  fs.writeFileSync(ledger, '{"event_id":"event-1"}\n');
  return { root, ledger };
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('command center read model bridge core', () => {
  it('blocks loudly when the Company.OS root is missing', async () => {
    const result = await buildCommandCenterReadModel({ env: {} });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('COMPANY_OS_ROOT_MISSING');
  });

  it('resolves the read-model source from Command EVE env vars', () => {
    const source = resolveCommandCenterReadModelSource({
      env: {
        COMMAND_EVE_COMPANY_OS_ROOT: '/tmp/company-os',
        COMMAND_EVE_AGENT_EVENTS_PATH: '/tmp/company-os/metrics/events.jsonl',
      },
    });

    expect(source.company_os_root).toBe('/tmp/company-os');
    expect(source.event_ledger).toBe('/tmp/company-os/metrics/events.jsonl');
    expect(source.reducer).toBe('/tmp/company-os/scripts/command-center/command-center-read-model-core.mjs');
  });

  it('blocks loudly when the local event ledger is missing', async () => {
    const { root, ledger } = prepareCompanyOsRoot();
    fs.rmSync(ledger);

    const result = await buildCommandCenterReadModel({ companyOsRoot: root, env: {} });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('AGENT_EVENTS_LEDGER_MISSING');
  });

  it('loads a real Company.OS read-model payload through the CLI runner', async () => {
    const { root, ledger } = prepareCompanyOsRoot();
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const runner: CommandCenterReadModelRunner = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      return {
        ok: true,
        stdout: JSON.stringify({
          schema_version: 'command-center-read-model/v0',
          generated_at: '2026-06-10T08:00:00.000Z',
          read_only: true,
          sources: {
            event_ledger: ledger,
            reducer: path.join(root, 'scripts/command-center/command-center-read-model-core.mjs'),
          },
          morning_brief: { headline: 'ready', totals: { worker_runs: 1 }, warnings: [] },
          worker_runs: [],
          human_gate_queue: [],
          ceo_critical_releases: [],
          eve_hg35_packets: [],
          trace_summary_cards: [],
          blocked_actions: [],
        }),
        stderr: '',
      };
    };

    const result = await buildCommandCenterReadModel({
      companyOsRoot: root,
      maxRuns: 7,
      nodeBinary: '/usr/local/bin/node',
      env: {},
      runner,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.model?.schema_version).toBe('command-center-read-model/v0');
    expect(calls[0]).toMatchObject({ command: '/usr/local/bin/node', cwd: root });
    expect(calls[0]?.args).toContain('--max-runs');
    expect(calls[0]?.args).toContain('7');
  });

  it('fails instead of rendering unknown read-model schemas', async () => {
    const { root } = prepareCompanyOsRoot();
    const runner: CommandCenterReadModelRunner = async () => ({
      ok: true,
      stdout: JSON.stringify({ schema_version: 'wrong/v0' }),
      stderr: '',
    });

    const result = await buildCommandCenterReadModel({ companyOsRoot: root, env: {}, runner });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.reason_code).toBe('READ_MODEL_SCHEMA_MISMATCH');
  });
});
