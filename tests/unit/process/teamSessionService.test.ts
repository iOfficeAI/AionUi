/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IConversationService } from '../../../src/process/services/IConversationService';
import type { ITeamRepository } from '../../../src/process/team/repository/ITeamRepository';
import type { TTeam, TeamAgent } from '../../../src/common/types/teamTypes';

const { mockConfigGet, mockReadFile } = vi.hoisted(() => ({
  mockConfigGet: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('../../../src/process/utils/initStorage', () => ({
  ProcessConfig: {
    get: mockConfigGet,
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
  },
}));

import { TeamSessionService } from '../../../src/process/team/TeamSessionService';

function makeRepo(overrides: Partial<ITeamRepository> = {}): ITeamRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMailboxByTeam: vi.fn(),
    deleteTasksByTeam: vi.fn(),
    writeMessage: vi.fn(),
    readUnread: vi.fn(),
    markRead: vi.fn(),
    getMailboxHistory: vi.fn(),
    createTask: vi.fn(),
    findTaskById: vi.fn(),
    updateTask: vi.fn(),
    findTasksByTeam: vi.fn(),
    findTasksByOwner: vi.fn(),
    deleteTask: vi.fn(),
    ...overrides,
  };
}

function makeConversationService(overrides: Partial<IConversationService> = {}): IConversationService {
  return {
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    updateConversation: vi.fn(),
    getConversation: vi.fn(),
    createWithMigration: vi.fn(),
    listAllConversations: vi.fn(),
    ...overrides,
  };
}

function makeWorkerTaskManager() {
  return {
    getOrBuildTask: vi.fn(),
  };
}

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: '',
    conversationId: '',
    role: 'lead',
    agentType: 'gemini',
    agentName: 'Gemini',
    conversationType: 'gemini',
    status: 'pending',
    ...overrides,
  };
}

describe('TeamSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates gemini team conversations with google auth model metadata', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'gemini.defaultModel') {
        return { id: 'google-auth-gemini', useModel: 'gemini-2.5-pro' };
      }
      if (key === 'model.config') {
        return [];
      }
      return undefined;
    });
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ refresh_token: 'token' }));

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-gemini', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.createTeam({
      userId: 'user-1',
      name: 'Team Gemini',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [makeAgent()],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gemini',
        model: expect.objectContaining({
          id: 'google-auth-gemini',
          platform: 'gemini-with-google-auth',
          useModel: 'gemini-2.5-pro',
        }),
      })
    );
  });

  it('uses preferred ACP model when creating qwen team conversations', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'gemini.defaultModel') {
        return undefined;
      }
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'gemini',
            name: 'Gemini API',
            apiKey: 'key',
            baseUrl: 'https://example.com',
            model: ['gemini-2.0-flash'],
            enabled: true,
          },
        ];
      }
      if (key === 'acp.config') {
        return {
          qwen: {
            preferredModelId: 'qwen3-coder-plus',
          },
        };
      }
      if (key === 'acp.cachedModels') {
        return undefined;
      }
      return undefined;
    });

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-qwen', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.createTeam({
      userId: 'user-1',
      name: 'Team Qwen',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [makeAgent({ agentType: 'qwen', agentName: 'Qwen', conversationType: 'acp' })],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp',
        model: expect.objectContaining({
          id: 'provider-1',
          useModel: 'gemini-2.0-flash',
        }),
        extra: expect.objectContaining({
          backend: 'qwen',
          currentModelId: 'qwen3-coder-plus',
        }),
      })
    );
  });

  it('preserves preset assistant identity and inherited ACP settings when adding teammates', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'gemini.defaultModel') {
        return undefined;
      }
      if (key === 'model.config') {
        return [
          {
            id: 'provider-1',
            platform: 'gemini',
            name: 'Gemini API',
            apiKey: 'key',
            baseUrl: 'https://example.com',
            model: ['gemini-2.0-flash'],
            enabled: true,
          },
        ];
      }
      if (key === 'acp.config') {
        return {
          qwen: {
            preferredModelId: 'qwen3-coder-next',
          },
        };
      }
      if (key === 'acp.cachedModels') {
        return undefined;
      }
      return undefined;
    });

    const team: TTeam = {
      id: 'team-1',
      userId: 'user-1',
      name: 'Preset Team',
      workspace: '/workspace',
      workspaceMode: 'shared',
      leadAgentId: 'slot-lead',
      agents: [
        {
          slotId: 'slot-lead',
          conversationId: 'conv-lead',
          role: 'lead',
          agentType: 'qwen',
          agentName: 'Lead Qwen',
          conversationType: 'acp',
          status: 'idle',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(team),
      update: vi.fn().mockImplementation(async (_id, updates) => ({ ...team, ...updates })),
    });
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-new', extra: {} }),
      getConversation: vi.fn().mockResolvedValue({
        id: 'conv-lead',
        extra: {
          backend: 'qwen',
          sessionMode: 'yolo',
          currentModelId: 'qwen3-coder-pro',
        },
      }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.addAgent('team-1', {
      conversationId: '',
      role: 'teammate',
      agentType: 'qwen',
      agentName: 'Preset Qwen',
      conversationType: 'acp',
      status: 'pending',
      customAgentId: 'builtin-preset-qwen',
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: expect.objectContaining({
          backend: 'qwen',
          presetAssistantId: 'builtin-preset-qwen',
          sessionMode: 'yolo',
          currentModelId: 'qwen3-coder-pro',
        }),
      })
    );
  });
});
