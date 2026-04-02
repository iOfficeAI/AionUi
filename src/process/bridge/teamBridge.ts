/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TeamSessionService } from '@process/team/TeamSessionService';

/**
 * Wrap an async provider handler so that unhandled rejections are caught and
 * logged instead of silently swallowed by the platform bridge (which only
 * chains `.then()` without `.catch()` on the provider callback).
 *
 * Returning `{ __bridgeError: true, message }` unblocks the renderer-side
 * `invoke()` promise so the UI never "freezes".
 */
function safeProvider<R, P>(fn: (params: P) => Promise<R>) {
  return async (params: P): Promise<R> => {
    try {
      return await fn(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[teamBridge] provider error:', message);
      // Return a sentinel the renderer can detect
      return { __bridgeError: true, message } as unknown as R;
    }
  };
}

let _teamSessionService: TeamSessionService | null = null;

export function initTeamBridge(teamSessionService: TeamSessionService): void {
  _teamSessionService = teamSessionService;
  ipcBridge.team.create.provider(
    safeProvider(async (params) => {
      return teamSessionService.createTeam(params);
    })
  );

  ipcBridge.team.list.provider(
    safeProvider(async ({ userId }) => {
      return teamSessionService.listTeams(userId);
    })
  );

  ipcBridge.team.get.provider(
    safeProvider(async ({ id }) => {
      return teamSessionService.getTeam(id);
    })
  );

  ipcBridge.team.remove.provider(
    safeProvider(async ({ id }) => {
      await teamSessionService.deleteTeam(id);
    })
  );

  ipcBridge.team.addAgent.provider(
    safeProvider(async ({ teamId, agent }) => {
      return teamSessionService.addAgent(teamId, agent);
    })
  );

  ipcBridge.team.removeAgent.provider(
    safeProvider(async ({ teamId, slotId }) => {
      await teamSessionService.removeAgent(teamId, slotId);
    })
  );

  ipcBridge.team.renameAgent.provider(
    safeProvider(async ({ teamId, slotId, newName }) => {
      await teamSessionService.renameAgent(teamId, slotId, newName);
    })
  );

  ipcBridge.team.sendMessage.provider(
    safeProvider(async ({ teamId, content }) => {
      const session = await teamSessionService.getOrStartSession(teamId);
      await session.sendMessage(content);
    })
  );

  ipcBridge.team.sendMessageToAgent.provider(
    safeProvider(async ({ teamId, slotId, content }) => {
      const session = await teamSessionService.getOrStartSession(teamId);
      await session.sendMessageToAgent(slotId, content);
    })
  );

  ipcBridge.team.stop.provider(
    safeProvider(async ({ teamId }) => {
      await teamSessionService.stopSession(teamId);
    })
  );
}

/** Stop all active team sessions (TCP servers + child processes). Call on app quit. */
export function disposeAllTeamSessions(): Promise<void> {
  return _teamSessionService?.stopAllSessions() ?? Promise.resolve();
}
