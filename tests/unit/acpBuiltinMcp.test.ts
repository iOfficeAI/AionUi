/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMcpServer } from '../../src/common/config/storage';
import { buildBuiltinAcpSessionMcpServers } from '../../src/process/agent/acp/mcpSessionConfig';
import { buildGeminiAddArgs } from '../../src/process/services/mcpServices/agents/GeminiMcpAgent';
import { parseAgentCapabilities } from '../../src/common/types/acpTypes';

describe('ACP built-in MCP session config', () => {
  it('injects only enabled built-in MCP servers and converts transport shape for session/new', () => {
    const servers: IMcpServer[] = [
      {
        id: 'builtin-image-gen',
        name: 'aionui-image-generation',
        enabled: true,
        builtin: true,
        status: 'connected',
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['/abs/builtin-mcp-image-gen.js'],
          env: {
            AIONUI_IMG_PLATFORM: 'openai',
            AIONUI_IMG_MODEL: 'gpt-image-1',
          },
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'builtin-http',
        name: 'Builtin HTTP',
        enabled: true,
        builtin: true,
        transport: {
          type: 'streamable_http',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'Bearer test-token',
          },
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'disabled-builtin',
        name: 'Disabled Builtin',
        enabled: false,
        builtin: true,
        transport: {
          type: 'stdio',
          command: 'node',
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'external-server',
        name: 'chrome-devtools',
        enabled: true,
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'chrome-devtools-mcp@latest'],
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'builtin-error',
        name: 'Broken Builtin',
        enabled: true,
        builtin: true,
        status: 'error',
        transport: {
          type: 'stdio',
          command: 'node',
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
    ];

    const result = buildBuiltinAcpSessionMcpServers(servers, { stdio: true, http: true, sse: false });

    expect(result).toEqual([
      {
        type: 'stdio',
        name: 'aionui-image-generation',
        command: 'node',
        args: ['/abs/builtin-mcp-image-gen.js'],
        env: [
          { name: 'AIONUI_IMG_PLATFORM', value: 'openai' },
          { name: 'AIONUI_IMG_MODEL', value: 'gpt-image-1' },
        ],
      },
      {
        type: 'http',
        name: 'Builtin HTTP',
        url: 'https://example.com/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer test-token' }],
      },
    ]);
  });

  it('keeps the built-in image generation MCP injected even if its saved status is stale', () => {
    const servers: IMcpServer[] = [
      {
        id: 'builtin-image-gen',
        name: 'aionui-image-generation',
        enabled: true,
        builtin: true,
        status: 'error',
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['/abs/builtin-mcp-image-gen.js'],
          env: {
            AIONUI_IMG_PLATFORM: 'new-api',
            AIONUI_IMG_BASE_URL: 'https://example.com/v1',
            AIONUI_IMG_API_KEY: 'sk-test',
            AIONUI_IMG_MODEL: 'grok-imagine-1.0',
          },
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
      {
        id: 'other-builtin-error',
        name: 'Other Builtin',
        enabled: true,
        builtin: true,
        status: 'error',
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['/abs/other.js'],
        },
        createdAt: 1,
        updatedAt: 1,
        originalJson: '{}',
      },
    ];

    expect(buildBuiltinAcpSessionMcpServers(servers, { stdio: true, http: true, sse: false })).toEqual([
      {
        type: 'stdio',
        name: 'aionui-image-generation',
        command: 'node',
        args: ['/abs/builtin-mcp-image-gen.js'],
        env: [
          { name: 'AIONUI_IMG_PLATFORM', value: 'new-api' },
          { name: 'AIONUI_IMG_BASE_URL', value: 'https://example.com/v1' },
          { name: 'AIONUI_IMG_API_KEY', value: 'sk-test' },
          { name: 'AIONUI_IMG_MODEL', value: 'grok-imagine-1.0' },
        ],
      },
    ]);
  });

  it('parses MCP capabilities from initialize response (omitted = false per ACP spec)', () => {
    const caps1 = parseAgentCapabilities({
      agentCapabilities: {
        mcpCapabilities: {
          http: true,
        },
      },
    } as any);
    expect(caps1.mcpCapabilities).toEqual({
      stdio: true, // always true per spec
      http: true,
      sse: false, // omitted = false
    });

    const caps2 = parseAgentCapabilities(null);
    expect(caps2.mcpCapabilities).toEqual({
      stdio: false, // mcpCapabilities absent = agent does not support MCP
      http: false, // omitted = false
      sse: false, // omitted = false
    });
  });
});

