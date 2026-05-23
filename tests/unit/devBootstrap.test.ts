import { beforeEach, describe, expect, it, vi } from 'vitest';

const execSyncMock = vi.fn(() => '');
const spawnMock = vi.fn(() => ({ on: vi.fn() }));
const rmSyncMock = vi.fn();
const existsSyncMock = vi.fn((candidate: string) => candidate.includes('.pouding-dev'));

vi.mock('node:child_process', () => ({
  execSync: execSyncMock,
  spawn: spawnMock,
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: existsSyncMock,
    rmSync: rmSyncMock,
  },
}));

describe('dev-bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HOME = '/mock-home';
  });

  it('cleans stale dev data dirs before launching', async () => {
    const { main } = await import('../../scripts/dev-bootstrap.mjs');
    main(['launch', 'start']);

    expect(rmSyncMock).toHaveBeenCalledWith('/mock-home/.pouding-dev', { recursive: true, force: true });
    expect(spawnMock).toHaveBeenCalled();
  });
});
