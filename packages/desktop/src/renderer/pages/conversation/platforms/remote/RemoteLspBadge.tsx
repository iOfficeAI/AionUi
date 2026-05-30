/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AionModal from '@/renderer/components/base/AionModal';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { Button, Tag, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type LspServer = { id: string; name: string; root: string; status: 'connected' | 'error' };

/**
 * M15 — conversation-header pill showing the remote OpenCode server's LSP
 * status: "LSP: N" when all are connected, "LSP: N/M" when some are in an
 * error state. Renders nothing for non-opencode remote agents or when the
 * server reports zero LSP servers (so a non-coding workspace doesn't show
 * an empty pill).
 *
 * Clicking opens a small modal listing the LSPs with their root paths so the
 * user can see *why* a language-aware tool might be unavailable. Re-fetches on
 * each open — opencode 1.15.11 does not emit a stable "lsp ready" SSE event,
 * so reactivity to status transitions is out of scope for v1.
 */
const RemoteLspBadge: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const [isOpencode, setIsOpencode] = useState(false);
  const [servers, setServers] = useState<LspServer[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getConversationOrNull(conversation_id).then(async (res) => {
      const extra = res?.extra as { remoteAgentId?: string; remote_agent_id?: string } | undefined;
      const remoteAgentId = extra?.remoteAgentId || extra?.remote_agent_id;
      if (!remoteAgentId) return;
      const agent = await ipcBridge.remoteAgent.get.invoke({ id: remoteAgentId });
      if (cancelled) return;
      setIsOpencode(agent?.protocol === 'opencode');
    });
    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ipcBridge.conversation.getRemoteLspStatus.invoke({ conversation_id });
      setServers(Array.isArray(list) ? list : []);
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [conversation_id]);

  useEffect(() => {
    if (!isOpencode) return;
    void fetchStatus();
  }, [isOpencode, fetchStatus]);

  if (!isOpencode || !servers || servers.length === 0) return null;

  const connected = servers.filter((s) => s.status === 'connected').length;
  const total = servers.length;
  const allUp = connected === total;
  const label = allUp ? `LSP: ${total}` : `LSP: ${connected}/${total}`;
  const tooltip = allUp
    ? t('conversation.remoteLsp.allConnected', {
        count: total,
        defaultValue: `${total} language server${total === 1 ? '' : 's'} connected`,
      })
    : t('conversation.remoteLsp.someDown', {
        connected,
        total,
        defaultValue: `${connected} of ${total} language servers connected`,
      });

  return (
    <>
      <Tooltip content={tooltip}>
        <Tag
          size='small'
          color={allUp ? 'green' : 'red'}
          checkable
          onClick={() => {
            setOpen(true);
            void fetchStatus();
          }}
        >
          {label}
        </Tag>
      </Tooltip>
      <AionModal
        visible={open}
        size='small'
        style={{ width: 520, height: 'auto' }}
        header={{
          title: t('conversation.remoteLsp.modalTitle', { defaultValue: 'Server language servers' }),
          showClose: true,
        }}
        contentStyle={{ padding: '20px 24px 24px' }}
        onCancel={() => setOpen(false)}
        footer={{
          render: () => (
            <div className='flex justify-end gap-10px pt-20px'>
              <Button
                className='px-20px min-w-80px'
                style={{ borderRadius: 8 }}
                loading={loading}
                onClick={() => void fetchStatus()}
              >
                {t('common.refresh', { defaultValue: 'Refresh' })}
              </Button>
              <Button
                type='primary'
                className='px-20px min-w-80px'
                style={{ borderRadius: 8 }}
                onClick={() => setOpen(false)}
              >
                {t('common.close', { defaultValue: 'Close' })}
              </Button>
            </div>
          ),
        }}
      >
        {servers.length === 0 ? (
          <div className='text-13px text-t-secondary leading-20px'>
            {t('conversation.remoteLsp.empty', { defaultValue: 'No language servers are running on this workspace.' })}
          </div>
        ) : (
          <ul className='flex flex-col gap-8px m-0 p-0 list-none'>
            {servers.map((s) => (
              <li key={s.id} className='flex items-start justify-between gap-12px'>
                <div className='flex flex-col gap-2px min-w-0'>
                  <div className='text-13px font-medium truncate'>{s.name || s.id}</div>
                  <div className='text-12px text-t-secondary truncate' title={s.root}>
                    {s.root}
                  </div>
                </div>
                <Tag size='small' color={s.status === 'connected' ? 'green' : 'red'}>
                  {s.status}
                </Tag>
              </li>
            ))}
          </ul>
        )}
      </AionModal>
    </>
  );
};

export default RemoteLspBadge;
