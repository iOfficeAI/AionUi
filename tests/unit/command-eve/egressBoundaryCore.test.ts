import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  evaluateCommandEveEgressBoundary,
  writeCommandEveEgressBoundaryReceipt,
} from '@/process/commandEve/egressBoundaryCore';

const LOCAL_PROVIDER = {
  kind: 'local' as const,
  name: 'ollama',
  model: 'custom:command-eve-gemma4-e4b-64k:latest',
  baseUrl: 'http://127.0.0.1:11434',
};

describe('Command EVE egress boundary core', () => {
  it('blocks secrets by default without storing raw text', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Mein API key: sk-abcdefghijklmnopqrstuvwxyz123456',
      provider: LOCAL_PROVIDER,
      now: new Date('2026-06-10T08:00:00.000Z'),
    });

    expect(result.decision).toBe('block');
    expect(result.receipt.finding_count).toBeGreaterThan(0);
    expect(result.receipt.findings.some((finding) => finding.kind === 'secret')).toBe(true);
    expect(result.receipt.input_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receipt.raw_text_stored).toBe(false);
    expect(JSON.stringify(result.receipt)).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('blocks German PII by default', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Bitte merke dir: Hauptstraße 12, 10115 Berlin und +49 30 12345678.',
      provider: LOCAL_PROVIDER,
    });

    expect(result.decision).toBe('block');
    expect(result.receipt.findings.some((finding) => finding.rule_id === 'german-street-address')).toBe(true);
    expect(result.receipt.findings.some((finding) => finding.rule_id === 'german-phone-number')).toBe(true);
  });

  it('supports redaction mode for explicit user policy without leaking raw text in receipts', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'E-Mail: mathias@example.com und token=supersecretvalue',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openai' },
      policyAction: 'redact',
    });

    expect(result.decision).toBe('redact');
    expect(result.allowedText).toContain('[REDACTED_EMAIL]');
    expect(result.allowedText).toContain('[REDACTED_SECRET_ASSIGNMENT]');
    expect(result.receipt.output_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.receipt)).not.toContain('mathias@example.com');
    expect(JSON.stringify(result.receipt)).not.toContain('supersecretvalue');
  });

  it('allows clean text', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Bitte erstelle einen Plan fuer die naechsten drei Schritte.',
      provider: LOCAL_PROVIDER,
    });

    expect(result.decision).toBe('allow');
    expect(result.allowedText).toBe('Bitte erstelle einen Plan fuer die naechsten drei Schritte.');
    expect(result.receipt.finding_count).toBe(0);
  });

  it('writes the receipt atomically without raw prompt text', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'password=supersecretvalue',
      provider: LOCAL_PROVIDER,
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-egress-'));
    const receiptPath = path.join(dir, 'receipt.json');

    writeCommandEveEgressBoundaryReceipt(receiptPath, result.receipt);

    const payload = fs.readFileSync(receiptPath, 'utf8');
    expect(payload).toContain('"command-eve-egress-boundary-receipt/v0"');
    expect(payload).not.toContain('supersecretvalue');
  });
});
