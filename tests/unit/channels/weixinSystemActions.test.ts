/**
 * Tests that SystemActions handles 'weixin' platform in all three ternary chains.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/config/constants';
import { buildChannelConversationExtra, getChannelEnabledSkills } from '@process/channels/utils';

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
    vi.resetModules();
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
    const { getChannelDefaultModel } = await import('@process/channels/actions/SystemActions');

    mockGet.mockResolvedValue(undefined);
    await getChannelDefaultModel('telegram');
    expect(mockGet).toHaveBeenCalledWith('assistant.telegram.defaultModel');
    expect(mockGet).not.toHaveBeenCalledWith('assistant.weixin.defaultModel');
  });

  it('uses local Gemini OAuth credentials when the saved weixin model is Google Auth', async () => {
    const { getChannelDefaultModel } = await import('@process/channels/actions/SystemActions');

    mockGet.mockImplementation((key: string) => {
      if (key === 'model.config') return Promise.resolve([]);
      if (key === 'assistant.weixin.defaultModel') {
        return Promise.resolve({ id: GOOGLE_AUTH_PROVIDER_ID, useModel: 'gemini-2.5-pro' });
      }
      return Promise.resolve(undefined);
    });
    vi.spyOn(os, 'homedir').mockReturnValue('/tmp/test-home');
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({ access_token: 'token' }) as never);

    const result = await getChannelDefaultModel('weixin');

    expect(result.id).toBe(GOOGLE_AUTH_PROVIDER_ID);
    expect(result.platform).toBe('gemini-with-google-auth');
    expect(result.useModel).toBe('gemini-2.5-pro');
    expect(fs.promises.readFile).toHaveBeenCalledWith(
      path.join('/tmp/test-home', '.gemini', 'oauth_creds.json'),
      'utf-8'
    );
  });

  it('falls back to a Gemini API-key provider when Google Auth is selected but local creds are missing', async () => {
    const { getChannelDefaultModel } = await import('@process/channels/actions/SystemActions');

    mockGet.mockImplementation((key: string) => {
      if (key === 'model.config') {
        return Promise.resolve([
          {
            id: 'gemini-api',
            platform: 'gemini',
            apiKey: 'sk-test',
            model: ['gemini-2.0-flash', 'gemini-2.5-pro'],
          },
        ]);
      }
      if (key === 'assistant.weixin.defaultModel') {
        return Promise.resolve({ id: GOOGLE_AUTH_PROVIDER_ID, useModel: 'gemini-2.5-pro' });
      }
      return Promise.resolve(undefined);
    });
    vi.spyOn(os, 'homedir').mockReturnValue('/tmp/test-home');
    vi.spyOn(fs.promises, 'readFile').mockRejectedValue(new Error('missing creds'));

    const result = await getChannelDefaultModel('weixin');

    expect(result.id).toBe('gemini-api');
    expect(result.platform).toBe('gemini');
    expect(result.useModel).toBe('gemini-2.5-pro');
  });

  it('falls back to Google Auth credentials when no API-key provider exists', async () => {
    const { getChannelDefaultModel } = await import('@process/channels/actions/SystemActions');

    mockGet.mockImplementation((key: string) => {
      if (key === 'model.config') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    vi.spyOn(os, 'homedir').mockReturnValue('/tmp/test-home');
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(JSON.stringify({ refresh_token: 'refresh' }) as never);

    const result = await getChannelDefaultModel('weixin');

    expect(result.id).toBe(GOOGLE_AUTH_PROVIDER_ID);
    expect(result.platform).toBe('gemini-with-google-auth');
    expect(result.useModel).toBe('gemini-2.0-flash');
  });

  it('enables weixin-file-send only for weixin channel conversations', () => {
    expect(getChannelEnabledSkills('weixin')).toEqual(['weixin-file-send']);
    expect(getChannelEnabledSkills('telegram')).toBeUndefined();
  });

  it('builds channel conversation extra with enabledSkills for weixin across backends', () => {
    expect(buildChannelConversationExtra({ platform: 'weixin', backend: 'gemini' })).toEqual({
      enabledSkills: ['weixin-file-send'],
    });

    expect(
      buildChannelConversationExtra({
        platform: 'weixin',
        backend: 'claude',
        customAgentId: 'agent-1',
        agentName: 'Claude',
      })
    ).toEqual({
      backend: 'claude',
      customAgentId: 'agent-1',
      agentName: 'Claude',
      enabledSkills: ['weixin-file-send'],
    });
  });
});
