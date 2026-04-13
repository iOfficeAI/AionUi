/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '../../../src/common/config/storage';
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
  getAssistantsDir: () => '/assistants',
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    access: mockReadFile,
  },
  readFile: mockReadFile,
  access: mockReadFile,
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
    readUnreadAndMark: vi.fn(),
    markRead: vi.fn(),
    getMailboxHistory: vi.fn(),
    createTask: vi.fn(),
    findTaskById: vi.fn(),
    updateTask: vi.fn(),
    findTasksByTeam: vi.fn(),
    findTasksByOwner: vi.fn(),
    deleteTask: vi.fn(),
    appendToBlocks: vi.fn(),
    removeFromBlockedBy: vi.fn(),
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

  it('resolves a real gemini model instead of an empty placeholder', async () => {
    mockConfigGet.mockImplementation(async () => undefined);

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
          platform: 'gemini-with-google-auth',
        }),
      })
    );
    // Must have a concrete useModel, not the bare 'default' placeholder
    const callArgs = (conversationService.createConversation as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.model.useModel).not.toBe('default');
  });

  it('uses configured gemini provider model when available', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'model.config') {
        return [
          {
            id: 'provider-gemini',
            platform: 'gemini',
            name: 'Gemini API',
            apiKey: 'test-key',
            baseUrl: 'https://generativelanguage.googleapis.com',
            model: ['gemini-2.5-pro'],
            enabled: true,
          },
        ];
      }
      return undefined;
    });
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-gemini-api', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.createTeam({
      userId: 'user-1',
      name: 'Team Gemini API',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [makeAgent()],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gemini',
        model: expect.objectContaining({
          id: 'provider-gemini',
          platform: 'gemini',
          apiKey: 'test-key',
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
        extra: expect.objectContaining({
          backend: 'qwen',
          currentModelId: 'qwen3-coder-plus',
        }),
      })
    );
  });

  it('creates remote team conversations with the remote agent id', async () => {
    mockConfigGet.mockResolvedValue(undefined);

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-remote', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.createTeam({
      userId: 'user-1',
      name: 'Team Remote',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [
        makeAgent({
          agentType: 'remote',
          agentName: 'Remote Agent',
          conversationType: 'remote',
          customAgentId: 'remote-agent-id',
        }),
      ],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'remote',
        extra: expect.objectContaining({
          remoteAgentId: 'remote-agent-id',
          teamId: expect.any(String),
        }),
      })
    );
  });

  it('creates preset gemini team conversations with preset rules and enabled skills', async () => {
    mockConfigGet.mockImplementation(async (key: string) => {
      if (key === 'language') {
        return 'en-US';
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
      if (key === 'acp.customAgents') {
        return [{ id: 'assistant-1', enabledSkills: ['skill-a'] }];
      }
      return undefined;
    });
    mockReadFile.mockImplementation(async (targetPath: string) => {
      if (targetPath.includes('assistant-1.en-US.md')) {
        return 'PRESET RULES';
      }
      if (targetPath.includes('assistant-1-skills.en-US.md')) {
        return 'PRESET SKILLS';
      }
      throw new Error('not found');
    });

    const repo = makeRepo();
    const conversationService = makeConversationService({
      createConversation: vi.fn().mockResolvedValue({ id: 'conv-preset-gemini', extra: {} }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.createTeam({
      userId: 'user-1',
      name: 'Team Preset Gemini',
      workspace: '/workspace',
      workspaceMode: 'shared',
      agents: [
        makeAgent({
          agentType: 'gemini',
          agentName: 'Preset Gemini',
          conversationType: 'gemini',
          customAgentId: 'assistant-1',
        }),
      ],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gemini',
        model: expect.objectContaining({
          id: 'provider-1',
          useModel: 'gemini-2.0-flash',
        }),
        extra: expect.objectContaining({
          presetAssistantId: 'assistant-1',
          presetRules: 'PRESET RULES',
          enabledSkills: ['skill-a'],
        }),
      })
    );
  });

  it('preserves preset assistant identity and only inherits session mode when adding teammates', async () => {
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
          currentModelId: 'qwen3-coder-next',
        }),
      })
    );
  });

  it('repairs legacy teams whose agents array was lost but conversations still exist', async () => {
    const legacyTeam: TTeam = {
      id: 'team-legacy',
      userId: 'user-1',
      name: 'Legacy Team',
      workspace: '',
      workspaceMode: 'shared',
      leadAgentId: 'slot-lead',
      agents: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const legacyConversation: TChatConversation = {
      id: 'conv-legacy',
      name: 'Legacy Team - Leader',
      type: 'acp',
      status: 'pending',
      createTime: 1,
      modifyTime: 2,
      extra: {
        backend: 'codex',
        cliPath: 'codex',
        agentName: 'Leader',
        teamId: 'team-legacy',
        teamMcpStdioConfig: {
          env: [{ name: 'TEAM_AGENT_SLOT_ID', value: 'slot-lead' }],
        },
      },
    };

    const repo = makeRepo({
      findById: vi.fn().mockResolvedValue(legacyTeam),
    });
    const conversationService = makeConversationService({
      listAllConversations: vi.fn().mockResolvedValue([legacyConversation]),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    const repairedTeam = await service.getTeam('team-legacy');

    expect(repairedTeam).toEqual(
      expect.objectContaining({
        leadAgentId: 'slot-lead',
        agents: [
          expect.objectContaining({
            slotId: 'slot-lead',
            conversationId: 'conv-legacy',
            role: 'lead',
            agentType: 'codex',
            agentName: 'Leader',
            conversationType: 'acp',
            cliPath: 'codex',
          }),
        ],
      })
    );
    expect(repo.update).toHaveBeenCalledWith(
      'team-legacy',
      expect.objectContaining({
        leadAgentId: 'slot-lead',
        agents: [
          expect.objectContaining({
            slotId: 'slot-lead',
            conversationId: 'conv-legacy',
          }),
        ],
        updatedAt: expect.any(Number),
      })
    );
  });
});
