/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Alert, Button, Collapse, Message, Switch, Tooltip } from '@arco-design/web-react';
import { Copy, Down, Link } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
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
  const [expandedMcpKeys, setExpandedMcpKeys] = useState<string[]>([]);
  const hasManualDevToolsToggleRef = useRef(false);

  const status = cdpStatus?.data;

  // Pending change: config differs from runtime
  const hasPendingChange = status?.configEnabled !== status?.enabled;

  // Initialize DevTools state from Main Process
  useEffect(() => {
    if (isLoading || status?.isDevMode === false) return;

    ipcBridge.application.isDevToolsOpened
      .invoke()
      .then((isOpen) => {
        // Avoid overwriting a user-triggered toggle with a stale initial read.
        if (!hasManualDevToolsToggleRef.current) {
          setIsDevToolsOpen(isOpen);
        }
      })
      .catch((error) => console.error('Failed to get DevTools state:', error));

    const unsubscribe = ipcBridge.application.devToolsStateChanged.on((event) => {
      setIsDevToolsOpen(event.isOpen);
    });

    return () => unsubscribe();
  }, [isLoading, status?.isDevMode]);

  const handleToggleDevTools = () => {
    hasManualDevToolsToggleRef.current = true;
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

  const copyPlaywrightMcpConfig = () => {
    if (status?.port) {
      const config = `{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--cdp-endpoint",
        "http://127.0.0.1:${status.port}"
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
    <div className='space-y-12px'>
      {/* DevTools toggle */}
      <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
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
      </div>

      {/* CDP section */}
      <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
        <div className='text-14px font-medium text-t-primary mb-8px'>{t('settings.cdp.title')}</div>
        <div className='space-y-12px'>
          {/* CDP remote debugging toggle */}
          <PreferenceRow label={t('settings.cdp.enable')} description={t('settings.cdp.enableDesc')}>
            <Switch checked={status?.configEnabled ?? false} loading={switchLoading} onChange={handleToggle} />
          </PreferenceRow>

          {status?.configEnabled && status?.port && (
            <div className='space-y-8px'>
              <div className='flex items-center gap-8px'>
                <div className='flex-1'>
                  <div className='text-12px text-t-tertiary'>{t('settings.cdp.currentPort')}</div>
                  <div className='text-14px text-t-primary font-medium'>http://127.0.0.1:{status.port}</div>
                </div>
                <Tooltip content={t('settings.cdp.openInBrowser')}>
                  <Button type='text' size='small' icon={<Link theme='outline' size='16' />} onClick={openCdpUrl} />
                </Tooltip>
                <Tooltip content={t('common.copy')}>
                  <Button type='text' size='small' icon={<Copy theme='outline' size='16' />} onClick={copyCdpUrl} />
                </Tooltip>
              </div>
              <div className='space-y-4px'>
                <div className='text-12px text-t-tertiary mb-4px'>{t('settings.cdp.mcpConfig')}</div>
                <Collapse
                  bordered={false}
                  onChange={(_, keys) => setExpandedMcpKeys(keys as string[])}
                  className='[&_.arco-collapse-item]:!border-none [&_.arco-collapse-item]:bg-[var(--fill-1)] [&_.arco-collapse-item]:rounded-8px [&_.arco-collapse-item]:mb-6px [&_.arco-collapse-item-header]:!px-12px [&_.arco-collapse-item-header]:!py-8px [&_.arco-collapse-item-header-title]:!flex-1 [&_.arco-collapse-item-content-box]:!px-12px [&_.arco-collapse-item-content-box]:!pt-0 [&_.arco-collapse-item-content-box]:!pb-8px'
                >
                  <Collapse.Item
                    name='chrome-devtools'
                    showExpandIcon={false}
                    header={
                      <div className='flex flex-1 items-center justify-between gap-8px'>
                        <div className='flex-1 min-w-0'>
                          <div className='text-13px text-t-primary font-medium'>chrome-devtools</div>
                          <div className='text-11px text-t-tertiary truncate'>{t('settings.cdp.mcpConfigHint')}</div>
                        </div>
                        <Tooltip content={t('settings.cdp.copyMcpConfig')}>
                          <Button
                            type='text'
                            size='small'
                            icon={<Copy theme='outline' size='16' />}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyMcpConfig();
                            }}
                          />
                        </Tooltip>
                        <Down
                          size='14'
                          className={`text-t-tertiary shrink-0 transition-transform duration-200 ${expandedMcpKeys.includes('chrome-devtools') ? 'rotate-180' : ''}`}
                        />
                      </div>
                    }
                  >
                    <pre className='text-11px text-t-secondary font-mono overflow-x-auto whitespace-pre-wrap break-all m-0 leading-relaxed py-4px px-8px bg-[var(--fill-2)] rounded-6px'>
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
                  </Collapse.Item>
                  <Collapse.Item
                    name='playwright'
                    showExpandIcon={false}
                    header={
                      <div className='flex flex-1 items-center justify-between gap-8px'>
                        <div className='flex-1 min-w-0'>
                          <div className='text-13px text-t-primary font-medium'>playwright</div>
                          <div className='text-11px text-t-tertiary truncate'>
                            {t('settings.cdp.playwrightMcpConfigHint')}
                          </div>
                        </div>
                        <Tooltip content={t('settings.cdp.copyMcpConfig')}>
                          <Button
                            type='text'
                            size='small'
                            icon={<Copy theme='outline' size='16' />}
                            onClick={(e) => {
                              e.stopPropagation();
                              copyPlaywrightMcpConfig();
                            }}
                          />
                        </Tooltip>
                        <Down
                          size='14'
                          className={`text-t-tertiary shrink-0 transition-transform duration-200 ${expandedMcpKeys.includes('playwright') ? 'rotate-180' : ''}`}
                        />
                      </div>
                    }
                  >
                    <pre className='text-11px text-t-secondary font-mono overflow-x-auto whitespace-pre-wrap break-all m-0 leading-relaxed py-4px px-8px bg-[var(--fill-2)] rounded-6px'>
                      {`{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--cdp-endpoint",
        "http://127.0.0.1:${status.port}"
      ]
    }
  }
}`}
                    </pre>
                  </Collapse.Item>
                </Collapse>
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
    </div>
  );
};

export default DevSettings;
