/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  last_login: string | null;
}

export interface Session {
  id: string;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

interface DatabaseSchema {
  users: User[];
  sessions: Session[];
  config: Record<string, string>;
  meta: {
    nextUserId: number;
  };
}

class AionDatabase {
  private static instance: AionDatabase;
  private readonly dbPath: string;
  private data: DatabaseSchema;

  private constructor(dbPath?: string) {
    this.dbPath = dbPath || this.resolveDefaultPath();
    this.ensureDirectory();
    this.data = this.loadFromDisk();
    this.saveToDisk();
  }

  public static getInstance(dbPath?: string): AionDatabase {
    if (!AionDatabase.instance) {
      AionDatabase.instance = new AionDatabase(dbPath);
    }
    return AionDatabase.instance;
  }

  // User operations
  public createUser(username: string, passwordHash: string): User {
    const user: User = {
      id: this.data.meta.nextUserId++,
      username,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
      last_login: null,
    };

    this.data.users.push(user);
    this.saveToDisk();
    return this.getUserById(user.id)!;
  }

  public getUserById(id: number): User | null {
    return this.data.users.find((user) => user.id === id) || null;
  }

  public getUserByUsername(username: string): User | null {
    return this.data.users.find((user) => user.username === username) || null;
  }

  public updateLastLogin(userId: number): void {
    const user = this.getUserById(userId);
    if (!user) {
      return;
    }

    user.last_login = new Date().toISOString();
    this.saveToDisk();
  }

  public updateUserPassword(userId: number, newPasswordHash: string, invalidateAllTokens = true): void {
    const user = this.getUserById(userId);
    if (!user) {
      return;
    }

    user.password_hash = newPasswordHash;

    // 如果需要使所有旧 Token 失效，则清除用户的所有会话并更换 JWT Secret
    // Invalidate all old tokens by clearing sessions and regenerating JWT secret
    if (invalidateAllTokens) {
      // 删除该用户的所有会话 / Delete all user sessions
      this.data.sessions = this.data.sessions.filter((session) => session.user_id !== userId);

      // 重新生成 JWT Secret，使所有旧 Token 立即失效
      // Regenerate JWT Secret to invalidate all old tokens immediately
      const newJwtSecret = crypto.randomBytes(64).toString('hex');
      this.data.config['jwt_secret'] = newJwtSecret;
    }

    this.saveToDisk();
  }

  public hasUsers(): boolean {
    return this.data.users.length > 0;
  }

  public getUserCount(): number {
    return this.data.users.length;
  }

  public getAllUsers(): User[] {
    return [...this.data.users].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  // Session operations
  public createSession(userId: number, title: string, sessionId?: string): Session {
    const session: Session = {
      id: sessionId || this.generateSessionId(),
      user_id: userId,
      title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.data.sessions.push(session);
    this.saveToDisk();
    return this.getSessionById(session.id)!;
  }

  public getSessionById(id: string): Session | null {
    return this.data.sessions.find((session) => session.id === id) || null;
  }

  public getSessionsByUserId(userId: number): Session[] {
    return this.data.sessions.filter((session) => session.user_id === userId).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  public updateSessionTitle(sessionId: string, title: string): void {
    const session = this.getSessionById(sessionId);
    if (!session) {
      return;
    }

    session.title = title;
    session.updated_at = new Date().toISOString();
    this.saveToDisk();
  }

  public deleteSession(sessionId: string): void {
    const index = this.data.sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) {
      return;
    }

    this.data.sessions.splice(index, 1);
    this.saveToDisk();
  }

  public updateSessionTimestamp(sessionId: string): void {
    const session = this.getSessionById(sessionId);
    if (!session) {
      return;
    }

    session.updated_at = new Date().toISOString();
    this.saveToDisk();
  }

  public close(): void {
    this.saveToDisk();
  }

  public transaction<T>(fn: () => T): T {
    const snapshot = JSON.parse(JSON.stringify(this.data)) as DatabaseSchema;
    try {
      const result = fn();
      this.saveToDisk();
      return result;
    } catch (error) {
      this.data = snapshot;
      this.saveToDisk();
      throw error;
    }
  }

  // Config operations
  public getConfig(key: string): string | null {
    return this.data.config[key] ?? null;
  }

  public setConfig(key: string, value: string): void {
    this.data.config[key] = value;
    this.saveToDisk();
  }

  private generateSessionId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }

  private resolveDefaultPath(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      return path.join(app.getPath('userData'), 'aion.json');
    } catch (_error) {
      return path.join(os.homedir(), '.aionui', 'aion.json');
    }
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadFromDisk(): DatabaseSchema {
    if (!fs.existsSync(this.dbPath)) {
      return this.createEmptySchema();
    }

    try {
      const raw = fs.readFileSync(this.dbPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      return {
        users: parsed.users ?? [],
        sessions: parsed.sessions ?? [],
        config: parsed.config ?? {},
        meta: {
          nextUserId: parsed.meta?.nextUserId && parsed.meta.nextUserId > 0 ? parsed.meta.nextUserId : this.computeNextUserId(parsed.users ?? []),
        },
      };
    } catch (error) {
      console.error('Failed to load database file, recreating:', error);
      return this.createEmptySchema();
    }
  }

  private saveToDisk(): void {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  private createEmptySchema(): DatabaseSchema {
    return {
      users: [],
      sessions: [],
      config: {},
      meta: {
        nextUserId: 1,
      },
    };
  }

  private computeNextUserId(users: User[]): number {
    if (users.length === 0) {
      return 1;
    }
    return Math.max(...users.map((user) => user.id)) + 1;
  }
}

export default AionDatabase;
