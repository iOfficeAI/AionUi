/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for process/services/terminal/TerminalService. node-pty is mocked
 * so these run in any environment without spawning real shells.
 */

import { describe, expect, it, vi } from 'vitest';

import { TerminalService } from '@/process/services/terminal/TerminalService';
import type { TerminalExitEvent, TerminalOutputEvent } from '@/common/types/terminal/terminalTypes';

type FakePty = {
  pid: number;
  write: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (e: { exitCode?: number; signal?: number }) => void) => void;
  _emitData: (data: string) => void;
  _emitExit: (e: { exitCode?: number; signal?: number }) => void;
};

function makeFakePty(pid = 1234): FakePty {
  let dataCb: ((data: string) => void) | null = null;
  let exitCb: ((e: { exitCode?: number; signal?: number }) => void) | null = null;
  return {
    pid,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb) => {
      dataCb = cb;
    },
    onExit: (cb) => {
      exitCb = cb;
    },
    _emitData: (data) => dataCb?.(data),
    _emitExit: (e) => exitCb?.(e),
  };
}

function makeService(opts: { fakePtyFactory?: () => FakePty; existsAll?: boolean } = {}) {
  const ptys: FakePty[] = [];
  const spawn = vi.fn(() => {
    const next = opts.fakePtyFactory ? opts.fakePtyFactory() : makeFakePty(ptys.length + 1000);
    ptys.push(next);
    return next as never;
  });
  const service = new TerminalService({
    spawn: spawn as never,
    exists: () => opts.existsAll ?? true,
    platform: 'darwin',
    env: { SHELL: '/bin/zsh', HOME: '/home/test' },
  });
  return { service, spawn, ptys };
}

describe('TerminalService.spawn', () => {
  it('returns metadata including session_id, shell, cwd, pid', () => {
    const { service } = makeService();
    const result = service.spawn();
    expect(result.shell).toBe('/bin/zsh');
    expect(result.cwd).toBe('/home/test');
    expect(typeof result.session_id).toBe('string');
    expect(result.session_id.length).toBeGreaterThan(0);
    expect(result.pid).toBe(1000);
  });

  it('uses the requested cwd when it exists', () => {
    const { service, spawn } = makeService({ existsAll: true });
    service.spawn({ cwd: '/tmp/project' });
    expect(spawn).toHaveBeenCalledWith('/bin/zsh', [], expect.objectContaining({ cwd: '/tmp/project' }));
  });

  it('falls back to default cwd when the requested directory does not exist', () => {
    const spawn = vi.fn(() => makeFakePty() as never);
    const service = new TerminalService({
      spawn: spawn as never,
      exists: (p) => p === '/bin/zsh',
      platform: 'darwin',
      env: { SHELL: '/bin/zsh', HOME: '/home/test' },
    });
    service.spawn({ cwd: '/does/not/exist' });
    expect(spawn).toHaveBeenCalledWith('/bin/zsh', [], expect.objectContaining({ cwd: '/home/test' }));
  });

  it('clamps absurd dimension requests', () => {
    const { service, spawn } = makeService();
    service.spawn({ cols: 99999, rows: -3 });
    const call = spawn.mock.calls[0]?.[2] as { cols: number; rows: number };
    expect(call.cols).toBe(1000);
    expect(call.rows).toBe(1);
  });

  it('emits output events tagged with the session_id', () => {
    const { service, ptys } = makeService();
    const events: TerminalOutputEvent[] = [];
    service.on('output', (e) => events.push(e));
    const { session_id } = service.spawn();
    ptys[0]._emitData('hello\r\n');
    expect(events).toEqual([{ session_id, data: 'hello\r\n' }]);
  });
});

describe('TerminalService.write', () => {
  it('forwards data to the underlying pty', () => {
    const { service, ptys } = makeService();
    const { session_id } = service.spawn();
    expect(service.write(session_id, 'ls\r')).toBe(true);
    expect(ptys[0].write).toHaveBeenCalledWith('ls\r');
  });

  it('returns false for an unknown session', () => {
    const { service } = makeService();
    expect(service.write('does-not-exist', 'x')).toBe(false);
  });

  it('returns false when the underlying pty throws', () => {
    const { service, ptys } = makeService();
    const { session_id } = service.spawn();
    ptys[0].write.mockImplementation(() => {
      throw new Error('EPIPE');
    });
    expect(service.write(session_id, 'x')).toBe(false);
  });
});

describe('TerminalService.resize', () => {
  it('clamps and forwards new dimensions', () => {
    const { service, ptys } = makeService();
    const { session_id } = service.spawn();
    service.resize(session_id, 0, 5000);
    expect(ptys[0].resize).toHaveBeenCalledWith(1, 1000);
  });

  it('returns false for an unknown session', () => {
    const { service } = makeService();
    expect(service.resize('missing', 80, 24)).toBe(false);
  });
});

describe('TerminalService.kill', () => {
  it('emits a killed exit event and removes the session', () => {
    const { service, ptys } = makeService();
    const events: TerminalExitEvent[] = [];
    service.on('exit', (e) => events.push(e));
    const { session_id } = service.spawn();
    expect(service.kill(session_id)).toBe(true);
    expect(ptys[0].kill).toHaveBeenCalled();
    expect(service.has(session_id)).toBe(false);
    expect(events[0]).toEqual({
      session_id,
      exit_code: null,
      signal: null,
      reason: 'killed',
    });
  });

  it('returns false for an unknown session', () => {
    const { service } = makeService();
    expect(service.kill('nope')).toBe(false);
  });
});

describe('TerminalService — shell-exit lifecycle', () => {
  it('marks the session gone and emits a shell-exit event', () => {
    const { service, ptys } = makeService();
    const events: TerminalExitEvent[] = [];
    service.on('exit', (e) => events.push(e));
    const { session_id } = service.spawn();
    ptys[0]._emitExit({ exitCode: 0 });
    expect(service.has(session_id)).toBe(false);
    expect(events[0]).toMatchObject({ session_id, exit_code: 0, reason: 'shell-exit' });
  });
});

describe('TerminalService.killAll', () => {
  it('kills every live session', () => {
    const { service, ptys } = makeService();
    service.spawn();
    service.spawn();
    service.spawn();
    expect(service.size).toBe(3);
    service.killAll();
    expect(service.size).toBe(0);
    for (const p of ptys) expect(p.kill).toHaveBeenCalled();
  });
});
