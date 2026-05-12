import { describe, expect, it } from 'vitest';
import { buildSshAcpConnectionTestArgs, buildSshAcpLaunch, isSshAcpRemoteAgent } from '@process/agent/remote/sshAcp';
import type { RemoteAgentConfig } from '@process/agent/remote/types';

function makeConfig(overrides: Partial<RemoteAgentConfig> = {}): RemoteAgentConfig {
  return {
    id: 'agent-1',
    name: 'SSH Agent',
    protocol: 'ssh-acp',
    url: 'ssh://dev@example.com:2222/home/dev/project?command=opencode%20--experimental-acp',
    authType: 'none',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('sshAcp remote helpers', () => {
  it('detects ssh-acp remote agents', () => {
    expect(isSshAcpRemoteAgent(makeConfig())).toBe(true);
    expect(isSshAcpRemoteAgent(makeConfig({ protocol: 'openclaw' }))).toBe(false);
  });

  it('builds an ssh launch command that wraps a remote ACP command', () => {
    const launch = buildSshAcpLaunch(makeConfig({ authType: 'bearer', authToken: '/keys/id_ed25519' }));

    expect(launch.command).toBe('ssh');
    expect(launch.args).toEqual([
      '-T',
      '-o',
      'ServerAliveInterval=30',
      '-o',
      'ServerAliveCountMax=3',
      '-i',
      '/keys/id_ed25519',
      '-p',
      '2222',
      'dev@example.com',
      "cd '/home/dev/project' && opencode --experimental-acp",
    ]);
  });

  it('builds lightweight SSH args for connection testing', () => {
    const args = buildSshAcpConnectionTestArgs(makeConfig());

    expect(args).toEqual([
      '-T',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '-p',
      '2222',
      'dev@example.com',
      'printf ok',
    ]);
  });

  it('requires a command query parameter for ACP launch', () => {
    expect(() => buildSshAcpLaunch(makeConfig({ url: 'ssh://dev@example.com/home/dev/project' }))).toThrow(
      'command query parameter'
    );
  });
});
