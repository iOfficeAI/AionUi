/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildLocalRuntimeStatus } from '@/process/commandEve/localRuntimeStatusCore';

const tempRoots: string[] = [];

const makeRoot = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-local-runtime-status-test-'));
  tempRoots.push(root);
  return root;
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const manifest = {
  version: 'command-eve-runtime-bootstrap-manifest/v0',
  release: '1.0.0-alpha.5',
  hermes: {
    package: 'hermes-agent',
    version: '0.16.0',
    extras: ['acp'],
  },
  local_runtime: {
    provider: 'ollama',
    base_url: 'http://127.0.0.1:11434',
    egress_proxy_url: 'http://127.0.0.1:25811',
    default_tier_id: 'gemma-4-e4b-local-default',
    tiers: [
      {
        id: 'gemma-4-e4b-local-default',
        label: 'Gemma 4 E4B local default',
        model_ref: 'gemma4:e4b',
        default: true,
        context_length: 65536,
        ollama_num_ctx: 65536,
        max_tokens: 512,
        min_unified_memory_gb: 16,
        min_free_disk_gb: 10,
      },
      {
        id: 'gemma-4-12b-local-planning',
        label: 'Gemma 4 12B local planning opt-in',
        model_ref: 'gemma4:12b',
        context_length: 65536,
        ollama_num_ctx: 65536,
        max_tokens: 512,
        min_unified_memory_gb: 16,
        min_free_disk_gb: 20,
      },
    ],
  },
  installer_policy: {
    allow_homebrew_install: true,
    allow_model_pull: true,
    model_weights_in_app_bundle: false,
    fail_closed_reason_codes: ['BLOCKED_RAM', 'BLOCKED_DISK'],
  },
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Command EVE local runtime status core', () => {
  it('renders local Gemma tiers from the runtime manifest without a receipt', () => {
    const root = makeRoot();
    const manifestPath = path.join(root, 'command-eve-runtime-bootstrap.json');
    writeJson(manifestPath, manifest);

    const result = buildLocalRuntimeStatus({
      userDataPath: root,
      manifestPath,
      now: () => new Date('2026-06-11T02:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.model?.release).toBe('1.0.0-alpha.5');
    expect(result.model?.hermes.version).toBe('0.16.0');
    expect(result.model?.provider.base_url).toBe('http://127.0.0.1:11434');
    expect(result.model?.selected_tier_id).toBe('gemma-4-e4b-local-default');
    expect(result.model?.selected_model_ref).toBe('command-eve-gemma4-e4b-64k:latest');
    expect(result.model?.tiers.map((tier) => tier.model_ref)).toEqual(['gemma4:e4b', 'gemma4:12b']);
    expect(result.model?.tiers[1].status).toBe('opt_in');
    expect(result.model?.warnings).toContain('runtime_receipt_missing');
    expect(result.model?.warnings).toContain('model_warmup_receipt_missing');
  });

  it('uses the runtime receipt to show the selected 12B planning tier', () => {
    const root = makeRoot();
    const manifestPath = path.join(root, 'command-eve-runtime-bootstrap.json');
    const receiptPath = path.join(root, 'receipt.json');
    const modelWarmupReceiptPath = path.join(root, 'warmup.json');
    writeJson(manifestPath, manifest);
    writeJson(receiptPath, {
      version: 'command-eve-runtime-bootstrap/v0',
      app_release: '1.0.0-alpha.5',
      mode: 'auto',
      status: 'ready',
      started_at: '2026-06-11T01:00:00.000Z',
      completed_at: '2026-06-11T01:01:00.000Z',
      runtime_root: root,
      hermes_home: path.join(root, 'hermes-home'),
      provider: 'ollama',
      default_model: 'command-eve-gemma4-12b-64k:latest',
      base_model: 'gemma4:12b',
      ollama_base_url: 'http://127.0.0.1:11434',
      egress_proxy_url: 'http://127.0.0.1:25811',
      stages: [],
      next_action: 'ready',
      warnings: [],
      capabilities: { skills: 1, connectors: 1, capability_pack: 'pack.json' },
    });
    writeJson(modelWarmupReceiptPath, {
      version: 'command-eve-model-warmup/v0',
      status: 'ready',
      model: 'command-eve-gemma4-12b-64k:latest',
      base_url: 'http://127.0.0.1:25811',
      started_at: '2026-06-11T01:01:00.000Z',
      completed_at: '2026-06-11T01:01:03.000Z',
      elapsed_ms: 3000,
    });

    const result = buildLocalRuntimeStatus({
      userDataPath: root,
      manifestPath,
      receiptPath,
      modelWarmupReceiptPath,
    });

    expect(result.ok).toBe(true);
    expect(result.model?.selected_tier_id).toBe('gemma-4-12b-local-planning');
    expect(result.model?.selected_model_ref).toBe('command-eve-gemma4-12b-64k:latest');
    expect(result.model?.tiers.find((tier) => tier.id === 'gemma-4-12b-local-planning')?.status).toBe('selected');
    expect(result.model?.receipt?.status).toBe('ready');
    expect(result.model?.model_warmup?.status).toBe('ready');
    expect(result.model?.model_warmup?.elapsed_ms).toBe(3000);
    expect(result.model?.warnings).toEqual([]);
  });

  it('accepts a running warm-up receipt without a completed timestamp', () => {
    const root = makeRoot();
    const manifestPath = path.join(root, 'command-eve-runtime-bootstrap.json');
    const modelWarmupReceiptPath = path.join(root, 'warmup.json');
    writeJson(manifestPath, manifest);
    writeJson(modelWarmupReceiptPath, {
      version: 'command-eve-model-warmup/v0',
      status: 'running',
      model: 'command-eve-gemma4-e4b-64k:latest',
      base_url: 'http://127.0.0.1:25811',
      started_at: '2026-06-11T01:01:00.000Z',
      elapsed_ms: 0,
    });

    const result = buildLocalRuntimeStatus({
      userDataPath: root,
      manifestPath,
      modelWarmupReceiptPath,
    });

    expect(result.ok).toBe(true);
    expect(result.model?.model_warmup?.status).toBe('running');
    expect(result.model?.model_warmup?.started_at).toBe('2026-06-11T01:01:00.000Z');
    expect(result.model?.model_warmup?.completed_at).toBeUndefined();
    expect(result.model?.warnings).toContain('runtime_receipt_missing');
    expect(result.model?.warnings).not.toContain('model_warmup_receipt_schema_mismatch');
  });

  it('fails closed when the manifest is unsafe', () => {
    const root = makeRoot();
    const manifestPath = path.join(root, 'command-eve-runtime-bootstrap.json');
    writeJson(manifestPath, {
      ...manifest,
      local_runtime: {
        ...manifest.local_runtime,
        base_url: 'https://example.com',
      },
    });

    const result = buildLocalRuntimeStatus({ userDataPath: root, manifestPath });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.reason_code).toBe('LOCAL_RUNTIME_STATUS_FAILED');
    expect(result.message).toContain('manifest.ollama_url_not_loopback');
  });
});
