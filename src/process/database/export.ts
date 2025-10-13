/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main database exports
 * Use this file to import database functionality throughout the app
 */

export { AionDatabase, getDatabase, closeDatabase } from './index';
export { ImageStorage, getImageStorage } from './imageStorage';
export { runMigrations, rollbackMigrations, getMigrationHistory, isMigrationApplied, type IMigration } from './migrations';

export type {
  // Database-specific types
  IUser,
  IImageMetadata,
  IQueryResult,
  IPaginatedResult,
  // Business types (re-exported for convenience)
  TChatConversation,
  TMessage,
  IProvider,
  IMcpServer,
  IConfigStorageRefer,
  // Database row types (for advanced usage)
  IConversationRow,
  IMessageRow,
  IAuthUserRow,
  IAuthSessionRow,
  IProviderRow,
  IMcpServerRow,
  IConfigRow,
} from './types';

// Re-export conversion functions
export { conversationToRow, rowToConversation, messageToRow, rowToMessage, providerToRow, rowToProvider, mcpServerToRow, rowToMcpServer } from './types';
