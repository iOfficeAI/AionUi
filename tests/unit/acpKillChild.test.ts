import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { killChild, isProcessAlive } from '../../src/process/agent/acp/utils';

// These tests rely on POSIX commands (sleep, bash, pgrep) unavailable on Windows.
// Windows kill path uses taskkill which is covered by the implementation itself.
const describeIfPosix = process.platform === 'win32' ? describe.skip : describe;

describeIfPosix('killChild', () => {
  it('kills a normal child process with SIGTERM', async () => {
    const child = spawn('sleep', ['60']);
    expect(child.pid).toBeDefined();
    expect(isProcessAlive(child.pid!)).toBe(true);

    await killChild(child, false);

    expect(isProcessAlive(child.pid!)).toBe(false);
  });

  it('kills a detached process group', async () => {
    const child = spawn('sleep', ['60'], { detached: true });
    child.unref();
    expect(child.pid).toBeDefined();
    expect(isProcessAlive(child.pid!)).toBe(true);

    await killChild(child, true);

    expect(isProcessAlive(child.pid!)).toBe(false);
  });

  it('escalates to SIGKILL when process ignores SIGTERM', async () => {
    // Spawn a process that traps SIGTERM (ignores it)
    const child = spawn('bash', ['-c', 'trap "" TERM; sleep 60']);
    expect(child.pid).toBeDefined();

    // Wait for bash to set up the trap
    await new Promise((r) => setTimeout(r, 200));
    expect(isProcessAlive(child.pid!)).toBe(true);

    await killChild(child, false);

    // Should be dead via SIGKILL escalation
    expect(isProcessAlive(child.pid!)).toBe(false);
  });

  it('cleans up child processes spawned by the target', async () => {
    // Parent spawns a child that also spawns a grandchild
    const parent = spawn('bash', ['-c', 'sleep 60 & sleep 60 & wait'], { detached: true });
    parent.unref();
    expect(parent.pid).toBeDefined();

    // Wait for children to spawn
    await new Promise((r) => setTimeout(r, 300));

    // Collect child PIDs before kill
    const { execFile: execFileCb } = await import('child_process');
    const { promisify } = await import('util');
    const execFile = promisify(execFileCb);

    let childPids: number[] = [];
    try {
      const { stdout } = await execFile('pgrep', ['-P', String(parent.pid!)]);
      childPids = stdout
        .trim()
        .split('\n')
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n));
    } catch {
      // no children found
    }

    expect(childPids.length).toBeGreaterThan(0);

    await killChild(parent, true);

    // All descendants should be dead
    expect(isProcessAlive(parent.pid!)).toBe(false);
    for (const pid of childPids) {
      expect(isProcessAlive(pid)).toBe(false);
    }
  });
});
