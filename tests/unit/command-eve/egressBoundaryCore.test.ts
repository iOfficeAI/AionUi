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

  it('blocks international financial PII (IBAN + card) the German-only filter missed', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Bitte überweise auf IBAN DE89 3704 0044 0532 0130 00, Karte 4111 1111 1111 1111.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
    });

    expect(result.decision).toBe('block');
    expect(result.receipt.findings.some((finding) => finding.kind === 'financial' && finding.rule_id === 'iban')).toBe(true);
    expect(result.receipt.findings.some((finding) => finding.rule_id === 'payment-card-number')).toBe(true);
    expect(JSON.stringify(result.receipt)).not.toContain('0532');
    expect(JSON.stringify(result.receipt)).not.toContain('4111');
  });

  it('blocks non-DACH PII (intl phone, US address, SSN)', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Reach the client at +1 415 555 1234, ship to 1600 Pennsylvania Avenue, SSN 123-45-6789.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
    });

    expect(result.decision).toBe('block');
    expect(result.receipt.findings.some((finding) => finding.kind === 'intl_pii')).toBe(true);
    expect(result.receipt.findings.some((finding) => finding.rule_id === 'intl-phone-number')).toBe(true);
    expect(result.receipt.findings.some((finding) => finding.rule_id === 'intl-street-address')).toBe(true);
    expect(result.receipt.findings.some((finding) => finding.rule_id === 'us-ssn')).toBe(true);
  });

  it('redacts a label-anchored health identifier (GDPR Art. 9) without leaking the value', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Versichertennummer: A123456789 — bitte vormerken.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
      policyAction: 'redact',
    });

    expect(result.receipt.findings.some((finding) => finding.kind === 'health')).toBe(true);
    expect(result.allowedText).toContain('[REDACTED_HEALTH_ID]');
    expect(JSON.stringify(result.receipt)).not.toContain('A123456789');
  });

  it('does NOT false-positive on clean international marketing copy', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Our 5 step plan boosts ROI by 30% across 3 channels in Q4. Visit our shop today.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
    });

    expect(result.decision).toBe('allow');
    expect(result.receipt.finding_count).toBe(0);
  });

  it('redacts a FULL IBAN in redact mode — no country/bank prefix leak (CRITICAL regression)', async () => {
    // The prior bug: german-phone fragmented the IBAN first, leaking "DE89 3704".
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Überweisung an DE89 3704 0044 0532 0130 00 heute.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
      policyAction: 'redact',
    });

    expect(result.allowedText).toContain('[REDACTED_IBAN]');
    expect(result.allowedText).not.toMatch(/DE\d{2}/);
    expect(result.allowedText).not.toContain('3704');
    expect(result.allowedText).not.toContain('0532');
    expect(result.allowedText).not.toContain('[REDACTED_PHONE]');
  });

  it('catches the 15-char Norway IBAN (shortest valid length)', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Konto: NO93 8601 1117 947.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
    });

    expect(result.receipt.findings.some((finding) => finding.rule_id === 'iban')).toBe(true);
  });

  it('catches a health insurance number in natural-language German AND bare form', async () => {
    const labeled = await evaluateCommandEveEgressBoundary({
      text: 'Meine Versichertennummer ist A123456789 bitte.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
    });
    expect(labeled.receipt.findings.some((finding) => finding.kind === 'health')).toBe(true);

    const bare = await evaluateCommandEveEgressBoundary({
      text: 'Notiz: A123456789 vormerken.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
    });
    expect(bare.receipt.findings.some((finding) => finding.kind === 'health')).toBe(true);
  });

  it('catches a bare parenthesised US phone (no country code)', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Call the client at (415) 555-2671 tomorrow.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
    });

    expect(result.decision).toBe('block');
    expect(result.receipt.findings.some((finding) => finding.rule_id === 'north-american-phone')).toBe(true);
  });

  it('does NOT redact bare 3-3-4 business reference numbers (order/ticket/SKU)', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Bestellnummer 845-291-6034 und Ticket 234-567-8901 versandt.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
    });

    expect(result.decision).toBe('allow');
    expect(result.receipt.finding_count).toBe(0);
  });

  it('does NOT redact a street suffix inside marketing copy ("Top 10 ... Avenue strategies")', async () => {
    const result = await evaluateCommandEveEgressBoundary({
      text: 'Read our Top 10 Marketing Avenue strategies for 2026 growth.',
      provider: { ...LOCAL_PROVIDER, kind: 'cloud', name: 'openrouter' },
    });

    expect(result.decision).toBe('allow');
    expect(result.receipt.finding_count).toBe(0);
  });
});
