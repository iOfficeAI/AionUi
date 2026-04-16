import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: (...args: unknown[]) => mockGet(...args) },
}));

import { isAcpV2Enabled } from '@process/acp/compat/featureFlag';

describe('isAcpV2Enabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(undefined);
    delete process.env.AION_ACP_V2;
  });

  it('returns false when no env var and no stored setting', async () => {
    expect(await isAcpV2Enabled()).toBe(false);
  });

  it('returns true when env var is "1"', async () => {
    process.env.AION_ACP_V2 = '1';
    expect(await isAcpV2Enabled()).toBe(true);
  });

  it('returns true when env var is "true"', async () => {
    process.env.AION_ACP_V2 = 'true';
    expect(await isAcpV2Enabled()).toBe(true);
  });

  it('returns false when env var is "0"', async () => {
    process.env.AION_ACP_V2 = '0';
    mockGet.mockResolvedValue(false);
    expect(await isAcpV2Enabled()).toBe(false);
  });

  it('returns true when stored setting is true', async () => {
    mockGet.mockResolvedValue(true);
    expect(await isAcpV2Enabled()).toBe(true);
  });

  it('env var overrides stored setting', async () => {
    process.env.AION_ACP_V2 = '1';
    mockGet.mockResolvedValue(false);
    expect(await isAcpV2Enabled()).toBe(true);
  });
});
