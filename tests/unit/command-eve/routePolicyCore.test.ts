/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildRouteReceipt,
  classifyDataSensitivity,
  decideRoute,
  laneForProvider,
  observeRouteShadow,
  resolveRouteReceiptPath,
  toRouteProvider,
  writeCommandEveRouteReceipt,
  COMMAND_EVE_ROUTE_RECEIPT_DIR,
} from '@/process/commandEve/routePolicyCore';
import type { CommandEveEgressProvider } from '@/common/api/egressBoundaryCore';

const LOCAL_PROVIDER: CommandEveEgressProvider = {
  kind: 'local',
  name: 'ollama',
  model: 'custom:command-eve-gemma4-e4b-64k:latest',
  baseUrl: 'http://127.0.0.1:11434',
};

const CLOUD_PROVIDER: CommandEveEgressProvider = {
  kind: 'cloud',
  name: 'openai',
  model: 'gpt-image-1',
  baseUrl: 'https://api.openai.com/v1',
};

const NOW = new Date('2026-06-15T08:00:00.000Z');

describe('Command EVE route policy core — data sensitivity classification', () => {
  it('classifies clean text as S0', () => {
    const result = classifyDataSensitivity('Bitte erstelle ein Bild von einem Sonnenuntergang am Meer.');
    expect(result.sensitivity).toBe('S0');
    expect(result.finding_count).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('classifies an email address as S1', () => {
    const result = classifyDataSensitivity('Schick das Ergebnis an mathias@example.com');
    expect(result.sensitivity).toBe('S1');
    expect(result.findings.some((finding) => finding.kind === 'email')).toBe(true);
  });

  it('classifies German PII (address / phone) as S2', () => {
    const result = classifyDataSensitivity('Adresse: Hauptstraße 12, 10115 Berlin, Tel +49 30 12345678');
    expect(result.sensitivity).toBe('S2');
    expect(result.findings.some((finding) => finding.kind === 'german_pii')).toBe(true);
  });

  it('classifies secrets as S3 and S3 wins over lower-severity findings', () => {
    const result = classifyDataSensitivity('mail mathias@example.com api_key=sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(result.sensitivity).toBe('S3');
    expect(result.findings.some((finding) => finding.kind === 'secret')).toBe(true);
    // S3 wins even though an email (S1) is also present.
    expect(result.findings.some((finding) => finding.kind === 'email')).toBe(true);
  });

  it('reuses the egress detector — no raw secret leaks into the classification result', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
    const result = classifyDataSensitivity(`token: ${secret}`);
    expect(JSON.stringify(result)).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('classifies financial PII (IBAN) as S3', () => {
    const result = classifyDataSensitivity('Konto: DE89 3704 0044 0532 0130 00');
    expect(result.sensitivity).toBe('S3');
    expect(result.findings.some((finding) => finding.kind === 'financial')).toBe(true);
  });

  it('classifies a health identifier as S3', () => {
    const result = classifyDataSensitivity('Versichertennummer: A123456789');
    expect(result.sensitivity).toBe('S3');
    expect(result.findings.some((finding) => finding.kind === 'health')).toBe(true);
  });

  it('classifies non-DACH international PII as S2', () => {
    const result = classifyDataSensitivity('Ship to 1600 Pennsylvania Avenue, call +1 415 555 1234');
    expect(result.sensitivity).toBe('S2');
    expect(result.findings.some((finding) => finding.kind === 'intl_pii')).toBe(true);
  });
});

describe('Command EVE route policy core — laneForProvider / toRouteProvider', () => {
  it('maps a declared local provider to the local lane', () => {
    expect(laneForProvider(LOCAL_PROVIDER)).toBe('local');
  });

  it('maps a declared cloud provider to the cloud lane', () => {
    expect(laneForProvider(CLOUD_PROVIDER)).toBe('cloud');
  });

  it('infers local lane from a loopback base URL when kind is unknown', () => {
    const provider: CommandEveEgressProvider = { kind: 'unknown', baseUrl: 'http://localhost:11434' };
    expect(laneForProvider(provider)).toBe('local');
  });

  it('infers cloud lane from a remote base URL when kind is unknown', () => {
    const provider: CommandEveEgressProvider = { kind: 'unknown', baseUrl: 'https://api.openai.com' };
    expect(laneForProvider(provider)).toBe('cloud');
  });

  it('returns unknown lane when there is no base URL and no kind', () => {
    expect(laneForProvider({ kind: 'unknown' })).toBe('unknown');
  });

  it('toRouteProvider derives kind without mutating the source provider', () => {
    const source = { platform: 'ollama', name: 'ollama', use_model: 'gemma4', base_url: 'http://127.0.0.1:11434' };
    const frozen = Object.freeze({ ...source });
    const mapped = toRouteProvider(frozen);
    expect(mapped.kind).toBe('local');
    expect(mapped.baseUrl).toBe('http://127.0.0.1:11434');
    expect(mapped.model).toBe('gemma4');
    // Source untouched.
    expect(frozen).toEqual(source);
  });
});

describe('Command EVE route policy core — decideRoute (SHADOW)', () => {
  it('never enforces (enforced:false) for clean text on a cloud provider', () => {
    const decision = decideRoute({
      text: 'Erstelle ein Logo.',
      provider: CLOUD_PROVIDER,
      taskClass: 'image_generation',
      budgetClass: 'premium',
    });
    expect(decision.enforced).toBe(false);
    expect(decision.sensitivity).toBe('S0');
    expect(decision.actual_lane).toBe('cloud');
    // Clean text honors the actual lane — no shadow reroute.
    expect(decision.recommended_lane).toBe('cloud');
    expect(decision.would_reroute).toBe(false);
    expect(decision.task_class).toBe('image_generation');
    expect(decision.budget_class).toBe('premium');
  });

  it('recommends local for S3 secrets on a cloud provider but stays enforced:false (shadow disagreement only)', () => {
    const decision = decideRoute({
      text: 'api_key=sk-abcdefghijklmnopqrstuvwxyz123456',
      provider: CLOUD_PROVIDER,
    });
    expect(decision.enforced).toBe(false);
    expect(decision.sensitivity).toBe('S3');
    expect(decision.actual_lane).toBe('cloud');
    expect(decision.recommended_lane).toBe('local');
    // Shadow flags the disagreement but does NOT change the actual lane.
    expect(decision.would_reroute).toBe(true);
    expect(decision.reason).toContain('shadow-prefers-local');
  });

  it('recommends local for S2 German PII', () => {
    const decision = decideRoute({
      text: 'Hauptstraße 12, 10115 Berlin',
      provider: CLOUD_PROVIDER,
    });
    expect(decision.sensitivity).toBe('S2');
    expect(decision.recommended_lane).toBe('local');
    expect(decision.would_reroute).toBe(true);
    expect(decision.enforced).toBe(false);
  });

  it('does not flag a reroute when sensitive data is already on a local provider', () => {
    const decision = decideRoute({
      text: 'api_key=sk-abcdefghijklmnopqrstuvwxyz123456',
      provider: LOCAL_PROVIDER,
    });
    expect(decision.sensitivity).toBe('S3');
    expect(decision.actual_lane).toBe('local');
    expect(decision.recommended_lane).toBe('local');
    expect(decision.would_reroute).toBe(false);
  });
});

describe('Command EVE route policy core — buildRouteReceipt (hash-only)', () => {
  it('produces a versioned, enforced:false, hash-only receipt that never stores raw text', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
    const receipt = buildRouteReceipt({
      text: `mein key: ${secret}`,
      provider: CLOUD_PROVIDER,
      taskClass: 'image_generation',
      budgetClass: 'premium',
      now: NOW,
    });

    expect(receipt.version).toBe('command-eve-route-policy-receipt/v0');
    expect(receipt.enforced).toBe(false);
    expect(receipt.raw_text_stored).toBe(false);
    expect(receipt.observed_at).toBe(NOW.toISOString());
    expect(receipt.sensitivity).toBe('S3');
    expect(receipt.actual_lane).toBe('cloud');
    expect(receipt.recommended_lane).toBe('local');
    expect(receipt.would_reroute).toBe(true);
    expect(receipt.input_sha256).toMatch(/^[a-f0-9]{64}$/);
    // Hash-only: raw secret must not appear anywhere in the receipt.
    expect(JSON.stringify(receipt)).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('builds a clean S0 receipt for benign prompts', () => {
    const receipt = buildRouteReceipt({
      text: 'Ein freundlicher Roboter im Comic-Stil.',
      provider: LOCAL_PROVIDER,
      now: NOW,
    });
    expect(receipt.sensitivity).toBe('S0');
    expect(receipt.finding_count).toBe(0);
    expect(receipt.would_reroute).toBe(false);
    expect(receipt.enforced).toBe(false);
  });
});

describe('Command EVE route policy core — persistence', () => {
  it('resolveRouteReceiptPath puts receipts under <userData>/command-eve-runtime/route-receipts/', () => {
    const userDataDir = '/tmp/example-user-data';
    const receiptPath = resolveRouteReceiptPath(userDataDir, 'image gen!');
    expect(receiptPath.startsWith(path.join(userDataDir, COMMAND_EVE_ROUTE_RECEIPT_DIR))).toBe(true);
    expect(receiptPath.endsWith('.json')).toBe(true);
    // Label is sanitized (no spaces / special chars in the filename segment).
    expect(path.basename(receiptPath)).toMatch(/^image-gen--\d+-\d+\.json$/);
  });

  it('writes the receipt atomically with 0o600 and without raw prompt text', () => {
    const receipt = buildRouteReceipt({
      text: 'password=supersecretvalue123',
      provider: CLOUD_PROVIDER,
      now: NOW,
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-route-'));
    const receiptPath = path.join(dir, 'route-receipt.json');

    writeCommandEveRouteReceipt(receiptPath, receipt);

    const payload = fs.readFileSync(receiptPath, 'utf8');
    expect(payload).toContain('"command-eve-route-policy-receipt/v0"');
    expect(payload).toContain('"enforced": false');
    expect(payload).not.toContain('supersecretvalue');

    const mode = fs.statSync(receiptPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe('Command EVE route policy core — observeRouteShadow (injection contract)', () => {
  it('emits a persisted receipt WITHOUT mutating the provider or changing routing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-route-shadow-'));
    const provider = {
      platform: 'openai',
      name: 'openai',
      use_model: 'gpt-image-1',
      base_url: 'https://api.openai.com/v1',
    };
    const frozenProvider = Object.freeze({ ...provider });

    const { receipt, receiptPath } = observeRouteShadow({
      text: 'Logo mit api_key=sk-abcdefghijklmnopqrstuvwxyz123456',
      provider: frozenProvider,
      taskClass: 'image_generation',
      label: 'image-gen',
      userDataDir: dir,
      now: NOW,
    });

    // A receipt was emitted and persisted under the route-receipt dir.
    expect(receiptPath).not.toBeNull();
    expect(receiptPath as string).toContain(COMMAND_EVE_ROUTE_RECEIPT_DIR);
    expect(fs.existsSync(receiptPath as string)).toBe(true);

    // Observation only: enforced:false, raw text never stored.
    expect(receipt.enforced).toBe(false);
    expect(receipt.raw_text_stored).toBe(false);
    expect(receipt.sensitivity).toBe('S3');

    // SHADOW disagreement is recorded, but the actual lane is unchanged (cloud).
    expect(receipt.actual_lane).toBe('cloud');
    expect(receipt.recommended_lane).toBe('local');
    expect(receipt.would_reroute).toBe(true);

    // The caller's provider is NOT mutated by the shadow observer.
    expect(frozenProvider).toEqual(provider);

    // Persisted payload is hash-only.
    const payload = fs.readFileSync(receiptPath as string, 'utf8');
    expect(payload).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('never throws and reports receiptPath:null when persistence is impossible', () => {
    // No userDataDir and platform services unavailable in the test runtime →
    // the observer must swallow the error and still return a receipt.
    const result = observeRouteShadow({
      text: 'Ein einfaches Bild.',
      provider: { platform: 'ollama', base_url: 'http://127.0.0.1:11434' },
      userDataDir: '',
      now: NOW,
    });
    expect(result.receipt.enforced).toBe(false);
    expect(result.receiptPath).toBeNull();
  });
});
