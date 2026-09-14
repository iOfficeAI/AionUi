/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Message, Popover, Spin } from '@arco-design/web-react';
import { CheckOne } from '@icon-park/react';
import { QRCodeSVG } from 'qrcode.react';
import classNames from 'classnames';
import type { IChannelPluginStatus } from '@/common/types/channel/channel';
import { channel } from '@/common/adapter/ipcBridge';
import { getBaseUrl } from '@/common/adapter/httpBridge';
import WeixinLogo from '@/renderer/assets/channel-logos/weixin.svg';
import siderStyles from './Sider.module.css';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned';

interface WeixinConnectButtonProps {
  collapsed?: boolean;
  isMobile?: boolean;
}

/**
 * 微信连接入口（侧边栏底部账户卡片右侧）
 *
 * 点击弹出气泡：未连接时展示扫码登录（复用渠道插件的 EventSource 登录流），
 * 连接后显示状态与断开入口。连接状态实时跟随 `pluginStatusChanged` 事件，
 * 与设置页中的微信渠道配置互通。
 */
const WeixinConnectButton: React.FC<WeixinConnectButtonProps> = ({ collapsed = false, isMobile = false }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pluginStatus, setPluginStatus] = useState<IChannelPluginStatus | null>(null);
  const [loginState, setLoginState] = useState<LoginState>('idle');
  // In Electron mode this holds a base64 data URL; in WebUI mode it holds the raw QR ticket string.
  const [qrcodeDataUrl, setQrcodeDataUrl] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isConnected = Boolean(pluginStatus?.hasToken && pluginStatus?.enabled);

  // Load current weixin plugin status on mount.
  useEffect(() => {
    const load = async () => {
      try {
        const plugins = await channel.getPluginStatus.invoke();
        if (plugins) {
          setPluginStatus(plugins.find((p) => p.type === 'weixin') ?? null);
        }
      } catch (error) {
        console.error('[WeixinConnect] Failed to load plugin status:', error);
      }
    };
    void load();
  }, []);

  // Track external status changes (e.g. connect/disconnect from the settings page).
  useEffect(() => {
    const unsubscribe = channel.pluginStatusChanged.on(({ status }) => {
      if (status.type !== 'weixin') return;
      setPluginStatus(status);
      if (!(status.hasToken && status.enabled)) {
        setLoginState('idle');
        setQrcodeDataUrl(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Close EventSource on unmount to prevent connection leaks.
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  const stopLoginStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const enableWeixinPlugin = useCallback(
    async (accountId: string, botToken: string) => {
      await channel.enablePlugin.invoke({
        plugin_id: 'weixin',
        config: { credentials: { account_id: accountId, bot_token: botToken } },
      });
      Message.success(t('settings.weixin.pluginEnabled', 'WeChat channel enabled'));
      const plugins = await channel.getPluginStatus.invoke();
      if (plugins) {
        setPluginStatus(plugins.find((p) => p.type === 'weixin') ?? null);
      }
      setLoginState('idle');
      setQrcodeDataUrl(null);
    },
    [t]
  );

  const handleLogin = useCallback(() => {
    setLoginState('loading_qr');
    setQrcodeDataUrl(null);

    const es = new EventSource(`${getBaseUrl()}/api/channel/weixin/login`);
    eventSourceRef.current = es;

    es.addEventListener('qr', (e: MessageEvent) => {
      const { qrcodeData } = JSON.parse(e.data) as { qrcodeData: string };
      setQrcodeDataUrl(qrcodeData);
      setLoginState('showing_qr');
    });

    es.addEventListener('scanned', () => {
      setLoginState('scanned');
    });

    es.addEventListener('done', (e: MessageEvent) => {
      es.close();
      const { accountId, botToken } = JSON.parse(e.data) as { accountId: string; botToken: string };
      enableWeixinPlugin(accountId, botToken).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        Message.error(msg || t('settings.weixin.enableFailed', 'Failed to enable WeChat plugin'));
        setLoginState('idle');
        setQrcodeDataUrl(null);
      });
    });

    es.addEventListener('error', (e: MessageEvent) => {
      es.close();
      const msg = e.data ? ((JSON.parse(e.data) as { message?: string }).message ?? '') : '';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('too many')) {
        Message.warning(t('settings.weixin.loginExpired', 'QR code expired, please try again'));
      } else {
        Message.error(t('settings.weixin.loginError', 'WeChat login failed'));
      }
      setLoginState('idle');
      setQrcodeDataUrl(null);
    });

    es.addEventListener('error', () => {
      es.close();
      setLoginState('idle');
      setQrcodeDataUrl(null);
    });
  }, [enableWeixinPlugin, t]);

  const handleDisconnect = useCallback(async () => {
    try {
      await channel.disablePlugin.invoke({ plugin_id: 'weixin' });
      Message.success(t('settings.weixin.pluginDisabled', 'WeChat channel disabled'));
      setPluginStatus(null);
      setLoginState('idle');
      setQrcodeDataUrl(null);
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    }
  }, [t]);

  // Closing the popover aborts an in-flight login stream.
  const handleVisibleChange = (visible: boolean) => {
    setOpen(visible);
    if (!visible) {
      stopLoginStream();
      setLoginState('idle');
      setQrcodeDataUrl(null);
    }
  };

  const renderHeader = () => (
    <div className={siderStyles.wechatHeader}>
      <img src={WeixinLogo} alt='WeChat' className={siderStyles.wechatHeaderIcon} />
      <div className={siderStyles.wechatTitleBlock}>
        <span className={siderStyles.wechatTitle}>{t('settings.weixin.connectTitle', 'WeChat Connect')}</span>
        {isConnected ? (
          <span className={siderStyles.wechatStatusLine}>
            <CheckOne theme='filled' size={12} className={siderStyles.wechatConnectedIcon} />
            {t('settings.weixin.connected', 'Connected')}
            {pluginStatus?.botUsername && <span className={siderStyles.wechatBotName}>({pluginStatus.botUsername})</span>}
          </span>
        ) : (
          <span className={classNames(siderStyles.wechatStatusLine, siderStyles.wechatStatusLineOffline)}>
            {t('settings.weixin.notConnected', 'Not connected')}
          </span>
        )}
      </div>
    </div>
  );

  const renderContent = () => {
    if (loginState === 'showing_qr' || loginState === 'scanned') {
      return (
        <div className={siderStyles.wechatPopoverBody}>
          <div className={siderStyles.wechatQrFrame}>
            {qrcodeDataUrl && <QRCodeSVG value={qrcodeDataUrl} size={148} />}
          </div>
          {loginState === 'scanned' ? (
            <div className={siderStyles.wechatQrTip}>
              <Spin size={14} />
              <span>{t('settings.weixin.scanned', 'Scanned, waiting for confirmation...')}</span>
            </div>
          ) : (
            <div className={siderStyles.wechatQrTip}>{t('settings.weixin.scanPrompt', 'Please scan the QR code with WeChat')}</div>
          )}
        </div>
      );
    }

    if (loginState === 'loading_qr') {
      return (
        <div className={siderStyles.wechatPopoverBody}>
          <div className={siderStyles.wechatQrFrame}>
            <Spin size={28} />
          </div>
        </div>
      );
    }

    if (isConnected) {
      return (
        <div className={siderStyles.wechatPopoverBody}>
          {renderHeader()}
          <p className={siderStyles.wechatHint}>{t('settings.weixin.step1', 'Find and send a message to your bot in WeChat')}</p>
          <Button
            size='small'
            status='danger'
            onClick={() => {
              void handleDisconnect();
            }}
          >
            {t('settings.weixin.disconnect', 'Disconnect')}
          </Button>
        </div>
      );
    }

    // idle
    return (
      <div className={siderStyles.wechatPopoverBody}>
        {renderHeader()}
        <p className={siderStyles.wechatHint}>{t('settings.weixin.connectDesc', 'Scan the QR code to chat with AIbang via WeChat')}</p>
        <Button
          type='primary'
          size='small'
          onClick={() => {
            handleLogin();
          }}
        >
          {t('settings.weixin.loginButton', 'Scan to Login')}
        </Button>
      </div>
    );
  };

  return (
    <Popover
      content={<div className={siderStyles.wechatPopoverContent}>{renderContent()}</div>}
      trigger='click'
      position='tr'
      triggerProps={{ popupAlign: { top: 6 } }}
      unmountOnExit
      popupVisible={open}
      onVisibleChange={handleVisibleChange}
      className={siderStyles.accountPopover}
    >
      <button
        type='button'
        data-testid='sider-weixin-connect-trigger'
        aria-haspopup='dialog'
        aria-expanded={open}
        title={t('settings.weixin.connectTitle', 'WeChat Connect')}
        onClick={() => {
          if (!open) setOpen(true);
        }}
        className={classNames(siderStyles.wechatTrigger, collapsed && 'w-full', isMobile && 'sider-footer-btn-mobile')}
      >
        <span className={siderStyles.wechatIconWrap}>
          <img src={WeixinLogo} alt='' aria-hidden='true' className={siderStyles.wechatIcon} />
          {isConnected && <span className={siderStyles.wechatStatusDot} />}
        </span>
      </button>
    </Popover>
  );
};

export default WeixinConnectButton;
