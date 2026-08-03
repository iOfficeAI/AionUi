/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveBrowserUrl } from '@/process/resources/builtinMcp/browserServerPort';

const registry = (entries: Array<{ pid: number; port: number }>) => () => JSON.stringify(entries);
const allAlive = () => true;
const noneAlive = () => false;

describe('resolveBrowserUrl', () => {
  it('prefers an explicit browser URL over everything else', () => {
    expect(
      resolveBrowserUrl({
        env: { AIONUI_CDP_BROWSER_URL: 'http://127.0.0.1:9999', AIONUI_CDP_PORT: '9230' },
        readRegistry: registry([{ pid: 1, port: 9231 }]),
        isProcessAlive: allAlive,
      })
    ).toBe('http://127.0.0.1:9999');
  });

  it('builds the URL from the env port when no explicit URL is set', () => {
    expect(resolveBrowserUrl({ env: { AIONUI_CDP_PORT: '9230' }, readRegistry: () => null })).toBe(
      'http://127.0.0.1:9230'
    );
  });

  it('rejects malformed or out-of-range env ports and moves on to the registry', () => {
    for (const port of ['0', '-1', 'abc', '70000', '9230.5']) {
      expect(resolveBrowserUrl({ env: { AIONUI_CDP_PORT: port }, readRegistry: () => null })).toBeNull();
    }
  });

  it('falls back to the registry when exactly one live instance exists', () => {
    expect(
      resolveBrowserUrl({
        env: {},
        readRegistry: registry([{ pid: 42, port: 9233 }]),
        isProcessAlive: allAlive,
      })
    ).toBe('http://127.0.0.1:9233');
  });

  it('refuses to guess when several instances are live', () => {
    // 关键行为：多开时猜错会让 Agent 操作另一个窗口，比直接失败更难排查
    // Key behavior: guessing wrong would have the agent drive another window, which
    // is harder to diagnose than a clean failure.
    expect(
      resolveBrowserUrl({
        env: {},
        readRegistry: registry([
          { pid: 1, port: 9230 },
          { pid: 2, port: 9231 },
        ]),
        isProcessAlive: allAlive,
      })
    ).toBeNull();
  });

  it('ignores dead registry entries when counting live instances', () => {
    let calls = 0;
    const onlyFirstAlive = () => {
      calls += 1;
      return calls === 1;
    };

    expect(
      resolveBrowserUrl({
        env: {},
        readRegistry: registry([
          { pid: 1, port: 9230 },
          { pid: 2, port: 9231 },
        ]),
        isProcessAlive: onlyFirstAlive,
      })
    ).toBe('http://127.0.0.1:9230');
  });

  it('returns null when the registry has no live entries', () => {
    expect(
      resolveBrowserUrl({
        env: {},
        readRegistry: registry([{ pid: 1, port: 9230 }]),
        isProcessAlive: noneAlive,
      })
    ).toBeNull();
  });

  it('returns null on unreadable or malformed registry content', () => {
    expect(resolveBrowserUrl({ env: {}, readRegistry: () => null })).toBeNull();
    expect(resolveBrowserUrl({ env: {}, readRegistry: () => 'not json' })).toBeNull();
    expect(resolveBrowserUrl({ env: {}, readRegistry: () => '{"not":"an array"}' })).toBeNull();
  });

  it('skips registry entries missing pid or port', () => {
    expect(
      resolveBrowserUrl({
        env: {},
        readRegistry: () => JSON.stringify([{ port: 9230 }, { pid: 5 }]),
        isProcessAlive: allAlive,
      })
    ).toBeNull();
  });

  it('reports the registry fallback so the reason is visible in logs', () => {
    const messages: string[] = [];
    resolveBrowserUrl({
      env: {},
      readRegistry: registry([{ pid: 1, port: 9230 }]),
      isProcessAlive: allAlive,
      onDiagnostic: (m) => messages.push(m),
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('registry');
  });
});
