/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { useRemoteAgentHealth } from '@/renderer/hooks/agent/useRemoteAgentHealth';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { Dropdown, Menu, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Down, LinkCloud } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const healthDotColor = (healthy: boolean | undefined, loading: boolean): string => {
  if (loading) return 'bg-[var(--color-text-3)]';
  return healthy ? 'bg-[rgb(var(--success-6))]' : 'bg-[rgb(var(--danger-6))]';
};

const RemoteServerBadge: React.FC<{ conversation: Pick<TChatConversation, 'id' | 'type' | 'extra'> }> = ({
  conversation,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { agents, health } = useRemoteAgentHealth();

  const [currentAgentId, setCurrentAgentId] = useState<string | undefined>();
  const [currentAgentName, setCurrentAgentName] = useState<string | undefined>();
  // Lazily fetched only while the dropdown is open — the header must NOT
  // subscribe to the live conversation-list store, which emits on every
  // streaming delta and would re-render the header continuously (the same
  // class of bug as #2908). The previous conversation per agent is resolved
  // on demand instead.
  const [recentByAgent, setRecentByAgent] = useState<Record<string, string>>({});

  useEffect(() => {
    if (conversation.type !== 'remote') return;
    let cancelled = false;
    void (async () => {
      const res = await getConversationOrNull(conversation.id);
      const extra = res?.extra as { remoteAgentId?: string; remote_agent_id?: string } | undefined;
      const remoteAgentId = extra?.remoteAgentId || extra?.remote_agent_id;
      if (!remoteAgentId || cancelled) return;
      setCurrentAgentId(remoteAgentId);
      const agent = await ipcBridge.remoteAgent.get.invoke({ id: remoteAgentId });
      if (!cancelled && agent) setCurrentAgentName(agent.name);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversation.id, conversation.type]);

  const loadRecentByAgent = useCallback(async () => {
    try {
      const result = await ipcBridge.database.getUserConversations.invoke({ limit: 500 });
      const items = result?.items ?? [];
      const map: Record<string, string> = {};
      // items are returned most-recent-first; first write per agent wins.
      for (const c of items) {
        if (c.type !== 'remote') continue;
        const extra = c.extra as { remoteAgentId?: string; remote_agent_id?: string } | undefined;
        const agentId = extra?.remoteAgentId || extra?.remote_agent_id;
        if (!agentId || map[agentId]) continue;
        map[agentId] = c.id;
      }
      setRecentByAgent(map);
    } catch {
      // best-effort; leave the previous map in place
    }
  }, []);

  const handleSelectAgent = useCallback(
    async (agentId: string) => {
      if (agentId === currentAgentId) return;
      const existingId = recentByAgent[agentId];
      if (existingId) {
        await Promise.resolve(navigate(`/conversation/${existingId}`));
        return;
      }
      await Promise.resolve(navigate('/guid'));
    },
    [currentAgentId, recentByAgent, navigate]
  );

  if (conversation.type !== 'remote' || !currentAgentName) return null;

  const currentHealth = currentAgentId ? health[currentAgentId] : undefined;
  const currentLoading = currentHealth === 'loading';
  const currentHealthy = !currentLoading && currentHealth ? currentHealth.healthy : undefined;

  const droplist = (
    <Menu className='min-w-[260px]' onClickMenuItem={(key) => void handleSelectAgent(key)}>
      <Menu.Item key='__header__' disabled className='!cursor-default'>
        <Typography.Text type='secondary' className='text-11px uppercase tracking-wide'>
          {t('conversation.remoteServerBadge.switchServer')}
        </Typography.Text>
      </Menu.Item>
      {agents.length === 0 && (
        <Menu.Item key='__empty__' disabled>
          <Typography.Text type='secondary'>{t('conversation.remoteServerBadge.noConversations')}</Typography.Text>
        </Menu.Item>
      )}
      {agents.map((agent) => {
        const entry = health[agent.id];
        const loading = entry === 'loading';
        const healthy = entry && entry !== 'loading' ? entry.healthy : undefined;
        const isCurrent = agent.id === currentAgentId;
        const hasRecent = Boolean(recentByAgent[agent.id]);
        return (
          <Menu.Item key={agent.id} className={isCurrent ? 'opacity-60' : ''}>
            <div className='flex items-center justify-between gap-8px'>
              <div className='flex min-w-0 items-center gap-8px'>
                <span
                  className={`inline-block h-6px w-6px shrink-0 rounded-full ${healthDotColor(healthy, loading)}`}
                />
                <Typography.Ellipsis className='max-w-[180px] font-medium'>{agent.name}</Typography.Ellipsis>
              </div>
              {isCurrent ? (
                <Tag size='small' color='arcoblue'>
                  {t('conversation.remoteServerBadge.current')}
                </Tag>
              ) : hasRecent ? (
                <Tag size='small' color='green'>
                  {t('conversation.remoteServerBadge.openExisting')}
                </Tag>
              ) : (
                <Tag size='small' color='gray'>
                  {agent.protocol}
                </Tag>
              )}
            </div>
            {entry && entry !== 'loading' && !entry.healthy && entry.error && (
              <Typography.Text type='error' className='mt-2px block text-11px line-clamp-2'>
                {entry.error}
              </Typography.Text>
            )}
          </Menu.Item>
        );
      })}
    </Menu>
  );

  return (
    <Tooltip
      content={
        currentHealth && currentHealth !== 'loading' && currentHealth.latency_ms > 0
          ? t('settings.remoteAgent.healthLatency', { ms: currentHealth.latency_ms })
          : undefined
      }
    >
      <Dropdown
        droplist={droplist}
        trigger={['click']}
        position='br'
        onVisibleChange={(visible) => {
          if (visible) void loadRecentByAgent();
        }}
      >
        <Tag size='small' color={currentHealthy === false ? 'red' : 'arcoblue'} className='cursor-pointer pr-6px'>
          <span className='flex items-center gap-4px'>
            <LinkCloud theme='outline' size='12' />
            <Typography.Ellipsis className='max-w-[140px]'>{currentAgentName}</Typography.Ellipsis>
            <Down size='10' />
          </span>
        </Tag>
      </Dropdown>
    </Tooltip>
  );
};

export default RemoteServerBadge;
