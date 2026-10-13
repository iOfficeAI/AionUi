/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow, ipcMain } from 'electron';
import type {
  AbortTeamworkRequest,
  AbortTeamworkResponse,
  ConfirmPlanRequest,
  ConfirmPlanResponse,
  GetTeamworkStateRequest,
  GetTeamworkStateResponse,
  InitiateTeamworkRequest,
  InitiateTeamworkResponse,
  SubmitInterviewRequest,
  SubmitInterviewResponse,
  TeamworkSessionState,
} from '@/common/types/teamwork';
import { getTeamworkOrchestrator } from './orchestrator';

/**
 * Broadcasts teamwork state updates to all active renderer windows.
 */
export const broadcastTeamworkUpdate = (state: TeamworkSessionState): void => {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('teamwork:status-update', state);
    }
  }
};

/**
 * Registers all Teamwork IPC handlers.
 * Call from process/bridge/index.ts during application startup.
 */
export const registerTeamworkHandlers = (): (() => void) => {
  const orchestrator = getTeamworkOrchestrator();

  // Subscribe to orchestrator updates and broadcast via IPC
  const unsubscribeOrchestrator = orchestrator.onStatusUpdate((state) => {
    broadcastTeamworkUpdate(state);
  });

  // Handler: teamwork:initiate
  ipcMain.handle(
    'teamwork:initiate',
    async (_event, params: InitiateTeamworkRequest): Promise<InitiateTeamworkResponse> => {
      try {
        if (!params || !params.userRequest?.trim()) {
          return { success: false, error: 'User request is required' };
        }
        const session = orchestrator.initiateSession({
          conversationId: params.conversationId,
          userRequest: params.userRequest,
          workspace: params.workspace,
        });
        return { success: true, session };
      } catch (error) {
        console.error('[teamworkHandler] initiate error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // Handler: teamwork:submit-interview
  ipcMain.handle(
    'teamwork:submit-interview',
    async (_event, params: SubmitInterviewRequest): Promise<SubmitInterviewResponse> => {
      try {
        if (!params || !params.sessionId) {
          return { success: false, error: 'Session ID is required' };
        }
        const session = await orchestrator.submitInterview({
          sessionId: params.sessionId,
          answers: params.answers || {},
        });
        return {
          success: true,
          session,
          originalRequestDoc: session.originalRequestDoc,
          projectPlanDoc: session.projectPlanDoc,
        };
      } catch (error) {
        console.error('[teamworkHandler] submit-interview error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // Handler: teamwork:confirm-plan
  ipcMain.handle('teamwork:confirm-plan', async (_event, params: ConfirmPlanRequest): Promise<ConfirmPlanResponse> => {
    try {
      if (!params || !params.sessionId) {
        return { success: false, error: 'Session ID is required' };
      }
      const session = await orchestrator.confirmPlan({ sessionId: params.sessionId });
      return { success: true, session };
    } catch (error) {
      console.error('[teamworkHandler] confirm-plan error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Handler: teamwork:abort
  ipcMain.handle('teamwork:abort', async (_event, params: AbortTeamworkRequest): Promise<AbortTeamworkResponse> => {
    try {
      if (!params || !params.sessionId) {
        return { success: false, error: 'Session ID is required' };
      }
      const session = orchestrator.abortSession({
        sessionId: params.sessionId,
        reason: params.reason,
      });
      return { success: true, session };
    } catch (error) {
      console.error('[teamworkHandler] abort error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Handler: teamwork:get-state
  ipcMain.handle(
    'teamwork:get-state',
    async (_event, params: GetTeamworkStateRequest): Promise<GetTeamworkStateResponse> => {
      try {
        if (params.sessionId) {
          const session = orchestrator.getSession(params.sessionId);
          return { success: true, session: session || null };
        }
        if (params.conversationId) {
          const session = orchestrator.getSessionByConversationId(params.conversationId);
          return { success: true, session: session || null };
        }
        return { success: false, error: 'Either sessionId or conversationId is required' };
      } catch (error) {
        console.error('[teamworkHandler] get-state error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  return () => {
    unsubscribeOrchestrator();
    ipcMain.removeHandler('teamwork:initiate');
    ipcMain.removeHandler('teamwork:submit-interview');
    ipcMain.removeHandler('teamwork:confirm-plan');
    ipcMain.removeHandler('teamwork:abort');
    ipcMain.removeHandler('teamwork:get-state');
  };
};
