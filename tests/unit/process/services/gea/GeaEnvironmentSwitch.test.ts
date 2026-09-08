/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ suspend: vi.fn(), resume: vi.fn(), gateway: {}, resetClient: vi.fn() }));
vi.mock('@/process/services/gea/LarkAuthService', () => ({
  suspendSharedGeaEnvironment: runtime.suspend,
  resumeSharedGeaEnvironment: runtime.resume,
}));
vi.mock('@/process/services/gea/PersonalModelGatewayRuntime', () => ({
  getPersonalModelGatewayRuntime: () => runtime.gateway,
}));
vi.mock('@/process/services/gea/GeaClientRuntime', () => ({ resetGeaClientEnvironment: runtime.resetClient }));

const TARGET = 'https://gea.example:4443/gea-boot';
let env: typeof import('@/process/services/gea/GeaEnvironmentService');
let switching: typeof import('@/process/services/gea/GeaEnvironmentSwitch');

beforeEach(async () => {
  vi.resetModules();
  runtime.suspend.mockReset();
  runtime.resume.mockReset();
  runtime.resetClient.mockReset();
  vi.stubEnv('AIONUI_GEA_BASE_URL', 'https://initial.example/gea-boot');
  vi.stubEnv('AIONUI_INTERNAL_GEA_BASE_URL_SOURCE', 'default');
  env = await import('@/process/services/gea/GeaEnvironmentService');
  env.initializeGeaEnvironment({ isPackaged: true, env: {} });
  switching = await import('@/process/services/gea/GeaEnvironmentSwitch');
  runtime.suspend.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('GEA runtime environment switch', () => {
  it('retires old services and starts the target backend before publishing the new environment', async () => {
    const previous = env.getGeaEnvironment();
    const events: string[] = [];
    const persist = vi.fn(async () => {
      events.push('persist');
    });
    runtime.suspend.mockImplementation(async () => {
      events.push('suspend');
    });
    runtime.resetClient.mockImplementation(() => {
      events.push('resetClient');
    });
    runtime.resume.mockImplementation(() => {
      events.push('resume');
      expect(env.getGeaEnvironment().baseUrl).toBe(TARGET);
    });
    const restart = vi.fn(async (address: string) => {
      events.push('restart');
      expect(address).toBe(TARGET);
      expect(env.getGeaEnvironment()).toBe(previous);
    });
    switching.configureGeaEnvironmentSwitch(restart);
    await expect(switching.switchGeaEnvironment(TARGET, { isPackaged: true, persist })).resolves.toMatchObject({
      changed: true,
    });
    expect(events).toEqual(['persist', 'suspend', 'resetClient', 'restart', 'resume']);
    expect(process.env.AIONUI_GEA_BASE_URL).toBe(TARGET);
    expect(runtime.resume).toHaveBeenCalledWith(runtime.gateway);
  });

  it('does not stop the current runtime if the address is invalid or persistence fails', async () => {
    const restart = vi.fn();
    switching.configureGeaEnvironmentSwitch(restart);
    const persist = vi.fn().mockRejectedValue(new Error('disk full'));
    await expect(
      switching.switchGeaEnvironment('https://user:password@example.com', { isPackaged: true, persist })
    ).rejects.toThrow();
    expect(persist).not.toHaveBeenCalled();
    await expect(switching.switchGeaEnvironment(TARGET, { isPackaged: true, persist })).rejects.toThrow('disk full');
    expect(runtime.suspend).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
  });

  it('restores the original endpoint after a failed backend replacement without restoring its login', async () => {
    const previous = env.getGeaEnvironment();
    runtime.resume.mockReset();
    const restart = vi.fn().mockRejectedValueOnce(new Error('new backend failed')).mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    switching.configureGeaEnvironmentSwitch(restart);
    await expect(switching.switchGeaEnvironment(TARGET, { isPackaged: true, persist })).rejects.toThrow(
      'new backend failed'
    );
    expect(restart.mock.calls.map(([address]) => address)).toEqual([TARGET, previous.baseUrl]);
    expect(env.getGeaEnvironment()).toBe(previous);
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ baseUrl: previous.baseUrl }));
    expect(runtime.resume).toHaveBeenCalledTimes(1);
    expect(runtime.suspend).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent switches and does not persist the second target while the first is draining', async () => {
    let release!: () => void;
    runtime.resume.mockReset();
    const restart = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      )
      .mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    switching.configureGeaEnvironmentSwitch(restart);
    const first = switching.switchGeaEnvironment(TARGET, { isPackaged: true, persist });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const secondTarget = 'https://other.example/gea-boot';
    const second = switching.switchGeaEnvironment(secondTarget, { isPackaged: true, persist });
    await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(restart.mock.calls.map(([address]) => address)).toEqual([TARGET, secondTarget]);
    expect(env.getGeaEnvironment().baseUrl).toBe(secondTarget);
  });

  it('retries runtime recovery even for the original address when rollback could not restart it', async () => {
    const previous = env.getGeaEnvironment();
    runtime.resume.mockReset();
    const restart = vi
      .fn()
      .mockRejectedValueOnce(new Error('target failed'))
      .mockRejectedValueOnce(new Error('rollback failed'))
      .mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    switching.configureGeaEnvironmentSwitch(restart);
    await expect(switching.switchGeaEnvironment(TARGET, { isPackaged: true, persist })).rejects.toThrow(
      'target failed'
    );
    expect(runtime.resume).not.toHaveBeenCalled();
    await switching.switchGeaEnvironment(previous.baseUrl, { isPackaged: true, persist });
    expect(restart).toHaveBeenCalledTimes(3);
    expect(runtime.resume).toHaveBeenCalledTimes(1);
  });
});
