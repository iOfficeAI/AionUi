import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('@/common/types/acpTypes', () => ({
  POTENTIAL_ACP_CLIS: [
    { cmd: 'claude', name: 'Claude Code', backendId: 'claude', args: ['--experimental-acp'] },
    { cmd: 'qwen', name: 'Qwen Code', backendId: 'qwen', args: ['--acp'] },
    { cmd: 'augment', name: 'Augment Code', backendId: 'auggie', args: ['--acp'] },
  ],
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn(async () => []) },
}));

const mockGetAcpAdapters = vi.fn((): Record<string, unknown>[] => []);
const mockGetLoadedExtensions = vi.fn(() => []);
vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      getAcpAdapters: mockGetAcpAdapters,
      getLoadedExtensions: mockGetLoadedExtensions,
    }),
  },
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({ ...process.env })),
}));

import { execSync } from 'child_process';
import { ProcessConfig } from '@process/utils/initStorage';

const mockedExecSync = vi.mocked(execSync);

// Helper: make execSync succeed for given commands, throw for others
function setAvailableClis(clis: string[]): void {
  mockedExecSync.mockImplementation((cmd: string) => {
    const command = typeof cmd === 'string' ? cmd : '';
    for (const cli of clis) {
      if (command.includes(cli)) return Buffer.from('');
    }
    throw new Error('not found');
  });
}

// Helper: create a mock extension ACP adapter
function makeExtAdapter(opts: {
  id: string;
  name: string;
  cliCommand: string;
  extensionName: string;
  acpArgs?: string[];
  avatar?: string;
  connectionType?: string;
}) {
  return {
    id: opts.id,
    name: opts.name,
    cliCommand: opts.cliCommand,
    connectionType: opts.connectionType ?? 'cli',
    acpArgs: opts.acpArgs ?? ['--acp'],
    avatar: opts.avatar,
    _extensionName: opts.extensionName,
  };
}

