/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { WEBUI_DEFAULT_PORT } from '@/common/config/constants';
import { shell, webui, type IWebUIStatus } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useTalkToButler } from '@/renderer/hooks/assistant/useTalkToButler';
import ChannelDingTalkLogo from '@/renderer/assets/channel-logos/dingtalk.svg';
import ChannelDiscordLogo from '@/renderer/assets/channel-logos/discord.svg';
import ChannelLarkLogo from '@/renderer/assets/channel-logos/lark.svg';
import ChannelSlackLogo from '@/renderer/assets/channel-logos/slack.svg';
import ChannelTelegramLogo from '@/renderer/assets/channel-logos/telegram.svg';
import ChannelWecomLogo from '@/renderer/assets/channel-logos/wecom.svg';
import ChannelWeixinLogo from '@/renderer/assets/channel-logos/weixin.svg';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Message, Switch, Tabs, Tooltip } from '@arco-design/web-react';
import { CheckOne, Communication, Copy, Earth } from '@icon-park/react';
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../settingsViewContext';

/**
 * 偏好设置行组件
 * Preference row component
 */
const PreferenceRow: React.FC<{
  label: string;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, description, extra, children }) => (
  <div className='flex items-center justify-between gap-12px py-12px'>
    <div className='min-w-0 flex-1'>
      <div className='flex items-center gap-8px'>
        <span className='text-14px text-t-primary'>{label}</span>
        {extra}
      </div>
      {description && <div className='text-12px text-t-tertiary mt-2px'>{description}</div>}
    </div>
    <div className='flex items-center shrink-0'>{children}</div>
  </div>
);

const CHANNEL_LOGOS = [
  { src: ChannelTelegramLogo, alt: 'Telegram' },
  { src: ChannelLarkLogo, alt: 'Lark' },
  { src: ChannelDingTalkLogo, alt: 'DingTalk' },
  { src: ChannelWeixinLogo, alt: 'WeChat' },
  { src: ChannelWecomLogo, alt: 'WeCom' },
  { src: ChannelSlackLogo, alt: 'Slack' },
  { src: ChannelDiscordLogo, alt: 'Discord' },
] as const;

const ChannelModalContentLazy = React.lazy(() => import('./channels/ChannelModalContent'));

const DESKTOP_WEBUI_ENABLED_KEY = 'webui.desktop.enabled';
const DESKTOP_WEBUI_ALLOW_REMOTE_KEY = 'webui.desktop.allowRemote';

/**
 * WebUI 设置内容组件
 * WebUI settings content component
 */
