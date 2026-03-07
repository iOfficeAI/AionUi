/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewMetadata } from '@/renderer/pages/conversation/preview/context/PreviewContext';
import { Button, Input, Modal, Tooltip } from '@arco-design/web-react';
import { Tv } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { detectReachableStarOfficeUrl, STAR_OFFICE_URL_KEY } from '@/renderer/utils/starOffice';
import { emitter } from '@/renderer/utils/emitter';
import { iconColors } from '@/renderer/theme/colors';

const MONITOR_URL_STORAGE_KEY = 'aionui.openclaw.monitorUrl';
const DEFAULT_MONITOR_URL = 'http://127.0.0.1:19000';

interface OpenClawMonitorButtonProps {
  conversationId?: string;
  onOpenUrl: (url: string, metadata?: PreviewMetadata) => void;
}

const normalizeUrl = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
};

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type DetectState = 'checking' | 'ready' | 'not_found' | 'error';

const OpenClawMonitorButton: React.FC<OpenClawMonitorButtonProps> = ({ conversationId, onOpenUrl }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectState, setDetectState] = useState<DetectState>('checking');
  const [detectError, setDetectError] = useState('');
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [showManualUrlEditor, setShowManualUrlEditor] = useState(false);
  const [detectFailureCount, setDetectFailureCount] = useState(0);
  const [showDiagnoseHint, setShowDiagnoseHint] = useState(false);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem(MONITOR_URL_STORAGE_KEY)?.trim() || DEFAULT_MONITOR_URL;
    } catch {
      return DEFAULT_MONITOR_URL;
    }
  });

  const runDetect = useCallback(async (options?: { force?: boolean; silent?: boolean; timeoutMs?: number }) => {
    if (!options?.silent) {
      setDetectState('checking');
      setDetectError('');
    }
    if (!options?.silent) setDetecting(true);
    try {
      let found: string | null = null;
      let hasDetectError = false;
      const mainDetectResult = await ipcBridge.application.detectStarOfficeUrl.invoke({
        preferredUrl: url,
        force: options?.force,
        timeoutMs: options?.timeoutMs ?? 1000,
      });
      if (mainDetectResult.success) {
        found = mainDetectResult.data?.url || null;
      } else if (mainDetectResult.msg) {
        hasDetectError = true;
        setDetectError(mainDetectResult.msg);
      }
      if (!found) {
        found = await detectReachableStarOfficeUrl(url, {
          force: options?.force,
          timeoutMs: options?.timeoutMs,
        });
      }
      setDetectedUrl(found);
      if (found) {
        setUrl(found);
        setDetectState('ready');
        setDetectFailureCount(0);
        setShowDiagnoseHint(false);
        try {
          localStorage.setItem(MONITOR_URL_STORAGE_KEY, found);
          localStorage.setItem(STAR_OFFICE_URL_KEY, found);
        } catch {
          // ignore persistence error
        }
      } else {
        if (!options?.silent) {
          setDetectState(hasDetectError ? 'error' : 'not_found');
        }
        setDetectedUrl(null);
        if (!options?.silent) {
          setDetectFailureCount((prev) => {
            const nextFailureCount = prev + 1;
            if (nextFailureCount >= 2) {
              setShowDiagnoseHint(true);
            }
            return nextFailureCount;
          });
        }
        if (options?.force) {
          // Force detect miss means prior cached URL is stale.
          try {
            localStorage.removeItem(MONITOR_URL_STORAGE_KEY);
            localStorage.removeItem(STAR_OFFICE_URL_KEY);
          } catch {
            // ignore persistence failures
          }
        }
      }
      return found;
    } finally {
      if (!options?.silent) setDetecting(false);
    }
  }, [url]);

  useEffect(() => {
    const idleWindow = window as IdleWindow;
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(() => {
        void runDetect({ silent: true });
      }, { timeout: 700 });
      return () => {
        if (typeof idleWindow.cancelIdleCallback === 'function') {
          idleWindow.cancelIdleCallback(idleId);
        }
      };
    }

    const timer = window.setTimeout(() => {
      void runDetect({ silent: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [runDetect]);

  useEffect(() => {
    if (!visible) return;
    // Always refresh state when opening modal to avoid stale ready status.
    setPreviewImageFailed(false);
    void runDetect({ force: true, silent: false, timeoutMs: 420 });
  }, [visible, runDetect]);

  const handleConfirm = useCallback(() => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;

    try {
      const parsed = new URL(normalized);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return;
      }
      try {
        localStorage.setItem(MONITOR_URL_STORAGE_KEY, normalized);
        localStorage.setItem(STAR_OFFICE_URL_KEY, normalized);
      } catch {
        // ignore persistence error
      }
      onOpenUrl(normalized, {
        title: t('conversation.preview.openclawMonitorTitle', { defaultValue: 'OpenClaw Live Monitor' }),
      });
      setVisible(false);
    } catch {
      // keep modal open for correction
    }
  }, [onOpenUrl, t, url]);

  const tooltipText = useMemo(() => {
    if (detectState === 'ready' && detectedUrl) {
      return t('conversation.preview.openclawMonitorDetected', {
        defaultValue: 'Open live monitor (detected at {{url}})',
        url: detectedUrl,
      });
    }
    if (detectState === 'checking') {
      return t('conversation.preview.openclawMonitorDetecting', { defaultValue: 'Detecting local monitor service...' });
    }
    if (detectState === 'error') {
      return t('conversation.preview.openclawMonitorDetectFailed', { defaultValue: 'Monitor detection failed, click to configure manually' });
    }
    if (detectState === 'not_found') {
      return t('conversation.preview.openclawMonitorNotInstalled', { defaultValue: 'No local monitor detected, click to install/connect' });
    }
    return t('conversation.preview.openclawMonitor', { defaultValue: 'Open live monitor' });
  }, [detectState, detectedUrl, t]);

  const statusBadgeColor = useMemo(() => {
    if (detectState === 'ready') return 'rgb(var(--success-6))';
    if (detectState === 'error') return 'rgb(var(--danger-6))';
    if (detectState === 'checking') return 'rgb(var(--arcoblue-6))';
    return 'rgb(var(--gray-4))';
  }, [detectState]);

  const statusText = useMemo(() => {
    if (detectState === 'ready') {
      return t('conversation.preview.openclawMonitorReady', {
        defaultValue: 'Connected: {{url}}',
        url: detectedUrl,
      });
    }
    if (detectState === 'checking') {
      return t('conversation.preview.openclawMonitorChecking', { defaultValue: 'Checking local Star Office service...' });
    }
    if (detectState === 'error') {
      return t('conversation.preview.openclawMonitorError', { defaultValue: 'Detection failed. You can still input URL manually.' });
    }
    return t('conversation.preview.openclawMonitorMissing', { defaultValue: 'Star Office is not detected on this machine.' });
  }, [detectState, detectedUrl, t]);

  const handlePrimaryClick = useCallback(() => {
    if (detectState === 'ready' && detectedUrl) {
      void (async () => {
        // Re-verify quickly before opening to avoid stale "ready" state after uninstall/stop.
        const rechecked = await runDetect({ force: true, timeoutMs: 320 });
        if (rechecked) {
          onOpenUrl(rechecked, {
            title: t('conversation.preview.openclawMonitorTitle', { defaultValue: 'OpenClaw Live Monitor' }),
          });
          return;
        }
        setVisible(true);
      })();
      return;
    }
    setVisible(true);
  }, [detectState, detectedUrl, onOpenUrl, runDetect, t]);

  const handleOpenInstallGuide = useCallback(() => {
    void ipcBridge.shell.openExternal.invoke('https://github.com/ringhyacinth/Star-Office-UI');
  }, []);

  const handleAskOpenClawInstall = useCallback(() => {
    if (conversationId) {
      const hasLocal = detectState === 'ready' && Boolean(detectedUrl);
      const text = hasLocal
        ? t('conversation.preview.openclawMonitorAssistPromptInstalled', {
            defaultValue:
              '已检测到本机 Star Office 服务（{{url}}）。请直接进入“连接与玩法引导”模式：1) 用一句话确认已检测到服务；2) 引导我点击右上角小电视并确认 URL；3) 告诉我 Star Office 与 OpenClaw 的联动玩法；4) 若连接失败，自动执行最短排障步骤（端口/进程/日志）并重试。',
            url: detectedUrl || '',
          })
        : t('conversation.preview.openclawMonitorInstallPrompt', {
            defaultValue:
              '用户已授权你在当前会话中自动执行 Star Office 的安装与修复命令（尽量不让用户手动敲命令）。请立刻执行：环境检查 -> 自动安装/修复（项目：https://github.com/ringhyacinth/Star-Office-UI）-> 启动服务 -> 检测端口 -> 引导点击右上角小电视验证。仅在系统权限必须用户确认时再提示用户操作。',
          });
      emitter.emit('staroffice.install.request', {
        conversationId,
        text,
        detectedUrl: detectedUrl || null,
      });
    }
    setVisible(false);
  }, [conversationId, detectState, detectedUrl, t]);

  const handleAskOpenClawDiagnose = useCallback(() => {
    if (conversationId) {
      const text = t('conversation.preview.openclawMonitorDiagnosePrompt', {
        defaultValue:
          '请进入 Star Office 连接排障模式（不重装优先）：先检查端口占用、进程状态、授权/token、健康检查与日志；给出最短修复动作并自动执行；最后重新检测并引导我点击右上角小电视验证。',
      });
      emitter.emit('staroffice.install.request', {
        conversationId,
        text,
        detectedUrl: detectedUrl || null,
      });
    }
    setVisible(false);
  }, [conversationId, detectedUrl, t]);

  const handleOpenDetectedMonitor = useCallback(() => {
    void (async () => {
      const rechecked = await runDetect({ force: true, timeoutMs: 380 });
      const target = rechecked || normalizeUrl(url);
      if (!rechecked || !target) {
        setVisible(true);
        return;
      }
      try {
        localStorage.setItem(MONITOR_URL_STORAGE_KEY, target);
        localStorage.setItem(STAR_OFFICE_URL_KEY, target);
      } catch {
        // ignore persistence error
      }
      onOpenUrl(target, {
        title: t('conversation.preview.openclawMonitorTitle', { defaultValue: 'OpenClaw Live Monitor' }),
      });
      setShowDiagnoseHint(false);
      setDetectFailureCount(0);
      setVisible(false);
    })();
  }, [onOpenUrl, runDetect, t, url]);

  const iconFill = useMemo(() => {
    if (detectState === 'ready') return iconColors.primary;
    return iconColors.disabled;
  }, [detectState]);

  const buttonNode = (
    <Button
      type='text'
      size='small'
      className='cron-job-manager-button chat-header-cron-pill !h-auto !w-auto !min-w-0 !px-0 !py-0'
      loading={detecting}
      onClick={handlePrimaryClick}
      aria-label={t('conversation.preview.openclawMonitor', { defaultValue: 'Open live monitor' })}
    >
      <span className='inline-flex items-center gap-2px rounded-full px-8px py-2px bg-2'>
        <Tv theme='outline' size={16} fill={iconFill} />
        <span className='ml-4px w-8px h-8px rounded-full' style={{ backgroundColor: statusBadgeColor }} />
      </span>
    </Button>
  );

  return (
    <>
      <Tooltip content={tooltipText}>{buttonNode}</Tooltip>

      <Modal
        title={t('conversation.preview.openclawMonitor', { defaultValue: 'Open live monitor' })}
        visible={visible}
        footer={null}
        onCancel={() => {
          setShowManualUrlEditor(false);
          setVisible(false);
        }}
      >
        <div className='flex flex-col gap-12px'>
          <div className='rounded-12px border border-3 bg-2 p-12px'>
            <button
              type='button'
              className='border-none bg-transparent p-0 text-left text-14px font-500 text-t-primary underline-offset-3 hover:underline cursor-pointer'
              onClick={handleOpenInstallGuide}
            >
              {t('conversation.preview.openclawMonitorVisualTitle', { defaultValue: 'What is Star Office UI?' })}
            </button>
            <div className='mt-6px text-12px leading-18px text-t-secondary'>
              {t('conversation.preview.openclawMonitorVisualDesc', {
                defaultValue: 'Star Office is a visual companion for OpenClaw. It turns chat-side status into a live, interactive monitor view.',
              })}
            </div>
            <div className='mt-10px overflow-hidden rounded-10px border border-3 bg-1'>
              {previewImageFailed ? (
                <div className='h-132px w-full flex items-center justify-center bg-[linear-gradient(135deg,rgba(73,147,255,0.12),rgba(73,147,255,0.04))] px-12px'>
                  <div className='text-center'>
                    <div className='text-20px'>📺</div>
                    <div className='mt-4px text-12px font-500 text-t-primary'>
                      {t('conversation.preview.openclawMonitorVisualFallbackTitle', { defaultValue: 'Star Office UI live preview' })}
                    </div>
                    <div className='mt-2px text-11px text-t-secondary'>
                      {t('conversation.preview.openclawMonitorVisualFallbackDesc', { defaultValue: 'OpenClaw chat status becomes a visual office scene.' })}
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src='https://raw.githubusercontent.com/ringhyacinth/Star-Office-UI/master/docs/screenshots/readme-cover-1.jpg'
                  alt={t('conversation.preview.openclawMonitorVisualImageAlt', { defaultValue: 'Star Office UI official preview' })}
                  className='h-132px w-full object-cover'
                  loading='lazy'
                  referrerPolicy='no-referrer'
                  onError={() => setPreviewImageFailed(true)}
                />
              )}
              <div className='px-8px py-6px text-11px text-t-secondary'>
                {previewImageFailed
                  ? t('conversation.preview.openclawMonitorVisualImageCaptionFallback', {
                      defaultValue: 'Preview image unavailable, open project for full screenshots.',
                    })
                  : t('conversation.preview.openclawMonitorVisualImageCaption', {
                      defaultValue: 'Official preview from Star-Office-UI (GitHub).',
                    })}
              </div>
            </div>
            <div className='mt-10px flex items-center gap-6px text-12px text-t-primary flex-wrap'>
              <span className='rounded-full border border-3 bg-1 px-8px py-4px'>
                {t('conversation.preview.openclawMonitorVisualStepChat', { defaultValue: 'OpenClaw Chat' })}
              </span>
              <span className='text-t-secondary'>→</span>
              <span className='rounded-full border border-3 bg-1 px-8px py-4px'>
                {t('conversation.preview.openclawMonitorVisualStepUi', { defaultValue: 'Star Office UI' })}
              </span>
              <span className='text-t-secondary'>→</span>
              <span className='rounded-full border border-3 bg-1 px-8px py-4px'>
                {t('conversation.preview.openclawMonitorVisualStepLive', { defaultValue: 'Live Monitor' })}
              </span>
            </div>
          </div>

          <div className='rounded-14px border border-2 bg-[linear-gradient(180deg,rgba(var(--gray-1),0.82),rgba(var(--gray-2),0.7))] p-14px'>
            <div className='flex items-center gap-8px'>
              <span
                className='h-8px w-8px rounded-full'
                style={{ backgroundColor: detectState === 'ready' ? 'rgb(var(--success-6))' : 'rgb(var(--gray-5))' }}
              />
              <div className='text-14px font-500 text-t-primary'>
                {t('conversation.preview.openclawMonitorIntroTitle', { defaultValue: 'Star Office Monitor' })}
              </div>
            </div>
            <div className='mt-8px text-13px leading-20px text-t-secondary'>
              {detectState === 'ready'
                ? t('conversation.preview.openclawMonitorConnectedInline', {
                    defaultValue: 'Connected · {{url}}',
                    url: detectedUrl || '',
                  })
                : t('conversation.preview.openclawMonitorNotDetectedInline', { defaultValue: 'Not detected on this device' })}
            </div>
            {detectState === 'ready' ? (
              <div className='mt-10px flex flex-wrap items-center gap-8px'>
                <Button type='primary' className='!rounded-10px' onClick={handleOpenDetectedMonitor}>
                  {t('conversation.preview.openclawMonitorOpenNow', { defaultValue: 'Open monitor' })}
                </Button>
                <Button
                  size='mini'
                  type='outline'
                  className='!rounded-10px'
                  onClick={() => {
                    setShowManualUrlEditor((prev) => !prev);
                  }}
                >
                  {showManualUrlEditor
                    ? t('conversation.preview.openclawMonitorHideUrlEditor', { defaultValue: 'Hide URL editor' })
                    : t('conversation.preview.openclawMonitorEditUrl', { defaultValue: 'Change URL' })}
                </Button>
              </div>
            ) : (
              <div className='mt-10px flex flex-wrap items-center gap-8px'>
                <Button type='primary' className='!rounded-10px' onClick={handleAskOpenClawInstall}>
                  {t('conversation.preview.openclawMonitorInstallWithOpenClaw', { defaultValue: 'Install with OpenClaw' })}
                </Button>
                <Button
                  size='mini'
                  type='outline'
                  className='!rounded-10px'
                  loading={detecting}
                  onClick={() => void runDetect({ force: true, timeoutMs: 360 })}
                >
                  {t('conversation.preview.openclawMonitorDetect', { defaultValue: 'Detect again' })}
                </Button>
              </div>
            )}
            {showDiagnoseHint ? null : null}
          </div>

          {detectError ? <div className='text-11px text-[rgb(var(--danger-6))]'>{statusText} · {detectError}</div> : null}
          {detectState === 'ready' && showManualUrlEditor ? (
            <>
              <div className='text-12px text-t-secondary'>
                {t('conversation.preview.openclawMonitorHint', { defaultValue: 'Input monitor URL manually, e.g. http://127.0.0.1:19000' })}
              </div>
              <div className='flex items-center gap-8px'>
                <Input value={url} onChange={setUrl} placeholder='http://127.0.0.1:19000' />
                <Button type='outline' onClick={handleConfirm}>
                  {t('common.confirm')}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>
    </>
  );
};

export default OpenClawMonitorButton;
