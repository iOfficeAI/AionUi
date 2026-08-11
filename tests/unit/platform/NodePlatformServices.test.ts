import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';

describe('NodePlatformServices.paths', () => {
  beforeEach(() => {
    delete process.env.DATA_DIR;
    delete process.env.LOGS_DIR;
    delete process.env.IS_PACKAGED;
    vi.resetModules();
  });

  it('getDataDir uses DATA_DIR env var when set', async () => {
    process.env.DATA_DIR = '/custom/data';
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getDataDir()).toBe('/custom/data');
  });

  it('getDataDir falls back to homedir/.aionui-server', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getDataDir()).toBe(path.join(os.homedir(), '.aionui-server'));
  });

  it('getLogsDir uses LOGS_DIR env var when set', async () => {
    process.env.LOGS_DIR = '/custom/logs';
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getLogsDir()).toBe('/custom/logs');
  });

  it('getLogsDir falls back to homedir/.aionui-server/logs', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getLogsDir()).toBe(path.join(os.homedir(), '.aionui-server', 'logs'));
  });

  it('getAppPath returns process.cwd()', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.getAppPath()).toBe(process.cwd());
  });

  it('isPackaged returns false by default', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.isPackaged()).toBe(false);
  });

  it('isPackaged returns true when IS_PACKAGED=true', async () => {
    process.env.IS_PACKAGED = 'true';
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().paths.isPackaged()).toBe(true);
  });

  it('getSystemPath returns null for any name', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    const svc = new NodePlatformServices();
    expect(svc.paths.getSystemPath('desktop')).toBeNull();
    expect(svc.paths.getSystemPath('home')).toBeNull();
    expect(svc.paths.getSystemPath('downloads')).toBeNull();
  });

  it('getName and getVersion read from package.json', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    const svc = new NodePlatformServices();
    expect(typeof svc.paths.getName()).toBe('string');
    expect(svc.paths.getName().length).toBeGreaterThan(0);
    expect(typeof svc.paths.getVersion()).toBe('string');
  });
});

const { mockFork } = vi.hoisted(() => {
  const mockFork = vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    send: vi.fn(),
    kill: vi.fn(),
  });
  return { mockFork };
});

vi.mock('child_process', () => ({ fork: mockFork }));

describe('NodePlatformServices.worker', () => {
  it('fork delegates to child_process.fork with serialization:advanced', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    const svc = new NodePlatformServices();
    svc.worker.fork('/path/script.js', [], {
      cwd: '/cwd',
      env: { FOO: 'bar' },
    });
    expect(mockFork).toHaveBeenCalledWith('/path/script.js', [], {
      cwd: '/cwd',
      env: { FOO: 'bar' },
      serialization: 'advanced',
    });
  });
});

describe('NodePlatformServices.power', () => {
  it('preventSleep returns null', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(new NodePlatformServices().power.preventSleep()).toBeNull();
  });

  it('allowSleep is a no-op for null', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(() => new NodePlatformServices().power.allowSleep(null)).not.toThrow();
  });

  it('allowSleep is a no-op for a number', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(() => new NodePlatformServices().power.allowSleep(42)).not.toThrow();
  });
});

describe('NodePlatformServices.notification', () => {
  it('send is a no-op and does not throw', async () => {
    const { NodePlatformServices } = await import('../../../src/common/platform/NodePlatformServices');
    expect(() => new NodePlatformServices().notification.send({ title: 'T', body: 'B' })).not.toThrow();
  });
});
