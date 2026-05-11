/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

import { buildCrashMessage } from '../../../../../src/process/acp/session/AcpSession';
import type { DisconnectInfo } from '../../../../../src/process/acp/infra/IAcpClient';

const baseInfo: DisconnectInfo = {
  reason: 'process_exit',
  exitCode: null,
  signal: null,
  stderr: '',
  activePrompt: false,
  intentional: false,
};

describe('buildCrashMessage', () => {
  it('returns null when info is undefined', () => {
    expect(buildCrashMessage(undefined)).toBeNull();
  });

  it('returns null for intentional teardown (suspend / user close)', () => {
    const result = buildCrashMessage({ ...baseInfo, intentional: true, exitCode: 0 });
    expect(result).toBeNull();
  });

  it('annotates idle vs in-flight crashes', () => {
    const idle = buildCrashMessage({ ...baseInfo, reason: 'pipe_close' });
    expect(idle).toContain('while idle');
    expect(idle).toContain('reason: pipe_close');

    const active = buildCrashMessage({ ...baseInfo, reason: 'pipe_close', activePrompt: true });
    expect(active).toContain('while a prompt was in flight');
  });

  it('surfaces exit code and signal', () => {
    const withCode = buildCrashMessage({ ...baseInfo, exitCode: 1 });
    expect(withCode).toContain('code: 1');
    expect(withCode).toContain('signal: none');

    const withSignal = buildCrashMessage({ ...baseInfo, signal: 'SIGSEGV' });
    expect(withSignal).toContain('code: unknown');
    expect(withSignal).toContain('signal: SIGSEGV');
  });

  it('appends stderr tail when present, trims leading/trailing whitespace', () => {
    const result = buildCrashMessage({
      ...baseInfo,
      stderr: '\n\n  bun: out of memory at index.js:42\n',
    });
    expect(result).toMatch(/stderr tail: bun: out of memory at index\.js:42$/);
  });

  it('caps stderr tail length', () => {
    const huge = 'x'.repeat(5000);
    const result = buildCrashMessage({ ...baseInfo, stderr: huge });
    // head has some characters; tail is bounded to 400; total is small vs 5000
    expect(result!.length).toBeLessThan(700);
    expect(result).toContain('stderr tail:');
  });

  it('omits stderr tail line when stderr is blank or whitespace-only', () => {
    const blank = buildCrashMessage({ ...baseInfo, stderr: '   \n\n  ' });
    expect(blank).not.toContain('stderr tail:');
  });

  it('uses reason verbatim so connection_close vs pipe_close is distinguishable', () => {
    const connClose = buildCrashMessage({ ...baseInfo, reason: 'connection_close' });
    expect(connClose).toContain('reason: connection_close');
  });
});
