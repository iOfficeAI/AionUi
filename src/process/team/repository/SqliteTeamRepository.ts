// src/process/team/repository/SqliteTeamRepository.ts
import { getDatabase } from '@process/services/database';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import type { MailboxMessage, TeamAgent, TeamTask, TTeam } from '../types';
import type { ITeamRepository } from './ITeamRepository';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

type TeamRow = {
  id: string;
  user_id: string;
  name: string;
  workspace: string;
  workspace_mode: string;
  lead_agent_id: string;
  agents: string;
  session_mode: string | null;
  created_at: number;
  updated_at: number;
};

type MailboxRow = {
  id: string;
  team_id: string;
  to_agent_id: string;
  from_agent_id: string;
  type: string;
  content: string;
  summary: string | null;
  files: string | null;
  read: number;
  created_at: number;
};

type TaskRow = {
  id: string;
  team_id: string;
  subject: string;
  description: string | null;
  status: string;
  owner: string | null;
  blocked_by: string;
  blocks: string;
  metadata: string;
  created_at: number;
  updated_at: number;
};

// ---------------------------------------------------------------------------
// Row -> domain converters
// ---------------------------------------------------------------------------

function rowToTeam(row: TeamRow): TTeam {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    workspace: row.workspace,
    workspace_mode: row.workspace_mode as TTeam['workspace_mode'],
    leader_agent_id: row.lead_agent_id,
    agents: JSON.parse(row.agents) as TeamAgent[],
    session_mode: row.session_mode ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToMailbox(row: MailboxRow): MailboxMessage {
  return {
    id: row.id,
    team_id: row.team_id,
    toAgentId: row.to_agent_id,
    fromAgentId: row.from_agent_id,
    type: row.type as MailboxMessage['type'],
    content: row.content,
    summary: row.summary ?? undefined,
    files: row.files ? (JSON.parse(row.files) as string[]) : undefined,
    read: Boolean(row.read),
    created_at: row.created_at,
  };
}

function rowToTask(row: TaskRow): TeamTask {
  return {
    id: row.id,
    team_id: row.team_id,
    subject: row.subject,
    description: row.description ?? undefined,
    status: row.status as TeamTask['status'],
    owner: row.owner ?? undefined,
    blockedBy: JSON.parse(row.blocked_by) as string[],
    blocks: JSON.parse(row.blocks) as string[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SqliteTeamRepository implements ITeamRepository {
  private readonly _driver: ISqliteDriver | undefined;

  /**
   * @param driver - Optional ISqliteDriver for constructor injection (e.g., tests).
   *   When omitted, the global database singleton is used via getDatabase().
   */
  constructor(driver?: ISqliteDriver) {
    this._driver = driver;
  }

  private async getDb(): Promise<ISqliteDriver> {
    if (this._driver) return this._driver;
    const aionDb = await getDatabase();
    return aionDb.getDriver();
  }

  // -------------------------------------------------------------------------
  // Team CRUD
  // -------------------------------------------------------------------------

  async create(team: TTeam): Promise<TTeam> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO teams (id, user_id, name, workspace, workspace_mode, lead_agent_id, agents, session_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      team.id,
      team.user_id,
      team.name,
      team.workspace,
      team.workspace_mode,
      team.leader_agent_id,
      JSON.stringify(team.agents),
      team.session_mode ?? null,
      team.created_at,
      team.updated_at
    );
    return team;
  }

  async findById(id: string): Promise<TTeam | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as TeamRow | undefined;
    return row ? rowToTeam(row) : null;
  }

  async findAll(user_id: string): Promise<TTeam[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM teams WHERE user_id = ? ORDER BY updated_at DESC').all(user_id) as TeamRow[];
    return rows.map(rowToTeam);
  }

  async update(id: string, updates: Partial<TTeam>): Promise<TTeam> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Team "${id}" not found`);
    const merged: TTeam = { ...current, ...updates };
    const db = await this.getDb();
    db.prepare(
      `UPDATE teams
       SET name = ?, workspace = ?, workspace_mode = ?, lead_agent_id = ?, agents = ?, session_mode = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      merged.name,
      merged.workspace,
      merged.workspace_mode,
      merged.leader_agent_id,
      JSON.stringify(merged.agents),
      merged.session_mode ?? null,
      merged.updated_at,
      id
    );
    return merged;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  }

  async deleteMailboxByTeam(team_id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM mailbox WHERE team_id = ?').run(team_id);
  }

  async deleteTasksByTeam(team_id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM team_tasks WHERE team_id = ?').run(team_id);
  }

  // -------------------------------------------------------------------------
  // Mailbox operations
  // -------------------------------------------------------------------------

  async writeMessage(message: MailboxMessage): Promise<MailboxMessage> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO mailbox (id, team_id, to_agent_id, from_agent_id, type, content, summary, files, read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      message.id,
      message.team_id,
      message.toAgentId,
      message.fromAgentId,
      message.type,
      message.content,
      message.summary ?? null,
      message.files ? JSON.stringify(message.files) : null,
      Number(message.read),
      message.created_at
    );
    return message;
  }

  async readUnread(team_id: string, toAgentId: string): Promise<MailboxMessage[]> {
    const db = await this.getDb();
    const rows = db
      .prepare(
        `SELECT * FROM mailbox WHERE team_id = ? AND to_agent_id = ? AND read = 0
         ORDER BY created_at ASC`
      )
      .all(team_id, toAgentId) as MailboxRow[];
    return rows.map(rowToMailbox);
  }

  async readUnreadAndMark(team_id: string, toAgentId: string): Promise<MailboxMessage[]> {
    const db = await this.getDb();
    const rows = db.transaction(() => {
      const unread = db
        .prepare(
          `SELECT * FROM mailbox WHERE team_id = ? AND to_agent_id = ? AND read = 0
           ORDER BY created_at ASC`
        )
        .all(team_id, toAgentId) as MailboxRow[];
      if (unread.length > 0) {
        const ids = unread.map((r) => r.id);
        db.prepare(`UPDATE mailbox SET read = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      }
      return unread;
    })();
    return rows.map(rowToMailbox);
  }

  async markRead(messageId: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('UPDATE mailbox SET read = 1 WHERE id = ?').run(messageId);
  }

  async getMailboxHistory(team_id: string, toAgentId: string, limit = 50): Promise<MailboxMessage[]> {
    const db = await this.getDb();
    const rows = db
      .prepare(
        `SELECT * FROM mailbox WHERE team_id = ? AND to_agent_id = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(team_id, toAgentId, limit) as MailboxRow[];
    return rows.map(rowToMailbox);
  }

  // -------------------------------------------------------------------------
  // Task operations
  // -------------------------------------------------------------------------

  async createTask(task: TeamTask): Promise<TeamTask> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO team_tasks (id, team_id, subject, description, status, owner, blocked_by, blocks, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      task.id,
      task.team_id,
      task.subject,
      task.description ?? null,
      task.status,
      task.owner ?? null,
      JSON.stringify(task.blockedBy),
      JSON.stringify(task.blocks),
      JSON.stringify(task.metadata),
      task.created_at,
      task.updated_at
    );
    return task;
  }

  async findTaskById(id: string): Promise<TeamTask | null> {
    const db = await this.getDb();
    // Exact match first
    let row = db.prepare('SELECT * FROM team_tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!row && id.length < 36) {
      // Support short-ID prefix match (agents receive truncated IDs)
      row = db.prepare('SELECT * FROM team_tasks WHERE id LIKE ? LIMIT 1').get(`${id}%`) as TaskRow | undefined;
    }
    return row ? rowToTask(row) : null;
  }

  async updateTask(id: string, updates: Partial<TeamTask>): Promise<TeamTask> {
    const current = await this.findTaskById(id);
    if (!current) throw new Error(`Task "${id}" not found`);
    const merged: TeamTask = { ...current, ...updates };
    const db = await this.getDb();
    db.prepare(
      `UPDATE team_tasks
       SET subject = ?, description = ?, status = ?, owner = ?,
           blocked_by = ?, blocks = ?, metadata = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      merged.subject,
      merged.description ?? null,
      merged.status,
      merged.owner ?? null,
      JSON.stringify(merged.blockedBy),
      JSON.stringify(merged.blocks),
      JSON.stringify(merged.metadata),
      merged.updated_at,
      id
    );
    return merged;
  }

  async findTasksByTeam(team_id: string): Promise<TeamTask[]> {
    const db = await this.getDb();
    const rows = db
      .prepare('SELECT * FROM team_tasks WHERE team_id = ? ORDER BY created_at ASC')
      .all(team_id) as TaskRow[];
    return rows.map(rowToTask);
  }

  async findTasksByOwner(team_id: string, owner: string): Promise<TeamTask[]> {
    const db = await this.getDb();
    const rows = db
      .prepare(`SELECT * FROM team_tasks WHERE team_id = ? AND owner = ? ORDER BY created_at ASC`)
      .all(team_id, owner) as TaskRow[];
    return rows.map(rowToTask);
  }

  async deleteTask(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM team_tasks WHERE id = ?').run(id);
  }

  async appendToBlocks(taskId: string, blockId: string): Promise<void> {
    const db = await this.getDb();
    const now = Date.now();
    db.transaction(() => {
      const row = db.prepare('SELECT blocks FROM team_tasks WHERE id = ?').get(taskId) as
        | Pick<TaskRow, 'blocks'>
        | undefined;
      if (!row) return;
      const blocks = JSON.parse(row.blocks) as string[];
      if (!blocks.includes(blockId)) {
        blocks.push(blockId);
      }
      db.prepare('UPDATE team_tasks SET blocks = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(blocks),
        now,
        taskId
      );
    })();
  }

  async removeFromBlockedBy(taskId: string, unblockedId: string): Promise<TeamTask> {
    const db = await this.getDb();
    const now = Date.now();
    const row = db.transaction(() => {
      const current = db.prepare('SELECT * FROM team_tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
      if (!current) throw new Error(`Task "${taskId}" not found`);
      const blockedBy = (JSON.parse(current.blocked_by) as string[]).filter((id) => id !== unblockedId);
      db.prepare('UPDATE team_tasks SET blocked_by = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(blockedBy),
        now,
        taskId
      );
      return { ...current, blocked_by: JSON.stringify(blockedBy), updated_at: now };
    })();
    return rowToTask(row);
  }
}
