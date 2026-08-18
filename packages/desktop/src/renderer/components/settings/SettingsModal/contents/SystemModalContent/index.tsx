/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IGpuStatus, IStartOnBootStatus } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';
import LanguageSwitcher from '@/renderer/components/settings/LanguageSwitcher';
import { getClientBusinessSetting, setClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import {
  DEFAULT_TEXT_PREVIEW_LIMIT_MB,
  MAX_TEXT_PREVIEW_LIMIT_MB,
  MIN_TEXT_PREVIEW_LIMIT_MB,
  normalizeTextPreviewLimitMb,
} from '@/renderer/utils/file/previewPayload';
import { notifyManualRestartRequired } from '@/renderer/utils/appRestart';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Alert, Collapse, Form, InputNumber, Message, Modal, Switch } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { useSettingsViewMode } from '../../settingsViewContext';
import BrowserNotificationGrant from './BrowserNotificationGrant';
import DevSettings from './DevSettings';
import BrowserDataSection from './BrowserDataSection';
import DirInputItem from './DirInputItem';
import PreferenceRow from './PreferenceRow';
import VoiceInputSection from './VoiceInputSection';

/**
 * System settings content component
 *
 * Provides system-level configuration options including language, directory config,
 * and developer tools (dev mode only).
 */
