/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { SidebarItem } from '@/common/types/sidebar';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Empty, Message, Modal, Spin } from '@arco-design/web-react';
import { DeleteOne, MessageOne, Peoples } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';

const ARCHIVED_SWR_KEY = 'sidebar-archived';

/** A flat archived row, resolved from a {@link SidebarItem} for uniform rendering. */
type ArchivedRow = {
  /** `${item_type}:${item_id}` — unique across the flattened groups. */
  key: string;
  item_type: 'conversation' | 'team';
  item_id: string;
  name: string;
  icon: React.ReactElement;
  /** Member count for teams; absent for conversations. */
  memberCount?: number;
};

/**
 * Archived management page. Reuses the grouped sidebar read model with the
 * `archived` flag (the same `SidebarResponse` shape as the active sidebar), then
 * flattens every group into a single flat list — the archive has no grouping /
 * ordering semantics, only restore and empty. Restoring an item unarchives it
 * and a `chat.history.refresh` puts it back in the active sidebar.
 */
const ArchivedSettings: React.FC = () => {
  const { t } = useTranslation();

  const { data, isLoading, mutate } = useSWR(ARCHIVED_SWR_KEY, () => ipcBridge.sidebar.get.invoke({ archived: true }));

  const rows = React.useMemo<ArchivedRow[]>(() => {
    const seen = new Set<string>();
    const out: ArchivedRow[] = [];
    for (const group of data?.groups ?? []) {
      for (const item of group.items as SidebarItem[]) {
        if (item.type === 'conversation') {
          const key = `conversation:${item.conversation.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            key,
            item_type: 'conversation',
            item_id: item.conversation.id,
            name: item.conversation.name || t('conversation.welcome.newConversation'),
            icon: <MessageOne theme='outline' size='16' className='block leading-none text-t-secondary' />,
          });
        } else {
          const key = `team:${item.team_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            key,
            item_type: 'team',
            item_id: item.team_id,
            name: item.name,
            icon: <Peoples theme='outline' size='16' className='block leading-none text-t-secondary' />,
            memberCount: item.member_conversation_ids.length,
          });
        }
      }
    }
    return out;
  }, [data, t]);

  const handleRestore = React.useCallback(
    async (row: ArchivedRow) => {
      try {
        await ipcBridge.sidebar.unarchive.invoke({ item_type: row.item_type, item_id: row.item_id });
        emitter.emit('chat.history.refresh');
        await mutate();
        Message.success(t('settings.archived.restoreSuccess'));
      } catch (error) {
        console.error('Failed to restore archived item:', error);
        Message.error(t('settings.archived.restoreFailed'));
      }
    },
    [mutate, t]
  );

  const handleEmpty = React.useCallback(() => {
    Modal.confirm({
      title: t('settings.archived.clearConfirmTitle'),
      content: t('settings.archived.clearConfirmContent'),
      okText: t('settings.archived.clearAll'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        try {
          await ipcBridge.sidebar.deleteArchived.invoke();
          emitter.emit('chat.history.refresh');
          await mutate();
          Message.success(t('settings.archived.clearSuccess'));
        } catch (error) {
          console.error('Failed to empty archive:', error);
          Message.error(t('settings.archived.clearFailed'));
        }
      },
      style: { borderRadius: '12px' },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [mutate, t]);

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={t('settings.archived.title')}
        description={t('settings.archived.description')}
        actions={
          rows.length > 0 ? (
            <Button status='danger' icon={<DeleteOne theme='outline' size='14' />} onClick={handleEmpty}>
              {t('settings.archived.clearAll')}
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className='flex items-center justify-center py-64px'>
          <Spin />
        </div>
      ) : rows.length === 0 ? (
        <div className='flex items-center justify-center py-64px'>
          <Empty description={t('settings.archived.empty')} />
        </div>
      ) : (
        <div className='mt-18px flex flex-col gap-2px'>
          {rows.map((row) => (
            <div
              key={row.key}
              className='group flex h-48px items-center gap-12px rd-8px px-12px transition-colors hover:bg-fill-3'
            >
              <span className='size-22px flex items-center justify-center shrink-0 line-height-0'>{row.icon}</span>
              <div className='min-w-0 flex-1'>
                <div className='overflow-hidden text-ellipsis whitespace-nowrap text-14px font-[500] text-t-primary'>
                  {row.name}
                </div>
                {typeof row.memberCount === 'number' ? (
                  <div className='text-12px text-t-tertiary'>
                    {t('settings.archived.teamMemberCount', { count: row.memberCount })}
                  </div>
                ) : null}
              </div>
              <Button type='text' size='small' className='shrink-0' onClick={() => void handleRestore(row)}>
                {t('settings.archived.restore')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </SettingsPageWrapper>
  );
};

export default ArchivedSettings;