describe('GeminiMcpAgent helpers', () => {
  it('builds stdio add args including image MCP env vars', () => {
    const server: IMcpServer = {
      id: 'builtin-image-gen',
      name: 'aionui-image-generation',
      enabled: true,
      builtin: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['/abs/builtin-mcp-image-gen.js'],
        env: {
          AIONUI_IMG_PLATFORM: 'new-api',
          AIONUI_IMG_BASE_URL: 'https://example.com/v1',
          AIONUI_IMG_API_KEY: 'sk-test',
          AIONUI_IMG_MODEL: 'grok-imagine-1.0',
        },
      },
      createdAt: 1,
      updatedAt: 1,
      originalJson: '{}',
    };

    expect(buildGeminiAddArgs(server)).toEqual([
      'mcp',
      'add',
      '-s',
      'user',
      '-e',
      'AIONUI_IMG_PLATFORM=new-api',
      '-e',
      'AIONUI_IMG_BASE_URL=https://example.com/v1',
      '-e',
      'AIONUI_IMG_API_KEY=sk-test',
      '-e',
      'AIONUI_IMG_MODEL=grok-imagine-1.0',
      'aionui-image-generation',
      'node',
      '/abs/builtin-mcp-image-gen.js',
    ]);
  });
});

const makeDetectedServer = (overrides: Partial<IMcpServer> = {}): IMcpServer => ({
  id: 'server-1',
  name: 'chrome-devtools',
  enabled: true,
  status: 'connected',
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest'],
  },
  createdAt: 1,
  updatedAt: 1,
  originalJson: '{}',
  ...overrides,
});

const makeAgentClass = (detectMcpServers: () => Promise<IMcpServer[]>) =>
  class {
    detectMcpServers = detectMcpServers;
  };

const makeProtocolAgentClass = ({
  detectMcpServers = vi.fn(async () => [] as IMcpServer[]),
  installMcpServers = vi.fn(async () => ({ success: true })),
  removeMcpServer = vi.fn(async () => ({ success: true })),
  getSupportedTransports = vi.fn(() => [] as string[]),
} = {}) =>
  class {
    detectMcpServers = detectMcpServers;
    installMcpServers = installMcpServers;
    removeMcpServer = removeMcpServer;
    getSupportedTransports = getSupportedTransports;
  };

const mockUnrelatedMcpAgents = (emptyDetect: () => Promise<IMcpServer[]>) => {
  vi.doMock('../../src/process/services/mcpServices/agents/ClaudeMcpAgent', () => ({
    ClaudeMcpAgent: makeAgentClass(emptyDetect),
  }));
  vi.doMock('../../src/process/services/mcpServices/agents/CodebuddyMcpAgent', () => ({
    CodebuddyMcpAgent: makeAgentClass(emptyDetect),
  }));
  vi.doMock('../../src/process/services/mcpServices/agents/QwenMcpAgent', () => ({
    QwenMcpAgent: makeAgentClass(emptyDetect),
  }));
  vi.doMock('../../src/process/services/mcpServices/agents/CodexMcpAgent', () => ({
    CodexMcpAgent: makeAgentClass(emptyDetect),
  }));
  vi.doMock('../../src/process/services/mcpServices/agents/OpencodeMcpAgent', () => ({
    OpencodeMcpAgent: makeAgentClass(emptyDetect),
  }));
  vi.doMock('../../src/process/services/mcpServices/agents/AionrsMcpAgent', () => ({
    AionrsMcpAgent: makeAgentClass(emptyDetect),
  }));
};

