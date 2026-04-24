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

const { mockConfigGet, mockReadFile, mockAssistantsList } = vi.hoisted(() => ({
  mockConfigGet: vi.fn(),
  mockReadFile: vi.fn(),
  mockAssistantsList: vi.fn(async () => [] as Array<Record<string, unknown>>),
}));

vi.mock('../../../src/process/utils/initStorage', () => ({
  ProcessConfig: {
    get: mockConfigGet,
  },
  getAssistantsDir: () => '/assistants',
}));

// Post-migration: TeamSessionService resolves preset rules via
// `ipcBridge.assistants.list` (see loadPresetAssistantResources defaults).
// Route the lookup through the same mockConfigGet('assistants') fixture so
// existing tests keep passing without a second source of truth.
vi.mock('../../../src/common', () => ({
  ipcBridge: {
    assistants: {
      list: { invoke: mockAssistantsList },
    },
    team: {
      listChanged: { emit: vi.fn() },
      agentSpawned: { emit: vi.fn() },
      agentRemoved: { emit: vi.fn() },
      agentRenamed: { emit: vi.fn() },
      mcpStatus: { emit: vi.fn() },
    },
  },
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
    slot_id: '',
    conversation_id: '',
    role: 'leader',
    agent_type: 'gemini',
    agent_name: 'Gemini',
    conversation_type: 'gemini',
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
      user_id: 'user-1',
      name: 'Team Gemini',
      workspace: '/workspace',
      workspace_mode: 'shared',
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
            api_key: 'test-key',
            base_url: 'https://generativelanguage.googleapis.com',
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
      user_id: 'user-1',
      name: 'Team Gemini API',
      workspace: '/workspace',
      workspace_mode: 'shared',
      agents: [makeAgent()],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gemini',
        model: expect.objectContaining({
          id: 'provider-gemini',
          platform: 'gemini',
          api_key: 'test-key',
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
            api_key: 'key',
            base_url: 'https://example.com',
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
      user_id: 'user-1',
      name: 'Team Qwen',
      workspace: '/workspace',
      workspace_mode: 'shared',
      agents: [makeAgent({ agent_type: 'qwen', agent_name: 'Qwen', conversation_type: 'acp' })],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'acp',
        extra: expect.objectContaining({
          backend: 'qwen',
          current_model_id: 'qwen3-coder-plus',
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
      user_id: 'user-1',
      name: 'Team Remote',
      workspace: '/workspace',
      workspace_mode: 'shared',
      agents: [
        makeAgent({
          agent_type: 'remote',
          agent_name: 'Remote Agent',
          conversation_type: 'remote',
          custom_agent_id: 'remote-agent-id',
        }),
      ],
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'remote',
        extra: expect.objectContaining({
          remoteAgentId: 'remote-agent-id',
          team_id: expect.any(String),
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
            api_key: 'key',
            base_url: 'https://example.com',
            model: ['gemini-2.0-flash'],
            enabled: true,
          },
        ];
      }
      if (key === 'assistants') {
        return [{ id: 'assistant-1', enabled_skills: ['skill-a'] }];
      }
      return undefined;
    });
    // Assistant catalog (post-migration backend shape). The key field tested
    // is `enabled_skills` — `defaultDeps.getEnabledSkills` reads that snake_case
    // field off the Assistant record.
    mockAssistantsList.mockResolvedValue([{ id: 'assistant-1', enabled_skills: ['skill-a'] }]);
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
      user_id: 'user-1',
      name: 'Team Preset Gemini',
      workspace: '/workspace',
      workspace_mode: 'shared',
      agents: [
        makeAgent({
          agent_type: 'gemini',
          agent_name: 'Preset Gemini',
          conversation_type: 'gemini',
          custom_agent_id: 'assistant-1',
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
          preset_assistant_id: 'assistant-1',
          preset_rules: 'PRESET RULES',
          enabled_skills: ['skill-a'],
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
            api_key: 'key',
            base_url: 'https://example.com',
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
      user_id: 'user-1',
      name: 'Preset Team',
      workspace: '/workspace',
      workspace_mode: 'shared',
      leader_agent_id: 'slot-lead',
      agents: [
        {
          slot_id: 'slot-lead',
          conversation_id: 'conv-lead',
          role: 'leader',
          agent_type: 'qwen',
          agent_name: 'Lead Qwen',
          conversation_type: 'acp',
          status: 'idle',
        },
      ],
      created_at: 1,
      updated_at: 1,
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
          session_mode: 'yolo',
          current_model_id: 'qwen3-coder-pro',
        },
      }),
    });
    const service = new TeamSessionService(repo, makeWorkerTaskManager() as any, conversationService);

    await service.addAgent('team-1', {
      conversation_id: '',
      role: 'teammate',
      agent_type: 'qwen',
      agent_name: 'Preset Qwen',
      conversation_type: 'acp',
      status: 'pending',
      custom_agent_id: 'builtin-preset-qwen',
    });

    expect(conversationService.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: expect.objectContaining({
          backend: 'qwen',
          preset_assistant_id: 'builtin-preset-qwen',
          session_mode: 'yolo',
          current_model_id: 'qwen3-coder-next',
        }),
      })
    );
  });

  it('repairs legacy teams whose agents array was lost but conversations still exist', async () => {
    const legacyTeam: TTeam = {
      id: 'team-legacy',
      user_id: 'user-1',
      name: 'Legacy Team',
      workspace: '',
      workspace_mode: 'shared',
      leader_agent_id: 'slot-lead',
      agents: [],
      created_at: 1,
      updated_at: 1,
    };
    const legacyConversation: TChatConversation = {
      id: 'conv-legacy',
      name: 'Legacy Team - Leader',
      type: 'acp',
      status: 'pending',
      created_at: 1,
      modified_at: 2,
      extra: {
        backend: 'codex',
        cli_path: 'codex',
        agent_name: 'Leader',
        team_id: 'team-legacy',
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
        leader_agent_id: 'slot-lead',
        agents: [
          expect.objectContaining({
            slot_id: 'slot-lead',
            conversation_id: 'conv-legacy',
            role: 'leader',
            agent_type: 'codex',
            agent_name: 'Leader',
            conversation_type: 'acp',
            cli_path: 'codex',
          }),
        ],
      })
    );
    expect(repo.update).toHaveBeenCalledWith(
      'team-legacy',
      expect.objectContaining({
        leader_agent_id: 'slot-lead',
        agents: [
          expect.objectContaining({
            slot_id: 'slot-lead',
            conversation_id: 'conv-legacy',
          }),
        ],
        updated_at: expect.any(Number),
      })
    );
  });
});
