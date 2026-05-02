/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Listens for the `team.list-changed` WebSocket event with action `created`
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
    return ipcBridge.team.listChanged.on((event) => {
      if (event.action !== 'created') return;

      const teamId = event.team_id;
      if (!teamId) return;

      // Avoid double-navigation if already on this team page
      // (e.g. user created team via modal which already navigated)
      if (pathnameRef.current === `/team/${teamId}`) return;

      // Refresh conversation list so the converted conversation disappears
      emitter.emit('chat.history.refresh');

      // Navigate to the new team
      Promise.resolve(navigate(`/team/${teamId}`)).catch(console.error);
    });
  }, [navigate]);
}
