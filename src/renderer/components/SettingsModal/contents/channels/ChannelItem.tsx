/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse, Input, Switch, Tabs } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ChannelHeader from './ChannelHeader';
import type { ChannelConfig, ChannelInstanceConfig } from './types';

interface ChannelItemProps {
  channel: ChannelConfig;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectInstance?: (instanceId: string) => void;
}

const ChannelItem: React.FC<ChannelItemProps> = ({ channel, isCollapsed, onToggleCollapse, onSelectInstance }) => {
  const { t } = useTranslation();
  const instances = channel.instances || [];
  const activeInstance = instances.find((item) => item.id === channel.activeInstanceId) || instances[0];
  const isInstanceDisabled = activeInstance ? activeInstance.status === 'coming_soon' || activeInstance.disabled : false;
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const startRename = useCallback((instance: ChannelInstanceConfig) => {
    if (!instance.onRename) return;
    setEditingInstanceId(instance.id);
    setEditingName(instance.title);
  }, []);

  const cancelRename = useCallback(() => {
    setEditingInstanceId(null);
    setEditingName('');
    setRenameSaving(false);
  }, []);

  const submitRename = useCallback(
    async (instance: ChannelInstanceConfig) => {
      if (!instance.onRename) {
        cancelRename();
        return;
      }

      const nextName = editingName.trim();
      if (!nextName) {
        return;
      }

      if (nextName === instance.title) {
        cancelRename();
        return;
      }

      try {
        setRenameSaving(true);
        const result = await instance.onRename(nextName);
        if (result !== false) {
          cancelRename();
        }
      } finally {
        setRenameSaving(false);
      }
    },
    [cancelRename, editingName]
  );

  useEffect(() => {
    if (!editingInstanceId) return;
    const current = instances.find((item) => item.id === editingInstanceId);
    if (!current) {
      cancelRename();
      return;
    }
    setEditingName(current.title);
  }, [cancelRename, editingInstanceId, instances]);

  const renderTabTitle = useCallback(
    (instance: ChannelInstanceConfig) => {
      const isEditing = editingInstanceId === instance.id;

      if (isEditing) {
        return (
          <span className='inline-flex items-center gap-6px max-w-220px' onClick={(event) => event.stopPropagation()}>
            <Input
              size='mini'
              value={editingName}
              autoFocus
              maxLength={40}
              onChange={setEditingName}
              onPressEnter={() => void submitRename(instance)}
              onBlur={() => void submitRename(instance)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              disabled={renameSaving}
              placeholder={t('settings.channels.renameInstancePlaceholder', { defaultValue: '输入实例名称' })}
            />
          </span>
        );
      }

      return (
        <span
          className={`inline-flex items-center gap-6px transition-colors ${activeInstance?.id === instance.id ? 'text-t-primary font-600' : 'text-t-secondary'}`}
          onDoubleClick={(event) => {
            event.stopPropagation();
            startRename(instance);
          }}
          title={instance.onRename ? t('settings.channels.renameInstanceHint', { defaultValue: '双击重命名实例' }) : undefined}
        >
          <span className='truncate max-w-180px'>{instance.title}</span>
          {instance.enabled ? <span className={`inline-flex w-6px h-6px rd-50% ${instance.isConnected ? 'bg-[rgb(var(--green-6))]' : 'bg-[rgb(var(--orange-6))]'}`} /> : null}
        </span>
      );
    },
    [activeInstance?.id, cancelRename, editingInstanceId, editingName, renameSaving, startRename, submitRename, t]
  );

  const instanceToolbar = activeInstance ? (
    <div className='flex items-center justify-between gap-12px'>
      <div className='min-w-0 flex-1' onClick={(event) => event.stopPropagation()}>
        {instances.length > 1 ? (
          <Tabs activeTab={activeInstance.id} onChange={(key) => onSelectInstance?.(String(key))} type='line' destroyOnHide>
            {instances.map((instance) => (
              <Tabs.TabPane key={instance.id} title={renderTabTitle(instance)} />
            ))}
          </Tabs>
        ) : (
          <div className='flex items-center min-h-32px'>{renderTabTitle(activeInstance)}</div>
        )}
      </div>

      <div className='flex items-center gap-8px shrink-0' onClick={(event) => event.stopPropagation()}>
        {channel.headerActions ? <div className='flex items-center gap-8px'>{channel.headerActions}</div> : null}
        {activeInstance.actions ? <div className='flex items-center gap-8px'>{activeInstance.actions}</div> : null}
        {activeInstance.onToggleEnabled ? <Switch data-channel-switch-for={activeInstance.id} data-channel-switch-disabled={isInstanceDisabled ? 'true' : 'false'} aria-disabled={isInstanceDisabled ? 'true' : undefined} checked={activeInstance.enabled} onChange={activeInstance.onToggleEnabled} size='small' disabled={isInstanceDisabled} /> : null}
      </div>
    </div>
  ) : null;

  const content = activeInstance ? (
    <div className='space-y-12px'>
      {instanceToolbar}
      <div>{activeInstance.content}</div>
    </div>
  ) : (
    channel.content || <div className='text-13px text-t-secondary'>{t('settings.channels.noInstance', { defaultValue: 'No channel instance available.' })}</div>
  );

  return (
    <div data-channel-id={channel.id} data-channel-status={channel.status} data-channel-extension={channel.isExtension ? 'true' : 'false'}>
      <Collapse activeKey={isCollapsed ? [] : ['1']} onChange={onToggleCollapse} className='[&_div.arco-collapse-item-header-title]:flex-1'>
        <Collapse.Item header={<ChannelHeader channel={channel} />} name='1' className='[&_div.arco-collapse-item-content-box]:py-3'>
          {content}
        </Collapse.Item>
      </Collapse>
    </div>
  );
};

export default ChannelItem;
