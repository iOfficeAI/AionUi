/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useRef } from 'react';
import { addEventListener, emitter } from '@/renderer/utils/emitter';
import { appendStarOfficeSyncLog, readStarOfficeBool, readStarOfficeUrl, STAR_OFFICE_SYNC_ENABLED_KEY, toStarOfficeSetStateUrl, type StarOfficeSource } from '@/renderer/utils/starOffice';

interface StarOfficeSyncBridgeProps {
  conversationId: string;
  source: StarOfficeSource;
}

const StarOfficeSyncBridge: React.FC<StarOfficeSyncBridgeProps> = ({ conversationId, source }) => {
  const lastSyncedRef = useRef<{ state: string; detail: string } | null>(null);

  useEffect(() => {
    const remove = addEventListener('staroffice.status', (payload) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.source !== source) return;

      const syncEnabled = readStarOfficeBool(STAR_OFFICE_SYNC_ENABLED_KEY, true);
      if (!syncEnabled) {
        const result = {
          conversationId,
          source,
          state: payload.state,
          detail: payload.detail,
          ok: false,
          error: 'Sync disabled',
          ts: Date.now(),
        };
        appendStarOfficeSyncLog(result);
        emitter.emit('staroffice.sync.result', result);
        return;
      }

      const last = lastSyncedRef.current;
      if (last && last.state === payload.state && last.detail === payload.detail) {
        return;
      }

      const baseUrl = readStarOfficeUrl();
      const setStateUrl = toStarOfficeSetStateUrl(baseUrl);

      void fetch(setStateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: payload.state,
          detail: payload.detail,
        }),
      })
        .then((response) => {
          const result = {
            conversationId,
            source,
            state: payload.state,
            detail: payload.detail,
            ok: response.ok,
            statusCode: response.status,
            error: response.ok ? undefined : `HTTP ${response.status}`,
            ts: Date.now(),
          };
          if (response.ok) {
            lastSyncedRef.current = { state: payload.state, detail: payload.detail };
          }
          appendStarOfficeSyncLog(result);
          emitter.emit('staroffice.sync.result', result);
        })
        .catch((error) => {
          const result = {
            conversationId,
            source,
            state: payload.state,
            detail: payload.detail,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            ts: Date.now(),
          };
          appendStarOfficeSyncLog(result);
          emitter.emit('staroffice.sync.result', result);
        });
    });
    return remove;
  }, [conversationId, source]);

  return null;
};

export default StarOfficeSyncBridge;
