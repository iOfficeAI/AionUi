/**
 * Tests that SystemActions handles 'weixin' platform in all three ternary chains.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/config/constants';
import { getChannelDefaultModel } from '@process/channels/actions/SystemActions';
import { buildChannelConversationExtra, getChannelEnabledSkills } from '@process/channels/utils';

const { mockGet, mockGetDetectedAgents } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockGetDetectedAgents: vi.fn(() => []),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: mockGet },
}));

vi.mock('@process/channels/pairing/PairingService', () => ({
  getPairingService: vi.fn(() => ({})),
}));

vi.mock('@process/acp/connectors/acpConversationConnector', () => ({}));

vi.mock('@process/model/providerListStore', () => ({
  getProviderList: vi.fn(async () => []),
}));

vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    getDetectedAgents: mockGetDetectedAgents,
  },
}));

vi.mock('@/process/services/conversationServiceSingleton', () => ({
  conversationServiceSingleton: {
    createConversation: vi.fn(),
  },
}));

vi.mock('@/process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {
    kill: vi.fn(),
  },
}));

vi.mock('@process/channels/agent/ChannelMessageService', () => ({
  getChannelMessageService: vi.fn(() => ({
    clearContext: vi.fn(),
  })),
}));

vi.mock('@process/channels/core/ChannelManager', () => ({
  getChannelManager: vi.fn(() => ({
    getSessionManager: vi.fn(),
    isInitialized: vi.fn(() => false),
  })),
}));

vi.mock('@process/channels/plugins/telegram/TelegramKeyboards', () => ({
  createAgentSelectionKeyboard: vi.fn(),
  createHelpKeyboard: vi.fn(),
  createMainMenuKeyboard: vi.fn(),
  createSessionControlKeyboard: vi.fn(),
}));

vi.mock('@process/channels/plugins/lark/LarkCards', () => ({
  createAgentSelectionCard: vi.fn(),
  createFeaturesCard: vi.fn(),
  createHelpCard: vi.fn(),
  createMainMenuCard: vi.fn(),
  createPairingGuideCard: vi.fn(),
  createSessionStatusCard: vi.fn(),
  createSettingsCard: vi.fn(),
  createTipsCard: vi.fn(),
}));

vi.mock('@process/channels/plugins/dingtalk/DingTalkCards', () => ({
  createAgentSelectionCard: vi.fn(),
  createFeaturesCard: vi.fn(),
  createHelpCard: vi.fn(),
  createMainMenuCard: vi.fn(),
  createPairingGuideCard: vi.fn(),
  createSessionStatusCard: vi.fn(),
  createSettingsCard: vi.fn(),
  createTipsCard: vi.fn(),
}));

describe('SystemActions weixin platform handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(undefined);
    mockGetDetectedAgents.mockReturnValue([]);
  });

  it('getChannelDefaultModel reads assistant.weixin.defaultModel for weixin platform', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'assistant.weixin.defaultModel') {
        return Promise.resolve({ id: 'p1', useModel: 'gemini-2.0-flash' });
      }
      return Promise.resolve(undefined);
    });

    const callsBefore = mockGet.mock.calls.length;
    await getChannelDefaultModel('weixin');
    const newCalls = mockGet.mock.calls.slice(callsBefore).map(([key]) => key);

    expect(newCalls).toContain('assistant.weixin.defaultModel');
    expect(newCalls).not.toContain('assistant.telegram.defaultModel');
  });

  it('getChannelDefaultModel still reads assistant.telegram.defaultModel for telegram', async () => {
    mockGet.mockResolvedValue(undefined);

    const callsBefore = mockGet.mock.calls.length;
    await getChannelDefaultModel('telegram');
    const newCalls = mockGet.mock.calls.slice(callsBefore).map(([key]) => key);

    expect(newCalls).toContain('assistant.telegram.defaultModel');
    expect(newCalls).not.toContain('assistant.weixin.defaultModel');
  });

  it('getChannelDefaultModel reads assistant.wecom.defaultModel for wecom platform', async () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'assistant.wecom.defaultModel') {
        return Promise.resolve({ id: 'p1', useModel: 'gemini-2.0-flash' });
      }
      return Promise.resolve(undefined);
    });

    await getChannelDefaultModel('wecom');

    expect(mockGet).toHaveBeenCalledWith('assistant.wecom.defaultModel');
    expect(mockGet).not.toHaveBeenCalledWith('assistant.telegram.defaultModel');
  });

  it('uses local Gemini OAuth credentials when the saved weixin model is Google Auth', async () => {
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
