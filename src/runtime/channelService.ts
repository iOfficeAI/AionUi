/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getChannelManager } from '@/channels';
import WorkerManage from '@/process/WorkerManage';
import { closeDatabase } from '@/process/database';
import { bootstrapRuntimeCore } from './bootstrap';

let heartbeatTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[ChannelService] ${signal} received, shutting down...`);

  try {
    await getChannelManager().shutdown();
  } catch (error) {
    console.error('[ChannelService] failed to shutdown ChannelManager:', error);
  }

  try {
    WorkerManage.clear();
  } catch (error) {
    console.error('[ChannelService] failed to clear workers:', error);
  }

  try {
    closeDatabase();
  } catch (error) {
    console.error('[ChannelService] failed to close database:', error);
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  process.exit(0);
}

async function main(): Promise<void> {
  await bootstrapRuntimeCore();
  await getChannelManager().initialize();

  console.log('[ChannelService] initialized successfully');

  // Keep process alive when no plugin connection is active yet.
  heartbeatTimer = setInterval(() => {
    // noop heartbeat
  }, 60_000);

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
}

void main().catch((error) => {
  console.error('[ChannelService] startup failed:', error);
  process.exit(1);
});
