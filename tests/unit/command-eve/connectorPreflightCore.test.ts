/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runConnectorPreflight } from '@/process/commandEve/connectorPreflightCore';

const tempRoots: string[] = [];

const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-connector-preflight-test-'));
  tempRoots.push(root);
  return root;
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const writeManifest = (root: string): string => {
  const manifestPath = path.join(root, 'kits', 'company-os-kit', '.company-os', 'eve', 'connector-manifests.json');
  writeJson(manifestPath, {
    version: 'eve-connector-manifest/v0',
    policy: {
      state_authority: 'local-preflight-result-files-only',
    },
    connectors: [
      {
        id: 'local-company-os-workspace',
        name: 'Local Company.OS Workspace',
        tier: 'core',
        purpose: 'Read local install truth.',
        required_for: ['T0'],
        auth_method: 'local filesystem',
        auth_surface: 'workspace',
        setup_mode: 'bootstrap',
        safe_preflight: ['check root'],
        verify_command: 'node smoke.mjs',
        allowed_actions: ['read install record'],
        blocked_actions: ['overwrite local memory'],
        human_gate: 'HG-1 before persistence',
        memory_policy: 'local-first',
        preflight_result_file: '.company-os/operations/preflight-results/local-company-os-workspace-latest.json',
      },
      {
        id: 'execution-ledger-plane',
        name: 'Plane Execution Ledger',
        tier: 'core',
        purpose: 'Read work items.',
        required_for: ['T3'],
        auth_method: 'Plane App connector preferred; app-token bridge fallback',
        auth_surface: 'Plane workspace',
        setup_mode: 'guided_connector',
        safe_preflight: ['sanity'],
        verify_command: 'node scripts/plane/plane-api-sanity.mjs',
        allowed_actions: ['read projects'],
        blocked_actions: ['mark Done'],
        human_gate: 'HG-3 before write-capable ledger changes',
        memory_policy: 'execution truth only',
        preflight_result_file: '.company-os/operations/preflight-results/execution-ledger-plane-latest.json',
      },
      {
        id: 'github-gitnexus',
        name: 'GitHub + GitNexus',
        tier: 'autonomy_core',
        purpose: 'Read repos and codegraph state.',
        required_for: ['T4'],
        auth_method: 'GitHub CLI/OAuth plus local GitNexus index',
        auth_surface: 'GitHub account/org and local repos',
        setup_mode: 'guided_connector',
        safe_preflight: ['gh auth status', 'gitnexus status'],
        verify_command: 'gh auth status && gitnexus status',
        allowed_actions: ['read repos'],
        blocked_actions: ['push or merge without approval'],
        human_gate: 'HG-3 before write-capable GitHub actions',
        memory_policy: 'store repo metadata and decisions',
        preflight_result_file: '.company-os/operations/preflight-results/github-gitnexus-latest.json',
      },
      {
        id: 'marketing-publishing-stack',
        name: 'Upload-Post + Social + Analytics',
        tier: 'optional_gated',
        purpose: 'Read marketing exports.',
        required_for: ['marketing_wedge_only'],
        auth_method: 'OAuth/API',
        auth_surface: 'Upload-Post',
        setup_mode: 'deferred_gated_connector',
        safe_preflight: ['read-only pull'],
        verify_command: 'manual',
        allowed_actions: ['read history'],
        blocked_actions: ['publish'],
        human_gate: 'HG-4 before public publishing',
        memory_policy: 'archive exports only',
        preflight_result_file: '.company-os/operations/preflight-results/marketing-publishing-stack-latest.json',
      },
    ],
  });
  return manifestPath;
};

