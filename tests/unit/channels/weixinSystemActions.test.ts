/**
 * Tests that SystemActions handles 'weixin' platform in all three ternary chains.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron before any imports
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

const mockGet = vi.fn();
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: mockGet },
}));

vi.mock('@process/channels/pairing/PairingService', () => ({
  getPairingService: vi.fn(() => ({})),
}));

vi.mock('@process/acp/connectors/acpConversationConnector', () => ({}));

// Also mock provider list (used inside getChannelDefaultModel)
vi.mock('@process/model/providerListStore', () => ({
  getProviderList: vi.fn(async () => []),
}));

describe('SystemActions weixin platform handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(undefined);
  });

  it('getChannelDefaultModel reads assistant.weixin.defaultModel for weixin platform', async () => {
    const { getChannelDefaultModel } = await import('@process/channels/actions/SystemActions');

    mockGet.mockImplementation((key: string) => {
      if (key === 'assistant.weixin.defaultModel') return Promise.resolve({ id: 'p1', useModel: 'gemini-2.0-flash' });
      return Promise.resolve(undefined);
    });

    // Function will fall through to provider fallback (providers list is empty)
    // but mockGet must have been called with the weixin key, not telegram
    try {
      await getChannelDefaultModel('weixin');
    } catch {
      // fallback throws when no provider found — that's fine, we check the key below
    }
    expect(mockGet).toHaveBeenCalledWith('assistant.weixin.defaultModel');
    expect(mockGet).not.toHaveBeenCalledWith('assistant.telegram.defaultModel');
  });

  it('getChannelDefaultModel still reads assistant.telegram.defaultModel for telegram', async () => {
    vi.resetModules();
    const { getChannelDefaultModel } = await import('@process/channels/actions/SystemActions');

    mockGet.mockResolvedValue(undefined);
    try {
      await getChannelDefaultModel('telegram');
    } catch {
      // fallback throws — fine
    }
    expect(mockGet).toHaveBeenCalledWith('assistant.telegram.defaultModel');
    expect(mockGet).not.toHaveBeenCalledWith('assistant.weixin.defaultModel');
  });
});
