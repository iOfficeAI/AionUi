/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcMain } from 'electron';
import { knowledgeRepoService } from '../services/knowledgeRepo';
import type { KnowledgeRepo } from '@/common/types/knowledgeRepo';

export function registerKnowledgeRepoBridge(): void {
  // Ensure the service is initialized
  knowledgeRepoService.initialize().catch((err) => {
    console.error('[KnowledgeRepoBridge] Failed to initialize knowledge repo service:', err);
  });

  ipcMain.handle('knowledgeRepo:list', async () => {
    return knowledgeRepoService.listRepos();
  });

  ipcMain.handle('knowledgeRepo:get', async (_event, id: string) => {
    return knowledgeRepoService.getRepo(id);
  });

  ipcMain.handle(
    'knowledgeRepo:add',
    async (
      _event,
      params: {
        name: string;
        gitUrl: string;
        ref?: string;
        subpath?: string;
        authToken?: string;
      }
    ) => {
      return knowledgeRepoService.addRepo(params);
    }
  );

  ipcMain.handle('knowledgeRepo:update', async (_event, id: string) => {
    return knowledgeRepoService.updateRepo(id);
  });

  ipcMain.handle('knowledgeRepo:rollback', async (_event, id: string) => {
    return knowledgeRepoService.rollbackRepo(id);
  });

  ipcMain.handle('knowledgeRepo:pin', async (_event, params: { id: string; pin: boolean }) => {
    return knowledgeRepoService.pinRepo(params.id, params.pin);
  });

  ipcMain.handle(
    'knowledgeRepo:setTrust',
    async (_event, params: { id: string; trustStatus: KnowledgeRepo['trustStatus'] }) => {
      return knowledgeRepoService.setTrustStatus(params.id, params.trustStatus);
    }
  );

  ipcMain.handle('knowledgeRepo:remove', async (_event, id: string) => {
    return knowledgeRepoService.removeRepo(id);
  });

  ipcMain.handle(
    'knowledgeRepo:buildInstructions',
    async (
      _event,
      params: {
        memberName: string;
        rolePrompt?: string;
        repoIds: string[];
        whenToUseHint?: string;
        tokenBudget?: number;
      }
    ) => {
      return knowledgeRepoService.buildEffectiveInstructions(params);
    }
  );

  ipcMain.handle(
    'knowledgeRepo:buildTeamCapabilityCards',
    async (
      _event,
      members: Array<{
        slot_id: string;
        assistant_name: string;
        knowledgeRepoIds?: string[];
        whenToUseHint?: string;
      }>
    ) => {
      return knowledgeRepoService.buildTeamCapabilityCards(members);
    }
  );

  ipcMain.handle('knowledgeRepo:setTaskRunning', async (_event, params: { repoIds: string[]; isRunning: boolean }) => {
    knowledgeRepoService.setAgentTaskRunning(params.repoIds, params.isRunning);
  });

  ipcMain.handle(
    'knowledgeRepo:runSetup',
    async (_event, params: { repoId: string; projectId?: string; command: string }) => {
      return knowledgeRepoService.runSetup(params);
    }
  );

  ipcMain.handle('knowledgeRepo:checkEnvironment', async (_event, repoId: string) => {
    return knowledgeRepoService.checkEnvironment(repoId);
  });

  ipcMain.handle(
    'knowledgeRepo:provisionWorkingCopy',
    async (_event, params: { repoId: string; projectId: string }) => {
      return knowledgeRepoService.provisionWorkingCopy(params.repoId, params.projectId);
    }
  );

  ipcMain.handle(
    'knowledgeRepo:setEnvVars',
    async (_event, params: { id: string; envVars: Record<string, string> }) => {
      return knowledgeRepoService.setRepoEnvVars(params.id, params.envVars);
    }
  );
}
