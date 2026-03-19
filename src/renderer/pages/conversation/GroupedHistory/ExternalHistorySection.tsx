/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * External CLI session history import feature.
 * Provides a trigger button and a Drawer that lists external sessions
 * (Claude Code, Codex) for importing into AionUi.
 */

import { ipcBridge } from '@/common';
import type { ExternalSessionInfo } from '@/common/externalHistoryTypes';
import { Button, Drawer, Empty, Message, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { Download, FolderOpen, Refresh, Terminal } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Unique key for a session (avoids collision across backends).
 */
function sessionKey(session: ExternalSessionInfo): string {
  return `${session.backend}:${session.id}`;
}

/**
 * Trigger button for the external history import Drawer.
 * Rendered in the sidebar header area.
 */
export const ExternalHistoryButton: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const { t } = useTranslation();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [sessions, setSessions] = useState<ExternalSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await ipcBridge.externalHistory.list.invoke();
      setSessions(result ?? []);
      setLoaded(true);
    } catch (err) {
      console.error('[ExternalHistory] Failed to load sessions:', err);
      setSessions([]);
      setLoaded(true);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenDrawer = useCallback(async () => {
    setDrawerVisible(true);
    if (!loaded) {
      await fetchSessions();
    }
  }, [loaded, fetchSessions]);

  const handleImport = useCallback(
    async (session: ExternalSessionInfo) => {
      const key = sessionKey(session);
      setImportingIds((prev) => new Set(prev).add(key));
      try {
        const result = await ipcBridge.externalHistory.import.invoke({ backend: session.backend, id: session.id });
        if (result.success) {
          Message.success(t('conversation.externalHistory.importSuccess', { count: result.messageCount }));
          // Remove imported session from list
          setSessions((prev) => prev.filter((s) => sessionKey(s) !== key));
        } else {
          Message.error(t('conversation.externalHistory.importError', { error: result.error }));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        Message.error(t('conversation.externalHistory.importError', { error: errorMsg }));
      } finally {
        setImportingIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [t]
  );


  if (collapsed) return null;

  return (
    <>
      <Tooltip content={t('conversation.externalHistory.importButton')} mini position='right'>
        <div
          className='flex items-center justify-start gap-10px px-12px py-8px rd-0.5rem cursor-pointer transition-colors hover:bg-hover active:bg-fill-2'
          onClick={() => {
            void handleOpenDrawer();
          }}
        >
          <Terminal
            theme='outline'
            size='20'
            className='block leading-none shrink-0'
            style={{ lineHeight: 0 }}
          />
          <span className='collapsed-hidden text-t-primary'>
            {t('conversation.externalHistory.importButton')}
          </span>
        </div>
      </Tooltip>

      <Drawer
        title={t('conversation.externalHistory.drawerTitle')}
        visible={drawerVisible}
        width={420}
        placement='left'
        footer={null}
        onCancel={() => setDrawerVisible(false)}
        getPopupContainer={() => document.body}
        headerStyle={{ borderBottom: '1px solid var(--color-border-2)' }}
      >
        {/* Toolbar */}
        <div className='flex items-center justify-between mb-12px'>
          <span className='text-13px text-t-secondary'>
            {loaded && !loading ? t('conversation.externalHistory.sessionCount', { count: sessions.length }) : ''}
          </span>
          <Button
            size='mini'
            type='text'
            icon={<Refresh theme='outline' size='14' />}
            loading={loading}
            onClick={() => {
              void fetchSessions();
            }}
          >
            {loading ? '' : t('conversation.externalHistory.refresh')}
          </Button>
        </div>

        {/* Loading */}
        {loading && !loaded && (
          <div className='flex-center py-40px flex-col gap-8px'>
            <Spin size={24} />
            <span className='text-13px text-t-secondary'>
              {t('conversation.externalHistory.loading')}
            </span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <Empty
            description={t('conversation.externalHistory.loadError')}
            style={{ marginTop: '40px' }}
          />
        )}

        {/* Empty state */}
        {loaded && !error && sessions.length === 0 && !loading && (
          <Empty
            description={t('conversation.externalHistory.noSessions')}
            style={{ marginTop: '40px' }}
          />
        )}

        {/* Session list */}
        <div className='flex flex-col gap-4px'>
          {sessions.map((session) => {
            const key = sessionKey(session);
            const isImporting = importingIds.has(key);
            return (
              <div
                key={key}
                className='flex items-start gap-12px px-12px py-10px rounded-10px transition-colors'
                style={{ border: '1px solid var(--color-border-2)', cursor: 'default' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-fill-1)';
                  e.currentTarget.style.borderColor = 'var(--color-border-3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = 'var(--color-border-2)';
                }}
              >
                {/* Content */}
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-6px mb-4px'>
                    <Tag size='small' color={session.backend === 'claude' ? 'orangered' : 'green'}>
                      {session.backend === 'claude' ? 'Claude Code' : 'Codex'}
                    </Tag>
                    <span className='text-11px text-t-secondary'>
                      {t('conversation.externalHistory.timeAgo', { time: formatTimeDiff(session.updatedAt) })}
                    </span>
                  </div>
                  <div className='text-13px text-t-primary leading-20px mb-2px'>
                    {session.name}
                  </div>
                  {session.workspace && (
                    <Tooltip content={session.workspace} mini>
                      <div className='text-11px text-t-secondary truncate flex items-center gap-2px'>
                        <FolderOpen theme='outline' size='12' />
                        {extractDirName(session.workspace)}
                      </div>
                    </Tooltip>
                  )}
                </div>

                {/* Import button */}
                <Button
                  size='small'
                  type='outline'
                  icon={<Download theme='outline' size='14' />}
                  loading={isImporting}
                  onClick={() => {
                    void handleImport(session);
                  }}
                  style={{ flexShrink: 0, marginTop: '2px' }}
                >
                  {isImporting
                    ? t('conversation.externalHistory.importing')
                    : t('conversation.externalHistory.import')}
                </Button>
              </div>
            );
          })}
        </div>
      </Drawer>
    </>
  );
};

/** Extract last directory segment from a path (cross-platform). */
function extractDirName(p: string): string {
  const segments = p.replace(/\\/g, '/').split('/');
  return segments.pop() || p;
}

/** Return a numeric value + unit for relative time (e.g. "5m", "2h", "3d"). */
function formatTimeDiff(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default ExternalHistoryButton;