const writePlaneSanityScript = (root: string): void => {
  const scriptPath = path.join(root, 'scripts', 'plane', 'plane-api-sanity.mjs');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, 'console.log(JSON.stringify({ ok: true }))\\n');
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Command EVE connector preflight core', () => {
  it('writes a local Company.OS workspace receipt without running manifest commands', () => {
    const root = makeRoot();
    writeManifest(root);
    fs.mkdirSync(path.join(root, '.company-os', 'operations'), { recursive: true });

    const result = runConnectorPreflight({
      connectorId: 'local-company-os-workspace',
      companyOsRoot: root,
      env: {},
      now: () => new Date('2026-06-11T01:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.receipt?.ok).toBe(true);
    expect(result.receipt?.connector_id).toBe('local-company-os-workspace');
    expect(result.receipt?.checks.find((check) => check.id === 'company_os_root')?.ok).toBe(true);
    expect(result.receipt?.checks.find((check) => check.id === 'connector_manifest')?.ok).toBe(true);
    expect(result.receipt_path).toContain('local-company-os-workspace-latest.json');
    expect(fs.existsSync(result.receipt_path || '')).toBe(true);
    expect(result.audit_event_path).toContain('agent-events.jsonl');
    expect(result.audit_event_id).toContain('command-eve-connector-preflight-local-company-os-workspace');
    const events = fs
      .readFileSync(result.audit_event_path || '', 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      schema_version: 'agent-event/v1',
      event_type: 'connector.preflight_recorded',
      run_id: 'connector-preflight-local-company-os-workspace',
      payload: {
        connector_id: 'local-company-os-workspace',
        ok: true,
        reason_code: 'LOCAL_COMPANY_OS_WORKSPACE_READY',
        mcp_enable_allowed: false,
        connector_write_allowed: false,
      },
    });
  });

  it('runs a fixed Plane read-only preflight handler instead of manifest verify_command', () => {
    const root = makeRoot();
    writeManifest(root);
    writePlaneSanityScript(root);
    const calls: Array<{ executable: string; args: string[]; cwd: string }> = [];

    const result = runConnectorPreflight({
      connectorId: 'execution-ledger-plane',
      companyOsRoot: root,
      env: {},
      now: () => new Date('2026-06-11T01:00:00.000Z'),
      commandRunner: (request) => {
        calls.push({
          executable: request.executable,
          args: request.args,
          cwd: request.cwd,
        });
        return { ok: true, exitCode: 0 };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('PLANE_READ_ONLY_PREFLIGHT_READY');
    expect(result.receipt?.checks.find((check) => check.id === 'plane_sanity_script')?.ok).toBe(true);
    expect(result.receipt?.checks.find((check) => check.id === 'plane_api_sanity_read_only')?.ok).toBe(true);
    expect(result.audit_event_path).toContain('agent-events.jsonl');
    expect(calls).toEqual([
      {
        executable: 'node',
        args: ['scripts/plane/plane-api-sanity.mjs', '--workspace', 'companyos', '--auth', 'app-token', '--json'],
        cwd: root,
      },
    ]);
    expect(result.receipt_path).toContain('execution-ledger-plane-latest.json');
    expect(fs.existsSync(result.receipt_path || '')).toBe(true);
  });

  it('runs fixed GitHub and GitNexus read-only preflight checks', () => {
    const root = makeRoot();
    writeManifest(root);
    const calls: Array<{ id: string; executable: string; args: string[] }> = [];

    const result = runConnectorPreflight({
      connectorId: 'github-gitnexus',
      companyOsRoot: root,
      env: {},
      now: () => new Date('2026-06-11T01:00:00.000Z'),
      commandRunner: (request) => {
        calls.push({
          id: request.id,
          executable: request.executable,
          args: request.args,
        });
        return { ok: true, exitCode: 0 };
      },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.reason_code).toBe('GITHUB_GITNEXUS_PREFLIGHT_READY');
    expect(calls).toEqual([
      { id: 'gh_auth_status', executable: 'gh', args: ['auth', 'status'] },
      { id: 'gitnexus_status', executable: 'gitnexus', args: ['status'] },
    ]);
    expect(result.receipt?.checks.map((check) => check.id)).toEqual(['gh_auth_status', 'gitnexus_status']);
  });

  it('writes a blocked receipt when a fixed handler command fails', () => {
    const root = makeRoot();
    writeManifest(root);
    writePlaneSanityScript(root);

    const result = runConnectorPreflight({
      connectorId: 'execution-ledger-plane',
      companyOsRoot: root,
      env: {},
      now: () => new Date('2026-06-11T01:00:00.000Z'),
      commandRunner: () => ({ ok: false, exitCode: 1, error: 'auth unavailable' }),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('PLANE_READ_ONLY_PREFLIGHT_BLOCKED');
    expect(result.receipt?.ok).toBe(false);
    expect(result.audit_event_path).toContain('agent-events.jsonl');
    expect(result.receipt?.checks.find((check) => check.id === 'plane_api_sanity_read_only')?.detail).toContain(
      'read-only command failed'
    );
    expect(fs.existsSync(result.receipt_path || '')).toBe(true);
  });

  it('blocks unsupported connectors instead of executing arbitrary verify_command strings', () => {
    const root = makeRoot();
    writeManifest(root);

    const result = runConnectorPreflight({
      connectorId: 'marketing-publishing-stack',
      companyOsRoot: root,
      env: {},
      now: () => new Date('2026-06-11T01:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('CONNECTOR_PREFLIGHT_HANDLER_MISSING');
    expect(result.receipt_path).toBeUndefined();
  });

  it('blocks loudly when the connector id is not in the manifest', () => {
    const root = makeRoot();
    writeManifest(root);

    const result = runConnectorPreflight({
      connectorId: 'missing-connector',
      companyOsRoot: root,
      env: {},
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason_code).toBe('CONNECTOR_NOT_FOUND');
  });
});
