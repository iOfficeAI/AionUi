/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ISqliteDriver } from '../../src/process/services/database/drivers/ISqliteDriver';
import { initSchema } from '../../src/process/services/database/schema';

function createMockDriver(): ISqliteDriver & { pragma: ReturnType<typeof vi.fn>; exec: ReturnType<typeof vi.fn> } {
  return {
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn(),
    transaction: vi.fn(),
    close: vi.fn(),
  };
}

describe('initSchema', () => {
  let driver: ReturnType<typeof createMockDriver>;

  beforeEach(() => {
    driver = createMockDriver();
  });

  it('sets busy_timeout pragma to prevent "database is locked" errors', () => {
    initSchema(driver);

    expect(driver.pragma).toHaveBeenCalledWith('busy_timeout = 5000');
  });

  it('sets busy_timeout before executing CREATE TABLE statements', () => {
    const callOrder: string[] = [];
    driver.pragma.mockImplementation((sql: string) => {
      callOrder.push(`pragma:${sql}`);
    });
    driver.exec.mockImplementation((_sql: string) => {
      callOrder.push('exec');
    });

    initSchema(driver);

    const busyTimeoutIndex = callOrder.indexOf('pragma:busy_timeout = 5000');
    const firstExecIndex = callOrder.indexOf('exec');
    expect(busyTimeoutIndex).toBeGreaterThanOrEqual(0);
    expect(firstExecIndex).toBeGreaterThan(busyTimeoutIndex);
  });

  it('enables WAL journal mode', () => {
    initSchema(driver);

    expect(driver.pragma).toHaveBeenCalledWith('journal_mode = WAL');
  });

  it('continues if WAL mode fails', () => {
    driver.pragma.mockImplementation((sql: string) => {
      if (sql === 'journal_mode = WAL') throw new Error('WAL not supported');
    });

    expect(() => initSchema(driver)).not.toThrow();
    expect(driver.exec).toHaveBeenCalled();
  });
});
