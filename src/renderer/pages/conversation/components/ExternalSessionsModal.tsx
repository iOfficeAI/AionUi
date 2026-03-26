/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ExternalSessionProvider, ExternalSessionSummary } from '@/common/types/externalSessions';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Empty, Message, Modal, Tabs, Tag, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useConversationTabs } from '../hooks/ConversationTabsContext';

type ExternalSessionsModalProps = {
  visible: boolean;
  onClose: () => void;
};

type ExternalSessionFilter = 'all' | ExternalSessionProvider;

const FILTER_ORDER: ExternalSessionFilter[] = ['all', 'codex', 'openclaw-gateway'];

const ExternalSessionsModal: React.FC<ExternalSessionsModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openTab } = useConversationTabs();
  const [messageApi, messageContext] = Message.useMessage();
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ExternalSessionSummary[]>([]);
  const [activeFilter, setActiveFilter] = useState<ExternalSessionFilter>('all');
  const [importingSessionId, setImportingSessionId] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const requestSeqRef = useRef(0);

  const loadSessions = useEffectEvent(async () => {
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    setLoading(true);

    try {
      const result = await ipcBridge.acpConversation.listExternalSessions.invoke({});
      if (!result?.success) {
        throw new Error(result?.msg || 'Failed to scan external sessions');
      }

      if (requestSeqRef.current === requestId) {
        setSessions(result.data?.sessions ?? []);
      }
    } catch (error) {
      console.error('Failed to load external sessions:', error);
      messageApi.error(
        t('guid.externalSessions.loadFailed', {
          defaultValue: 'Failed to scan external sessions.',
        })
      );
    } finally {
      if (requestSeqRef.current === requestId) {
        setLoading(false);
      }
      loadingRef.current = false;
    }
  });

  const importSession = useCallback(
    async (session: ExternalSessionSummary) => {
      setImportingSessionId(session.sessionId);

      try {
        const result = await ipcBridge.acpConversation.importExternalSession.invoke({
          provider: session.provider,
          sessionId: session.sessionId,
        });

        if (!result?.success || !result.data?.conversation) {
          throw new Error(result?.msg || 'Failed to import external session');
        }

        const conversation = result.data.conversation;
        emitter.emit('chat.history.refresh');
        openTab(conversation);
        onClose();
        await navigate(`/conversation/${conversation.id}`);
      } catch (error) {
        console.error('Failed to import external session:', error);
        messageApi.error(
          t('guid.externalSessions.importFailed', {
            defaultValue: 'Failed to take over the selected external session.',
          })
        );
      } finally {
        setImportingSessionId(null);
      }
    },
    [messageApi, navigate, onClose, openTab, t]
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    setActiveFilter('all');
    void loadSessions();
  }, [visible]);

  const filteredSessions =
    activeFilter === 'all' ? sessions : sessions.filter((session) => session.provider === activeFilter);

  return (
    <>
      {messageContext}
      <Modal
        visible={visible}
        title={t('guid.externalSessions.title', {
          defaultValue: 'Continue external sessions',
        })}
        style={{ width: 680 }}
        footer={null}
        unmountOnExit
        onCancel={onClose}
      >
        <div className='flex min-h-220px flex-col gap-12px'>
          <div className='flex items-start justify-between gap-12px'>
            <Typography.Paragraph className='!mb-0 text-t-secondary'>
              {t('guid.externalSessions.description', {
                count: sessions.length,
                defaultValue:
                  'New CLI sessions created outside ContextGo will appear here when they have not been taken over yet.',
              })}
            </Typography.Paragraph>
            <Button
              size='mini'
              type='text'
              icon={<Refresh size={14} className={loading ? 'animate-spin' : ''} />}
              onClick={() => {
                void loadSessions();
              }}
            >
              {t('guid.externalSessions.refresh', {
                defaultValue: 'Refresh',
              })}
            </Button>
          </div>

          <Tabs
            activeTab={activeFilter}
            size='small'
            type='capsule'
            onChange={(key) => {
              setActiveFilter(key as ExternalSessionFilter);
            }}
          >
            {FILTER_ORDER.map((filter) => (
              <Tabs.TabPane
                key={filter}
                title={
                  filter === 'all'
                    ? t('guid.externalSessions.filters.all', {
                        defaultValue: 'All',
                      })
                    : t(`guid.externalSessions.providers.${filter}`, {
                        defaultValue: filter,
                      })
                }
              />
            ))}
          </Tabs>

          {loading && filteredSessions.length === 0 && sessions.length === 0 ? (
            <div className='py-20px text-center text-13px text-t-secondary'>
              {t('guid.externalSessions.loading', {
                defaultValue: 'Scanning external sessions...',
              })}
            </div>
          ) : filteredSessions.length > 0 ? (
            <div className='flex flex-col gap-10px max-h-420px overflow-y-auto'>
              {filteredSessions.map((session) => (
                <div
                  key={`${session.provider}:${session.sessionId}`}
                  className='flex items-center gap-12px rounded-14px border border-border-2 bg-fill-1 px-14px py-12px'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-8px flex-wrap'>
                      <Tag size='small' color='arcoblue'>
                        {t(`guid.externalSessions.providers.${session.provider}`, {
                          defaultValue: session.provider,
                        })}
                      </Tag>
                      <span className='min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-14px font-600 text-t-primary'>
                        {session.title}
                      </span>
                    </div>
                    <div className='mt-4px overflow-hidden text-ellipsis whitespace-nowrap text-12px text-t-secondary'>
                      {session.workspace}
                    </div>
                    <div className='mt-4px overflow-hidden text-ellipsis whitespace-nowrap text-12px text-t-secondary'>
                      {t('guid.externalSessions.updatedAt', {
                        defaultValue: 'Updated {{time}}',
                        time: new Date(session.updatedAt).toLocaleString(),
                      })}
                    </div>
                  </div>
                  <Button
                    type='primary'
                    size='small'
                    loading={importingSessionId === session.sessionId}
                    onClick={() => {
                      void importSession(session);
                    }}
                  >
                    {t('guid.externalSessions.import', {
                      defaultValue: 'Take over',
                    })}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              className='py-24px'
              description={t('guid.externalSessions.description', {
                count: 0,
                defaultValue:
                  'New CLI sessions created outside ContextGo will appear here when they have not been taken over yet.',
              })}
            />
          )}
        </div>
      </Modal>
    </>
  );
};

export default ExternalSessionsModal;
