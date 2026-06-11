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

export function useTeamCreatedRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  useEffect(() => {
    const navigateToTeam = (teamId: string) => {
      if (!teamId) return;
      if (pathnameRef.current === `/team/${teamId}`) return;
      emitter.emit('chat.history.refresh');
      Promise.resolve(navigate(`/team/${teamId}`)).catch(console.error);
    };

    const unsubListChanged = ipcBridge.team.listChanged.on((event) => {
      if (event.action !== 'created') return;
      navigateToTeam(event.team_id);
    });

    const unsubCreated = ipcBridge.team.created.on((event) => {
      navigateToTeam(event.team_id);
    });

    return () => {
      unsubListChanged();
      unsubCreated();
    };
  }, [navigate]);
}
