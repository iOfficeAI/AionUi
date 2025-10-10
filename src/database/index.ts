/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  last_login: string;
}

export interface Session {
  id: string;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

class AionDatabase {
  private db: Database.Database;
  private static instance: AionDatabase;

  constructor(dbPath?: string) {
    // Default path that works in both Electron and CLI contexts
    let defaultPath: string;

    try {
      // Try to use Electron's app.getPath if available
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      defaultPath = path.join(app.getPath('userData'), 'aion.db');
    } catch (error) {
      // Fallback for CLI context
      defaultPath = path.join(os.homedir(), '.aionui', 'aion.db');

      // Ensure directory exists
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      const dir = path.dirname(defaultPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath || defaultPath);
    this.initTables();
  }

  public static getInstance(dbPath?: string): AionDatabase {
    if (!AionDatabase.instance) {
      AionDatabase.instance = new AionDatabase(dbPath);
    }
    return AionDatabase.instance;
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
  }

  // User operations
  public createUser(username: string, passwordHash: string): User {
    const stmt = this.db.prepare(`
      INSERT INTO users (username, password_hash)
      VALUES (?, ?)
    `);

    const result = stmt.run(username, passwordHash);

    return this.getUserById(result.lastInsertRowid as number)!;
  }

  public getUserById(id: number): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | null;
  }

  public getUserByUsername(username: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | null;
  }

  public updateLastLogin(userId: number): void {
    const stmt = this.db.prepare(`
      UPDATE users
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(userId);
  }

  public updateUserPassword(userId: number, newPasswordHash: string): void {
    const stmt = this.db.prepare(`
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `);
    stmt.run(newPasswordHash, userId);
  }

  public hasUsers(): boolean {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
    const result = stmt.get() as { count: number };
    return result.count > 0;
  }

  public getUserCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  public getAllUsers(): User[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at ASC');
    return stmt.all() as User[];
  }

  // Session operations
  public createSession(userId: number, title: string, sessionId?: string): Session {
    const id = sessionId || this.generateSessionId();
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, title)
      VALUES (?, ?, ?)
    `);

    stmt.run(id, userId, title);
    return this.getSessionById(id)!;
  }

  public getSessionById(id: string): Session | null {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id) as Session | null;
  }

  public getSessionsByUserId(userId: number): Session[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `);
    return stmt.all(userId) as Session[];
  }

  public updateSessionTitle(sessionId: string, title: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET title = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(title, sessionId);
  }

  public deleteSession(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(sessionId);
  }

  public updateSessionTimestamp(sessionId: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(sessionId);
  }

  private generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  public close(): void {
    this.db.close();
  }

  // Transaction support
  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // Config operations
  public getConfig(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM config WHERE key = ?');
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value || null;
  }

  public setConfig(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO config (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, value);
  }
}

export default AionDatabase;