describe('McpService Gemini detection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reports built-in Gemini MCP servers under gemini source', async () => {
    const builtinDetect = vi.fn(async () => [makeDetectedServer()]);
    const nativeDetect = vi.fn(async () => []);
    const emptyDetect = vi.fn(async () => []);

    vi.doMock('child_process', () => ({
      execSync: vi.fn(() => {
        throw new Error('gemini not installed');
      }),
    }));
    mockUnrelatedMcpAgents(emptyDetect);
    vi.doMock('../../src/process/services/mcpServices/agents/GeminiMcpAgent', () => ({
      GeminiMcpAgent: makeAgentClass(nativeDetect),
    }));
    vi.doMock('../../src/process/services/mcpServices/agents/AionuiMcpAgent', () => ({
      AionuiMcpAgent: makeAgentClass(builtinDetect),
    }));

    const { McpService } = await import('../../src/process/services/mcpServices/McpService');
    const service = new McpService();

    const result = await service.getAgentMcpConfigs([{ backend: 'gemini', name: 'Gemini CLI', cliPath: undefined }]);

    expect(result).toEqual([
      {
        source: 'gemini',
        servers: [makeDetectedServer()],
      },
    ]);
    expect(builtinDetect).toHaveBeenCalledOnce();
    expect(nativeDetect).not.toHaveBeenCalled();
  });

  it('merges native and built-in Gemini detections into one gemini entry', async () => {
    const sharedServer = makeDetectedServer();
    const builtinDetect = vi.fn(async () => [sharedServer]);
    const nativeDetect = vi.fn(async () => [sharedServer]);
    const emptyDetect = vi.fn(async () => []);

    vi.doMock('child_process', () => ({
      execSync: vi.fn(() => '/usr/local/bin/gemini\n'),
    }));
    mockUnrelatedMcpAgents(emptyDetect);
    vi.doMock('../../src/process/services/mcpServices/agents/GeminiMcpAgent', () => ({
      GeminiMcpAgent: makeAgentClass(nativeDetect),
    }));
    vi.doMock('../../src/process/services/mcpServices/agents/AionuiMcpAgent', () => ({
      AionuiMcpAgent: makeAgentClass(builtinDetect),
    }));

    const { McpService } = await import('../../src/process/services/mcpServices/McpService');
    const service = new McpService();

    const result = await service.getAgentMcpConfigs([{ backend: 'gemini', name: 'Gemini CLI', cliPath: undefined }]);

    expect(result).toEqual([
      {
        source: 'gemini',
        servers: [sharedServer],
      },
    ]);
    expect(builtinDetect).toHaveBeenCalledOnce();
    expect(nativeDetect).toHaveBeenCalledOnce();
  });

  it('returns no Gemini entry when built-in detection fails', async () => {
    const builtinDetect = vi.fn(async () => {
      throw new Error('failed to read mcp config');
    });
    const emptyDetect = vi.fn(async () => []);

    vi.doMock('child_process', () => ({
      execSync: vi.fn(() => {
        throw new Error('gemini not installed');
      }),
    }));
    mockUnrelatedMcpAgents(emptyDetect);
    vi.doMock('../../src/process/services/mcpServices/agents/GeminiMcpAgent', () => ({
      GeminiMcpAgent: makeAgentClass(emptyDetect),
    }));
    vi.doMock('../../src/process/services/mcpServices/agents/AionuiMcpAgent', () => ({
      AionuiMcpAgent: makeAgentClass(builtinDetect),
    }));

    const { McpService } = await import('../../src/process/services/mcpServices/McpService');
    const service = new McpService();

    const result = await service.getAgentMcpConfigs([{ backend: 'gemini', name: 'Gemini CLI', cliPath: undefined }]);

    expect(result).toEqual([]);
    expect(builtinDetect).toHaveBeenCalledOnce();
  });
});

