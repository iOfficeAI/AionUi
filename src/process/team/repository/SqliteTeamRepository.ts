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
    userId: row.user_id,
    name: row.name,
    workspace: row.workspace,
    workspaceMode: row.workspace_mode as TTeam['workspaceMode'],
    leadAgentId: row.lead_agent_id,
    agents: JSON.parse(row.agents) as TeamAgent[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMailbox(row: MailboxRow): MailboxMessage {
  return {
    id: row.id,
    teamId: row.team_id,
    toAgentId: row.to_agent_id,
    fromAgentId: row.from_agent_id,
    type: row.type as MailboxMessage['type'],
    content: row.content,
    summary: row.summary ?? undefined,
    read: Boolean(row.read),
    createdAt: row.created_at,
  };
}

function rowToTask(row: TaskRow): TeamTask {
  return {
    id: row.id,
    teamId: row.team_id,
    subject: row.subject,
    description: row.description ?? undefined,
    status: row.status as TeamTask['status'],
    owner: row.owner ?? undefined,
    blockedBy: JSON.parse(row.blocked_by) as string[],
    blocks: JSON.parse(row.blocks) as string[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
      `INSERT INTO teams (id, user_id, name, workspace, workspace_mode, lead_agent_id, agents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      team.id,
      team.userId,
      team.name,
      team.workspace,
      team.workspaceMode,
      team.leadAgentId,
      JSON.stringify(team.agents),
      team.createdAt,
      team.updatedAt
    );
    return team;
  }

  async findById(id: string): Promise<TTeam | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as TeamRow | undefined;
    return row ? rowToTeam(row) : null;
  }

  async findAll(userId: string): Promise<TTeam[]> {
    const db = await this.getDb();
    const rows = db.prepare('SELECT * FROM teams WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as TeamRow[];
    return rows.map(rowToTeam);
  }

  async update(id: string, updates: Partial<TTeam>): Promise<TTeam> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Team "${id}" not found`);
    const merged: TTeam = { ...current, ...updates };
    const db = await this.getDb();
    db.prepare(
      `UPDATE teams
       SET name = ?, workspace = ?, workspace_mode = ?, lead_agent_id = ?, agents = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      merged.name,
      merged.workspace,
      merged.workspaceMode,
      merged.leadAgentId,
      JSON.stringify(merged.agents),
      merged.updatedAt,
      id
    );
    return merged;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  }

  async deleteMailboxByTeam(teamId: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM mailbox WHERE team_id = ?').run(teamId);
  }

  async deleteTasksByTeam(teamId: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM team_tasks WHERE team_id = ?').run(teamId);
  }

  // -------------------------------------------------------------------------
  // Mailbox operations
  // -------------------------------------------------------------------------

  async writeMessage(message: MailboxMessage): Promise<MailboxMessage> {
    const db = await this.getDb();
    db.prepare(
      `INSERT INTO mailbox (id, team_id, to_agent_id, from_agent_id, type, content, summary, read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      message.id,
      message.teamId,
      message.toAgentId,
      message.fromAgentId,
      message.type,
      message.content,
      message.summary ?? null,
      Number(message.read),
      message.createdAt
    );
    return message;
  }

  async readUnread(teamId: string, toAgentId: string): Promise<MailboxMessage[]> {
    const db = await this.getDb();
    const rows = db
      .prepare(
        `SELECT * FROM mailbox WHERE team_id = ? AND to_agent_id = ? AND read = 0
         ORDER BY created_at ASC`
      )
      .all(teamId, toAgentId) as MailboxRow[];
    return rows.map(rowToMailbox);
  }

  async markRead(messageId: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('UPDATE mailbox SET read = 1 WHERE id = ?').run(messageId);
  }

  async getMailboxHistory(teamId: string, toAgentId: string, limit = 50): Promise<MailboxMessage[]> {
    const db = await this.getDb();
    const rows = db
      .prepare(
        `SELECT * FROM mailbox WHERE team_id = ? AND to_agent_id = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(teamId, toAgentId, limit) as MailboxRow[];
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
      task.teamId,
      task.subject,
      task.description ?? null,
      task.status,
      task.owner ?? null,
      JSON.stringify(task.blockedBy),
      JSON.stringify(task.blocks),
      JSON.stringify(task.metadata),
      task.createdAt,
      task.updatedAt
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
      merged.updatedAt,
      id
    );
    return merged;
  }

  async findTasksByTeam(teamId: string): Promise<TeamTask[]> {
    const db = await this.getDb();
    const rows = db
      .prepare('SELECT * FROM team_tasks WHERE team_id = ? ORDER BY created_at ASC')
      .all(teamId) as TaskRow[];
    return rows.map(rowToTask);
  }

  async findTasksByOwner(teamId: string, owner: string): Promise<TeamTask[]> {
    const db = await this.getDb();
    const rows = db
      .prepare(`SELECT * FROM team_tasks WHERE team_id = ? AND owner = ? ORDER BY created_at ASC`)
      .all(teamId, owner) as TaskRow[];
    return rows.map(rowToTask);
  }

  async deleteTask(id: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM team_tasks WHERE id = ?').run(id);
  }
}