const SystemModalContent: React.FC = () => {
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const [form] = Form.useForm();
  const [modal, modalContextHolder] = Modal.useModal();
  const [error, setError] = useState<string | null>(null);
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const initializingRef = useRef(true);

  const [startOnBoot, setStartOnBoot] = useState<IStartOnBootStatus>({
    supported: false,
    enabled: false,
    isPackaged: false,
    platform: 'web',
  });
  const [closeToTray, setCloseToTray] = useState(false);
  const [gpuStatus, setGpuStatus] = useState<IGpuStatus | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [cronNotificationEnabled, setCronNotificationEnabled] = useState(false);
  const [promptTimeout, setPromptTimeout] = useState<number>(300);
  const [agentIdleTimeout, setAgentIdleTimeout] = useState<number>(5);
  /**
   * The committed limit — what is stored, and what the field falls back to.
   *
   * The field itself is left uncontrolled while typing. Arco's `InputNumber` skips its
   * internal "user is typing" state whenever a `value` prop is present, and then
   * renders the number it parsed rather than the characters that were entered. `1.` is
   * not a number, so the dot was dropped on the keystroke that produced it and `1.5`
   * came out as `15`.
   *
   * Remounting on commit (via `key`) is what lets an uncontrolled field still show a
   * clamped result: type `0.2`, blur, and the field comes back as the accepted `1`.
   */
  const [previewLimitMb, setPreviewLimitMb] = useState<number>(DEFAULT_TEXT_PREVIEW_LIMIT_MB);
  const previewLimitDraftRef = useRef<string>(String(DEFAULT_TEXT_PREVIEW_LIMIT_MB));
  const [saveUploadToWorkspace, setSaveUploadToWorkspace] = useState(false);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    ipcBridge.application.getStartOnBootStatus
      .invoke()
      .then((result) => {
        if (result.success && result.data) {
          setStartOnBoot(result.data);
        }
      })
      .catch(() => {});

    ipcBridge.application.getGpuStatus
      .invoke()
      .then((result) => {
        if (result.success && result.data) {
          setGpuStatus(result.data);
        }
      })
      .catch(() => {});
  }, [isDesktop]);

  useEffect(() => {
    setCloseToTray(configService.get('system.closeToTray') ?? false);
    if (isDesktop) {
      ipcBridge.systemSettings.getCloseToTray
        .invoke()
        .then((enabled) => {
          setCloseToTray(enabled);
          configService.setLocal('system.closeToTray', enabled);
        })
        .catch(() => {});
    }
    setNotificationEnabled(configService.get('system.notificationEnabled') ?? true);
    setCronNotificationEnabled(configService.get('system.cronNotificationEnabled') ?? false);
    setSaveUploadToWorkspace(configService.get('upload.saveToWorkspace') ?? false);
  }, [isDesktop]);

  useEffect(() => {
    let cancelled = false;

    const loadAcpTimeouts = async () => {
      try {
        const [storedPromptTimeout, storedAgentIdleTimeout, storedPreviewLimitMb] = await Promise.all([
          getClientBusinessSetting('acp.promptTimeout'),
          getClientBusinessSetting('acp.agentIdleTimeout'),
          getClientBusinessSetting('preview.textSizeLimitMb'),
        ]);
        if (cancelled) {
          return;
        }

        if (typeof storedPromptTimeout === 'number' && storedPromptTimeout > 0) {
          setPromptTimeout(storedPromptTimeout);
        }
        if (typeof storedAgentIdleTimeout === 'number' && storedAgentIdleTimeout > 0) {
          setAgentIdleTimeout(storedAgentIdleTimeout);
        }
        // Normalized rather than range-checked inline: the same clamp guards the
        // stored value, the field, and the size check, so a hand-edited or legacy
        // entry cannot present one limit here and apply another when a file opens.
        if (storedPreviewLimitMb !== undefined) {
          const stored = normalizeTextPreviewLimitMb(storedPreviewLimitMb);
          setPreviewLimitMb(stored);
          previewLimitDraftRef.current = String(stored);
        }
      } catch {
        // Keep the in-memory defaults when backend settings are unavailable.
      }
    };

    void loadAcpTimeouts();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCloseToTrayChange = useCallback(
    (checked: boolean) => {
      const previous = closeToTray;
      setCloseToTray(checked);
      configService.setLocal('system.closeToTray', checked);

      if (!isDesktop) {
        configService.set('system.closeToTray', checked).catch(() => {
          setCloseToTray(previous);
          configService.setLocal('system.closeToTray', previous);
        });
        return;
      }

      ipcBridge.systemSettings.setCloseToTray.invoke({ enabled: checked }).catch(() => {
        setCloseToTray(previous);
        configService.setLocal('system.closeToTray', previous);
      });
    },
    [closeToTray, isDesktop]
  );

  const handleHardwareAccelerationChange = useCallback(
    (checked: boolean) => {
      const previous = gpuStatus;
      const optimistic: IGpuStatus = {
        userOverride: checked ? 'force-on' : 'force-off',
        autoDisabled: false,
        crashCount: 0,
        lastCrashAt: gpuStatus?.lastCrashAt ?? null,
      };
      setGpuStatus(optimistic);

      const apply = () => {
        ipcBridge.application.setGpuOverride
          .invoke({ override: checked ? 'force-on' : 'force-off' })
          .then((result) => {
            if (result.success && result.data) {
              setGpuStatus(result.data);
              ipcBridge.application.restart
                .invoke()
                .then((restartResult) => notifyManualRestartRequired(restartResult, t))
                .catch(() => {});
            } else {
              setGpuStatus(previous);
              Message.error(t('settings.hardwareAccelerationUpdateFailed'));
            }
          })
          .catch(() => {
            setGpuStatus(previous);
            Message.error(t('settings.hardwareAccelerationUpdateFailed'));
          });
      };

      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.hardwareAccelerationRestartConfirm'),
        onOk: apply,
        onCancel: () => setGpuStatus(previous),
      });
    },
    [gpuStatus, modal, t]
  );

  const handleStartOnBootChange = useCallback(
    (checked: boolean) => {
      const previousStatus = startOnBoot;
      setStartOnBoot((prev) => ({ ...prev, enabled: checked }));

      ipcBridge.application.setStartOnBoot
        .invoke({ enabled: checked })
        .then((result) => {
          if (result.success && result.data) {
            setStartOnBoot(result.data);
            return;
          }

          setStartOnBoot(previousStatus);
          Message.error(result.msg || t('settings.startOnBootUpdateFailed'));
        })
        .catch(() => {
          setStartOnBoot(previousStatus);
          Message.error(t('settings.startOnBootUpdateFailed'));
        });
    },
    [startOnBoot, t]
  );

  const handleNotificationEnabledChange = useCallback((checked: boolean) => {
    setNotificationEnabled(checked);
    configService.set('system.notificationEnabled', checked).catch(() => {
      setNotificationEnabled(!checked);
      configService.setLocal('system.notificationEnabled', !checked);
    });
  }, []);

  const handleCronNotificationEnabledChange = useCallback((checked: boolean) => {
    setCronNotificationEnabled(checked);
    configService.set('system.cronNotificationEnabled', checked).catch(() => {
      setCronNotificationEnabled(!checked);
      configService.setLocal('system.cronNotificationEnabled', !checked);
    });
  }, []);

  const handlePromptTimeoutChange = useCallback((val: number | undefined) => {
    setPromptTimeout(val as number);
  }, []);

  const handlePromptTimeoutBlur = useCallback(() => {
    const clamped = Math.max(30, Math.min(3600, promptTimeout || 300));
    setPromptTimeout(clamped);
    void setClientBusinessSetting('acp.promptTimeout', clamped).catch(() => {});
  }, [promptTimeout]);

  const handleAgentIdleTimeoutChange = useCallback((val: number | undefined) => {
    setAgentIdleTimeout(val as number);
  }, []);

  const handleAgentIdleTimeoutBlur = useCallback(() => {
    const clamped = Math.max(1, Math.min(60, agentIdleTimeout || 5));
    setAgentIdleTimeout(clamped);
    void setClientBusinessSetting('acp.agentIdleTimeout', clamped).catch(() => {});
  }, [agentIdleTimeout]);

  /**
   * Keep what the user typed, not a number parsed from it.
   *
   * A decimal is typed one character at a time, and `1.` is a necessary intermediate
   * state on the way to `1.5`. Storing it as a number turns it back into `1`, the
   * controlled value re-renders the field as `"1"`, and the trailing dot is gone
   * before the next keystroke arrives — so `1.5` came out as `15`. Holding the raw
   * string lets the dot survive until the value is actually used.
   *
   * Nothing downstream sees this string: {@link handlePreviewLimitMbBlur} is the only
   * writer, and it normalizes first.
   */
  const handlePreviewLimitMbChange = useCallback((val: number | string) => {
    previewLimitDraftRef.current = val === undefined || val === null ? '' : String(val);
  }, []);

  /**
   * Persist on blur, not on every keystroke: the field is cleared to empty while
   * retyping, and writing that intermediate state would store a limit the user never
   * chose. The clamp runs here too, so the stored value is always one the size check
   * would accept.
   *
   * Only newly opened preview tabs see the new limit — tabs already open captured
   * theirs when they opened. That is deliberate: reclassifying an open tab would move
   * a file being edited into the "too large to show" state mid-edit.
   */
  const handlePreviewLimitMbBlur = useCallback(() => {
    const typed = previewLimitDraftRef.current.trim();
    // An emptied field means "unset", which normalize turns into the default; Number('')
    // would be 0 and clamp up to the minimum instead, silently choosing for the user.
    const clamped = normalizeTextPreviewLimitMb(typed === '' ? undefined : Number(typed));
    setPreviewLimitMb(clamped);
    previewLimitDraftRef.current = String(clamped);
    void setClientBusinessSetting('preview.textSizeLimitMb', clamped).catch(() => {});
  }, []);

  const handleSaveUploadToWorkspaceChange = useCallback((checked: boolean) => {
    setSaveUploadToWorkspace(checked);
    configService.set('upload.saveToWorkspace', checked).catch(() => {
      setSaveUploadToWorkspace(!checked);
      configService.setLocal('upload.saveToWorkspace', !checked);
    });
  }, []);

  // Get system directory info
  const { data: systemInfo } = useSWR('system.dir.info', () => ipcBridge.application.systemInfo.invoke());

  // Initialize form data
  useEffect(() => {
    if (systemInfo) {
      initializingRef.current = true;
      form.setFieldsValue({ workDir: systemInfo.workDir, logDir: systemInfo.logDir });
      requestAnimationFrame(() => {
        initializingRef.current = false;
      });
    }
  }, [systemInfo, form]);

  const preferenceItems = [
    { key: 'language', label: t('settings.language'), component: <LanguageSwitcher /> },
    {
      key: 'startOnBoot',
      label: t('settings.startOnBoot'),
      description: startOnBoot.supported ? t('settings.startOnBootDesc') : t('settings.startOnBootUnsupported'),
      component: (
        <Switch checked={startOnBoot.enabled} onChange={handleStartOnBootChange} disabled={!startOnBoot.supported} />
      ),
    },
    {
      key: 'closeToTray',
      label: t('settings.closeToTray'),
      component: <Switch checked={closeToTray} onChange={handleCloseToTrayChange} />,
    },
    ...(isDesktop && gpuStatus
      ? [
          {
            key: 'hardwareAcceleration',
            label: t('settings.hardwareAcceleration'),
            description: gpuStatus.autoDisabled
              ? t('settings.hardwareAccelerationAutoDisabled')
              : t('settings.hardwareAccelerationDesc'),
            component: (
              <Switch
                checked={gpuStatus.userOverride !== 'force-off' && !gpuStatus.autoDisabled}
                onChange={handleHardwareAccelerationChange}
              />
            ),
          },
        ]
      : []),
    {
      key: 'promptTimeout',
      label: t('settings.promptTimeout'),
      component: (
        <InputNumber
          value={promptTimeout}
          onChange={handlePromptTimeoutChange}
          onBlur={handlePromptTimeoutBlur}
          max={3600}
          step={30}
          style={{ width: 120 }}
          suffix='s'
        />
      ),
    },
    {
      key: 'agentIdleTimeout',
      label: t('settings.agentIdleTimeout'),
      description: t('settings.agentIdleTimeoutDesc'),
      component: (
        <InputNumber
          value={agentIdleTimeout}
          onChange={handleAgentIdleTimeoutChange}
          onBlur={handleAgentIdleTimeoutBlur}
          max={60}
          step={5}
          style={{ width: 120 }}
          suffix='min'
        />
      ),
    },
    {
      key: 'previewTextSizeLimit',
      label: t('settings.previewTextSizeLimit'),
      description: t('settings.previewTextSizeLimitDesc'),
      component: (
        <InputNumber
          key={`preview-limit-${previewLimitMb}`}
          defaultValue={previewLimitMb}
          onChange={handlePreviewLimitMbChange}
          onBlur={handlePreviewLimitMbBlur}
          min={MIN_TEXT_PREVIEW_LIMIT_MB}
          max={MAX_TEXT_PREVIEW_LIMIT_MB}
          step={0.5}
          style={{ width: 120 }}
          suffix='MB'
        />
      ),
    },
    {
      key: 'saveUploadToWorkspace',
      label: t('settings.saveUploadToWorkspace'),
      component: <Switch checked={saveUploadToWorkspace} onChange={handleSaveUploadToWorkspaceChange} />,
    },
  ];

  const saveDirConfigValidate = (_values: { workDir: string; logDir: string }): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      modal.confirm({
        title: t('settings.updateConfirm'),
        content: t('settings.restartConfirm'),
        onOk: resolve,
        onCancel: reject,
      });
    });
  };

  const savingRef = useRef(false);

  const handleValuesChange = useCallback(
    async (_changedValue: unknown, allValues: Record<string, string>) => {
      if (initializingRef.current || savingRef.current || !systemInfo) return;
      const { workDir, logDir } = allValues;
      const needsRestart = workDir !== systemInfo.workDir || logDir !== systemInfo.logDir;
      if (!needsRestart) return;

      savingRef.current = true;
      setError(null);
      try {
        await saveDirConfigValidate({ workDir, logDir });
        // Pass systemInfo.cacheDir as-is: cacheDir is no longer user-editable
        // (removed from UI), but the backend IPC interface still expects it.
        // Passing the current value ensures existing custom paths are preserved.
        await ipcBridge.application.updateSystemInfo.invoke({ cacheDir: systemInfo.cacheDir, workDir, logDir });
        const restartResult = await ipcBridge.application.restart.invoke();
        notifyManualRestartRequired(restartResult, t);
      } catch (caughtError: unknown) {
        form.setFieldsValue({ workDir: systemInfo.workDir, logDir: systemInfo.logDir });
        if (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
        }
      } finally {
        savingRef.current = false;
      }
    },
    [systemInfo, form, saveDirConfigValidate, t]
  );

  return (
    <div className='flex flex-col h-full w-full'>
      {modalContextHolder}

      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {preferenceItems.map((item) => (
                <PreferenceRow key={item.key} label={item.label} description={item.description}>
                  {item.component}
                </PreferenceRow>
              ))}
            </div>
            {/* Notification settings with collapsible sub-options */}
            <Collapse
              bordered={false}
              activeKey={notificationEnabled ? ['notification'] : []}
              onChange={(_, keys) => {
                const shouldExpand = (keys as string[]).includes('notification');
                if (shouldExpand && !notificationEnabled) {
                  handleNotificationEnabledChange(true);
                } else if (!shouldExpand && notificationEnabled) {
                  handleNotificationEnabledChange(false);
                }
              }}
              className='[&_.arco-collapse-item]:!border-none [&_.arco-collapse-item-header]:!px-0 [&_.arco-collapse-item-header-title]:!flex-1 [&_.arco-collapse-item-content-box]:!px-0 [&_.arco-collapse-item-content-box]:!pb-0'
            >
              <Collapse.Item
                name='notification'
                showExpandIcon={false}
                header={
                  <div className='flex flex-1 items-center justify-between w-full'>
                    <span className='text-14px text-2 ms-12px'>{t('settings.notification')}</span>
                    <Switch
                      checked={notificationEnabled}
                      onClick={(e) => e.stopPropagation()}
                      onChange={handleNotificationEnabledChange}
                    />
                  </div>
                }
              >
                {isDesktop ? (
                  <div className='ps-12px'>
                    <PreferenceRow label={t('settings.cronNotificationEnabled')}>
                      <Switch
                        checked={cronNotificationEnabled}
                        disabled={!notificationEnabled}
                        onChange={handleCronNotificationEnabledChange}
                      />
                    </PreferenceRow>
                  </div>
                ) : (
                  <BrowserNotificationGrant />
                )}
              </Collapse.Item>
            </Collapse>
            <Form form={form} layout='vertical' className='!mt-32px space-y-16px' onValuesChange={handleValuesChange}>
              <DirInputItem label={t('settings.workDir')} field='workDir' />
              <DirInputItem label={t('settings.logDir')} field='logDir' />
              {error && (
                <Alert
                  className='mt-16px'
                  type='error'
                  content={
                    <span>
                      {typeof error === 'string' ? error : JSON.stringify(error)}
                      <FeedbackButton module='system-settings' className='ms-6px' />
                    </span>
                  }
                />
              )}
            </Form>
          </div>

          {/* Voice input (speech-to-text) settings */}
          <VoiceInputSection />

          {/* In-app browser: sign-in state and cache */}
          <BrowserDataSection />

          {/* Developer settings: DevTools + CDP (only visible in dev mode) */}
          <DevSettings />
        </div>
      </AionScrollArea>
    </div>
  );
};

export default SystemModalContent;
