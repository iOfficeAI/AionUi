/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcMain, type IpcMainInvokeEvent, BrowserWindow } from 'electron';
import type {
  ApproveTeamPlanParams,
  ApproveTeamPlanResponse,
  GetTeamScopingStateParams,
  GetTeamScopingStateResponse,
  ITeamScopingStatusChangedEvent,
  InitiateTeamScopingParams,
  InitiateTeamScopingResponse,
  RejectTeamPlanParams,
  RejectTeamPlanResponse,
  SubmitTeamInterviewAnswersParams,
  SubmitTeamInterviewAnswersResponse,
} from '@/common/types/teamwork';
import { getTeamScopingManager } from './scopingManager';

/**
 * Broadcasts team scoping status update to all renderer webContents.
 */
function broadcastTeamScopingStatus(event: ITeamScopingStatusChangedEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('team.scopingStatusChanged', event);
    }
  }
}

/**
 * Registers IPC handlers for Antigravity-style Team Mode Scoping & Verification.
 */
export function registerTeamScopingHandlers(): void {
  const manager = getTeamScopingManager();

  // Wire event broadcasting
  manager.onStatusUpdate((event) => {
    broadcastTeamScopingStatus(event);
  });

  ipcMain.handle(
    'team:initiateScoping',
    async (_event: IpcMainInvokeEvent, params: InitiateTeamScopingParams): Promise<InitiateTeamScopingResponse> => {
      try {
        return await manager.initiateScoping(params);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'team:submitInterviewAnswers',
    async (
      _event: IpcMainInvokeEvent,
      params: SubmitTeamInterviewAnswersParams
    ): Promise<SubmitTeamInterviewAnswersResponse> => {
      try {
        return await manager.submitInterviewAnswers(params);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'team:approvePlan',
    async (_event: IpcMainInvokeEvent, params: ApproveTeamPlanParams): Promise<ApproveTeamPlanResponse> => {
      try {
        return await manager.approvePlan(params);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'team:rejectPlan',
    async (_event: IpcMainInvokeEvent, params: RejectTeamPlanParams): Promise<RejectTeamPlanResponse> => {
      try {
        return await manager.rejectPlan(params);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  ipcMain.handle(
    'team:getScopingState',
    async (_event: IpcMainInvokeEvent, params: GetTeamScopingStateParams): Promise<GetTeamScopingStateResponse> => {
      try {
        return manager.getScopingState(params.team_id);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
}