describe('AcpDetector', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetAcpAdapters.mockReturnValue([]);
    vi.mocked(ProcessConfig.get).mockResolvedValue([]);
  });

  async function createFreshDetector() {
    const mod = await import('@process/agent/acp/AcpDetector');
    return mod.acpDetector;
  }

  describe('initialize', () => {
    it('should detect built-in CLIs that are available on PATH', async () => {
      setAvailableClis(['claude', 'qwen']);

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      // Gemini always first + claude + qwen
      expect(agents).toHaveLength(3);
      expect(agents[0].backend).toBe('gemini');
      expect(agents[1]).toMatchObject({ backend: 'claude', cliPath: 'claude' });
      expect(agents[2]).toMatchObject({ backend: 'qwen', cliPath: 'qwen' });
    });

    it('should skip built-in CLIs that are not available', async () => {
      setAvailableClis(['claude']); // only claude, not qwen or augment

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      expect(agents).toHaveLength(2); // gemini + claude
      expect(agents.find((a) => a.backend === 'qwen')).toBeUndefined();
      expect(agents.find((a) => a.backend === 'auggie')).toBeUndefined();
    });

    it('should always include Gemini as first agent', async () => {
      setAvailableClis([]);

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({ backend: 'gemini', name: 'Gemini CLI' });
    });

    it('should detect extension-contributed agents when CLI is available', async () => {
      setAvailableClis(['goose']);
      mockGetAcpAdapters.mockReturnValue([
        makeExtAdapter({ id: 'goose', name: 'Goose', cliCommand: 'goose', extensionName: 'aionext-goose' }),
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      // gemini + builtin goose (from POTENTIAL_ACP_CLIS if present) or ext goose
      const gooseAgent = agents.find((a) => a.cliPath === 'goose');
      expect(gooseAgent).toBeDefined();
    });

    it('should skip extension agents whose CLI is not available', async () => {
      setAvailableClis([]); // nothing available
      mockGetAcpAdapters.mockReturnValue([
        makeExtAdapter({ id: 'missing', name: 'Missing Agent', cliCommand: 'nonexistent', extensionName: 'ext-test' }),
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      expect(agents).toHaveLength(1); // only gemini
    });

    it('should skip extension agents with non-CLI connection type', async () => {
      setAvailableClis(['http-tool']);
      mockGetAcpAdapters.mockReturnValue([
        makeExtAdapter({
          id: 'http-agent',
          name: 'HTTP Agent',
          cliCommand: 'http-tool',
          extensionName: 'ext-http',
          connectionType: 'http',
        }),
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      expect(agents).toHaveLength(1); // only gemini
    });

    it('should include custom agents from config', async () => {
      setAvailableClis([]);
      vi.mocked(ProcessConfig.get).mockResolvedValue([
        { id: 'custom-1', name: 'My Agent', defaultCliPath: '/usr/bin/myagent', enabled: true, acpArgs: ['--acp'] },
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      expect(agents).toHaveLength(2); // gemini + custom
      expect(agents[1]).toMatchObject({ backend: 'custom', name: 'My Agent', customAgentId: 'custom-1' });
    });

    it('should not run twice (isDetected guard)', async () => {
      setAvailableClis(['claude']);

      const detector = await createFreshDetector();
      await detector.initialize();
      await detector.initialize(); // second call — should be no-op

      // execSync called only during first init
      const callCount = mockedExecSync.mock.calls.length;
      await detector.initialize();
      expect(mockedExecSync.mock.calls.length).toBe(callCount);
    });
  });

  describe('deduplicate', () => {
    it('should deduplicate by cliPath — builtin wins over extension', async () => {
      setAvailableClis(['qwen']);
      mockGetAcpAdapters.mockReturnValue([
        makeExtAdapter({ id: 'Qwen Code', name: 'Qwen Code', cliCommand: 'qwen', extensionName: 'aionext-qwen' }),
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      // Should have only one qwen entry (builtin with backend 'qwen'), not the extension duplicate
      const qwenAgents = agents.filter((a) => a.cliPath === 'qwen');
      expect(qwenAgents).toHaveLength(1);
      expect(qwenAgents[0].backend).toBe('qwen'); // builtin wins
      expect(qwenAgents[0].isExtension).toBeUndefined(); // not the extension one
    });

    it('should keep extension agent when no builtin matches the same cliPath', async () => {
      setAvailableClis(['custom-cli']);
      mockGetAcpAdapters.mockReturnValue([
        makeExtAdapter({
          id: 'unique',
          name: 'Unique Agent',
          cliCommand: 'custom-cli',
          extensionName: 'ext-unique',
        }),
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      const agent = agents.find((a) => a.cliPath === 'custom-cli');
      expect(agent).toBeDefined();
      expect(agent!.isExtension).toBe(true);
    });

    it('should keep agents without cliPath (gemini, presets)', async () => {
      setAvailableClis([]);
      vi.mocked(ProcessConfig.get).mockResolvedValue([
        { id: 'preset-1', name: 'Preset', enabled: true, isPreset: true, avatar: '📚', presetAgentType: 'gemini' },
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();
      const agents = detector.getDetectedAgents();

      // Gemini (no cliPath) + preset (no cliPath) — both kept
      expect(agents).toHaveLength(2);
      expect(agents[0].backend).toBe('gemini');
      expect(agents[1].isPreset).toBe(true);
    });
  });

  describe('refreshExtensionAgents', () => {
    it('should remove old extension agents and add newly detected ones', async () => {
      setAvailableClis(['claude']);
      const detector = await createFreshDetector();
      await detector.initialize();

      expect(detector.getDetectedAgents().find((a) => a.isExtension)).toBeUndefined();

      // Now an extension is installed that contributes a new CLI
      setAvailableClis(['claude', 'new-ext-cli']);
      mockGetAcpAdapters.mockReturnValue([
        makeExtAdapter({ id: 'new', name: 'New Ext', cliCommand: 'new-ext-cli', extensionName: 'ext-new' }),
      ]);

      await detector.refreshExtensionAgents();
      const agents = detector.getDetectedAgents();

      const extAgent = agents.find((a) => a.cliPath === 'new-ext-cli');
      expect(extAgent).toBeDefined();
      expect(extAgent!.isExtension).toBe(true);
    });

    it('should remove extension agents whose CLI is no longer available', async () => {
      setAvailableClis(['ext-cli']);
      mockGetAcpAdapters.mockReturnValue([
        makeExtAdapter({ id: 'temp', name: 'Temp', cliCommand: 'ext-cli', extensionName: 'ext-temp' }),
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();
      expect(detector.getDetectedAgents().find((a) => a.cliPath === 'ext-cli')).toBeDefined();

      // CLI removed
      setAvailableClis([]);
      await detector.refreshExtensionAgents();

      expect(detector.getDetectedAgents().find((a) => a.cliPath === 'ext-cli')).toBeUndefined();
    });

    it('should still deduplicate after refresh', async () => {
      setAvailableClis(['qwen']);

      const detector = await createFreshDetector();
      await detector.initialize();

      // Extension contributes same CLI as builtin
      mockGetAcpAdapters.mockReturnValue([
        makeExtAdapter({ id: 'qwen', name: 'Qwen Ext', cliCommand: 'qwen', extensionName: 'aionext-qwen' }),
      ]);

      await detector.refreshExtensionAgents();
      const qwenAgents = detector.getDetectedAgents().filter((a) => a.cliPath === 'qwen');
      expect(qwenAgents).toHaveLength(1);
      expect(qwenAgents[0].backend).toBe('qwen'); // builtin still wins
    });
  });

  describe('refreshCustomAgents', () => {
    it('should replace custom agents with updated config', async () => {
      setAvailableClis([]);
      vi.mocked(ProcessConfig.get).mockResolvedValue([
        { id: 'old', name: 'Old Agent', defaultCliPath: '/bin/old', enabled: true },
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();
      expect(detector.getDetectedAgents().find((a) => a.customAgentId === 'old')).toBeDefined();

      // Config changes
      vi.mocked(ProcessConfig.get).mockResolvedValue([
        { id: 'new', name: 'New Agent', defaultCliPath: '/bin/new', enabled: true },
      ]);

      await detector.refreshCustomAgents();
      const agents = detector.getDetectedAgents();

      expect(agents.find((a) => a.customAgentId === 'old')).toBeUndefined();
      expect(agents.find((a) => a.customAgentId === 'new')).toBeDefined();
    });

    it('should skip disabled custom agents', async () => {
      setAvailableClis([]);
      vi.mocked(ProcessConfig.get).mockResolvedValue([
        { id: 'disabled', name: 'Disabled', defaultCliPath: '/bin/x', enabled: false },
      ]);

      const detector = await createFreshDetector();
      await detector.initialize();

      expect(detector.getDetectedAgents().find((a) => a.customAgentId === 'disabled')).toBeUndefined();
    });
  });
});
