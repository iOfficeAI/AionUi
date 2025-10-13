/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProcessConfig, ProcessChat, ProcessChatMessage } from '../initStorage';
import { getDatabase } from './index';
import type { TChatConversation, IProvider, IMcpServer, IConfigStorageRefer } from '@/common/storage';
import type { TMessage } from '@/common/chatLib';

/**
 * Migration result
 */
interface IMigrationResult {
  success: boolean;
  stats: {
    conversations: number;
    messages: number;
    providers: number;
    mcpServers: number;
    configs: number;
  };
  errors: string[];
}

/**
 * Migrate data from file storage to database
 * This is a ONE-TIME migration that should run only once
 */
export async function migrateFileStorageToDatabase(): Promise<IMigrationResult> {
  console.log('[Migration] Starting migration from file storage to database...');

  const db = getDatabase();
  const result: IMigrationResult = {
    success: true,
    stats: {
      conversations: 0,
      messages: 0,
      providers: 0,
      mcpServers: 0,
      configs: 0,
    },
    errors: [],
  };

  const defaultUserId = db.getDefaultUserId();

  try {
    // 1. Check if migration already completed
    const migrationFlag = db.getConfig<boolean>('migration_completed');
    if (migrationFlag.success && migrationFlag.data === true) {
      console.log('[Migration] Migration already completed, skipping...');
      return result;
    }

    // 2. Migrate conversations
    console.log('[Migration] Migrating conversations...');
    try {
      const chatHistory = await ProcessChat.get('chat.history');
      if (Array.isArray(chatHistory)) {
        for (const conversation of chatHistory) {
          const convResult = db.createConversation(conversation as TChatConversation, defaultUserId);
          if (convResult.success) {
            result.stats.conversations++;

            // Migrate messages for this conversation
            try {
              const messages = await ProcessChatMessage.get(conversation.id);
              if (Array.isArray(messages) && messages.length > 0) {
                const msgResult = db.insertMessages(messages as TMessage[]);
                if (msgResult.success && msgResult.data) {
                  result.stats.messages += msgResult.data;
                }
              }
            } catch (msgError: any) {
              result.errors.push(`Failed to migrate messages for conversation ${conversation.id}: ${msgError.message}`);
            }
          } else {
            result.errors.push(`Failed to migrate conversation ${conversation.id}: ${convResult.error}`);
          }
        }
        console.log(`[Migration] Migrated ${result.stats.conversations} conversations and ${result.stats.messages} messages`);
      }
    } catch (error: any) {
      result.errors.push(`Failed to read chat history: ${error.message}`);
    }

    // 3. Migrate providers
    console.log('[Migration] Migrating providers...');
    try {
      const providers = await ProcessConfig.get('model.config');
      if (Array.isArray(providers)) {
        for (const provider of providers) {
          const providerResult = db.createProvider(provider as IProvider, defaultUserId);
          if (providerResult.success) {
            result.stats.providers++;
          } else {
            result.errors.push(`Failed to migrate provider ${provider.id}: ${providerResult.error}`);
          }
        }
        console.log(`[Migration] Migrated ${result.stats.providers} providers`);
      }
    } catch (error: any) {
      result.errors.push(`Failed to read providers: ${error.message}`);
    }

    // 4. Migrate MCP servers
    console.log('[Migration] Migrating MCP servers...');
    try {
      const mcpServers = await ProcessConfig.get('mcp.config');
      if (Array.isArray(mcpServers)) {
        for (const server of mcpServers) {
          const serverResult = db.createMcpServer(server as IMcpServer, defaultUserId);
          if (serverResult.success) {
            result.stats.mcpServers++;
          } else {
            result.errors.push(`Failed to migrate MCP server ${server.id}: ${serverResult.error}`);
          }
        }
        console.log(`[Migration] Migrated ${result.stats.mcpServers} MCP servers`);
      }
    } catch (error: any) {
      result.errors.push(`Failed to read MCP servers: ${error.message}`);
    }

    // 5. Migrate all configs
    console.log('[Migration] Migrating configurations...');
    try {
      const allConfigs = await ProcessConfig.toJson();
      const configKeys = Object.keys(allConfigs) as (keyof IConfigStorageRefer)[];

      for (const key of configKeys) {
        // Skip model.config and mcp.config as they are migrated separately
        if (key === 'model.config' || key === 'mcp.config') {
          continue;
        }

        const value = allConfigs[key as keyof typeof allConfigs];
        const configResult = db.setConfig(key, value);
        if (configResult.success) {
          result.stats.configs++;
        } else {
          result.errors.push(`Failed to migrate config ${String(key)}: ${configResult.error}`);
        }
      }
      console.log(`[Migration] Migrated ${result.stats.configs} config entries`);
    } catch (error: any) {
      result.errors.push(`Failed to read configs: ${error.message}`);
    }

    // 6. Mark migration as completed
    db.setConfig('migration_completed', true);
    db.setConfig('migration_date', Date.now());
    db.setConfig('migration_version', 1);

    console.log('[Migration] Migration completed successfully!');
    console.log('[Migration] Stats:', result.stats);

    if (result.errors.length > 0) {
      console.warn('[Migration] Migration completed with errors:', result.errors);
      result.success = false;
    }
  } catch (error: any) {
    console.error('[Migration] Migration failed:', error);
    result.success = false;
    result.errors.push(`Fatal error: ${error.message}`);
  }

  return result;
}

