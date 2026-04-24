/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ISqliteDriver, IStatement } from './drivers/ISqliteDriver';
import type { AcpSessionRow, IAcpSessionRepository } from './IAcpSessionRepository';

/**
 * SQLite implementation of IAcpSessionRepository.
 *
 * All methods are synchronous (better-sqlite3). The caller is responsible
 * for obtaining the driver instance via `getDatabase().getDriver()`.
 */
export class SqliteAcpSessionRepository implements IAcpSessionRepository {
  private readonly stmtGet: IStatement;
  private readonly stmtUpsert: IStatement;
  private readonly stmtUpdateSessionId: IStatement;
  private readonly stmtUpdateStatus: IStatement;
  private readonly stmtUpdateConfig: IStatement;
  private readonly stmtTouchActive: IStatement;
  private readonly stmtGetSuspended: IStatement;
  private readonly stmtDelete: IStatement;

  constructor(db: ISqliteDriver) {
    this.stmtGet = db.prepare('SELECT * FROM acp_session WHERE conversation_id = ?');

    this.stmtUpsert = db.prepare(`
      INSERT INTO acp_session (conversation_id, agent_backend, agent_source, agent_id, session_id, session_status, session_config, last_active_at, suspended_at)
      VALUES (@conversation_id, @agent_backend, @agent_source, @agent_id, @session_id, @session_status, @session_config, @last_active_at, @suspended_at)
      ON CONFLICT(conversation_id) DO UPDATE SET
        agent_backend = excluded.agent_backend,
        agent_source = excluded.agent_source,
        agent_id = excluded.agent_id,
        session_id = excluded.session_id,
        session_status = excluded.session_status,
        session_config = excluded.session_config,
        last_active_at = excluded.last_active_at,
        suspended_at = excluded.suspended_at
    `);

    this.stmtUpdateSessionId = db.prepare(
      'UPDATE acp_session SET session_id = ?, last_active_at = ? WHERE conversation_id = ?'
    );

    this.stmtUpdateStatus = db.prepare(
      'UPDATE acp_session SET session_status = ?, suspended_at = ?, last_active_at = ? WHERE conversation_id = ?'
    );

    this.stmtUpdateConfig = db.prepare('UPDATE acp_session SET session_config = ? WHERE conversation_id = ?');

    this.stmtTouchActive = db.prepare('UPDATE acp_session SET last_active_at = ? WHERE conversation_id = ?');

    this.stmtGetSuspended = db.prepare(
      "SELECT * FROM acp_session WHERE session_status = 'suspended' ORDER BY suspended_at ASC"
    );

    this.stmtDelete = db.prepare('DELETE FROM acp_session WHERE conversation_id = ?');
  }

  getSession(conversation_id: string): AcpSessionRow | null {
    return (this.stmtGet.get(conversation_id) as AcpSessionRow) ?? null;
  }

  upsertSession(session: AcpSessionRow): void {
    this.stmtUpsert.run(session);
  }

  updateSessionId(conversation_id: string, session_id: string): void {
    this.stmtUpdateSessionId.run(session_id, Date.now(), conversation_id);
  }

  updateStatus(
    conversation_id: string,
    status: 'idle' | 'active' | 'suspended' | 'error',
    suspendedAt?: number | null
  ): void {
    this.stmtUpdateStatus.run(status, suspendedAt ?? null, Date.now(), conversation_id);
  }

  updateSessionConfig(conversation_id: string, config: string): void {
    this.stmtUpdateConfig.run(config, conversation_id);
  }

  touchLastActive(conversation_id: string): void {
    this.stmtTouchActive.run(Date.now(), conversation_id);
  }

  getSuspendedSessions(): AcpSessionRow[] {
    return this.stmtGetSuspended.all() as AcpSessionRow[];
  }

  deleteSession(conversation_id: string): void {
    this.stmtDelete.run(conversation_id);
  }
}
