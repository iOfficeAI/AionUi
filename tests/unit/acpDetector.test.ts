import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock the AcpDetector that AgentRegistry delegates to
const mockDetectBuiltinAgents = vi.fn(async () => []);
const mockDetectExtensionAgents = vi.fn(async () => []);
const mockClearEnvCache = vi.fn();
const mockIsCliAvailable = vi.fn(() => false);

vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    detectBuiltinAgents: (...args: unknown[]) => mockDetectBuiltinAgents(...args),
    detectExtensionAgents: (...args: unknown[]) => mockDetectExtensionAgents(...args),
    clearEnvCache: (...args: unknown[]) => mockClearEnvCache(...args),
    isCliAvailable: (...args: unknown[]) => mockIsCliAvailable(...args),
  },
}));

import type { AcpDetectedAgent } from '../../src/common/types/detectedAgent';

// Helper: create a mock ACP detected agent
function makeAcpAgent(opts: {
  id: string;
  name: string;
  backend: string;
  cliPath?: string;
  acpArgs?: string[];
  isExtension?: boolean;
  extensionName?: string;
}): AcpDetectedAgent {
  return {
    id: opts.id,
    name: opts.name,
    kind: 'acp',
    available: true,
    backend: opts.backend,
    cliPath: opts.cliPath ?? opts.id,
    acpArgs: opts.acpArgs ?? ['--acp'],
    isExtension: opts.isExtension,
    extensionName: opts.extensionName,
  };
}

async function createFreshRegistry() {
  vi.resetModules();
  const mod = await import('@process/agent/AgentRegistry');
  return mod.agentRegistry;
}

