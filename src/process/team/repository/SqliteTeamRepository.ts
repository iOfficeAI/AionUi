// src/process/team/repository/SqliteTeamRepository.ts
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';
import type { TTeam, TeamAgent } from '../types';
import type { ITeamRepository } from './ITeamRepository';

type TeamRow = {
  id: string;
  user_id: string;
  name: string;
  workspace: string;
  workspace_mode: string;
  agents: string;
  created_at: number;
  updated_at: number;
};

function rowToTeam(row: TeamRow): TTeam {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    workspace: row.workspace,
    workspaceMode: row.workspace_mode as TTeam['workspaceMode'],
    agents: JSON.parse(row.agents) as TeamAgent[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteTeamRepository implements ITeamRepository {
  constructor(private readonly db: ISqliteDriver) {}

  async create(team: TTeam): Promise<TTeam> {
    this.db
      .prepare(
        `INSERT INTO teams (id, user_id, name, workspace, workspace_mode, agents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        team.id,
        team.userId,
        team.name,
        team.workspace,
        team.workspaceMode,
        JSON.stringify(team.agents),
        team.createdAt,
        team.updatedAt
      );
    return team;
  }

  async findById(id: string): Promise<TTeam | null> {
    const row = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as TeamRow | undefined;
    return row ? rowToTeam(row) : null;
  }

  async findAll(userId: string): Promise<TTeam[]> {
    const rows = this.db
      .prepare('SELECT * FROM teams WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId) as TeamRow[];
    return rows.map(rowToTeam);
  }

  async update(id: string, updates: Partial<TTeam>): Promise<TTeam> {
    const current = await this.findById(id);
    if (!current) throw new Error(`Team "${id}" not found`);
    const merged: TTeam = { ...current, ...updates };
    this.db
      .prepare(
        `UPDATE teams SET name = ?, workspace = ?, workspace_mode = ?, agents = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(merged.name, merged.workspace, merged.workspaceMode, JSON.stringify(merged.agents), merged.updatedAt, id);
    return merged;
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  }
}
