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
  buildCommandEveStatusSurface,
  type CommandEveStatusSurfaceRunner,
} from '@/process/commandEve/statusSurfaceCore';

const tempRoots: string[] = [];

const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-status-surface-test-'));
  tempRoots.push(root);
  return root;
};

const prepareCompanyOsRoot = (): { root: string; ledger: string; cli: string } => {
  const root = makeRoot();
  const cli = path.join(root, 'scripts', 'operator-shell', 'command-eve-status-surface.mjs');
  const ledger = path.join(root, 'metrics', 'agent-events.jsonl');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(cli, '#!/usr/bin/env node\n');
  fs.writeFileSync(ledger, '{"event_id":"event-1"}\n');
  return { root, ledger, cli };
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Command EVE status surface bridge core', () => {
  it('blocks loudly when the Company.OS root is missing', async () => {
    const result = await buildCommandEveStatusSurface({ env: {} });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('COMPANY_OS_ROOT_MISSING');
  });

  it('calls the public status-surface CLI with explicit root, ledger and json output', async () => {
    const { root, ledger, cli } = prepareCompanyOsRoot();
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    const runner: CommandEveStatusSurfaceRunner = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      return {
        ok: true,
        stdout: JSON.stringify({
          schema_version: 'command-eve-status-surface/v0',
          status: 'READY',
          status_label: 'Ready',
          empty_states: [],
          blocked_actions: [],
        }),
        stderr: '',
      };
    };

    const result = await buildCommandEveStatusSurface({
      companyOsRoot: root,
      eventLedgerPath: ledger,
      maxRuns: 5,
      nodeBinary: '/usr/local/bin/node',
      env: {},
      runner,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.surface?.schema_version).toBe('command-eve-status-surface/v0');
    expect(result.source.status_surface_cli).toBe(cli);
    expect(calls[0]).toMatchObject({ command: '/usr/local/bin/node', cwd: root });
    expect(calls[0]?.args).toContain('--root');
    expect(calls[0]?.args).toContain(root);
    expect(calls[0]?.args).toContain('--events');
    expect(calls[0]?.args).toContain(ledger);
    expect(calls[0]?.args).toContain('--format');
    expect(calls[0]?.args).toContain('json');
    expect(calls[0]?.args).toContain('--max-runs');
    expect(calls[0]?.args).toContain('5');
  });

  it('keeps BLOCK status blocked instead of reporting it as ready', async () => {
    const { root } = prepareCompanyOsRoot();
    const runner: CommandEveStatusSurfaceRunner = async () => ({
      ok: true,
      stdout: JSON.stringify({
        schema_version: 'command-eve-status-surface/v0',
        status: 'BLOCK',
        status_label: 'Blocked',
        empty_states: ['ledger_missing'],
        blocked_actions: ['dispatch_worker'],
      }),
      stderr: '',
    });

    const result = await buildCommandEveStatusSurface({ companyOsRoot: root, env: {}, runner });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.surface?.empty_states).toContain('ledger_missing');
  });

  it('fails instead of rendering unknown status-surface schemas', async () => {
    const { root } = prepareCompanyOsRoot();
    const runner: CommandEveStatusSurfaceRunner = async () => ({
      ok: true,
      stdout: JSON.stringify({ schema_version: 'wrong/v0' }),
      stderr: '',
    });

    const result = await buildCommandEveStatusSurface({ companyOsRoot: root, env: {}, runner });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.reason_code).toBe('STATUS_SURFACE_SCHEMA_MISMATCH');
  });
});
