import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStart, mockClose } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockClose: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('@process/acp/infra/ProcessAcpClient', () => ({
  ProcessAcpClient: class {
    start = mockStart;
    close = mockClose;
  },
}));

vi.mock('@process/agent/acp/acpConnectors', () => ({
  spawnGenericBackend: vi.fn().mockResolvedValue({ child: {} }),
}));

vi.mock('@process/acp/types', () => ({
  noopProtocolHandlers: {
    onSessionUpdate: () => {},
    onRequestPermission: () => Promise.resolve({ outcome: { outcome: 'cancelled' } }),
    onReadTextFile: () => Promise.resolve({ content: '' }),
    onWriteTextFile: () => Promise.resolve({}),
  },
}));

import { execFileSync } from 'node:child_process';
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
    mockStart.mockResolvedValue({});
    mockClose.mockResolvedValue(undefined);

    const result = await testCustomAgentConnection({
      command: 'my-agent',
      acpArgs: ['--acp'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.step).toBe('acp_initialize');
  });

  it('returns acp_initialize failure when CLI exists but ACP fails', async () => {
    vi.mocked(execFileSync).mockReturnValue('/usr/local/bin/my-agent');
    mockStart.mockRejectedValue(new Error('ACP handshake timeout'));
    mockClose.mockResolvedValue(undefined);

    const result = await testCustomAgentConnection({
      command: 'my-agent',
      acpArgs: ['--acp'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.step).toBe('acp_initialize');
  });

  it('suppresses close error on ACP failure', async () => {
    vi.mocked(execFileSync).mockReturnValue('/usr/local/bin/my-agent');
    mockStart.mockRejectedValue(new Error('handshake failed'));
    mockClose.mockRejectedValue(new Error('close also failed'));

    const result = await testCustomAgentConnection({
      command: 'my-agent',
    });

    expect(result.success).toBe(false);
    expect(result.data?.step).toBe('acp_initialize');
    expect(result.msg).toContain('handshake failed');
  });

  it('extracts base command from multi-word command', async () => {
    vi.mocked(execFileSync).mockReturnValue('/usr/local/bin/npx');
    mockStart.mockResolvedValue({});
    mockClose.mockResolvedValue(undefined);

    await testCustomAgentConnection({
      command: 'npx my-agent-cli',
    });

    expect(execFileSync).toHaveBeenCalledWith(expect.any(String), ['npx'], expect.any(Object));
  });
});
