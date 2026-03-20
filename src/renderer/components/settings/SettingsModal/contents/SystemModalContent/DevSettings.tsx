/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Alert, Button, Message, Switch, Tooltip } from '@arco-design/web-react';
import { Link } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { mutate } from 'swr';
import PreferenceRow from './PreferenceRow';

/**
 * Developer Settings Component
 * Groups DevTools toggle and CDP remote debugging config.
 * Only visible in development mode.
 */
const DevSettings: React.FC = () => {
  const { t } = useTranslation();
  const { data: cdpStatus, isLoading } = useSWR('cdp.status', () => ipcBridge.application.getCdpStatus.invoke());
  const [switchLoading, setSwitchLoading] = useState(false);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);

  const status = cdpStatus?.data;

  // Pending change: config differs from runtime
  const hasPendingChange = status?.configEnabled !== status?.enabled;

  // Initialize DevTools state from Main Process
  useEffect(() => {
    if (isLoading || status?.isDevMode === false) return;

    ipcBridge.application.isDevToolsOpened
      .invoke()
      .then((isOpen) => setIsDevToolsOpen(isOpen))
      .catch((error) => console.error('Failed to get DevTools state:', error));

    const unsubscribe = ipcBridge.application.devToolsStateChanged.on((event) => {
      setIsDevToolsOpen(event.isOpen);
    });

    return () => unsubscribe();
  }, [isLoading, status?.isDevMode]);

  const handleToggleDevTools = () => {
    ipcBridge.application.openDevTools
      .invoke()
      .then((isOpen) => setIsDevToolsOpen(Boolean(isOpen)))
      .catch((error) => console.error('Failed to toggle dev tools:', error));
  };

  const handleToggle = async (checked: boolean) => {
    setSwitchLoading(true);
    try {
      const result = await ipcBridge.application.updateCdpConfig.invoke({ enabled: checked });
      if (result.success) {
        Message.success(t('settings.cdp.configSaved'));
        await mutate('cdp.status');
      } else {
        Message.error(result.msg || t('settings.cdp.configFailed'));
      }
    } catch {
      Message.error(t('settings.cdp.configFailed'));
    } finally {
      setSwitchLoading(false);
    }
  };

  const handleRestart = async () => {
    try {
      await ipcBridge.application.restart.invoke();
    } catch {
      Message.error(t('common.error'));
    }
  };

  const openCdpUrl = () => {
    if (status?.port) {
      const url = `http://127.0.0.1:${status.port}/json`;
      ipcBridge.shell.openExternal.invoke(url).catch(console.error);
    }
  };

  const copyCdpUrl = () => {
    if (status?.port) {
      const url = `http://127.0.0.1:${status.port}`;
      void navigator.clipboard.writeText(url).then(() => {
        Message.success(t('common.copySuccess'));
      });
    }
  };

  const copyMcpConfig = () => {
    if (status?.port) {
      const config = `{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@0.16.0",
        "--browser-url=http://127.0.0.1:${status.port}"
      ]
    }
  }
}`;
      void navigator.clipboard.writeText(config).then(() => {
        Message.success(t('common.copySuccess'));
      });
    }
  };

  // Only show in development mode
  if (!isLoading && status?.isDevMode === false) {
    return null;
  }

  if (isLoading) {
    return null;
  }

  return (
    <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
      <div className='text-14px font-medium text-t-primary mb-8px'>{t('settings.cdp.title')}</div>
      <div className='space-y-12px'>
        {/* DevTools toggle */}
        <PreferenceRow label={t('settings.devTools')}>
          <Button
            size='small'
            type={isDevToolsOpen ? 'primary' : 'secondary'}
            onClick={handleToggleDevTools}
            className='shadow-md border-2 hover:shadow-lg transition-all'
          >
            {isDevToolsOpen ? t('settings.closeDevTools') : t('settings.openDevTools')}
          </Button>
        </PreferenceRow>

        {/* CDP remote debugging toggle */}
        <PreferenceRow label={t('settings.cdp.enable')} description={t('settings.cdp.enableDesc')}>
          <Switch checked={status?.configEnabled ?? false} loading={switchLoading} onChange={handleToggle} />
        </PreferenceRow>

        {status?.port && (
          <div className='space-y-8px'>
            <div className='flex items-center gap-8px py-8px px-12px bg-[var(--fill-1)] rounded-8px'>
              <div className='flex-1'>
                <div className='text-12px text-t-tertiary'>{t('settings.cdp.currentPort')}</div>
                <div className='text-14px text-t-primary font-medium'>http://127.0.0.1:{status.port}</div>
              </div>
              <Tooltip content={t('settings.cdp.openInBrowser')}>
                <Button type='text' size='small' icon={<Link theme='outline' size='16' />} onClick={openCdpUrl} />
              </Tooltip>
              <Tooltip content={t('common.copy')}>
                <Button
                  type='text'
                  size='small'
                  icon={<span className='i-carbon:copy text-16px' />}
                  onClick={copyCdpUrl}
                />
              </Tooltip>
            </div>
            <div className='space-y-4px'>
              <div className='text-12px text-t-tertiary'>{t('settings.cdp.mcpConfig')}</div>
              <div className='flex items-start gap-8px py-8px px-12px bg-[var(--fill-1)] rounded-8px'>
                <pre className='flex-1 text-11px text-t-secondary font-mono overflow-x-auto whitespace-pre-wrap break-all m-0 leading-relaxed'>
                  {`{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@0.16.0",
        "--browser-url=http://127.0.0.1:${status.port}"
      ]
    }
  }
}`}
                </pre>
                <Tooltip content={t('settings.cdp.copyMcpConfig')}>
                  <Button
                    type='text'
                    size='small'
                    icon={<span className='i-carbon:copy text-16px' />}
                    onClick={copyMcpConfig}
                  />
                </Tooltip>
              </div>
              <div className='text-11px text-t-tertiary'>{t('settings.cdp.mcpConfigHint')}</div>
            </div>
          </div>
        )}

        {status && !status.port && !status.configEnabled && (
          <div className='text-12px text-t-tertiary py-8px'>{t('settings.cdp.disabledHint')}</div>
        )}

        {hasPendingChange && (
          <Alert
            type='warning'
            content={
              <div className='flex items-center justify-between gap-12px'>
                <span>{t('settings.cdp.restartRequired')}</span>
                <Button size='small' type='primary' onClick={handleRestart}>
                  {t('settings.restartNow')}
                </Button>
              </div>
            }
            className='mt-8px'
          />
        )}
      </div>
    </div>
  );
};

export default DevSettings;
