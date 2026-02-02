/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import { getDatabase } from '@/process/database';
import type { ChannelAgentType, IChannelSession, IChannelUser, PluginType } from '../types';

/**
 * SessionManager - Manages user sessions for the Personal Assistant
 *
 * MVP Strategy: Single active session per user
 * - Each authorized user has at most one active session
 * - Creating a new session clears the previous one
 * - Sessions are linked to conversations in the main AionUI database
 */
export class SessionManager {
  // In-memory cache of active sessions for quick lookup
  private activeSessions: Map<string, IChannelSession> = new Map();

  constructor() {
    this.loadActiveSessions();
  }

  /**
   * Load active sessions from database into memory
   */
  private loadActiveSessions(): void {
    const db = getDatabase();
    const result = db.getChannelSessions();

    if (result.success && result.data) {
      for (const session of result.data) {
        this.activeSessions.set(session.userId, session);
      }
      console.log(`[SessionManager] Loaded ${this.activeSessions.size} active session(s)`);
    }
  }

  /**
   * Get session for a user
   */
  getSession(userId: string): IChannelSession | null {
    return this.activeSessions.get(userId) ?? null;
  }

  /**
   * Get session by platform user (lookup user first, then get session)
   */
  getSessionByPlatformUser(platformUserId: string, platformType: PluginType): IChannelSession | null {
    const db = getDatabase();
    const userResult = db.getChannelUserByPlatform(platformUserId, platformType);

    if (!userResult.success || !userResult.data) {
      return null;
    }

    return this.getSession(userResult.data.id);
  }

  /**
   * Create a new session for a user
   * This will clear any existing session (MVP: single session per user)
   */
  createSession(user: IChannelUser, agentType: ChannelAgentType = 'gemini', workspace?: string): IChannelSession {
    // Generate a new conversationId
    return this.createSessionWithConversation(user, uuid(), agentType, workspace);
  }

  /**
   * Create a new session with a specific conversation ID
   * 使用指定的 conversationId 创建会话（用于复用现有会话）
   */
  createSessionWithConversation(user: IChannelUser, conversationId: string, agentType: ChannelAgentType = 'gemini', workspace?: string): IChannelSession {
    const db = getDatabase();

    // Clear existing session if any
    const existingSession = this.activeSessions.get(user.id);
    if (existingSession) {
      console.log(`[SessionManager] Clearing existing session for user ${user.id}`);
      db.deleteChannelSession(existingSession.id);
    }

    // Create new session with the provided conversation ID
    const now = Date.now();
    const session: IChannelSession = {
      id: uuid(),
      userId: user.id,
      agentType,
      workspace,
      conversationId,
      createdAt: now,
      lastActivity: now,
    };

    // Save to database
    db.upsertChannelSession(session);

    // Update in-memory cache
    this.activeSessions.set(user.id, session);

    // Update user's session reference
    db.getChannelUserByPlatform(user.platformUserId, user.platformType);

    console.log(`[SessionManager] Created new session ${session.id} with conversation ${conversationId} for user ${user.id}`);
    return session;
  }

  /**
   * Update session's conversation ID (after creating a conversation)
   */
  updateSessionConversation(sessionId: string, conversationId: string): boolean {
    const db = getDatabase();

    // Find session by ID
    let session: IChannelSession | null = null;
    for (const s of this.activeSessions.values()) {
      if (s.id === sessionId) {
        session = s;
        break;
      }
    }

    if (!session) {
      console.warn(`[SessionManager] Session ${sessionId} not found`);
      return false;
    }

    // Update session
    session.conversationId = conversationId;
    session.lastActivity = Date.now();

    // Save to database
    db.upsertChannelSession(session);

    console.log(`[SessionManager] Updated session ${sessionId} with conversation ${conversationId}`);
    return true;
  }

  /**
   * Update session's last activity timestamp
   */
  updateSessionActivity(userId: string): void {
    const session = this.activeSessions.get(userId);
    if (!session) return;

    session.lastActivity = Date.now();

    const db = getDatabase();
    db.upsertChannelSession(session);
  }

  /**
   * Clear session for a user (e.g., when user clicks "New Session")
   */
  clearSession(userId: string): boolean {
    const session = this.activeSessions.get(userId);
    if (!session) {
      return false;
    }

    const db = getDatabase();
    db.deleteChannelSession(session.id);
    this.activeSessions.delete(userId);

    console.log(`[SessionManager] Cleared session for user ${userId}`);
    return true;
  }

  /**
   * Clear session by conversation ID
   * Used when a conversation is deleted from AionUI
   * 根据 conversationId 清理 session（当会话从 AionUI 删除时调用）
   */
  clearSessionByConversationId(conversationId: string): IChannelSession | null {
    const db = getDatabase();

    // Find session with this conversation ID
    let foundSession: IChannelSession | null = null;
    let foundUserId: string | null = null;

    for (const [userId, session] of this.activeSessions.entries()) {
      if (session.conversationId === conversationId) {
        foundSession = session;
        foundUserId = userId;
        break;
      }
    }

    if (!foundSession || !foundUserId) {
      return null;
    }

    // Delete from database and cache
    db.deleteChannelSession(foundSession.id);
    this.activeSessions.delete(foundUserId);

    console.log(`[SessionManager] Cleared session ${foundSession.id} for conversation ${conversationId}`);
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
  cleanupStaleSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const db = getDatabase();
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > maxAgeMs) {
        db.deleteChannelSession(session.id);
        this.activeSessions.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned up ${cleaned} stale session(s)`);
    }

    return cleaned;
  }
}
