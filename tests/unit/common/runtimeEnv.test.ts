import { afterEach, describe, expect, it } from 'vitest';

import {
  getRuntimeEnvValue,
  isDevelopmentRuntime,
  isMultiInstanceRuntime,
  isProductionRuntime,
  resolveWebUiDefaultPort,
} from '../../../src/common/config/runtimeEnv';

const originalProcess = globalThis.process;

afterEach(() => {
  Object.defineProperty(globalThis, 'process', {
    value: originalProcess,
    configurable: true,
    writable: true,
  });
});

describe('runtimeEnv', () => {
  it('falls back safely when process is unavailable', () => {
    Object.defineProperty(globalThis, 'process', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(getRuntimeEnvValue('NODE_ENV')).toBeUndefined();
    expect(isProductionRuntime()).toBe(false);
    expect(isDevelopmentRuntime()).toBe(true);
    expect(isMultiInstanceRuntime()).toBe(false);
    expect(resolveWebUiDefaultPort()).toBe(25809);
  });

  it('derives runtime flags from process.env when available', () => {
    Object.defineProperty(globalThis, 'process', {
      value: {
        env: {
          NODE_ENV: 'production',
          AIONUI_MULTI_INSTANCE: '1',
        },
      },
      configurable: true,
      writable: true,
    });

    expect(getRuntimeEnvValue('NODE_ENV')).toBe('production');
    expect(isProductionRuntime()).toBe(true);
    expect(isDevelopmentRuntime()).toBe(false);
    expect(isMultiInstanceRuntime()).toBe(true);
    expect(resolveWebUiDefaultPort()).toBe(25808);
  });
});
