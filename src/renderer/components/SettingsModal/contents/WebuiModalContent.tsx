/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Input, Form, Message, Tooltip } from '@arco-design/web-react';
import { Copy, Refresh } from '@icon-park/react';
import { webui, shell, type IWebUIStatus } from '@/common/ipcBridge';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AionModal from '@/renderer/components/base/AionModal';
import { useSettingsViewMode } from '../settingsViewContext';
import { isElectronDesktop } from '@/renderer/utils/platform';

/**
 * 偏好设置行组件
 * Preference row component
 */
const PreferenceRow: React.FC<{ label: string; description?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }> = ({ label, description, extra, children }) => (
  <div className='flex items-center justify-between gap-24px py-12px'>
    <div className='flex-1'>
      <div className='flex items-center gap-8px'>
        <span className='text-14px text-t-primary'>{label}</span>
        {extra}
      </div>
      {description && <div className='text-12px text-t-tertiary mt-2px'>{description}</div>}
    </div>
    <div className='flex items-center'>{children}</div>
  </div>
);

/**
 * 信息行组件（用于登录信息展示）
 * Info row component (for login info display)
 */
const InfoRow: React.FC<{ label: string; value: string; onCopy?: () => void; showCopy?: boolean }> = ({ label, value, onCopy, showCopy = true }) => (
  <div className='flex items-center justify-between py-12px'>
    <span className='text-14px text-t-secondary'>{label}</span>
    <div className='flex items-center gap-8px'>
      <span className='text-14px text-t-primary'>{value}</span>
      {showCopy && onCopy && (
        <Tooltip content='复制'>
          <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={onCopy}>
            <Copy size={16} />
          </button>
        </Tooltip>
      )}
    </div>
  </div>
);

/**
 * WebUI 设置内容组件
 * WebUI settings content component
 */
const WebuiModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  // 检测是否在 Electron 桌面环境 / Check if running in Electron desktop environment
  const isDesktop = isElectronDesktop();

  const [status, setStatus] = useState<IWebUIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [port] = useState(25808);
  const [allowRemote, setAllowRemote] = useState(false);
  const [cachedIP, setCachedIP] = useState<string | null>(null);
  const [cachedPassword, setCachedPassword] = useState<string | null>(null);
  // 标记密码是否可以明文显示（首次启动且未复制过）/ Flag for plaintext password display (first startup and not copied)
  const [canShowPlainPassword, setCanShowPlainPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  // 设置新密码弹窗 / Set new password modal
  const [setPasswordModalVisible, setSetPasswordModalVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [form] = Form.useForm();

  // 加载状态 / Load status
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      let result: { success: boolean; data?: IWebUIStatus } | null = null;

      // 优先使用直接 IPC（Electron 环境）/ Prefer direct IPC (Electron environment)
      if (window.electronAPI?.webuiGetStatus) {
        result = await window.electronAPI.webuiGetStatus();
      } else {
        // 后备方案：使用 bridge / Fallback: use bridge
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
        result = await Promise.race([webui.getStatus.invoke(), timeoutPromise]);
      }

      if (result && result.success && result.data) {
        setStatus(result.data);
        setAllowRemote(result.data.allowRemote);
        if (result.data.lanIP) {
          setCachedIP(result.data.lanIP);
        } else if (result.data.networkUrl) {
          const match = result.data.networkUrl.match(/http:\/\/([^:]+):/);
          if (match) {
            setCachedIP(match[1]);
          }
        }
        if (result.data.initialPassword) {
          setCachedPassword(result.data.initialPassword);
          // 有初始密码说明可以显示明文 / Having initial password means can show plaintext
          setCanShowPlainPassword(true);
        }
        // 注意：如果 running 但没有密码，会在下面的 useEffect 中自动重置
        // Note: If running but no password, auto-reset will be triggered in the useEffect below
      } else {
        setStatus(
          (prev) =>
            prev || {
              running: false,
              port: 25808,
              allowRemote: false,
              localUrl: 'http://localhost:25808',
              adminUsername: 'admin',
            }
        );
      }
    } catch (error) {
      console.error('[WebuiModal] Failed to load WebUI status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // 监听状态变更事件 / Listen to status change events
  useEffect(() => {
    const unsubscribe = webui.statusChanged.on((data) => {
      if (data.running) {
        setStatus((prev) => ({
          ...(prev || { adminUsername: 'admin' }),
          running: true,
          port: data.port ?? prev?.port ?? 25808,
          allowRemote: prev?.allowRemote ?? false,
          localUrl: data.localUrl ?? `http://localhost:${data.port ?? 25808}`,
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

  // 监听密码重置结果事件（Web 环境后备）/ Listen to password reset result events (Web environment fallback)
  useEffect(() => {
    const unsubscribe = webui.resetPasswordResult.on((data) => {
      if (data.success && data.newPassword) {
        setCachedPassword(data.newPassword);
        setStatus((prev) => (prev ? { ...prev, initialPassword: data.newPassword } : null));
        setCanShowPlainPassword(true);
      }
      setResetLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 注意：不再自动重置密码，用户已有密码存储在数据库中
  // Note: No longer auto-reset password, user already has password stored in database
  // 如果用户忘记密码，可以手动点击重置按钮
  // If user forgets password, they can manually click reset button
  useEffect(() => {
    // 仅在组件首次加载且没有显示过密码时，标记为密文状态
    // Only when component first loads and password hasn't been shown, mark as hidden
    if (status?.running && !status?.initialPassword && !cachedPassword && !loading) {
      // 不自动重置，只是确保密码显示为 ******
      // Don't auto-reset, just ensure password shows as ******
      setCanShowPlainPassword(false);
    }
  }, [status?.running, status?.initialPassword, cachedPassword, loading]);

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
    if (allowRemote && currentIP) {
      return `http://${currentIP}:${currentPort}`;
    }
    return `http://localhost:${currentPort}`;
  }, [allowRemote, getLocalIP, status?.port, port]);

  // 启动/停止 WebUI / Start/Stop WebUI
  const handleToggle = async (enabled: boolean) => {
    // 先获取 IP（如果没有缓存且要启动）/ First get IP (if not cached and starting)
    let currentIP = getLocalIP();
    if (enabled && !currentIP) {
      try {
        const statusResult = await Promise.race([webui.getStatus.invoke(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000))]);
        if (statusResult?.success && statusResult.data?.lanIP) {
          currentIP = statusResult.data.lanIP;
          setCachedIP(statusResult.data.lanIP);
        }
      } catch {
        // 忽略错误，继续使用 localhost / Ignore error, continue with localhost
      }
    }

    // 立即显示 loading 和 URL / Immediately show loading and URL
    setStartLoading(true);

    try {
      if (enabled) {
        const localUrl = `http://localhost:${port}`;

        const startResult = await Promise.race([webui.start.invoke({ port, allowRemote }), new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))]);

        if (startResult && startResult.success && startResult.data) {
          const responseIP = startResult.data.lanIP || currentIP;
          const responsePassword = startResult.data.initialPassword;

          if (responseIP) setCachedIP(responseIP);
          if (responsePassword) setCachedPassword(responsePassword);

          setStatus((prev) => ({
            ...(prev || { adminUsername: 'admin' }),
            running: true,
            port,
            allowRemote,
            localUrl,
            networkUrl: allowRemote && responseIP ? `http://${responseIP}:${port}` : undefined,
            lanIP: responseIP,
            initialPassword: responsePassword || cachedPassword || prev?.initialPassword,
          }));
        } else {
          setStatus((prev) => ({
            ...(prev || { adminUsername: 'admin' }),
            running: true,
            port,
            allowRemote,
            localUrl,
            lanIP: currentIP || prev?.lanIP,
            networkUrl: allowRemote && currentIP ? `http://${currentIP}:${port}` : undefined,
            initialPassword: cachedPassword || prev?.initialPassword,
          }));
        }

        Message.success(t('settings.webui.startSuccess'));

        // 延迟获取状态 / Delayed status fetch
        const fetchStatusWithRetry = async (retries = 3, delay = 2000) => {
          try {
            const result = await Promise.race([webui.getStatus.invoke(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);
            if (result && result.success && result.data) {
              if (result.data.lanIP) setCachedIP(result.data.lanIP);
              if (result.data.initialPassword) setCachedPassword(result.data.initialPassword);
              setStatus(result.data);
              return;
            }
            if (retries > 0) setTimeout(() => fetchStatusWithRetry(retries - 1, delay + 1000), delay);
          } catch {
            if (retries > 0) setTimeout(() => fetchStatusWithRetry(retries - 1, delay + 1000), delay);
          }
        };
        setTimeout(() => fetchStatusWithRetry(), 2000);
      } else {
        webui.stop.invoke().catch((err) => console.error('WebUI stop error:', err));
        await new Promise((resolve) => setTimeout(resolve, 500));
        setStatus((prev) => (prev ? { ...prev, running: false } : null));
        Message.success(t('settings.webui.stopSuccess'));
      }
    } catch (error) {
      console.error('Toggle WebUI error:', error);
      Message.error(t('settings.webui.operationFailed'));
    } finally {
      setStartLoading(false);
    }
  };

  // 处理允许远程访问切换 / Handle allow remote toggle
  // 需要重启服务器才能更改绑定地址 / Need to restart server to change binding address
  const handleAllowRemoteChange = async (checked: boolean) => {
    const wasRunning = status?.running;

    // 如果服务器正在运行，需要重启以应用新的绑定设置
    // If server is running, need to restart to apply new binding settings
    if (wasRunning) {
      setStartLoading(true);
      try {
        // 1. 先停止服务器 / First stop the server
        try {
          await Promise.race([webui.stop.invoke(), new Promise((resolve) => setTimeout(resolve, 3000))]);
        } catch (err) {
          console.error('WebUI stop error:', err);
        }
        // 等待服务器完全停止 / Wait for server to fully stop
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 2. 用新设置重新启动 / Restart with new settings
        const startResult = await Promise.race([webui.start.invoke({ port, allowRemote: checked }), new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))]);

        if (startResult && startResult.success && startResult.data) {
          const responseIP = startResult.data.lanIP;
          const responsePassword = startResult.data.initialPassword;

          if (responseIP) setCachedIP(responseIP);
          if (responsePassword) setCachedPassword(responsePassword);

          setAllowRemote(checked);
          setStatus((prev) => ({
            ...(prev || { adminUsername: 'admin' }),
            running: true,
            port,
            allowRemote: checked,
            localUrl: `http://localhost:${port}`,
            networkUrl: checked && responseIP ? `http://${responseIP}:${port}` : undefined,
            lanIP: responseIP,
            initialPassword: responsePassword || cachedPassword || prev?.initialPassword,
          }));

          Message.success(t('settings.webui.restartSuccess'));
        } else {
          // 响应为空或失败，但服务器可能已启动，检查状态
          // Response is null or failed, but server might have started, check status
          await new Promise((resolve) => setTimeout(resolve, 1000));

          let statusResult: { success: boolean; data?: IWebUIStatus } | null = null;
          if (window.electronAPI?.webuiGetStatus) {
            statusResult = await window.electronAPI.webuiGetStatus();
          } else {
            statusResult = await Promise.race([webui.getStatus.invoke(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);
          }

          if (statusResult?.success && statusResult?.data?.running) {
            // 服务器实际上已启动 / Server actually started
            const responseIP = statusResult.data.lanIP;
            if (responseIP) setCachedIP(responseIP);

            setAllowRemote(checked);
            setStatus(statusResult.data);
            Message.success(t('settings.webui.restartSuccess'));
          } else {
            // 真的启动失败 / Really failed to start
            Message.error(t('settings.webui.operationFailed'));
            setStatus((prev) => (prev ? { ...prev, running: false } : null));
          }
        }
      } catch (error) {
        console.error('[WebuiModal] Restart error:', error);
        Message.error(t('settings.webui.operationFailed'));
      } finally {
        setStartLoading(false);
      }
    } else {
      // 服务器未运行，只更新状态 / Server not running, just update state
      setAllowRemote(checked);

      // 获取 IP 用于显示 / Get IP for display
      let newIP: string | undefined;
      try {
        if (window.electronAPI?.webuiGetStatus) {
          const result = await window.electronAPI.webuiGetStatus();
          if (result?.success && result?.data?.lanIP) {
            newIP = result.data.lanIP;
            setCachedIP(newIP);
          }
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
    }
  };

  // 复制内容 / Copy content
  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    Message.success(t('common.copySuccess'));
  };

  // 复制密码（复制后立即变密文）/ Copy password (immediately hide after copying)
  const handleCopyPassword = async () => {
    const password = status?.initialPassword || cachedPassword;
    if (password) {
      void navigator.clipboard.writeText(password);
      Message.success(t('common.copySuccess'));
      // 复制后立即隐藏明文，图标变成重置 / Hide plaintext immediately after copying, icon changes to reset
      setCanShowPlainPassword(false);
    }
  };

  // 打开设置新密码弹窗 / Open set new password modal
  const handleResetPassword = () => {
    form.resetFields();
    setSetPasswordModalVisible(true);
  };

  // 提交新密码 / Submit new password
  const handleSetNewPassword = async () => {
    try {
      const values = await form.validate();
      setPasswordLoading(true);

      let result: { success: boolean; msg?: string };

      // 优先使用直接 IPC（Electron 环境）/ Prefer direct IPC (Electron environment)
      if (window.electronAPI?.webuiChangePassword) {
        result = await window.electronAPI.webuiChangePassword(values.newPassword);
      } else {
        // 后备方案：使用 bridge / Fallback: use bridge
        result = await webui.changePassword.invoke({
          newPassword: values.newPassword,
        });
      }

      if (result.success) {
        Message.success(t('settings.webui.passwordChanged'));
        setSetPasswordModalVisible(false);
        form.resetFields();
        // 更新缓存的密码为新密码，不再显示明文 / Update cached password, no longer show plaintext
        setCachedPassword(values.newPassword);
        setCanShowPlainPassword(false);
        setStatus((prev) => (prev ? { ...prev, initialPassword: undefined } : null));
      } else {
        Message.error(result.msg || t('settings.webui.passwordChangeFailed'));
      }
    } catch (error) {
      console.error('Set new password error:', error);
      Message.error(t('settings.webui.passwordChangeFailed'));
    } finally {
      setPasswordLoading(false);
    }
  };

  // 获取实际密码 / Get actual password
  const actualPassword = status?.initialPassword || cachedPassword;
  // 获取显示的密码 / Get display password
  // 密码默认显示 ***，只在首次启动时显示明文 / Password shows *** by default, only show plaintext on first startup
  // 重置中显示加载状态 / Show loading state when resetting
  const getDisplayPassword = () => {
    if (resetLoading) return t('common.loading');
    // 可以显示明文且有密码时显示明文 / Show plaintext when allowed and has password
    if (canShowPlainPassword && actualPassword) return actualPassword;
    // 否则显示 ****** / Otherwise show ******
    return t('settings.webui.passwordHidden');
  };
  const displayPassword = getDisplayPassword();

  // 浏览器端不显示 WebUI 设置，出于安全考虑 / Don't show WebUI settings in browser for security reasons
  if (!isDesktop) {
    return (
      <div className='flex flex-col h-full w-full'>
        <div className='flex flex-col items-center justify-center h-200px px-32px text-center'>
          <div className='text-16px font-500 text-t-primary mb-8px'>{t('settings.webui.browserNotSupported')}</div>
          <div className='text-14px text-t-secondary'>{t('settings.webui.browserNotSupportedDesc')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col h-full w-full'>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* 标题 / Title */}
          <h2 className='text-20px font-500 text-t-primary m-0'>WebUI</h2>

          {/* 描述说明 / Description */}
          <div className='p-16px bg-fill-2 rd-12px border border-line text-13px text-t-secondary leading-relaxed'>
            <p className='m-0'>{t('settings.webui.description')}</p>
            <p className='m-0 mt-4px'>{t('settings.webui.steps')}</p>
          </div>

          {/* WebUI 服务卡片 / WebUI Service Card */}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
            {/* 启用 WebUI / Enable WebUI */}
            <PreferenceRow label={t('settings.webui.enable')} extra={startLoading ? <span className='text-12px text-warning'>{t('settings.webui.starting')}</span> : status?.running ? <span className='text-12px text-green-500'>✓ {t('settings.webui.running')}</span> : null}>
              <Switch checked={status?.running || startLoading} loading={startLoading} onChange={handleToggle} />
            </PreferenceRow>

            {/* 访问地址（仅运行时显示）/ Access URL (only when running) */}
            {status?.running && (
              <PreferenceRow label={t('settings.webui.accessUrl')}>
                <div className='flex items-center gap-8px'>
                  <button className='text-14px text-primary font-mono hover:underline cursor-pointer bg-transparent border-none p-0' onClick={() => shell.openExternal.invoke(getDisplayUrl()).catch(console.error)}>
                    {getDisplayUrl()}
                  </button>
                  <Tooltip content={t('common.copy')}>
                    <button className='p-4px text-t-tertiary hover:text-t-primary cursor-pointer bg-transparent border-none' onClick={() => handleCopy(getDisplayUrl())}>
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
                <>
                  {t('settings.webui.allowRemoteDesc')}
                  {'  '}
                  <button className='text-primary hover:underline cursor-pointer bg-transparent border-none p-0 text-12px' onClick={() => shell.openExternal.invoke('https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide').catch(console.error)}>
                    {t('settings.webui.viewGuide')}
                  </button>
                </>
              }
            >
              <Switch checked={allowRemote} onChange={handleAllowRemoteChange} />
            </PreferenceRow>
          </div>

          {/* 登录信息卡片 / Login Info Card */}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
            <div className='text-14px font-500 mb-8px text-t-primary'>{t('settings.webui.loginInfo')}</div>

            {/* 用户名 / Username */}
            <InfoRow label='Username:' value={status?.adminUsername || 'admin'} onCopy={() => handleCopy(status?.adminUsername || 'admin')} />

            {/* 密码 / Password */}
            <div className='flex items-center justify-between py-12px'>
              <span className='text-14px text-t-secondary'>Password:</span>
              <div className='flex items-center gap-8px'>
                <span className='text-14px text-t-primary'>{displayPassword}</span>
                {canShowPlainPassword && actualPassword ? (
                  // 可以显示明文时，显示复制图标 / Show copy icon when plaintext is visible
                  <Tooltip content={t('settings.webui.copyPasswordTooltip')}>
                    <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={handleCopyPassword}>
                      <Copy size={16} />
                    </button>
                  </Tooltip>
                ) : (
                  // 密文状态时，显示重置图标 / Show reset icon when password is hidden
                  <Tooltip content={t('settings.webui.resetPasswordTooltip')}>
                    <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={handleResetPassword} disabled={resetLoading}>
                      <Refresh size={16} className={resetLoading ? 'animate-spin' : ''} />
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </div>
      </AionScrollArea>

      {/* 设置新密码弹窗 / Set New Password Modal */}
      <AionModal visible={setPasswordModalVisible} onCancel={() => setSetPasswordModalVisible(false)} onOk={handleSetNewPassword} confirmLoading={passwordLoading} title={t('settings.webui.setNewPassword')} size='small'>
        <Form form={form} layout='vertical' className='pt-16px'>
          <Form.Item
            label={t('settings.webui.newPassword')}
            field='newPassword'
            rules={[
              { required: true, message: t('settings.webui.newPasswordRequired') },
              { minLength: 8, message: t('settings.webui.passwordMinLength') },
            ]}
          >
            <Input.Password placeholder={t('settings.webui.newPasswordPlaceholder')} />
          </Form.Item>
          <Form.Item
            label={t('settings.webui.confirmPassword')}
            field='confirmPassword'
            rules={[
              { required: true, message: t('settings.webui.confirmPasswordRequired') },
              {
                validator: (value, callback) => {
                  if (value !== form.getFieldValue('newPassword')) {
                    callback(t('settings.webui.passwordMismatch'));
                  } else {
                    callback();
                  }
                },
              },
            ]}
          >
            <Input.Password placeholder={t('settings.webui.confirmPasswordPlaceholder')} />
          </Form.Item>
        </Form>
      </AionModal>
    </div>
  );
};

export default WebuiModalContent;
