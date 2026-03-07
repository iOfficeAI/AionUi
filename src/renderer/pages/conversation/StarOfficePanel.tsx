/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Message, Switch, Tag } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addEventListener } from '@/renderer/utils/emitter';
import { DEFAULT_STAR_OFFICE_URL, readStarOfficeBool, readStarOfficeSyncLogs, STAR_OFFICE_EMBED_ENABLED_KEY, STAR_OFFICE_SYNC_ENABLED_KEY, STAR_OFFICE_URL_KEY, type StarOfficeSyncResult } from '@/renderer/utils/starOffice';

interface StarOfficePanelProps {
  conversationId: string;
  source: 'acp' | 'openclaw-gateway';
}

const StarOfficePanel: React.FC<StarOfficePanelProps> = ({ conversationId, source }) => {
  const [messageApi, contextHolder] = Message.useMessage({ maxCount: 1 });
  const [baseUrl, setBaseUrl] = useState(() => {
    try {
      return localStorage.getItem(STAR_OFFICE_URL_KEY)?.trim() || DEFAULT_STAR_OFFICE_URL;
    } catch {
      return DEFAULT_STAR_OFFICE_URL;
    }
  });
  const [syncEnabled, setSyncEnabled] = useState(() => readStarOfficeBool(STAR_OFFICE_SYNC_ENABLED_KEY, true));
  const [embedEnabled, setEmbedEnabled] = useState(() => readStarOfficeBool(STAR_OFFICE_EMBED_ENABLED_KEY, true));
  const [lastSyncText, setLastSyncText] = useState('No sync yet');
  const [errorText, setErrorText] = useState('');
  const [isPinging, setIsPinging] = useState(false);
  const [recentLogs, setRecentLogs] = useState<StarOfficeSyncResult[]>(() =>
    readStarOfficeSyncLogs()
      .filter((item) => item.conversationId === conversationId && item.source === source)
      .slice(0, 3)
  );

  const iframeUrl = useMemo(() => baseUrl.trim().replace(/\/+$/, ''), [baseUrl]);

  useEffect(() => {
    setRecentLogs(
      readStarOfficeSyncLogs()
        .filter((item) => item.conversationId === conversationId && item.source === source)
        .slice(0, 3)
    );
  }, [conversationId, source]);

  useEffect(() => {
    try {
      localStorage.setItem(STAR_OFFICE_URL_KEY, baseUrl);
    } catch {
      // ignore persistence failures
    }
  }, [baseUrl]);

  useEffect(() => {
    try {
      localStorage.setItem(STAR_OFFICE_SYNC_ENABLED_KEY, String(syncEnabled));
    } catch {
      // ignore persistence failures
    }
  }, [syncEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(STAR_OFFICE_EMBED_ENABLED_KEY, String(embedEnabled));
    } catch {
      // ignore persistence failures
    }
  }, [embedEnabled]);

  useEffect(() => {
    const remove = addEventListener('staroffice.sync.result', (payload) => {
      if (payload.conversationId !== conversationId) return;
      if (payload.source !== source) return;
      const now = new Date(payload.ts || Date.now());
      setLastSyncText(`${now.toLocaleTimeString()} | ${payload.state} | ${payload.detail}`);
      setErrorText(payload.ok ? '' : payload.error || (payload.statusCode ? `HTTP ${payload.statusCode}` : 'Unknown error'));
      setRecentLogs((prev) => [payload, ...prev].slice(0, 3));
    });
    return remove;
  }, [conversationId, source]);

  const handlePing = useCallback(async () => {
    setIsPinging(true);
    try {
      const response = await fetch(`${iframeUrl}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      messageApi.success('Star Office is reachable');
      setErrorText('');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setErrorText(msg);
      messageApi.error(`Cannot reach Star Office: ${msg}`);
    } finally {
      setIsPinging(false);
    }
  }, [iframeUrl, messageApi]);

  return (
    <div className='flex flex-col gap-8px border-t border-[var(--bg-3)] p-10px'>
      {contextHolder}
      <div className='flex items-center justify-between'>
        <div className='text-12px font-semibold text-t-primary'>Star Office</div>
        <Tag color={syncEnabled ? 'green' : 'gray'}>{syncEnabled ? 'Sync ON' : 'Sync OFF'}</Tag>
      </div>
      <Input size='small' value={baseUrl} onChange={setBaseUrl} placeholder='http://127.0.0.1:19000' />
      <div className='flex items-center justify-between gap-8px'>
        <span className='text-12px text-t-secondary'>Auto Sync</span>
        <Switch size='small' checked={syncEnabled} onChange={setSyncEnabled} />
      </div>
      <div className='flex items-center justify-between gap-8px'>
        <span className='text-12px text-t-secondary'>Embed</span>
        <Switch size='small' checked={embedEnabled} onChange={setEmbedEnabled} />
      </div>
      <div className='flex items-center justify-between gap-8px'>
        <div className='text-11px text-t-secondary truncate'>{lastSyncText}</div>
        <Button size='mini' loading={isPinging} onClick={handlePing}>
          Ping
        </Button>
      </div>
      {errorText && <div className='text-11px text-red-500 break-all'>Sync error: {errorText}</div>}
      {recentLogs.length > 0 && (
        <div className='flex flex-col gap-2px text-11px text-t-secondary'>
          {recentLogs.map((item, index) => (
            <div key={`${item.ts}-${index}`} className='truncate'>
              {item.ok ? 'OK' : 'ERR'} {item.state} {item.statusCode ? `(${item.statusCode})` : ''} {item.detail}
            </div>
          ))}
        </div>
      )}
      {embedEnabled && <iframe title='Star Office' src={iframeUrl} className='w-full border border-[var(--bg-3)] rounded-8px bg-[var(--bg-1)]' style={{ height: 260 }} />}
    </div>
  );
};

export default StarOfficePanel;