describe('AgentRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectBuiltinAgents.mockResolvedValue([]);
    mockDetectExtensionAgents.mockResolvedValue([]);
    mockIsCliAvailable.mockReturnValue(false);
  });

  describe('initialize', () => {
    it('should detect built-in CLIs that are available on PATH', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({
          id: 'claude',
          name: 'Claude Code',
          backend: 'claude',
          cliPath: 'claude',
          acpArgs: ['--experimental-acp'],
        }),
        makeAcpAgent({ id: 'qwen', name: 'Qwen Code', backend: 'qwen', cliPath: 'qwen' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      // Aionrs always first, Gemini always second, then ACP agents
      expect(agents).toHaveLength(4);
      expect(agents[0].backend).toBe('aionrs');
      expect(agents[1].backend).toBe('gemini');
      expect(agents[2]).toMatchObject({ backend: 'claude', cliPath: 'claude' });
      expect(agents[3]).toMatchObject({ backend: 'qwen', cliPath: 'qwen' });
    });

    it('should skip built-in CLIs that are not available', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      expect(agents).toHaveLength(3); // gemini + aionrs + claude
      expect(agents.find((a) => a.backend === 'qwen')).toBeUndefined();
      expect(agents.find((a) => a.backend === 'auggie')).toBeUndefined();
    });

    it('should always include Aionrs first and Gemini second', async () => {
      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      expect(agents).toHaveLength(2); // aionrs + gemini
      expect(agents[0]).toMatchObject({ backend: 'aionrs', name: 'Aion CLI' });
      expect(agents[1]).toMatchObject({ backend: 'gemini', name: 'Gemini CLI' });
    });

    it('should detect extension-contributed agents when CLI is available', async () => {
      mockDetectExtensionAgents.mockResolvedValue([
        makeAcpAgent({
          id: 'goose',
          name: 'Goose',
          backend: 'custom',
          cliPath: 'goose',
          isExtension: true,
          extensionName: 'aionext-goose',
        }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      const gooseAgent = agents.find((a) => a.kind === 'acp' && a.cliPath === 'goose');
      expect(gooseAgent).toBeDefined();
    });

    it('should skip extension agents whose CLI is not available', async () => {
      // detectExtensionAgents returns empty when CLI not available
      mockDetectExtensionAgents.mockResolvedValue([]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      expect(agents).toHaveLength(2); // gemini + aionrs
    });

    it('should not run twice (isDetected guard)', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      await registry.initialize(); // second call — should be no-op

      // detectBuiltinAgents called only during first init
      expect(mockDetectBuiltinAgents).toHaveBeenCalledTimes(1);
      expect(mockDetectExtensionAgents).toHaveBeenCalledTimes(1);

      await registry.initialize(); // third call — still no-op
      expect(mockDetectBuiltinAgents).toHaveBeenCalledTimes(1);
    });
  });

  describe('deduplicate', () => {
    it('should deduplicate by backend — builtin wins over extension with same backend', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'qwen', name: 'Qwen Code', backend: 'qwen', cliPath: 'qwen' }),
      ]);
      mockDetectExtensionAgents.mockResolvedValue([
        makeAcpAgent({
          id: 'qwen-ext',
          name: 'Qwen Code',
          backend: 'qwen',
          cliPath: 'bunx @qwen/qwen',
          isExtension: true,
          extensionName: 'aionext-qwen',
        }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      const qwenAgents = agents.filter((a) => a.backend === 'qwen');
      expect(qwenAgents).toHaveLength(1);
      expect(qwenAgents[0].cliPath).toBe('qwen'); // builtin wins
      expect(qwenAgents[0].isExtension).toBeUndefined();
    });

    it('should keep extension agent when no builtin has the same backend', async () => {
      mockDetectExtensionAgents.mockResolvedValue([
        makeAcpAgent({
          id: 'unique',
          name: 'Unique Agent',
          backend: 'unique',
          cliPath: 'custom-cli',
          isExtension: true,
          extensionName: 'ext-unique',
        }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      const agent = agents.find((a) => a.backend === 'unique');
      expect(agent).toBeDefined();
      expect(agent!.isExtension).toBe(true);
    });

    it('should always include aionrs and gemini', async () => {
      const registry = await createFreshRegistry();
      await registry.initialize();
      const agents = registry.getDetectedAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0].backend).toBe('aionrs');
      expect(agents[1].backend).toBe('gemini');
    });
  });

  describe('refreshExtensionAgents', () => {
    it('should remove old extension agents and add newly detected ones', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();

      expect(registry.getDetectedAgents().find((a) => a.isExtension)).toBeUndefined();

      // Now an extension is installed that contributes a new CLI
      mockDetectExtensionAgents.mockResolvedValue([
        makeAcpAgent({
          id: 'new',
          name: 'New Ext',
          backend: 'custom',
          cliPath: 'new-ext-cli',
          isExtension: true,
          extensionName: 'ext-new',
        }),
      ]);

      await registry.refreshExtensionAgents();
      const agents = registry.getDetectedAgents();

      const extAgent = agents.find((a) => a.kind === 'acp' && a.cliPath === 'new-ext-cli');
      expect(extAgent).toBeDefined();
      expect(extAgent!.isExtension).toBe(true);
    });

    it('should remove extension agents whose CLI is no longer available', async () => {
      mockDetectExtensionAgents.mockResolvedValue([
        makeAcpAgent({
          id: 'temp',
          name: 'Temp',
          backend: 'custom',
          cliPath: 'ext-cli',
          isExtension: true,
          extensionName: 'ext-temp',
        }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();
      expect(registry.getDetectedAgents().find((a) => a.kind === 'acp' && a.cliPath === 'ext-cli')).toBeDefined();

      // CLI removed — detectExtensionAgents returns empty
      mockDetectExtensionAgents.mockResolvedValue([]);
      await registry.refreshExtensionAgents();

      expect(registry.getDetectedAgents().find((a) => a.kind === 'acp' && a.cliPath === 'ext-cli')).toBeUndefined();
    });

    it('should deduplicate by backend after refresh — builtin wins', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'qwen', name: 'Qwen Code', backend: 'qwen', cliPath: 'qwen' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();

      // Extension contributes same backend as builtin
      mockDetectExtensionAgents.mockResolvedValue([
        makeAcpAgent({
          id: 'qwen-ext',
          name: 'Qwen Ext',
          backend: 'qwen',
          cliPath: 'bunx @qwen/qwen',
          isExtension: true,
          extensionName: 'aionext-qwen',
        }),
      ]);

      await registry.refreshExtensionAgents();
      const qwenAgents = registry.getDetectedAgents().filter((a) => a.backend === 'qwen');
      expect(qwenAgents).toHaveLength(1);
      expect(qwenAgents[0].cliPath).toBe('qwen'); // builtin wins
    });
  });

  describe('refreshBuiltinAgents', () => {
    it('should keep Aionrs and Gemini ahead of builtin agents after refresh', async () => {
      mockDetectBuiltinAgents.mockResolvedValue([
        makeAcpAgent({ id: 'claude', name: 'Claude Code', backend: 'claude', cliPath: 'claude' }),
        makeAcpAgent({ id: 'qwen', name: 'Qwen Code', backend: 'qwen', cliPath: 'qwen' }),
      ]);

      const registry = await createFreshRegistry();
      await registry.initialize();

      await registry.refreshBuiltinAgents();
      const agents = registry.getDetectedAgents();

      expect(agents[0].backend).toBe('aionrs');
      expect(agents[1].backend).toBe('gemini');
      expect(agents.slice(2).map((agent) => agent.backend)).toEqual(['claude', 'qwen']);
    });

    it('should clear env cache before re-detecting', async () => {
      const registry = await createFreshRegistry();
      await registry.initialize();

      await registry.refreshBuiltinAgents();
      expect(mockClearEnvCache).toHaveBeenCalled();
    });
  });

  describe('hasAgents', () => {
    it('should return true after initialization (Gemini is always present)', async () => {
      const registry = await createFreshRegistry();
      await registry.initialize();
      expect(registry.hasAgents()).toBe(true);
    });

    it('should return false before initialization', async () => {
      const registry = await createFreshRegistry();
      expect(registry.hasAgents()).toBe(false);
    });
  });

  describe('refreshAll', () => {
    it('should re-run all detection paths', async () => {
      const registry = await createFreshRegistry();
      await registry.initialize();

      mockDetectBuiltinAgents.mockClear();
      mockDetectExtensionAgents.mockClear();

      await registry.refreshAll();

      expect(mockClearEnvCache).toHaveBeenCalled();
      expect(mockDetectBuiltinAgents).toHaveBeenCalledTimes(1);
      expect(mockDetectExtensionAgents).toHaveBeenCalledTimes(1);
    });
  });
});
