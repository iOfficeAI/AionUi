/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import { getDatabase } from '@process/services/database';
import type { ChannelAgentType, IChannelSession, IChannelUser, PluginType } from '../types';

/**
 * SessionManager - Manages user sessions for the Personal Assistant
 *
 * Sessions are keyed by composite key `${user_id}:${chatId}` to support
 * per-chat isolation: the same user in different group chats gets separate sessions.
 * When chatId is omitted, falls back to user_id-only key for backward compatibility.
 */
export class SessionManager {
  // In-memory cache of active sessions keyed by composite key (user_id:chatId)
  private activeSessions: Map<string, IChannelSession> = new Map();

  /** Resolves once persisted sessions have been loaded into memory. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.loadActiveSessions();
  }

  /**
   * Build composite key for session lookup
   */
  private buildKey(user_id: string, chatId?: string): string {
    return chatId ? `${user_id}:${chatId}` : user_id;
  }

  /**
   * Load active sessions from database into memory
   */
  private async loadActiveSessions(): Promise<void> {
    const db = await getDatabase();
    const result = db.getChannelSessions();

    if (result.success && result.data) {
      for (const session of result.data) {
        const key = this.buildKey(session.user_id, session.chatId);
        this.activeSessions.set(key, session);
      }
    }
  }

  /**
   * Get session for a user (optionally scoped to a specific chat)
   */
  getSession(user_id: string, chatId?: string): IChannelSession | null {
    return this.activeSessions.get(this.buildKey(user_id, chatId)) ?? null;
  }

  /**
   * Get session by platform user (lookup user first, then get session)
   */
  async getSessionByPlatformUser(
    platformUserId: string,
    platformType: PluginType,
    chatId?: string
  ): Promise<IChannelSession | null> {
    const db = await getDatabase();
    const userResult = db.getChannelUserByPlatform(platformUserId, platformType);

    if (!userResult.success || !userResult.data) {
      return null;
    }

    return this.getSession(userResult.data.id, chatId);
  }

  /**
   * Create a new session for a user
   * This will clear any existing session for the same user+chat combo
   */
  async createSession(
    user: IChannelUser,
    agent_type: ChannelAgentType = 'gemini',
    workspace?: string,
    chatId?: string
  ): Promise<IChannelSession> {
    // Generate a new conversation_id
    return await this.createSessionWithConversation(user, uuid(), agent_type, workspace, chatId);
  }

  /**
   * Create a new session with a specific conversation ID
   */
  async createSessionWithConversation(
    user: IChannelUser,
    conversation_id: string,
    agent_type: ChannelAgentType = 'gemini',
    workspace?: string,
    chatId?: string
  ): Promise<IChannelSession> {
    const db = await getDatabase();
    const key = this.buildKey(user.id, chatId);

    // Clear existing session if any
    const existingSession = this.activeSessions.get(key);
    if (existingSession) {
      db.deleteChannelSession(existingSession.id);
    }

    // Create new session with the provided conversation ID
    const now = Date.now();
    const session: IChannelSession = {
      id: uuid(),
      user_id: user.id,
      agent_type,
      workspace,
      conversation_id,
      chatId,
      created_at: now,
      lastActivity: now,
    };

    // Save to database
    db.upsertChannelSession(session);

    // Update in-memory cache
    this.activeSessions.set(key, session);

    // Update user's session reference
    db.getChannelUserByPlatform(user.platformUserId, user.platformType);

    return session;
  }

  /**
   * Update session's conversation ID (after creating a conversation)
   */
  async updateSessionConversation(session_id: string, conversation_id: string): Promise<boolean> {
    const db = await getDatabase();

    // Find session by ID and its key
    let foundKey: string | null = null;
    let foundSession: IChannelSession | null = null;
    for (const [key, s] of this.activeSessions.entries()) {
      if (s.id === session_id) {
        foundKey = key;
        foundSession = s;
        break;
      }
    }

    if (!foundSession || !foundKey) {
      console.warn(`[SessionManager] Session ${session_id} not found`);
      return false;
    }

    // Create updated session (immutable)
    const updated: IChannelSession = {
      ...foundSession,
      conversation_id,
      lastActivity: Date.now(),
    };

    // Save to database and update cache
    db.upsertChannelSession(updated);
    this.activeSessions.set(foundKey, updated);

    return true;
  }

  /**
   * Update session's last activity timestamp
   */
  async updateSessionActivity(user_id: string, chatId?: string): Promise<void> {
    const key = this.buildKey(user_id, chatId);
    const session = this.activeSessions.get(key);
    if (!session) return;

    // Create updated session (immutable)
    const updated: IChannelSession = { ...session, lastActivity: Date.now() };
    this.activeSessions.set(key, updated);

    const db = await getDatabase();
    db.upsertChannelSession(updated);
  }

  /**
   * Clear session for a user (e.g., when user clicks "New Session")
   */
  async clearSession(user_id: string, chatId?: string): Promise<boolean> {
    const key = this.buildKey(user_id, chatId);
    const session = this.activeSessions.get(key);
    if (!session) {
      return false;
    }

    const db = await getDatabase();
    db.deleteChannelSession(session.id);
    this.activeSessions.delete(key);

    return true;
  }

  /**
   * Clear all sessions from both in-memory cache and database.
   * Used when channel settings change to force session re-evaluation on next message.
   */
  async clearAllSessions(): Promise<number> {
    const db = await getDatabase();
    let cleared = 0;
    for (const [key, session] of this.activeSessions.entries()) {
      db.deleteChannelSession(session.id);
      this.activeSessions.delete(key);
      cleared++;
    }
    return cleared;
  }

  /**
   * Clear session by conversation ID
   * Used when a conversation is deleted from AionUI
   */
  async clearSessionByConversationId(conversation_id: string): Promise<IChannelSession | null> {
    const db = await getDatabase();

    // Find session with this conversation ID
    let foundSession: IChannelSession | null = null;
    let foundKey: string | null = null;

    for (const [key, session] of this.activeSessions.entries()) {
      if (session.conversation_id === conversation_id) {
        foundSession = session;
        foundKey = key;
        break;
      }
    }

    if (!foundSession || !foundKey) {
      return null;
    }

    // Delete from database and cache
    db.deleteChannelSession(foundSession.id);
    this.activeSessions.delete(foundKey);

    return foundSession;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): IChannelSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Cleanup stale sessions (e.g., inactive for more than 24 hours)
   */
  async cleanupStaleSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const db = await getDatabase();
    const now = Date.now();
    let cleaned = 0;

    for (const [key, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > maxAgeMs) {
        db.deleteChannelSession(session.id);
        this.activeSessions.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned up ${cleaned} stale session(s)`);
    }

    return cleaned;
  }
}
