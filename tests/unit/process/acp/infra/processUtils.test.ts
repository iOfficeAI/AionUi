// tests/unit/process/acp/infra/processUtils.test.ts
import { describe, it, expect } from 'vitest';
import { splitCommandLine, prepareCleanEnv, isProcessAlive } from '@process/acp/infra/processUtils';

describe('splitCommandLine', () => {
  it('splits simple command', () => {
    expect(splitCommandLine('node server.js')).toEqual(['node', 'server.js']);
  });
  it('handles double-quoted arguments', () => {
    expect(splitCommandLine('echo "hello world"')).toEqual(['echo', 'hello world']);
  });
  it('handles single-quoted arguments', () => {
    expect(splitCommandLine("echo 'hello world'")).toEqual(['echo', 'hello world']);
  });
  it('handles escaped spaces', () => {
    expect(splitCommandLine('path/to/my\\ file')).toEqual(['path/to/my file']);
  });
  it('throws for empty string', () => {
    expect(() => splitCommandLine('')).toThrow('splitCommandLine: empty command');
  });
  it('handles mixed quotes and args', () => {
    expect(splitCommandLine('cmd --flag "a b" --other')).toEqual(['cmd', '--flag', 'a b', '--other']);
  });
});

describe('prepareCleanEnv', () => {
  it('returns merged env without ELECTRON_ vars', () => {
    const original = { PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1', HOME: '/home/user' };
    const custom = { MY_VAR: 'hello' };
    const result = prepareCleanEnv(custom, original);
    expect(result.PATH).toBe('/usr/bin');
    expect(result.HOME).toBe('/home/user');
    expect(result.MY_VAR).toBe('hello');
    expect(result.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });
});

describe('isProcessAlive', () => {
  it('returns true for current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });
  it('returns false for non-existent PID', () => {
    expect(isProcessAlive(999999)).toBe(false);
  });
});