const WebuiModalContent: React.FC = () => {
  const { t } = useTranslation();
  const talkToButler = useTalkToButler();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const [activeTab, setActiveTab] = useState<'webui' | 'channels'>('webui');

  // 检测是否在 Electron 桌面环境 / Check if running in Electron desktop environment
  const isDesktop = isElectronDesktop();

  const [status, setStatus] = useState<IWebUIStatus | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const port = WEBUI_DEFAULT_PORT;
  const [webuiEnabled, setWebuiEnabled] = useState(false);
  const [allowRemotePreference, setAllowRemotePreference] = useState(false);
  const [cachedIP, setCachedIP] = useState<string | null>(null);

  // 加载状态 / Load status
  const loadStatus = useCallback(async () => {
    try {
      const savedAllowRemote = configService.get(DESKTOP_WEBUI_ALLOW_REMOTE_KEY) ?? false;
      setAllowRemotePreference(savedAllowRemote === true);

      // getStatus goes via IPC to the Electron main process which tracks the
      // WebUI lifecycle; backend does not know it's being wrapped.
      const statusData: IWebUIStatus | null = await webui.getStatus.invoke();

      if (statusData) {
        setStatus(statusData);
        // Switch must track the *real* server state, not the persisted
        // preference. Reading `webui.desktop.enabled` from config and using it
        // as the Switch's checked value used to make the Switch look "on" when
        // the main-process auto-restore silently failed (port conflict, etc.),
        // so users clicked the saved URL and got a white screen because 25808
        // was empty. The main process is the sole writer of this key — the
        // start/stop IPC providers and restoreDesktopWebUIFromPreferences own
        // reconciliation, so the renderer only reads `running` and never
        // writes the flag back.
        setWebuiEnabled(statusData.running);

        if (statusData.lanIP) {
          setCachedIP(statusData.lanIP);
        } else if (statusData.networkUrl) {
          const match = statusData.networkUrl.match(/http:\/\/([^:]+):/);
          if (match) {
            setCachedIP(match[1]);
          }
        }
      } else {
        // getStatus failed — fall back to treating server as stopped rather
        // than believing a possibly-stale config flag.
        setWebuiEnabled(false);
        setStatus(
          (prev) =>
            prev || {
              running: false,
              port: WEBUI_DEFAULT_PORT,
              allowRemote: false,
              localUrl: `http://localhost:${WEBUI_DEFAULT_PORT}`,
              adminUsername: 'admin',
            }
        );
      }
    } catch (error) {
      console.error('[WebuiModal] Failed to load WebUI status:', error);
      setWebuiEnabled(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // 监听状态变更事件 / Listen to status change events
  useEffect(() => {
    const unsubscribe = webui.statusChanged.on((data) => {
      // Keep the Switch checkbox in lock-step with the actual server state so
      // a main-process auto-restore (or external stop) is reflected in the UI
      // without a page reload.
      setWebuiEnabled(data.running === true);
      if (data.running) {
        setStatus((prev) => ({
          ...(prev || { adminUsername: 'admin' }),
          running: true,
          port: data.port ?? prev?.port ?? WEBUI_DEFAULT_PORT,
          allowRemote: prev?.allowRemote ?? false,
          localUrl: data.localUrl ?? `http://localhost:${data.port ?? WEBUI_DEFAULT_PORT}`,
          networkUrl: data.networkUrl,
          lanIP: prev?.lanIP,
          initialPassword: prev?.initialPassword,
        }));
        if (data.networkUrl) {
          const match = data.networkUrl.match(/http:\/\/([^:]+):/);
          if (match) setCachedIP(match[1]);
        }
      } else {
        setStatus((prev) => (prev ? { ...prev, running: false } : null));
      }
    });
    return () => unsubscribe();
  }, []);

  // 获取当前 IP 地址 / Get current IP
  const getLocalIP = useCallback(() => {
    if (status?.lanIP) return status.lanIP;
    if (cachedIP) return cachedIP;
    if (status?.networkUrl) {
      const match = status.networkUrl.match(/http:\/\/([^:]+):/);
      if (match) return match[1];
    }
    return null;
  }, [status?.lanIP, cachedIP, status?.networkUrl]);

  // 获取显示的 URL / Get display URL
  const getDisplayUrl = useCallback(() => {
    const currentIP = getLocalIP();
    const currentPort = status?.port || port;
    const useRemote = status?.running ? status.allowRemote : allowRemotePreference;
    if (useRemote && currentIP) {
      return `http://${currentIP}:${currentPort}`;
    }
    return `http://localhost:${currentPort}`;
  }, [allowRemotePreference, getLocalIP, status?.allowRemote, status?.port, status?.running, port]);

  // 启动/停止 WebUI / Start/Stop WebUI
  const handleToggle = async (enabled: boolean) => {
    // 使用缓存的 IP，不再阻塞获取 / Use cached IP, no longer block to fetch
    const currentIP = getLocalIP();

    // 保存原始值用于回滚 / Save original value for rollback
    const previousEnabled = webuiEnabled;

    // 立即显示 loading / Immediately show loading
    setStartLoading(true);
    setWebuiEnabled(enabled);

    try {
      if (enabled) {
        const localUrl = `http://localhost:${port}`;

        // Await the real result — Promise.race with a 3s fallback used to hide
        // backend failures behind a fake "started" toast while the server was
        // still RESOLVING or had crashed, leaving webui.desktop.enabled unset.
        const startResult = await webui.start.invoke({ port, allowRemote: allowRemotePreference });

        const responseIP = startResult.lanIP || currentIP;
        if (responseIP) setCachedIP(responseIP);

        setStatus((prev) => ({
          ...(prev || { adminUsername: 'admin' }),
          running: true,
          port,
          allowRemote: allowRemotePreference,
          localUrl,
          networkUrl: allowRemotePreference && responseIP ? `http://${responseIP}:${port}` : undefined,
          lanIP: responseIP,
        }));

        await configService.set(DESKTOP_WEBUI_ENABLED_KEY, true);
        Message.success(t('settings.webui.startSuccess'));
      } else {
        // 立即更新UI，异步停止服务器 / Update UI immediately, stop server async
        setStatus((prev) => (prev ? { ...prev, running: false } : null));
        await configService.set(DESKTOP_WEBUI_ENABLED_KEY, false);
        Message.success(t('settings.webui.stopSuccess'));
        webui.stop.invoke().catch((err) => console.error('WebUI stop error:', err));
      }
    } catch (error) {
      // 回滚 UI 状态 / Rollback UI state
      setWebuiEnabled(previousEnabled);
      console.error('Toggle WebUI error:', error);
      Message.error(t('settings.webui.operationFailed'));
    } finally {
      setStartLoading(false);
    }
  };

  // 处理允许远程访问切换 / Handle allow remote toggle
  // 需要重启服务器才能更改绑定地址 / Need to restart server to change binding address
  const handleAllowRemoteChange = async (checked: boolean) => {
    // 保存原始值用于回滚 / Save original value for rollback
    const previousAllowRemote = allowRemotePreference;
    setAllowRemotePreference(checked);

    const wasRunning = status?.running;

    // 如果服务器正在运行，需要重启以应用新的绑定设置
    // If server is running, need to restart to apply new binding settings
    if (wasRunning) {
      setStartLoading(true);
      try {
        // 1. 先停止服务器 / First stop the server
        try {
          await Promise.race([webui.stop.invoke(), new Promise((resolve) => setTimeout(resolve, 1500))]);
        } catch (err) {
          console.error('WebUI stop error:', err);
        }

        // Await the real result — a 3s race fallback used to mask backend
        // failures as success (see handleToggle).
        const startResult = await webui.start.invoke({ port, allowRemote: checked });

        const responseIP = startResult.lanIP;
        if (responseIP) setCachedIP(responseIP);

        setStatus((prev) => ({
          ...(prev || { adminUsername: 'admin' }),
          running: true,
          port,
          allowRemote: checked,
          localUrl: `http://localhost:${port}`,
          networkUrl: checked && responseIP ? `http://${responseIP}:${port}` : undefined,
          lanIP: responseIP,
        }));

        await configService.set(DESKTOP_WEBUI_ALLOW_REMOTE_KEY, checked);
        Message.success(t('settings.webui.restartSuccess'));
      } catch (error) {
        // 回滚 UI 状态 / Rollback UI state
        setAllowRemotePreference(previousAllowRemote);
        console.error('[WebuiModal] Restart error:', error);
        Message.error(t('settings.webui.operationFailed'));
      } finally {
        setStartLoading(false);
      }
    } else {
      // 服务器未运行，直接持久化 / Server not running, persist directly
      try {
        await configService.set(DESKTOP_WEBUI_ALLOW_REMOTE_KEY, checked);

        // 获取 IP 用于显示 / Get IP for display
        let newIP: string | undefined;
        try {
          const snapshot = await webui.getStatus.invoke();
          if (snapshot?.lanIP) {
            newIP = snapshot.lanIP;
            setCachedIP(newIP);
          }
        } catch {
          // ignore
        }

        const existingIP = newIP || cachedIP || status?.lanIP;
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                allowRemote: checked,
                lanIP: existingIP || prev.lanIP,
                networkUrl: checked && existingIP ? `http://${existingIP}:${port}` : undefined,
              }
            : null
        );
      } catch (error) {
        // 回滚 UI 状态 / Rollback UI state
        setAllowRemotePreference(previousAllowRemote);
        console.error('[WebuiModal] Failed to persist allowRemote:', error);
        Message.error(t('settings.webui.operationFailed'));
      }
    }
  };

  // 复制内容 / Copy content
  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success(t('common.copySuccess'));
  };

  // 浏览器端只显示 Channels 配置，不显示 WebUI 服务配置 / In browser mode, only show Channels config, not WebUI service config
  if (!isDesktop) {
    return (
      <div className='flex flex-col h-full w-full'>
        <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
          <div className='space-y-16px'>
            <h2 className='text-20px font-500 text-t-primary m-0'>Channels</h2>
            <Suspense fallback={<div className='text-13px text-t-secondary'>{t('common.loading')}</div>}>
              <ChannelModalContentLazy />
            </Suspense>
          </div>
        </AionScrollArea>
      </div>
    );
  }

  const webuiPanel = (
    <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
      <div className='space-y-12px px-[12px] md:px-[28px]'>
        {/* 标题 / Title */}
        <h2 className='text-20px font-500 text-t-primary m-0'>WebUI</h2>

        {/* 描述说明 / Description */}
        <div className='space-y-6px'>
          <p className='m-0 text-13px text-t-secondary leading-relaxed'>{t('settings.webui.description')}</p>
          <div className='flex flex-wrap gap-x-12px gap-y-6px'>
            {[
              t('settings.webui.enable', { defaultValue: 'Enable WebUI' }),
              t('settings.webui.accessUrl', { defaultValue: 'Access URL' }),
              t('settings.webui.allowRemote', { defaultValue: 'Allow Remote Access' }),
            ].map((stepLabel, idx) => (
              <div key={stepLabel} className='inline-flex items-center gap-6px'>
                <span className='inline-flex items-center justify-center w-16px h-16px rd-50% text-10px font-600 bg-[rgba(var(--primary-6),0.12)] text-[rgb(var(--primary-6))]'>
                  {idx + 1}
                </span>
                <CheckOne theme='outline' size='12' className='text-[rgb(var(--primary-6))]' />
                <span className='text-12px text-t-secondary'>{stepLabel}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Messaging 强引导入口 / Messaging primary entry — disabled, kept for future use
        <div className='rd-12px border border-line bg-2 px-12px py-10px flex items-center justify-between gap-10px'>
            <div className='min-w-0 flex items-center gap-8px'>
              <Communication theme='outline' size='18' className='text-[rgb(var(--primary-6))] shrink-0' />
              <div className='min-w-0'>
                <div className='text-13px text-t-primary font-500'>{t('settings.webui.featureChannelsTitle')}</div>
                <div className='text-12px text-t-secondary truncate'>{t('settings.webui.featureChannelsDesc')}</div>
              </div>
            </div>
            <Button type='primary' size='small' className='rd-100px' onClick={() => setActiveTab('channels')}>
              {t('settings.webui.goToChannels')}
            </Button>
          </div>
        */}

        {/* WebUI 服务卡片 / WebUI Service Card */}
        <div className='px-[12px] md:px-[28px] py-14px bg-2 rd-16px'>
          {/* WebUI 引导提示 / WebUI hint */}
          <div className='mb-8px rd-10px border border-line bg-fill-1 px-10px py-8px flex items-start gap-6px'>
            <Earth theme='outline' size='16' className='mt-1px text-[rgb(var(--primary-6))]' />
            <div className='text-12px text-t-secondary leading-relaxed'>{t('settings.webui.featureRemoteDesc')}</div>
          </div>

          {/* 启用 WebUI / Enable WebUI */}
          <PreferenceRow
            label={t('settings.webui.enable')}
            extra={
              startLoading ? (
                <span className='text-12px text-warning'>{t('settings.webui.starting')}</span>
              ) : status?.running ? (
                <span className='text-12px text-success'>✓ {t('settings.webui.running')}</span>
              ) : null
            }
          >
            <Switch checked={webuiEnabled} loading={startLoading} onChange={handleToggle} />
          </PreferenceRow>

          {/* 访问地址（启用 WebUI 后即显示，不依赖后端 running 状态）/ Access URL (shown whenever WebUI is enabled, not tied to backend running state) */}
          {webuiEnabled && (
            <PreferenceRow label={t('settings.webui.accessUrl')}>
              <div className='flex items-center gap-8px min-w-0'>
                <button
                  className='text-14px text-primary font-mono hover:underline cursor-pointer bg-transparent border-none p-0 truncate'
                  onClick={() => shell.openExternal.invoke(getDisplayUrl()).catch(console.error)}
                >
                  {getDisplayUrl()}
                </button>
                <Tooltip content={t('common.copy')}>
                  <button
                    className='p-4px text-t-tertiary hover:text-t-primary cursor-pointer bg-transparent border-none'
                    onClick={() => handleCopy(getDisplayUrl())}
                  >
                    <Copy size={16} />
                  </button>
                </Tooltip>
              </div>
            </PreferenceRow>
          )}

          {/* 允许局域网访问 / Allow LAN Access */}
          <PreferenceRow
            label={t('settings.webui.allowRemote')}
            description={
              <span className='text-t-secondary'>
                {t('settings.webui.allowRemoteDesc')}
                {'  '}
                <button
                  className='text-primary hover:underline cursor-pointer bg-transparent border-none p-0 text-12px'
                  onClick={() =>
                    void talkToButler({
                      prompt: t('settings.talkToButler.prompt.setupRemote', {
                        defaultValue:
                          'Help me set up remote access so I can open AionUi from my phone or over the internet.',
                      }),
                    })
                  }
                >
                  {t('settings.webui.letButlerSetup', { defaultValue: 'Let the butler set it up' })}
                </button>
              </span>
            }
          >
            <Switch checked={allowRemotePreference} onChange={handleAllowRemoteChange} />
          </PreferenceRow>
        </div>
      </div>
    </AionScrollArea>
  );

  return (
    <div className='flex flex-col h-full w-full'>
      <Tabs
        activeTab={activeTab}
        onChange={(key) => setActiveTab((key as 'webui' | 'channels') || 'webui')}
        type='line'
        className='mb-12px settings-remote-tabs'
      >
        <Tabs.TabPane
          key='webui'
          title={
            <span
              data-webui-tab='webui'
              className={`inline-flex items-center gap-6px transition-colors ${activeTab === 'webui' ? 'text-t-primary font-600' : 'text-t-secondary'}`}
            >
              <Earth theme='outline' size='15' />
              <span>WebUI</span>
            </span>
          }
        />
        <Tabs.TabPane
          key='channels'
          title={
            <span
              data-webui-tab='channels'
              className={`inline-flex items-center gap-6px transition-colors ${activeTab === 'channels' ? 'text-t-primary font-600' : 'text-t-secondary'}`}
            >
              <Communication theme='outline' size='15' />
              <span>Channels</span>
              <span className='inline-flex items-center gap-4px ml-2px'>
                {CHANNEL_LOGOS.map((item) => (
                  <span
                    key={item.alt}
                    className='inline-flex items-center justify-center w-16px h-16px rd-50% border border-line bg-fill-1'
                    title={item.alt}
                    aria-label={item.alt}
                  >
                    <img src={item.src} alt={item.alt} className='w-14px h-14px object-contain' />
                  </span>
                ))}
              </span>
            </span>
          }
        />
      </Tabs>

      {activeTab === 'webui' ? (
        webuiPanel
      ) : (
        <div className='flex-1 min-h-0'>
          <Suspense
            fallback={<div className='px-[12px] md:px-[28px] text-13px text-t-secondary'>{t('common.loading')}</div>}
          >
            <ChannelModalContentLazy />
          </Suspense>
        </div>
      )}
    </div>
  );
};

export default WebuiModalContent;
