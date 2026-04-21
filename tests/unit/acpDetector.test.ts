import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSafeExec = vi.hoisted(() => vi.fn());
const mockSafeExecFile = vi.hoisted(() => vi.fn());
const mockGetEnhancedEnv = vi.hoisted(() => vi.fn(() => ({ PATH: '/usr/bin' })));
const mockGetAcpAdapters = vi.hoisted(() => vi.fn((): Record<string, unknown>[] => []));

vi.mock('@/common/types/acpTypes', () => ({
  POTENTIAL_ACP_CLIS: [
    { cmd: 'claude', name: 'Claude Code', backendId: 'claude', args: ['--experimental-acp'] },
    { cmd: 'qwen', name: 'Qwen Code', backendId: 'qwen', args: ['--acp'] },
    { cmd: 'auggie', name: 'Augment Code', backendId: 'auggie', args: ['--acp'] },
  ],
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      getAcpAdapters: mockGetAcpAdapters,
    }),
  },
}));

vi.mock('@process/utils/safeExec', () => ({
  safeExec: (...args: unknown[]) => mockSafeExec(...args),
  safeExecFile: (...args: unknown[]) => mockSafeExecFile(...args),
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: (...args: unknown[]) => mockGetEnhancedEnv(...args),
}));

async function createFreshDetector() {
  vi.resetModules();
  const mod = await import('@process/agent/acp/AcpDetector');
  return mod.acpDetector;
}

function makeExtAdapter(opts: {
  id: string;
  name: string;
  cliCommand?: string;
  defaultCliPath?: string;
  extensionName: string;
  acpArgs?: string[];
  connectionType?: string;
}) {
  return {
    id: opts.id,
    name: opts.name,
    cliCommand: opts.cliCommand,
    defaultCliPath: opts.defaultCliPath,
    connectionType: opts.connectionType ?? 'cli',
    acpArgs: opts.acpArgs ?? ['--acp'],
    _extensionName: opts.extensionName,
  };
}

describe('AcpDetector', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnhancedEnv.mockReturnValue({ PATH: '/usr/bin' });
    mockGetAcpAdapters.mockReturnValue([]);
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('detects builtin CLI agents on POSIX via a single batch shell command', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    mockSafeExec.mockResolvedValue({ stdout: 'claude\nqwen\n', stderr: '' });

    const detector = await createFreshDetector();
    const agents = await detector.detectBuiltinAgents();

    expect(agents).toEqual([
      expect.objectContaining({ backend: 'claude', cliPath: 'claude', acpArgs: ['--experimental-acp'] }),
      expect.objectContaining({ backend: 'qwen', cliPath: 'qwen', acpArgs: ['--acp'] }),
    ]);
    expect(mockSafeExec).toHaveBeenCalledTimes(1);
    expect(mockGetEnhancedEnv).toHaveBeenCalledTimes(1);
  });

  it('detects builtin CLI agents on Windows with where and PowerShell fallback', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    mockSafeExecFile.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'where' && args[0] === 'claude') {
        return { stdout: 'C:\\Tools\\claude.exe', stderr: '' };
      }
      if (command === 'where' && args[0] === 'qwen') {
        throw new Error('not found');
      }
      if (command === 'powershell' && args[3]?.includes('Get-Command -All qwen')) {
        return { stdout: '', stderr: '' };
      }
      throw new Error('not found');
    });

    const detector = await createFreshDetector();
    const agents = await detector.detectBuiltinAgents();

    expect(agents).toEqual([
      expect.objectContaining({ backend: 'claude', cliPath: 'claude' }),
      expect.objectContaining({ backend: 'qwen', cliPath: 'qwen' }),
    ]);
    expect(mockSafeExecFile).toHaveBeenCalled();
    expect(mockGetEnhancedEnv).toHaveBeenCalledTimes(1);
  });

  it('reuses the cached environment across repeated async CLI checks', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    mockSafeExec.mockResolvedValue({ stdout: 'claude\n', stderr: '' });

    const detector = await createFreshDetector();

    await expect(detector.batchCheckCliAvailability(['claude'])).resolves.toEqual(new Set(['claude']));
    await expect(detector.batchCheckCliAvailability(['claude'])).resolves.toEqual(new Set(['claude']));
    expect(mockGetEnhancedEnv).toHaveBeenCalledTimes(1);
  });

  it('clears the cached environment when clearEnvCache is called', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    mockSafeExec.mockResolvedValue({ stdout: 'qwen\n', stderr: '' });

    const detector = await createFreshDetector();

    await expect(detector.batchCheckCliAvailability(['qwen'])).resolves.toEqual(new Set(['qwen']));
    detector.clearEnvCache();
    await expect(detector.batchCheckCliAvailability(['qwen'])).resolves.toEqual(new Set(['qwen']));
    expect(mockGetEnhancedEnv).toHaveBeenCalledTimes(2);
  });

  it('returns extension-contributed CLI adapters without requiring PATH detection', async () => {
    mockGetAcpAdapters.mockReturnValue([
      makeExtAdapter({
        id: 'goose',
        name: 'Goose',
        cliCommand: 'goose',
        defaultCliPath: 'bunx @block/goose',
        extensionName: 'aionext-goose',
      }),
      makeExtAdapter({
        id: 'copilot',
        name: 'Copilot',
        cliCommand: 'copilot',
        connectionType: 'stdio',
        extensionName: 'aionext-copilot',
      }),
    ]);

    const detector = await createFreshDetector();
    const agents = await detector.detectExtensionAgents();

    expect(agents).toEqual([
      expect.objectContaining({
        backend: 'goose',
        cliPath: 'bunx @block/goose',
        isExtension: true,
        extensionName: 'aionext-goose',
      }),
      expect.objectContaining({
        backend: 'copilot',
        cliPath: 'copilot',
        isExtension: true,
        extensionName: 'aionext-copilot',
      }),
    ]);
    expect(mockSafeExec).not.toHaveBeenCalled();
    expect(mockSafeExecFile).not.toHaveBeenCalled();
  });

  it('skips adapters with unsupported connection types or missing cliCommand', async () => {
    mockGetAcpAdapters.mockReturnValue([
      makeExtAdapter({
        id: 'http-agent',
        name: 'HTTP Agent',
        cliCommand: 'http-agent',
        connectionType: 'http',
        extensionName: 'ext-http',
      }),
      makeExtAdapter({
        id: 'missing-cli',
        name: 'Missing CLI',
        extensionName: 'ext-missing',
      }),
      makeExtAdapter({
        id: 'valid',
        name: 'Valid Agent',
        cliCommand: 'valid-agent',
        extensionName: 'ext-valid',
      }),
    ]);

    const detector = await createFreshDetector();
    const agents = await detector.detectExtensionAgents();

    expect(agents).toEqual([
      expect.objectContaining({
        backend: 'valid',
        cliPath: 'valid-agent',
        isExtension: true,
      }),
    ]);
  });

  it('returns an empty extension list when the extension registry throws', async () => {
    mockGetAcpAdapters.mockImplementation(() => {
      throw new Error('registry failed');
    });

    const detector = await createFreshDetector();

    await expect(detector.detectExtensionAgents()).resolves.toEqual([]);
  });
});
