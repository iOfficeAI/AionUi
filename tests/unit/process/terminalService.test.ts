/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalService } from '@/process/services/terminal/TerminalService';

describe('TerminalService', () => {
  let service: TerminalService;

  beforeEach(() => {
    service = new TerminalService();
  });

  describe('shell & cwd resolution', () => {
    it('returns default shell based on platform', () => {
      const shell = service.getDefaultShell();
      expect(typeof shell).toBe('string');
      expect(shell.length).toBeGreaterThan(0);
    });

    it('resolves valid existing directory as cwd', () => {
      const tmpDir = os.tmpdir();
      const resolved = service.resolveCwd(tmpDir);
      expect(resolved).toBe(path.resolve(tmpDir));
    });

    it('falls back to home directory when cwd does not exist or is invalid', () => {
      const nonExistent = path.join(os.tmpdir(), `non-existent-${Date.now()}`);
      const resolved = service.resolveCwd(nonExistent);
      expect(resolved).toBe(os.homedir() || process.cwd());
    });

    it('falls back to home directory when cwd is empty string or whitespace', () => {
      const resolved = service.resolveCwd('   ');
      expect(resolved).toBe(os.homedir() || process.cwd());
    });
  });

  describe('session lifecycle', () => {
    it('creates a new session and returns session info', () => {
      const session = service.createSession({
        id: 'test-session-1',
        cwd: os.tmpdir(),
      });

      expect(session.id).toBe('test-session-1');
      expect(session.cwd).toBe(path.resolve(os.tmpdir()));
      expect(session.shell).toBeTruthy();
      expect(service.hasSession('test-session-1')).toBe(true);

      service.kill('test-session-1');
    });

    it('returns existing session info when createSession is called with same id', () => {
      const s1 = service.createSession({ id: 'test-session-dup', cwd: os.tmpdir() });
      const s2 = service.createSession({ id: 'test-session-dup', cwd: os.homedir() });

      expect(s2.id).toBe(s1.id);
      expect(s2.cwd).toBe(s1.cwd);

      service.kill('test-session-dup');
    });

    it('returns null when getSession is called with non-existent id', () => {
      expect(service.getSession('non-existent')).toBeNull();
      expect(service.hasSession('non-existent')).toBe(false);
    });

    it('kills and removes session', () => {
      service.createSession({ id: 'test-kill-1' });
      expect(service.hasSession('test-kill-1')).toBe(true);

      service.kill('test-kill-1');
      expect(service.hasSession('test-kill-1')).toBe(false);
      expect(service.getSession('test-kill-1')).toBeNull();
    });

    it('gracefully handles kill on non-existent session', () => {
      expect(() => service.kill('ghost-session')).not.toThrow();
    });

    it('writes to session and handles non-existent session safely', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      service.createSession({ id: 'test-write-1' });
      expect(() => service.write('test-write-1', 'echo hi\n')).not.toThrow();

      // Write to non-existent session
      service.write('non-existent-write', 'echo fail\n');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Session non-existent-write not found'));

      consoleSpy.mockRestore();
      service.kill('test-write-1');
    });

    it('resizes session without crashing', () => {
      service.createSession({ id: 'test-resize-1' });
      expect(() => service.resize('test-resize-1', 120, 40)).not.toThrow();
      expect(() => service.resize('ghost-resize', 120, 40)).not.toThrow();
      service.kill('test-resize-1');
    });

    it('closes all sessions on closeAll', () => {
      service.createSession({ id: 'batch-1' });
      service.createSession({ id: 'batch-2' });
      expect(service.hasSession('batch-1')).toBe(true);
      expect(service.hasSession('batch-2')).toBe(true);

      service.closeAll();
      expect(service.hasSession('batch-1')).toBe(false);
      expect(service.hasSession('batch-2')).toBe(false);
    });
  });

  describe('callbacks & event emission', () => {
    it('notifies onData callback when data arrives', async () => {
      const onData = vi.fn();
      const onExit = vi.fn();
      service.setCallbacks({ onData, onExit });

      service.createSession({ id: 'cb-session-1' });
      service.write('cb-session-1', 'echo callback_test\n');

      await vi.waitFor(
        () => {
          expect(onData).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );

      service.kill('cb-session-1');
    });

    it('handles fallback spawn process directly and routes data and close', async () => {
      const onData = vi.fn();
      const onExit = vi.fn();
      service.setCallbacks({ onData, onExit });

      const fallbackSession = (
        service as unknown as {
          spawnFallbackProcess: (
            id: string,
            shell: string,
            cwd: string,
            env: Record<string, string | undefined>
          ) => {
            write: (data: string) => void;
            kill: () => void;
            cwd: string;
            shell: string;
          };
        }
      ).spawnFallbackProcess('fallback-direct-1', service.getDefaultShell(), os.tmpdir(), {
        ...process.env,
        TERM: 'xterm-256color',
      });

      expect(fallbackSession.cwd).toBe(os.tmpdir());
      expect(fallbackSession.shell).toBeTruthy();

      fallbackSession.write('echo fallback_direct_ok\n');

      await vi.waitFor(
        () => {
          expect(onData).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );

      fallbackSession.kill();
    });
  });
});
