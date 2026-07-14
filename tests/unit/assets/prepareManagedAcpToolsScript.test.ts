import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const script = readFileSync('scripts/prepare-managed-acp-tools.sh', 'utf8');

describe('prepare-managed-acp-tools script', () => {
  it('defaults to current managed ACP packages and versions', () => {
    expect(script).toContain('CODEX_ACP_VERSION="${CODEX_ACP_VERSION:-1.1.2}"');
    expect(script).toContain('CLAUDE_ACP_VERSION="${CLAUDE_ACP_VERSION:-0.58.1}"');
    expect(script).toContain('codex-acp|@agentclientprotocol/codex-acp|${CODEX_ACP_VERSION}');
    expect(script).not.toContain('@zed-industries/codex-acp|${CODEX_ACP_VERSION}');
    expect(script).not.toContain('CODEX_ACP_VERSION="${CODEX_ACP_VERSION:-0.14.0}"');
  });

  it('validates the OpenAI Codex platform executable layout', () => {
    expect(script).toContain('@openai/codex-${target}/vendor/');
    expect(script).toContain('x86_64-pc-windows-msvc');
    expect(script).toContain('aarch64-unknown-linux-musl');
  });
});
