/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ModalWrapper from '@renderer/components/base/ModalWrapper';
import { FEEDBACK_MODULES } from './feedbackModules';
import { Input, Select, Message, Upload } from '@arco-design/web-react';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import { Info, Plus } from '@icon-park/react';
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const DESCRIPTION_MAX_LENGTH = 2000;
const MAX_SCREENSHOTS = 3;
const ACCEPTED_IMAGE_TYPES = '.png,.jpg,.jpeg,.gif';
const SUMMARY_PREVIEW_LENGTH = 60;

type ScreenshotBuffer = {
  name: string;
  data: Uint8Array<ArrayBuffer>;
  type: string;
};

const getUploadItemKey = (item: Pick<UploadItem, 'name' | 'originFile'>) =>
  `${item.originFile?.name ?? item.name}_${item.originFile?.size ?? 0}`;

const createPastedImageName = (file: File, index: number) => {
  if (file.name.trim()) {
    return file.name;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = file.type.split('/')[1] || 'png';
  return `pasted-screenshot-${timestamp}-${index + 1}.${ext}`;
};

type FeedbackReportModalProps = {
  visible: boolean;
  onCancel: () => void;
};

const FeedbackReportModal: React.FC<FeedbackReportModalProps> = ({ visible, onCancel }) => {
  const { t } = useTranslation();

  const [module, setModule] = useState<string | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<UploadItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setModule(undefined);
    setDescription('');
    setScreenshots([]);
    setError('');
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    onCancel();
  }, [onCancel, resetForm]);

  const selectedModule = FEEDBACK_MODULES.find((item) => item.tag === module);

  const handleSubmit = useCallback(async () => {
    if (!module || !description.trim()) {
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      // Collect logs via IPC (graceful fallback)
      let logData: { filename: string; data: number[] } | null = null;
      try {
        const electronAPI = window.electronAPI;
        if (electronAPI?.collectFeedbackLogs) {
          logData = await electronAPI.collectFeedbackLogs();
        }
      } catch {
        // Non-blocking: continue without logs
      }

      // Read screenshot files as ArrayBuffer
      const screenshotBuffers = (
        await Promise.all(
          screenshots.map(async (item) => {
            if (!item.originFile) {
              return null;
            }

            const buffer = await item.originFile.arrayBuffer();
            const ext = item.originFile.name.split('.').pop() || 'png';
            return {
              name: item.originFile.name,
              data: new Uint8Array(buffer),
              type: item.originFile.type || `image/${ext}`,
            };
          })
        )
      ).filter((item): item is ScreenshotBuffer => item !== null);

      // Submit via Sentry
      // Use hint.attachments instead of scope.addAttachment to avoid
      // @sentry/electron's ScopeToMain normalize() corrupting Uint8Array binary data.
      const Sentry = await import('@sentry/electron/renderer');

      const attachments: Array<{ filename: string; data: Uint8Array; contentType: string }> = [];

      if (logData) {
        attachments.push({
          filename: logData.filename,
          data: new Uint8Array(logData.data),
          contentType: 'application/gzip',
        });
      }

      screenshotBuffers.forEach((screenshot, index) => {
        attachments.push({
          filename: `screenshot-${index + 1}-${screenshot.name}`,
          data: screenshot.data,
          contentType: screenshot.type,
        });
      });

      const normalizedDescription = description.trim().replace(/\s+/g, ' ');
      const summaryPreview =
        normalizedDescription.length > SUMMARY_PREVIEW_LENGTH
          ? `${normalizedDescription.slice(0, SUMMARY_PREVIEW_LENGTH).trimEnd()}...`
          : normalizedDescription;
      const eventSummary = `${t(selectedModule?.i18nKey ?? 'settings.bugReportModuleOther')}: ${summaryPreview}`;

      Sentry.withScope((scope) => {
        scope.setTag('type', 'user-feedback');
        scope.setTag('module', module);

        Sentry.captureEvent(
          {
            level: 'info',
            message: eventSummary,
            extra: {
              description: normalizedDescription,
            },
          },
          { attachments }
        );
      });

      Message.success(t('settings.bugReportSuccess'));
      resetForm();
      onCancel();
    } catch {
      setError(t('settings.bugReportError'));
    } finally {
      setSubmitting(false);
    }
  }, [module, description, screenshots, t, onCancel, resetForm, selectedModule]);

  const isFormValid = module !== undefined && description.trim().length > 0;

  const appendScreenshotFiles = useCallback((files: File[]) => {
    setError('');
    setScreenshots((current) => {
      const merged = [...current];
      const seen = new Set(current.map(getUploadItemKey));

      files.forEach((file, index) => {
        if (merged.length >= MAX_SCREENSHOTS) {
          return;
        }

        const normalizedFile = file.name.trim()
          ? file
          : new File([file], createPastedImageName(file, index), {
              type: file.type,
              lastModified: file.lastModified,
            });
        const nextItem: UploadItem = {
          uid: `pasted-${Date.now()}-${index}-${merged.length}`,
          name: normalizedFile.name,
          originFile: normalizedFile,
          status: 'done',
        };

        const key = getUploadItemKey(nextItem);
        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        merged.push(nextItem);
      });

      return merged;
    });
  }, []);

  const handleScreenshotChange = useCallback((fileList: UploadItem[]) => {
    setError('');
    // Deduplicate by file name + size, then mark as 'done' to hide progress indicators
    const seen = new Set<string>();
    const deduped = fileList.filter((f) => {
      const key = `${f.originFile?.name ?? f.name}_${f.originFile?.size ?? 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setScreenshots(deduped.map((f) => (f.status === 'done' ? f : Object.assign({}, f, { status: 'done' as const }))));
  }, []);

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      appendScreenshotFiles(files);
    },
    [appendScreenshotFiles]
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste, visible]);

  return (
    <ModalWrapper
      title={t('settings.bugReportTitle')}
      visible={visible}
      onCancel={handleCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText={t('settings.bugReportSubmit')}
      cancelText={t('settings.bugReportCancel')}
      okButtonProps={{ disabled: !isFormValid }}
      alignCenter
      className='w-[min(600px,calc(100vw-32px))] max-w-600px rd-16px'
      autoFocus={false}
    >
      <div
        data-testid='feedback-report-scroll-body'
        className='overflow-y-auto overflow-x-hidden px-24px pb-12px pr-18px max-h-[min(66vh,520px)]'
      >
        <div className='flex flex-col gap-16px'>
          {/* Module Select */}
          <div className='flex flex-col gap-4px'>
            <label className='text-13px text-t-secondary'>
              {t('settings.bugReportModuleLabel')} <span className='text-red-500'>*</span>
            </label>
            <Select
              placeholder={t('settings.bugReportModulePlaceholder')}
              value={module}
              onChange={(val) => {
                setModule(val);
                setError('');
              }}
            >
              {FEEDBACK_MODULES.map((m) => (
                <Select.Option key={m.tag} value={m.tag}>
                  {t(m.i18nKey)}
                </Select.Option>
              ))}
            </Select>
            {selectedModule ? (
              <div className='text-12px leading-18px text-t-tertiary'>{t(selectedModule.descriptionI18nKey)}</div>
            ) : null}
          </div>

          {/* Description */}
          <div className='flex flex-col gap-4px'>
            <label className='text-13px text-t-secondary'>
              {t('settings.bugReportDescriptionLabel')} <span className='text-red-500'>*</span>
            </label>
            <Input.TextArea
              placeholder={t('settings.bugReportDescriptionPlaceholder')}
              value={description}
              onChange={(val) => {
                setDescription(val);
                setError('');
              }}
              maxLength={DESCRIPTION_MAX_LENGTH}
              showWordLimit
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
          </div>

          {/* Screenshot Upload */}
          <div className='flex flex-col gap-4px'>
            <label className='text-13px text-t-secondary'>{t('settings.bugReportScreenshotLabel')}</label>
            <Upload
              className='[&_.arco-upload-trigger]:w-full'
              drag
              multiple
              accept={ACCEPTED_IMAGE_TYPES}
              autoUpload={false}
              fileList={screenshots}
              onChange={handleScreenshotChange}
              limit={MAX_SCREENSHOTS}
              showUploadList={{ startIcon: null }}
            >
              <div
                data-testid='feedback-report-upload-trigger'
                className='box-border flex min-h-180px w-full flex-col items-center justify-center gap-10px rd-8px border border-dashed border-border-2 bg-fill-1 px-20px py-28px text-center'
              >
                <Plus theme='outline' size='20' fill='currentColor' className='text-t-secondary' />
                <div className='max-w-320px text-16px leading-22px font-500 text-t-secondary'>
                  {t('settings.bugReportScreenshotDropzoneText')}
                </div>
                <div className='text-12px leading-18px text-t-tertiary'>{t('settings.bugReportScreenshotFormats')}</div>
              </div>
            </Upload>
          </div>

          {/* Auto-info Banner */}
          <div className='flex'>
            <div
              data-testid='feedback-report-auto-info'
              className='inline-flex max-w-full items-start gap-6px px-10px py-8px bg-fill-1 rd-8px text-12px leading-18px text-t-tertiary'
            >
              <Info theme='outline' size='14' className='mt-2px flex-shrink-0' />
              <span>{t('settings.bugReportAutoInfo')}</span>
            </div>
          </div>

          {error ? (
            <div className='px-12px py-8px bg-red-50 dark:bg-red-900/20 rd-8px text-13px text-red-500 b-1px b-solid b-red-200 dark:b-red-800'>
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </ModalWrapper>
  );
};

export default FeedbackReportModal;
