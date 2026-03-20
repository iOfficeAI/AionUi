/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  IChannelPluginConfig,
  IChannelPairingRequest,
  IChannelUser,
  IChannelSession,
} from '@process/channels/types';
import { getDatabase } from '@process/services/database';
import type { IChannelRepository } from './IChannelRepository';

/** Thin delegation wrapper around the better-sqlite3 database for channel-related queries. */
export class SqliteChannelRepository implements IChannelRepository {
  getChannelPlugins(): IChannelPluginConfig[] {
    const db = getDatabase();
    const result = db.getChannelPlugins();
    if (!result.success || !Array.isArray(result.data)) {
      throw new Error(result.error ?? 'Failed to get channel plugins');
    }
    return result.data;
  }

  getPendingPairingRequests(): IChannelPairingRequest[] {
    const db = getDatabase();
    const result = db.getPendingPairingRequests();
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to get pending pairing requests');
    }
    return result.data;
  }

  getChannelUsers(): IChannelUser[] {
    const db = getDatabase();
    const result = db.getChannelUsers();
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to get channel users');
    }
    return result.data;
  }

  deleteChannelUser(userId: string): void {
    const db = getDatabase();
    const result = db.deleteChannelUser(userId);
    if (!result.success) {
      throw new Error(result.error ?? `Failed to delete channel user ${userId}`);
    }
  }

  getChannelSessions(): IChannelSession[] {
    const db = getDatabase();
    const result = db.getChannelSessions();
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to get channel sessions');
    }
    return result.data;
  }
}
