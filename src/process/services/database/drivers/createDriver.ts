// src/process/services/database/drivers/createDriver.ts

import type { ISqliteDriver } from './ISqliteDriver';

export async function createDriver(dbPath: string): Promise<ISqliteDriver> {
  if (typeof process.versions['bun'] !== 'undefined') {
    const { BunSqliteDriver } = await import('./BunSqliteDriver');
    return new BunSqliteDriver(dbPath);
  }
  const { BetterSqlite3Driver } = await import('./BetterSqlite3Driver');
  return new BetterSqlite3Driver(dbPath);
}