/**
 * Rollback migration (for testing/emergency use)
 * WARNING: This will clear all database data!
 */
export function rollbackMigration(): void {
  console.log('[Migration] Rolling back migration...');

  const db = getDatabase();

  try {
    // Clear all data
    db.deleteConfig('migration_completed');
    db.deleteConfig('migration_date');
    db.deleteConfig('migration_version');

    console.log('[Migration] Rollback completed. You can now run migration again.');
  } catch (error) {
    console.error('[Migration] Rollback failed:', error);
    throw error;
  }
}

/**
 * Get migration status
 */
export function getMigrationStatus(): {
  completed: boolean;
  date?: number;
  version?: number;
  stats?: any;
} {
  const db = getDatabase();

  const completed = db.getConfig<boolean>('migration_completed');
  const date = db.getConfig<number>('migration_date');
  const version = db.getConfig<number>('migration_version');

  return {
    completed: completed.success && completed.data === true,
    date: date.data,
    version: version.data,
    stats: db.getStats(),
  };
}

/**
 * Export database to JSON (for backup)
 */
export function exportDatabaseToJSON(): {
  conversations: TChatConversation[];
  messages: Record<string, TMessage[]>;
  providers: IProvider[];
  mcpServers: IMcpServer[];
  configs: Record<string, any>;
} {
  const db = getDatabase();
  const defaultUserId = db.getDefaultUserId();

  const conversations = db.getUserConversations(defaultUserId, 0, 10000);
  const providers = db.getUserProviders(defaultUserId);
  const mcpServers = db.getUserMcpServers(defaultUserId);
  const configs = db.getAllConfigs();

  const messages: Record<string, TMessage[]> = {};
  if (conversations.data) {
    for (const conv of conversations.data) {
      const convMessages = db.getConversationMessages(conv.id, 0, 10000);
      if (convMessages.data) {
        messages[conv.id] = convMessages.data;
      }
    }
  }

  return {
    conversations: conversations.data || [],
    messages,
    providers: providers.data || [],
    mcpServers: mcpServers.data || [],
    configs: configs.data || {},
  };
}

/**
 * Import database from JSON (for restore)
 */
// eslint-disable-next-line max-len
export function importDatabaseFromJSON(data: { conversations: TChatConversation[]; messages: Record<string, TMessage[]>; providers: IProvider[]; mcpServers: IMcpServer[]; configs: Record<string, any> }): void {
  const db = getDatabase();
  const defaultUserId = db.getDefaultUserId();

  console.log('[Import] Starting database import...');

  // Import conversations
  for (const conv of data.conversations) {
    db.createConversation(conv, defaultUserId);
  }

  // Import messages
  for (const [_convId, messages] of Object.entries(data.messages)) {
    db.insertMessages(messages);
  }

  // Import providers
  for (const provider of data.providers) {
    db.createProvider(provider, defaultUserId);
  }

  // Import MCP servers
  for (const server of data.mcpServers) {
    db.createMcpServer(server, defaultUserId);
  }

  // Import configs
  for (const [key, value] of Object.entries(data.configs)) {
    db.setConfig(key, value);
  }

  console.log('[Import] Database import completed');
}
