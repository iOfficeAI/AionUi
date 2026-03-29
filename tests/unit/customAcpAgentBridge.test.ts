import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('@process/agent/acp/AcpConnection', () => ({
  AcpConnection: vi.fn().mockImplementation(function () {
    return { connect: mockConnect, disconnect: mockDisconnect };
  }),
}));

import { execFileSync } from 'child_process';
import { testCustomAgentConnection } from '@process/bridge/testCustomAgentConnection';

describe('testCustomAgentConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cli_check failure when command does not exist', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const result = await testCustomAgentConnection({
      command: 'nonexistent-agent',
      acpArgs: ['--acp'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.step).toBe('cli_check');
  });

  it('returns success when CLI exists and ACP initialize succeeds', async () => {
    vi.mocked(execFileSync).mockReturnValue('/usr/local/bin/my-agent');
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);

    const result = await testCustomAgentConnection({
      command: 'my-agent',
      acpArgs: ['--acp'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.step).toBe('acp_initialize');
  });

  it('returns acp_initialize failure when CLI exists but ACP fails', async () => {
    vi.mocked(execFileSync).mockReturnValue('/usr/local/bin/my-agent');
    mockConnect.mockRejectedValue(new Error('ACP handshake timeout'));
    mockDisconnect.mockResolvedValue(undefined);

    const result = await testCustomAgentConnection({
      command: 'my-agent',
      acpArgs: ['--acp'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.step).toBe('acp_initialize');
  });

  it('passes env and acpArgs to AcpConnection.connect', async () => {
    vi.mocked(execFileSync).mockReturnValue('/usr/local/bin/my-agent');
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);

    await testCustomAgentConnection({
      command: 'my-agent',
      acpArgs: ['--acp'],
      env: { API_KEY: 'secret', NODE_ENV: 'test' },
    });

    expect(mockConnect).toHaveBeenCalledWith('custom', 'my-agent', expect.any(String), ['--acp'], {
      API_KEY: 'secret',
      NODE_ENV: 'test',
    });
  });

  it('suppresses disconnect error on ACP failure', async () => {
    vi.mocked(execFileSync).mockReturnValue('/usr/local/bin/my-agent');
    mockConnect.mockRejectedValue(new Error('handshake failed'));
    mockDisconnect.mockRejectedValue(new Error('disconnect also failed'));

    const result = await testCustomAgentConnection({
      command: 'my-agent',
    });

    expect(result.success).toBe(false);
    expect(result.data?.step).toBe('acp_initialize');
    expect(result.msg).toContain('handshake failed');
  });

  it('extracts base command from multi-word command', async () => {
    vi.mocked(execFileSync).mockReturnValue('/usr/local/bin/npx');
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);

    await testCustomAgentConnection({
      command: 'npx my-agent-cli',
    });

    expect(execFileSync).toHaveBeenCalledWith(expect.any(String), ['npx'], expect.any(Object));
  });
});
