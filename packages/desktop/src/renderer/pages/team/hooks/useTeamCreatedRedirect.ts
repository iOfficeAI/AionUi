/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Listens for Team creation WebSocket events
 * and automatically:
 * 1. Refreshes the conversation list (so the converted conversation disappears)
 * 2. Navigates to the newly created team page
 *
 * This handles the case where an agent's `aion_create_team` tool call converts
 * a single-chat conversation into a team — the user should be seamlessly
 * redirected without manual refresh.
 */

import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { deferLeaderQueueBeforeTeamRedirect } from './teamCreatedRedirectQueue';

export function useTeamCreatedRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  const inFlightTeamIdsRef = useRef(new Set<string>());
  pathnameRef.current = location.pathname;

  useEffect(() => {
    const navigateToTeam = async (teamId: string) => {
      if (!teamId) return;
      if (pathnameRef.current === `/team/${teamId}`) return;
      if (inFlightTeamIdsRef.current.has(teamId)) return;

      inFlightTeamIdsRef.current.add(teamId);
      try {
        await deferLeaderQueueBeforeTeamRedirect({
          team_id: teamId,
          getTeam: ipcBridge.team.get.invoke,
          emitDefer: (payload) => emitter.emit('conversation.commandQueue.deferAfterTeamUpgrade', payload),
        });

        emitter.emit('chat.history.refresh');
        await Promise.resolve(navigate(`/team/${teamId}`));
      } finally {
        inFlightTeamIdsRef.current.delete(teamId);
      }
    };

    const unsubListChanged = ipcBridge.team.listChanged.on((event) => {
      if (event.action !== 'created') return;
      void navigateToTeam(event.team_id).catch(console.error);
    });

    const unsubCreated = ipcBridge.team.created.on((event) => {
      void navigateToTeam(event.team_id).catch(console.error);
    });

    return () => {
      unsubListChanged();
      unsubCreated();
    };
  }, [navigate]);
}
