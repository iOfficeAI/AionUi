/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ipcBridge } from '@/common';

const CONVERSATION_PATH_RE = /^\/conversation\/([^/]+)/;
const TEAM_PATH_RE = /^\/team\/([^/]+)/;

/**
 * Single owner of `document.title`.
 *
 * The title used to be set once by the login page and never again, so after
 * logging in the window/tab kept saying "AionUi - Login" — in whatever language
 * the login page happened to render in — for the rest of the session. Deriving
 * it here from the route and the app language keeps it correct across both
 * navigation and language switches.
 *
 * On conversation/team routes the title is enriched with the entity name
 * ("Trip plan - AionUi") so the OS window/taskbar entry identifies the active
 * session instead of showing a bare "AionUi".
 */
export function titleForPath(pathname: string, t: (key: string) => string): string {
  return pathname.startsWith('/login') ? t('login.pageTitle') : 'AionUi';
}

/** Build the window/tab title for a named entity route. */
export function titleWithEntityName(
  name: string | undefined,
  t: (key: string, options?: { name: string }) => string
): string {
  return name ? t('common.documentTitleWithName', { name }) : 'AionUi';
}

const DocumentTitle: React.FC = () => {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const conversationMatch = pathname.match(CONVERSATION_PATH_RE);
    const teamMatch = pathname.match(TEAM_PATH_RE);
    if (!conversationMatch && !teamMatch) {
      document.title = titleForPath(pathname, t);
      return undefined;
    }

    const id = conversationMatch?.[1] ?? teamMatch?.[1] ?? '';
    const isTeam = Boolean(teamMatch);
    let cancelled = false;

    const applyEntityTitle = async () => {
      try {
        const entity = isTeam
          ? await ipcBridge.team.get.invoke({ id })
          : await ipcBridge.conversation.get.invoke({ id });
        if (cancelled) return;
        const name = (entity as { name?: string } | undefined)?.name;
        document.title = titleWithEntityName(name, t);
      } catch {
        if (!cancelled) document.title = titleWithEntityName(undefined, t);
      }
    };
    void applyEntityTitle();

    // Refresh the title when the open conversation/team is renamed in place.
    const offConversation = ipcBridge.conversation.listChanged.on((event) => {
      if (!isTeam && event.conversation_id === id) void applyEntityTitle();
    });
    const offTeam = ipcBridge.team.listChanged.on((event) => {
      if (isTeam && event.team_id === id) void applyEntityTitle();
    });

    return () => {
      cancelled = true;
      offConversation();
      offTeam();
    };
  }, [pathname, t, i18n.language]);

  return null;
};

export default DocumentTitle;
