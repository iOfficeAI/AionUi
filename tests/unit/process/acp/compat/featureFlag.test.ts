// tests/unit/process/acp/compat/featureFlag.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { isAcpV2Enabled } from '@process/acp/compat/featureFlag';

describe('isAcpV2Enabled', () => {
  afterEach(() => {
    delete process.env.AION_ACP_V2;
  });

  it('returns false when env var is not set', () => {
    delete process.env.AION_ACP_V2;
    expect(isAcpV2Enabled()).toBe(false);
  });

  it('returns true when env var is "1"', () => {
    process.env.AION_ACP_V2 = '1';
    expect(isAcpV2Enabled()).toBe(true);
  });

  it('returns true when env var is "true"', () => {
    process.env.AION_ACP_V2 = 'true';
    expect(isAcpV2Enabled()).toBe(true);
  });

  it('returns false for other values', () => {
    process.env.AION_ACP_V2 = '0';
    expect(isAcpV2Enabled()).toBe(false);
  });
});