describe('McpService MCP sync', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('passes cliPath through to agent sync operations', async () => {
    const emptyDetect = vi.fn(async () => []);
    const installSpy = vi.fn(async () => ({ success: true }));

    vi.doMock('child_process', () => ({
      execSync: vi.fn(() => {
        throw new Error('gemini not installed');
      }),
    }));
    mockUnrelatedMcpAgents(emptyDetect);
    vi.doMock('../../src/process/services/mcpServices/agents/GeminiMcpAgent', () => ({
      GeminiMcpAgent: makeProtocolAgentClass({ detectMcpServers: emptyDetect }),
    }));
    vi.doMock('../../src/process/services/mcpServices/agents/AionuiMcpAgent', () => ({
      AionuiMcpAgent: makeProtocolAgentClass({ detectMcpServers: emptyDetect }),
    }));
    vi.doMock('../../src/process/services/mcpServices/agents/CodexMcpAgent', () => ({
      CodexMcpAgent: makeProtocolAgentClass({
        detectMcpServers: emptyDetect,
        installMcpServers: installSpy,
      }),
    }));

    const { McpService } = await import('../../src/process/services/mcpServices/McpService');
    const service = new McpService();
    const server = makeDetectedServer();
    const cliPath = 'C:\\Program Files\\OpenAI\\codex.cmd';

    const syncResult = await service.syncMcpToAgents([server], [{ backend: 'codex', name: 'Codex', cliPath }]);

    expect(syncResult.success).toBe(true);
    expect(installSpy).toHaveBeenCalledWith([server], cliPath);
  });

  it('passes cliPath through to agent removal operations', async () => {
    const emptyDetect = vi.fn(async () => [] as IMcpServer[]);
    const removeSpy = vi.fn(async () => ({ success: true }));

    vi.doMock('child_process', () => ({
      execSync: vi.fn(() => {
        throw new Error('gemini not installed');
      }),
    }));
    mockUnrelatedMcpAgents(emptyDetect);
    vi.doMock('../../src/process/services/mcpServices/agents/GeminiMcpAgent', () => ({
      GeminiMcpAgent: makeProtocolAgentClass({ detectMcpServers: emptyDetect }),
    }));
    vi.doMock('../../src/process/services/mcpServices/agents/AionuiMcpAgent', () => ({
      AionuiMcpAgent: makeProtocolAgentClass({ detectMcpServers: emptyDetect }),
    }));
    vi.doMock('../../src/process/services/mcpServices/agents/CodexMcpAgent', () => ({
      CodexMcpAgent: makeProtocolAgentClass({
        detectMcpServers: emptyDetect,
        removeMcpServer: removeSpy,
      }),
    }));

    const { McpService } = await import('../../src/process/services/mcpServices/McpService');
    const service = new McpService();
    const cliPath = 'C:\\Program Files\\OpenAI\\codex.cmd';

    const removeResult = await service.removeMcpFromAgents('aionui-image-generation', [
      { backend: 'codex', name: 'Codex', cliPath },
    ]);

    expect(removeResult.success).toBe(true);
    expect(removeSpy).toHaveBeenCalledWith('aionui-image-generation', cliPath);
  });
});

describe('McpService OpenCode detection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reports OpenCode MCP servers under opencode source', async () => {
    const opencodeDetect = vi.fn(async () => [makeDetectedServer({ id: 'opencode-1', name: 'filesystem' })]);
    const emptyDetect = vi.fn(async () => []);

    vi.doMock('child_process', () => ({
      execSync: vi.fn(() => {
        throw new Error('gemini not installed');
      }),
    }));
    mockUnrelatedMcpAgents(emptyDetect);
    vi.doMock('../../src/process/services/mcpServices/agents/GeminiMcpAgent', () => ({
      GeminiMcpAgent: makeAgentClass(emptyDetect),
    }));
    vi.doMock('../../src/process/services/mcpServices/agents/AionuiMcpAgent', () => ({
      AionuiMcpAgent: makeAgentClass(emptyDetect),
    }));
    vi.doMock('../../src/process/services/mcpServices/agents/OpencodeMcpAgent', () => ({
      OpencodeMcpAgent: makeAgentClass(opencodeDetect),
    }));

    const { McpService } = await import('../../src/process/services/mcpServices/McpService');
    const service = new McpService();

    const result = await service.getAgentMcpConfigs([{ backend: 'opencode', name: 'OpenCode', cliPath: 'opencode' }]);

    expect(result).toEqual([
      {
        source: 'opencode',
        servers: [makeDetectedServer({ id: 'opencode-1', name: 'filesystem' })],
      },
    ]);
    expect(opencodeDetect).toHaveBeenCalledOnce();
  });
});
