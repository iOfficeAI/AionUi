// src/process/team/repository/ITeamRepository.ts
import type { TTeam } from '../types';

export interface ITeamRepository {
  create(team: TTeam): Promise<TTeam>;
  findById(id: string): Promise<TTeam | null>;
  findAll(userId: string): Promise<TTeam[]>;
  update(id: string, updates: Partial<TTeam>): Promise<TTeam>;
  delete(id: string): Promise<void>;
}
