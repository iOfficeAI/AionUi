/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Input, Form, Message, Tooltip } from '@arco-design/web-react';
import { Copy } from '@icon-park/react';
import { webui, shell, type IWebUIStatus } from '@/common/ipcBridge';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AionModal from '@/renderer/components/base/AionModal';
import { useSettingsViewMode } from '../settingsViewContext';

/**
 * 偏好设置行组件
 * Preference row component
 */
const PreferenceRow: React.FC<{ label: string; description?: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ label, description, extra, children }) => (
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
const InfoRow: React.FC<{ label: string; value: string; onCopy: () => void }> = ({ label, value, onCopy }) => (
  <div className='flex items-center justify-between py-12px'>
    <span className='text-14px text-t-secondary'>{label}</span>
    <div className='flex items-center gap-8px'>
      <span className='text-14px text-t-primary'>{value}</span>
      <Tooltip content='复制'>
        <button className='p-4px bg-transparent border-none text-t-tertiary hover:text-t-primary cursor-pointer' onClick={onCopy}>
          <Copy size={16} />
        </button>
      </Tooltip>
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

  const [status, setStatus] = useState<IWebUIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [port] = useState(25808);
  const [allowRemote, setAllowRemote] = useState(false);
  const [cachedIP, setCachedIP] = useState<string | null>(null);
  const [cachedPassword, setCachedPassword] = useState<string | null>(null);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [form] = Form.useForm();
  const [message, messageContext] = Message.useMessage();
  // 标记重置后是否需要复制密码 / Flag to copy password after reset
  const copyAfterResetRef = useRef(false);

  // 加载状态 / Load status
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      const result = await Promise.race([webui.getStatus.invoke(), timeoutPromise]);

      if (result && result.success && result.data) {
        setStatus(result.data);
        setAllowRemote(result.data.allowRemote);
        if (result.data.lanIP) {
          setCachedIP(result.data.lanIP);
        } else if (result.data.networkUrl) {
          const match = result.data.networkUrl.match(/http:\/\/([^:]+):/);
          if (match) setCachedIP(match[1]);
        }
        if (result.data.initialPassword) {
          setCachedPassword(result.data.initialPassword);
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
      console.error('Failed to load WebUI status:', error);
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

  // 直接 IPC 调用重置密码 / Direct IPC call to reset password
  // 使用 Electron 直接 IPC，绕过有问题的 bridge provider 模式
  // Use Electron direct IPC, bypassing the problematic bridge provider pattern
  const resetPasswordViaDirectIPC = useCallback(
    async (shouldCopyAfter: boolean, fillForm = false) => {
      setResetLoading(true);
      try {
        // 优先使用直接 IPC（Electron 环境）/ Prefer direct IPC (Electron environment)
        if (window.electronAPI?.webuiResetPassword) {
          console.log('[WebuiModal] Using direct IPC for reset password');
          const result = await window.electronAPI.webuiResetPassword();
          console.log('[WebuiModal] Direct IPC result:', result);

          if (result.success && result.newPassword) {
            setCachedPassword(result.newPassword);
            setStatus((prev) => (prev ? { ...prev, initialPassword: result.newPassword } : null));

            if (fillForm) {
              // 重置后新密码即为当前密码，填入当前密码字段
              // After reset, the new password becomes the current password
              form.setFieldsValue({
                currentPassword: result.newPassword,
                newPassword: '',
                confirmPassword: '',
              });
              message.success(t('settings.webui.passwordResetAndFilled'));
            } else if (shouldCopyAfter) {
              void navigator.clipboard.writeText(result.newPassword);
              message.success(t('settings.webui.passwordResetAndCopied'));
            } else {
              message.success(t('settings.webui.passwordResetSuccess'));
            }
          } else {
            message.error(result.msg || t('settings.webui.passwordResetFailed'));
          }
          setResetLoading(false);
        } else {
          // 后备方案：使用 bridge emitter（Web 环境）/ Fallback: use bridge emitter (Web environment)
          // 注意：不在此处设置 setResetLoading(false)，由 emitter 回调处理
          // Note: Don't setResetLoading(false) here, it's handled by emitter callback
          console.log('[WebuiModal] Falling back to bridge emitter for reset password');
          copyAfterResetRef.current = shouldCopyAfter;
          webui.resetPassword.invoke().catch(console.error);
        }
      } catch (error) {
        console.error('[WebuiModal] Reset password error:', error);
        message.error(t('settings.webui.passwordResetFailed'));
        setResetLoading(false);
      }
    },
    [message, t, form]
  );

  // 监听密码重置结果事件（Web 环境后备）/ Listen to password reset result events (Web environment fallback)
  useEffect(() => {
    const unsubscribe = webui.resetPasswordResult.on((data) => {
      if (data.success && data.newPassword) {
        setCachedPassword(data.newPassword);
        setStatus((prev) => (prev ? { ...prev, initialPassword: data.newPassword } : null));
        if (copyAfterResetRef.current) {
          void navigator.clipboard.writeText(data.newPassword);
          message.success(t('settings.webui.passwordResetAndCopied'));
          copyAfterResetRef.current = false;
        } else {
          message.success(t('settings.webui.passwordResetSuccess'));
        }
      } else {
        message.error(data.msg || t('settings.webui.passwordResetFailed'));
        copyAfterResetRef.current = false;
      }
      setResetLoading(false);
    });
    return () => unsubscribe();
  }, [message, t]);

  // 自动重置密码：当 WebUI 运行但没有密码时
  // Auto-reset password: when WebUI is running but no password cached
  useEffect(() => {
    if (status?.running && !status?.initialPassword && !cachedPassword && !loading && !resetLoading) {
      console.log('[WebuiModal] Auto-resetting password because WebUI is running but no password cached');
      void resetPasswordViaDirectIPC(false);
    }
  }, [status?.running, status?.initialPassword, cachedPassword, loading, resetLoading, resetPasswordViaDirectIPC]);

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
            networkUrl: allowRemote && currentIP ? `http://${currentIP}:${port}` : undefined,
            initialPassword: cachedPassword || prev?.initialPassword,
          }));
        }

        message.success(t('settings.webui.startSuccess'));
        void shell.openExternal.invoke(localUrl);

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
        message.success(t('settings.webui.stopSuccess'));
      }
    } catch (error) {
      console.error('Toggle WebUI error:', error);
      message.error(t('settings.webui.operationFailed'));
    } finally {
      setStartLoading(false);
    }
  };

  // 处理允许远程访问切换 / Handle allow remote toggle
  const handleAllowRemoteChange = async (checked: boolean) => {
    setAllowRemote(checked);

    // 启用远程访问时，总是从服务器获取最新 IP / When enabling remote, always get latest IP from server
    let currentIP: string | null = null;

    if (checked) {
      try {
        const result = await Promise.race([webui.getStatus.invoke(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))]);
        if (result && result.success && result.data) {
          if (result.data.lanIP) {
            currentIP = result.data.lanIP;
            setCachedIP(result.data.lanIP);
          } else if (result.data.networkUrl) {
            const match = result.data.networkUrl.match(/http:\/\/([^:]+):/);
            if (match) {
              currentIP = match[1];
              setCachedIP(match[1]);
            }
          }
        }
      } catch (error) {
        console.error('Failed to get IP:', error);
      }

      // 如果 API 没有返回 IP，使用缓存的 / If API didn't return IP, use cached
      if (!currentIP) {
        currentIP = getLocalIP();
      }
    }

    if (status?.running) {
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              allowRemote: checked,
              lanIP: currentIP || prev.lanIP,
              networkUrl: checked && currentIP ? `http://${currentIP}:${port}` : undefined,
            }
          : null
      );
    }
  };

  // 复制内容 / Copy content
  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    message.success(t('common.copySuccess'));
  };

  // 复制密码 / Copy password
  const handleCopyPassword = async () => {
    const actualPassword = status?.initialPassword || cachedPassword;
    if (actualPassword) {
      void navigator.clipboard.writeText(actualPassword);
      message.success(t('common.copySuccess'));
    } else {
      // 没有缓存的密码，触发重置并标记需要复制
      // No cached password, trigger reset and flag for copy
      void resetPasswordViaDirectIPC(true);
    }
  };

  // 修改密码 / Change password
  const handleChangePassword = async () => {
    try {
      const values = await form.validate();
      setPasswordLoading(true);

      let result: { success: boolean; msg?: string };

      // 优先使用直接 IPC（Electron 环境）/ Prefer direct IPC (Electron environment)
      if (window.electronAPI?.webuiChangePassword) {
        console.log('[WebuiModal] Using direct IPC for change password');
        result = await window.electronAPI.webuiChangePassword(values.currentPassword, values.newPassword);
      } else {
        // 后备方案：使用 bridge / Fallback: use bridge
        console.log('[WebuiModal] Falling back to bridge for change password');
        result = await webui.changePassword.invoke({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
      }

      if (result.success) {
        message.success(t('settings.webui.passwordChanged'));
        setPasswordModalVisible(false);
        form.resetFields();
        // 更新缓存的密码为新密码 / Update cached password to new password
        setCachedPassword(values.newPassword);
        setStatus((prev) => (prev ? { ...prev, initialPassword: values.newPassword } : null));
      } else {
        message.error(result.msg || t('settings.webui.passwordChangeFailed'));
      }
    } catch (error) {
      console.error('Change password error:', error);
      message.error(t('settings.webui.passwordChangeFailed'));
    } finally {
      setPasswordLoading(false);
    }
  };

  // 获取实际密码 / Get actual password
  const actualPassword = status?.initialPassword || cachedPassword;
  // 获取显示的密码 / Get display password
  // 重置中显示加载状态，否则显示密码或占位文本
  // Show loading state when resetting, otherwise show password or placeholder
  const displayPassword = resetLoading ? t('common.loading') : actualPassword || t('settings.webui.clickCopyToGet');

  if (loading && !status) {
    return (
      <div className='flex items-center justify-center h-200px'>
        <span className='text-t-secondary'>{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className='flex flex-col h-full w-full'>
      {messageContext}

      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* 描述说明 / Description */}
          <div className='px-[12px] md:px-[32px] text-13px text-t-secondary leading-relaxed'>
            <p>{t('settings.webui.description')}</p>
            <p className='mt-4px'>{t('settings.webui.steps')}</p>
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
                  <span className='text-14px text-primary font-mono'>{getDisplayUrl()}</span>
                  <Tooltip content={t('common.copy')}>
                    <button className='p-4px text-t-tertiary hover:text-t-primary cursor-pointer bg-transparent border-none' onClick={() => handleCopy(getDisplayUrl())}>
                      <Copy size={16} />
                    </button>
                  </Tooltip>
                </div>
              </PreferenceRow>
            )}

            {/* 允许局域网访问 / Allow LAN Access */}
            <PreferenceRow label={t('settings.webui.allowRemote')} description={t('settings.webui.allowRemoteDesc')}>
              <Switch checked={allowRemote} onChange={handleAllowRemoteChange} />
            </PreferenceRow>
          </div>

          {/* 登录信息卡片 / Login Info Card */}
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
            <div className='text-14px font-500 mb-8px text-t-primary'>{t('settings.webui.loginInfo')}</div>

            {/* 用户名 / Username */}
            <InfoRow label='Username:' value={status?.adminUsername || 'admin'} onCopy={() => handleCopy(status?.adminUsername || 'admin')} />

            {/* 密码 / Password */}
            <InfoRow label='Password:' value={displayPassword} onCopy={handleCopyPassword} />

            {/* 修改密码按钮 / Change password button */}
            <div className='flex items-center justify-end mt-12px pt-12px border-t border-line'>
              <button className='text-14px text-primary hover:text-primary-hover cursor-pointer bg-transparent border-none underline' onClick={() => setPasswordModalVisible(true)}>
                {t('settings.webui.changePassword')}
              </button>
            </div>
          </div>
        </div>
      </AionScrollArea>

      {/* 修改密码弹窗 / Change Password Modal */}
      <AionModal visible={passwordModalVisible} onCancel={() => setPasswordModalVisible(false)} onOk={handleChangePassword} confirmLoading={passwordLoading} title={t('settings.webui.changePassword')} size='small'>
        <Form form={form} layout='vertical' className='pt-16px'>
          <Form.Item
            label={
              <div className='flex items-center gap-4px w-full'>
                <span className='text-danger'>*</span>
                <span>{t('settings.webui.currentPassword')}</span>
                <button type='button' className='text-12px text-warning hover:text-warning-hover cursor-pointer bg-transparent border-none p-0 ml-auto' onClick={() => void resetPasswordViaDirectIPC(false, true)} disabled={resetLoading}>
                  {resetLoading ? t('common.loading') : t('settings.webui.forgotPassword')}
                </button>
              </div>
            }
            field='currentPassword'
            rules={[{ required: true, message: t('settings.webui.currentPasswordRequired') }]}
            requiredSymbol={false}
          >
            <Input.Password placeholder={t('settings.webui.currentPasswordPlaceholder')} />
          </Form.Item>
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
