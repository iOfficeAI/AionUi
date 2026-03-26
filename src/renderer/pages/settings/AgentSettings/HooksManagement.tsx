/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import SettingsPageWrapper from '@/renderer/pages/settings/components/SettingsPageWrapper';
import type { HookInfo } from '@/renderer/pages/settings/AgentSettings/AssistantManagement/types';
import { Button, Collapse, Empty, Input, Message, Modal, Tag, Typography } from '@arco-design/web-react';
import { Delete, FolderOpen, Plus, Refresh, Search } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { filterHooksByQuery, summarizeHookLibrary } from './hookLibraryUtils';

const HooksManagement: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [messageApi, messageContext] = Message.useMessage();
  const [loading, setLoading] = useState(false);
  const [availableHooks, setAvailableHooks] = useState<HookInfo[]>([]);
  const [hooksDir, setHooksDir] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteHookName, setDeleteHookName] = useState<string | null>(null);
  const [installingHookName, setInstallingHookName] = useState<string | null>(null);

  const loadHooks = useCallback(async () => {
    setLoading(true);
    try {
      const [hooks, paths] = await Promise.all([
        ipcBridge.fs.listAvailableHooks.invoke(),
        ipcBridge.fs.getHookPaths.invoke(),
      ]);
      setAvailableHooks(hooks);
      setHooksDir(paths.userHooksDir);
      return hooks;
    } catch (error) {
      console.error('Failed to load hooks:', error);
      messageApi.error(t('conversation.workspace.sessionHooksLoadFailed', { defaultValue: 'Failed to load hooks' }));
      setAvailableHooks([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [messageApi, t]);

  useEffect(() => {
    void loadHooks();
  }, [loadHooks]);

  const handleImportHook = useCallback(async () => {
    try {
      const result = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openDirectory'],
      });
      if (!result || result.length === 0) {
        return;
      }

      const importResult = await ipcBridge.fs.importHookWithSymlink.invoke({
        hookPath: result[0],
      });
      if (!importResult.success) {
        messageApi.error(importResult.msg || t('settings.hookImportFailed', { defaultValue: 'Failed to import hook' }));
        return;
      }

      messageApi.success(
        importResult.msg || t('settings.hookImported', { defaultValue: 'Hook imported successfully' })
      );
      await loadHooks();
    } catch (error) {
      console.error('Failed to import hook:', error);
      messageApi.error(t('settings.hookImportFailed', { defaultValue: 'Failed to import hook' }));
    }
  }, [loadHooks, messageApi, t]);

  const handleOpenHooksDir = useCallback(async () => {
    try {
      const nextHooksDir =
        hooksDir ||
        (await ipcBridge.fs.getHookPaths.invoke().then((paths) => {
          setHooksDir(paths.userHooksDir);
          return paths.userHooksDir;
        }));

      if (!nextHooksDir) {
        throw new Error('Hook directory not found');
      }

      await ipcBridge.shell.openFile.invoke(nextHooksDir);
    } catch (error) {
      console.error('Failed to open hooks directory:', error);
      messageApi.error(t('settings.hookOpenFolderFailed', { defaultValue: 'Failed to open hook folder' }));
    }
  }, [hooksDir, messageApi, t]);

  const handleInstallBuiltinHook = useCallback(
    async (hookName: string) => {
      setInstallingHookName(hookName);
      try {
        const result = await ipcBridge.fs.installBuiltinHook.invoke({ hookName });
        if (!result.success) {
          messageApi.error(result.msg || t('settings.hookInstallFailed', { defaultValue: 'Failed to install hook' }));
          return;
        }

        messageApi.success(result.msg || t('settings.installed', { defaultValue: 'Installed' }));
        await loadHooks();
      } catch (error) {
        console.error('Failed to install builtin hook:', error);
        messageApi.error(t('settings.hookInstallFailed', { defaultValue: 'Failed to install hook' }));
      } finally {
        setInstallingHookName((current) => (current === hookName ? null : current));
      }
    },
    [loadHooks, messageApi, t]
  );

  const handleDeleteHookConfirm = useCallback(async () => {
    if (!deleteHookName) {
      return;
    }

    try {
      const result = await ipcBridge.fs.deleteHook.invoke({ hookName: deleteHookName });
      if (!result.success) {
        messageApi.error(result.msg || t('settings.hookDeleteFailed', { defaultValue: 'Failed to delete hook' }));
        return;
      }

      messageApi.success(result.msg || t('settings.hookDeleted', { defaultValue: 'Hook deleted successfully' }));
      setDeleteHookName(null);
      await loadHooks();
    } catch (error) {
      console.error('Failed to delete hook:', error);
      messageApi.error(t('settings.hookDeleteFailed', { defaultValue: 'Failed to delete hook' }));
    }
  }, [deleteHookName, loadHooks, messageApi, t]);

  const filteredHooks = useMemo(() => filterHooksByQuery(availableHooks, searchQuery), [availableHooks, searchQuery]);
  const stats = useMemo(() => summarizeHookLibrary(availableHooks), [availableHooks]);
  const customHooks = useMemo(() => filteredHooks.filter((hook) => hook.isCustom), [filteredHooks]);
  const builtinHooks = useMemo(() => filteredHooks.filter((hook) => !hook.isCustom), [filteredHooks]);
  const defaultActiveKeys = useMemo(() => {
    if (customHooks.length > 0 && builtinHooks.length > 0) {
      return ['custom-hooks', 'builtin-hooks'];
    }
    return ['all-hooks'];
  }, [builtinHooks.length, customHooks.length]);

  const renderHookCard = (hook: HookInfo, canDelete: boolean) => (
    <div
      key={hook.name}
      className='flex items-start gap-8px rounded-12px border border-border-2 p-12px hover:bg-fill-1'
    >
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-6px flex-wrap'>
          <div className='text-13px font-medium text-t-primary'>{hook.name}</div>
          {hook.isCustom && (
            <Tag size='small' color='orange'>
              {t('settings.skillsHub.custom', { defaultValue: 'Custom' })}
            </Tag>
          )}
          {hook.isBuiltinInstalled && (
            <Tag size='small' color='green'>
              {t('settings.installed', { defaultValue: 'Installed' })}
            </Tag>
          )}
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
        </div>
        {hook.description && <div className='mt-4px text-12px text-t-secondary'>{hook.description}</div>}
        <div className='mt-6px text-11px text-t-tertiary break-all'>
          {t('settings.hookLocation', { defaultValue: 'Location' })}: {hook.location}
        </div>
        {hook.supportedBackends && hook.supportedBackends.length > 0 && (
          <div className='mt-6px flex flex-wrap gap-4px'>
            <span className='text-11px text-t-tertiary'>
              {t('settings.hookSupportedBackends', { defaultValue: 'Supported backends' })}:
            </span>
            {hook.supportedBackends.map((backend) => (
              <Tag key={`${hook.name}-${backend}`} size='small' color='purple'>
                {backend}
              </Tag>
            ))}
          </div>
        )}
        {hook.events && hook.events.length > 0 && (
          <div className='mt-6px flex flex-wrap gap-4px'>
            {hook.events.map((eventName) => (
              <Tag key={`${hook.name}-${eventName}`} size='small' color='green'>
                {eventName}
              </Tag>
            ))}
          </div>
        )}
      </div>
      <div className='flex items-center gap-4px'>
        {!hook.isCustom && (
          <Button
            type='outline'
            size='mini'
            loading={installingHookName === hook.name}
            onClick={() => void handleInstallBuiltinHook(hook.name)}
          >
            {t('settings.installHook', { defaultValue: 'Install' })}
          </Button>
        )}
        {canDelete && (
          <Button
            type='text'
            size='mini'
            icon={<Delete size={16} fill='var(--color-text-3)' />}
            onClick={() => setDeleteHookName(hook.name)}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {messageContext}
      <SettingsPageWrapper contentClassName='max-w-1200px'>
        <div className='flex flex-col gap-16px'>
          <div className='rounded-16px border border-border-2 bg-bg-1 p-20px md:p-24px'>
            <div className='flex flex-col gap-16px md:flex-row md:items-start md:justify-between'>
              <div className='min-w-0'>
                <Typography.Title heading={5} className='!mb-8px'>
                  {t('settings.hooksPage', { defaultValue: 'Hooks' })}
                </Typography.Title>
                <Typography.Paragraph className='!mb-0 text-t-secondary'>
                  {t('settings.hooksPageDescription', {
                    defaultValue:
                      'Manage imported hooks here. Assistant defaults are configured in Assistants, and session overrides are available from the conversation header.',
                  })}
                </Typography.Paragraph>
              </div>
              <div className='flex flex-wrap items-center gap-8px'>
                <Button type='outline' onClick={() => void navigate('/settings/agent', { replace: true })}>
                  {t('settings.hooksPageManageAssistants', { defaultValue: 'Manage Assistants' })}
                </Button>
                <Button
                  type='outline'
                  icon={<Refresh size={14} className={loading ? 'animate-spin' : ''} />}
                  onClick={() => void loadHooks()}
                >
                  {t('common.refresh', { defaultValue: 'Refresh' })}
                </Button>
                <Button type='outline' icon={<Plus size={14} />} onClick={() => void handleImportHook()}>
                  {t('settings.importHook', { defaultValue: 'Import Hook' })}
                </Button>
                <Button type='outline' icon={<FolderOpen size={14} />} onClick={() => void handleOpenHooksDir()}>
                  {t('settings.openHookFolder', { defaultValue: 'Open Folder' })}
                </Button>
              </div>
            </div>
          </div>

          <div className='grid gap-12px md:grid-cols-3'>
            <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
              <Typography.Text type='secondary' className='text-12px'>
                {t('settings.hooksPageTotal', { defaultValue: 'Total Hooks' })}
              </Typography.Text>
              <div className='mt-6px text-28px font-semibold text-t-primary'>{stats.total}</div>
            </div>
            <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
              <Typography.Text type='secondary' className='text-12px'>
                {t('settings.hooksPageCustom', { defaultValue: 'Custom Hooks' })}
              </Typography.Text>
              <div className='mt-6px text-28px font-semibold text-t-primary'>{stats.custom}</div>
            </div>
            <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
              <Typography.Text type='secondary' className='text-12px'>
                {t('settings.hooksPageBuiltin', { defaultValue: 'Builtin Hooks' })}
              </Typography.Text>
              <div className='mt-6px text-28px font-semibold text-t-primary'>{stats.builtin}</div>
            </div>
          </div>

          <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
            <Input
              value={searchQuery}
              allowClear
              prefix={<Search theme='outline' size={14} />}
              placeholder={t('settings.hooksPageSearchPlaceholder', {
                defaultValue: 'Search hooks by name, description, or location',
              })}
              onChange={setSearchQuery}
            />
            <div className='mt-12px rounded-12px bg-fill-1 p-12px'>
              <Typography.Text type='secondary' className='text-12px'>
                {t('settings.hookStoragePath', { defaultValue: 'Hook storage path' })}
              </Typography.Text>
              <div className='mt-4px break-all text-12px text-t-primary'>{hooksDir || '-'}</div>
            </div>
          </div>

          <div className='rounded-16px border border-border-2 bg-bg-1 p-16px'>
            {filteredHooks.length > 0 ? (
              <Collapse defaultActiveKey={defaultActiveKeys}>
                {customHooks.length > 0 && (
                  <Collapse.Item
                    header={
                      <span className='text-13px font-medium'>
                        {t('settings.hooksPageCustom', { defaultValue: 'Custom Hooks' })}
                      </span>
                    }
                    name={builtinHooks.length > 0 ? 'custom-hooks' : 'all-hooks'}
                    extra={<span className='text-12px text-t-secondary'>{customHooks.length}</span>}
                  >
                    <div className='space-y-4px'>{customHooks.map((hook) => renderHookCard(hook, true))}</div>
                  </Collapse.Item>
                )}
                {builtinHooks.length > 0 && (
                  <Collapse.Item
                    header={
                      <span className='text-13px font-medium'>
                        {t('settings.hooksPageBuiltin', { defaultValue: 'Builtin Hooks' })}
                      </span>
                    }
                    name='builtin-hooks'
                    extra={<span className='text-12px text-t-secondary'>{builtinHooks.length}</span>}
                  >
                    <div className='space-y-4px'>{builtinHooks.map((hook) => renderHookCard(hook, false))}</div>
                  </Collapse.Item>
                )}
              </Collapse>
            ) : (
              <Empty
                className='py-24px'
                description={
                  searchQuery
                    ? t('settings.hooksPageEmptySearch', { defaultValue: 'No hooks match the current search.' })
                    : t('settings.noAvailableHooks', { defaultValue: 'No hooks found in the hook directory' })
                }
              />
            )}
          </div>
        </div>
      </SettingsPageWrapper>

      <Modal
        visible={deleteHookName !== null}
        title={t('settings.deleteHookTitle', { defaultValue: 'Delete Hook' })}
        onCancel={() => setDeleteHookName(null)}
        onOk={() => void handleDeleteHookConfirm()}
      >
        <Typography.Text>
          {t('settings.deleteHookConfirm', {
            name: deleteHookName || '',
            defaultValue: 'Are you sure you want to delete "{{name}}"? This action cannot be undone.',
          })}
        </Typography.Text>
      </Modal>
    </>
  );
};

export default HooksManagement;
