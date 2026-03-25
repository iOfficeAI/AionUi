/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HookInfo } from '@/renderer/pages/settings/AgentSettings/AssistantManagement/types';
import {
  getIncompatibleHookNames,
  isHookSupportedByBackend,
} from '@/renderer/pages/settings/AgentSettings/AssistantManagement/assistantUtils';
import { Button, Checkbox, Collapse, Drawer, Tag, Typography } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type SessionHooksDrawerProps = {
  visible: boolean;
  onClose: () => void;
  hooksLoading: boolean;
  hooksSaving: boolean;
  availableHooks: HookInfo[];
  selectedHooks: string[];
  setSelectedHooks: (hooks: string[]) => void;
  currentBackend: string;
  handleRefresh: () => Promise<HookInfo[]>;
  handleSave: () => Promise<boolean>;
};

const SessionHooksDrawer: React.FC<SessionHooksDrawerProps> = ({
  visible,
  onClose,
  hooksLoading,
  hooksSaving,
  availableHooks,
  selectedHooks,
  setSelectedHooks,
  currentBackend,
  handleRefresh,
  handleSave,
}) => {
  const { t } = useTranslation();
  const incompatibleHookNameSet = useMemo(
    () => new Set(getIncompatibleHookNames(availableHooks, selectedHooks, currentBackend)),
    [availableHooks, currentBackend, selectedHooks]
  );

  return (
    <Drawer
      visible={visible}
      placement='right'
      width={420}
      title={t('conversation.workspace.sessionHooksTitle', {
        defaultValue: 'Session Hooks',
      })}
      onCancel={onClose}
      footer={
        <div className='flex items-center justify-between w-full'>
          <Button
            size='small'
            type='outline'
            icon={<Refresh size={14} className={hooksLoading ? 'animate-spin' : ''} />}
            onClick={() => void handleRefresh()}
          >
            {t('common.refresh', { defaultValue: 'Refresh' })}
          </Button>
          <div className='flex items-center gap-8px'>
            <Button size='small' onClick={onClose}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type='primary' size='small' loading={hooksSaving} onClick={() => void handleSave()}>
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
          </div>
        </div>
      }
    >
      <div className='flex flex-col gap-12px'>
        <Typography.Text type='secondary' className='text-12px'>
          {t('conversation.workspace.sessionHooksHint', {
            defaultValue:
              'These hooks only apply to the current session. Unsupported hooks are shown but cannot be newly selected.',
          })}
        </Typography.Text>
        <div className='rounded-8px bg-fill-1 p-12px'>
          <Typography.Text type='secondary' className='text-12px'>
            {t('conversation.workspace.sessionHooksCurrentAgent', {
              defaultValue: 'Current agent',
            })}
          </Typography.Text>
          <div className='mt-4px text-13px text-t-primary break-all'>{currentBackend}</div>
        </div>

        <Collapse defaultActiveKey={['session-hooks']}>
          <Collapse.Item
            header={
              <span className='text-13px font-medium'>
                {t('conversation.workspace.sessionHooksAvailable', {
                  defaultValue: 'Available Hooks',
                })}
              </span>
            }
            name='session-hooks'
            extra={<span className='text-12px text-t-secondary'>{availableHooks.length}</span>}
          >
            {availableHooks.length > 0 ? (
              <div className='space-y-4px'>
                {availableHooks.map((hook) => {
                  const isSupportedByCurrentAgent = isHookSupportedByBackend(hook, currentBackend);
                  const isSelected = selectedHooks.includes(hook.name);
                  const isSelectedButIncompatible = incompatibleHookNameSet.has(hook.name);

                  return (
                    <div key={hook.name} className='flex items-start gap-8px rounded-4px p-8px hover:bg-fill-1'>
                      <Checkbox
                        checked={isSelected}
                        disabled={!isSupportedByCurrentAgent && !isSelected}
                        className='mt-2px cursor-pointer'
                        onChange={() => {
                          if (isSelected) {
                            setSelectedHooks(selectedHooks.filter((item) => item !== hook.name));
                          } else {
                            setSelectedHooks([...selectedHooks, hook.name]);
                          }
                        }}
                      />
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-6px flex-wrap'>
                          <div className='text-13px font-medium text-t-primary'>{hook.name}</div>
                          {hook.executionType && (
                            <Tag size='small' color='arcoblue'>
                              {hook.executionType}
                            </Tag>
                          )}
                          {hook.version && (
                            <Tag size='small' color='gray'>
                              v{hook.version}
                            </Tag>
                          )}
                          {!isSupportedByCurrentAgent && (
                            <Tag size='small' color='red'>
                              {t('settings.hookUnsupportedTag', { defaultValue: 'Unsupported' })}
                            </Tag>
                          )}
                        </div>
                        {hook.description && (
                          <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{hook.description}</div>
                        )}
                        {!isSupportedByCurrentAgent && (
                          <div className='mt-6px text-11px text-danger-6'>
                            {isSelectedButIncompatible
                              ? t('settings.hookSelectedButUnsupported', {
                                  defaultValue:
                                    'This hook is selected but will not run for the current agent. Remove it before saving.',
                                })
                              : t('settings.hookUnsupportedHint', {
                                  defaultValue: 'This hook does not support the current agent.',
                                })}
                          </div>
                        )}
                        <div className='mt-6px text-11px text-t-tertiary break-all'>
                          {t('settings.hookLocation', { defaultValue: 'Location' })}: {hook.location}
                        </div>
                        {hook.supportedBackends && hook.supportedBackends.length > 0 && (
                          <div className='mt-6px flex flex-wrap gap-4px'>
                            <span className='text-11px text-t-tertiary'>
                              {t('settings.hookSupportedBackends', {
                                defaultValue: 'Supported backends',
                              })}
                              :
                            </span>
                            {hook.supportedBackends.map((backend) => (
                              <Tag key={`${hook.name}-${backend}`} size='small' color='purple'>
                                {backend}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className='text-center text-t-secondary text-12px py-16px'>
                {t('settings.noAvailableHooks', { defaultValue: 'No hooks found in the hook directory' })}
              </div>
            )}
          </Collapse.Item>
        </Collapse>
      </div>
    </Drawer>
  );
};

export default SessionHooksDrawer;
