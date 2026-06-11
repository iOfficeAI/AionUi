/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type CommandEveEgressPolicyAction = 'block' | 'redact' | 'allow';
export type CommandEveEgressDecision = 'allow' | 'block' | 'redact';
export type CommandEveEgressProviderKind = 'local' | 'cloud' | 'unknown';
export type CommandEveEgressFindingKind = 'secret' | 'german_pii' | 'email';

export type CommandEveEgressProvider = {
  kind: CommandEveEgressProviderKind;
  name?: string;
  model?: string;
  baseUrl?: string;
};

export type CommandEveEgressFinding = {
  kind: CommandEveEgressFindingKind;
  rule_id: string;
  count: number;
};

export type CommandEveEgressBoundaryReceipt = {
  version: 'command-eve-egress-boundary-receipt/v0';
  observed_at: string;
  provider: CommandEveEgressProvider;
  policy_action: CommandEveEgressPolicyAction;
  decision: CommandEveEgressDecision;
  finding_count: number;
  findings: CommandEveEgressFinding[];
  input_sha256: string;
  output_sha256?: string;
  raw_text_stored: false;
  reason: string;
};

export type CommandEveEgressBoundaryInput = {
  text: string;
  provider: CommandEveEgressProvider;
  policyAction?: CommandEveEgressPolicyAction;
  now?: Date;
};

export type CommandEveEgressBoundaryResult = {
  decision: CommandEveEgressDecision;
  allowedText?: string;
  receipt: CommandEveEgressBoundaryReceipt;
};

type SensitiveRule = {
  kind: CommandEveEgressFindingKind;
  ruleId: string;
  pattern: RegExp;
  replacement: string;
};

const SENSITIVE_RULES: SensitiveRule[] = [
  {
    kind: 'secret',
    ruleId: 'provider-api-key-token',
    pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    replacement: '[REDACTED_SECRET]',
  },
  {
    kind: 'secret',
    ruleId: 'secret-assignment',
    pattern: /\b(?:api[_-]?key|secret|token|password|passwort)\s*[:=]\s*["']?[^"'\s]{8,}["']?/gi,
    replacement: '[REDACTED_SECRET_ASSIGNMENT]',
  },
  {
    kind: 'german_pii',
    ruleId: 'german-street-address',
    pattern: /\b[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.-]+(?:straße|strasse|weg|allee|platz|gasse|ring|damm)\s+\d+[a-z]?\b/gi,
    replacement: '[REDACTED_ADDRESS]',
  },
  {
    kind: 'german_pii',
    ruleId: 'german-phone-number',
    pattern: /(?:\+49|0049|0)\s?(?:\(?\d{2,5}\)?[\s./-]?)\d{3,}[\d\s./-]{2,}\b/g,
    replacement: '[REDACTED_PHONE]',
  },
  {
    kind: 'email',
    ruleId: 'email-address',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[REDACTED_EMAIL]',
  },
];

async function sha256(value: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.subtle) {
    const encoded = new TextEncoder().encode(value);
    const digest = await cryptoApi.subtle.digest('SHA-256', encoded);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

export function detectCommandEveSensitiveEgress(text: string): CommandEveEgressFinding[] {
  return SENSITIVE_RULES.map((rule) => ({
    kind: rule.kind,
    rule_id: rule.ruleId,
    count: countMatches(text, rule.pattern),
  })).filter((finding) => finding.count > 0);
}

export function redactCommandEveSensitiveText(text: string): string {
  return SENSITIVE_RULES.reduce((currentText, rule) => currentText.replace(rule.pattern, rule.replacement), text);
}

export async function evaluateCommandEveEgressBoundary(
  input: CommandEveEgressBoundaryInput
): Promise<CommandEveEgressBoundaryResult> {
  const text = input.text || '';
  const policyAction = input.policyAction || 'block';
  const findings = detectCommandEveSensitiveEgress(text);
  const hasSensitiveFindings = findings.length > 0;
  const sanitizedText = hasSensitiveFindings ? redactCommandEveSensitiveText(text) : text;
  const decision: CommandEveEgressDecision = hasSensitiveFindings
    ? policyAction === 'allow'
      ? 'allow'
      : policyAction
    : 'allow';
  const receipt: CommandEveEgressBoundaryReceipt = {
    version: 'command-eve-egress-boundary-receipt/v0',
    observed_at: (input.now || new Date()).toISOString(),
    provider: input.provider,
    policy_action: policyAction,
    decision,
    finding_count: findings.reduce((sum, finding) => sum + finding.count, 0),
    findings,
    input_sha256: await sha256(text),
    ...(decision === 'redact' ? { output_sha256: await sha256(sanitizedText) } : {}),
    raw_text_stored: false,
    reason: hasSensitiveFindings ? `sensitive-egress-${decision}` : 'no-sensitive-egress-detected',
  };
  return {
    decision,
    allowedText: decision === 'redact' ? sanitizedText : text,
    receipt,
  };
}
