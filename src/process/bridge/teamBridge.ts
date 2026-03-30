/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TeamSessionService } from '@process/team/TeamSessionService';

export function initTeamBridge(teamSessionService: TeamSessionService): void {
  ipcBridge.team.create.provider(async (params) => {
    return teamSessionService.createTeam(params);
  });

  ipcBridge.team.list.provider(async ({ userId }) => {
    return teamSessionService.listTeams(userId);
  });

  ipcBridge.team.get.provider(async ({ id }) => {
    return teamSessionService.getTeam(id);
  });

  ipcBridge.team.remove.provider(async ({ id }) => {
    await teamSessionService.deleteTeam(id);
  });

  ipcBridge.team.addAgent.provider(async ({ teamId, agent }) => {
    return teamSessionService.addAgent(teamId, agent);
  });

  ipcBridge.team.removeAgent.provider(async ({ teamId, slotId }) => {
    await teamSessionService.removeAgent(teamId, slotId);
  });

  ipcBridge.team.sendMessage.provider(async ({ teamId, content }) => {
    const session = await teamSessionService.getOrStartSession(teamId);
    await session.sendMessage(content);
  });

  ipcBridge.team.stop.provider(async ({ teamId }) => {
    teamSessionService.stopSession(teamId);
  });
}
