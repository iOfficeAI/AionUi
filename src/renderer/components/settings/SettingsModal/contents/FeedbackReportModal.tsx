/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import { FEEDBACK_MODULES } from './feedbackModules';
import { Button, Input, Select, Message, Upload } from '@arco-design/web-react';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import { Info } from '@icon-park/react';
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;
const MAX_SCREENSHOTS = 3;
const ACCEPTED_IMAGE_TYPES = '.png,.jpg,.jpeg,.gif';

type FeedbackReportModalProps = {
  visible: boolean;
  onCancel: () => void;
};

const FeedbackReportModal: React.FC<FeedbackReportModalProps> = ({ visible, onCancel }) => {
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [module, setModule] = useState<string | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<UploadItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setTitle('');
    setModule(undefined);
    setDescription('');
    setScreenshots([]);
    setError('');
  }, []);

  const handleCancel = useCallback(() => {
    resetForm();
    onCancel();
  }, [onCancel, resetForm]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !module || !description.trim()) {
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
      const screenshotBuffers: Array<{ name: string; data: Uint8Array; type: string }> = [];
      for (const item of screenshots) {
        if (item.originFile) {
          const buffer = await item.originFile.arrayBuffer();
          const ext = item.originFile.name.split('.').pop() || 'png';
          screenshotBuffers.push({
            name: item.originFile.name,
            data: new Uint8Array(buffer),
            type: item.originFile.type || `image/${ext}`,
          });
        }
      }

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

      Sentry.withScope((scope) => {
        scope.setTag('type', 'user-feedback');
        scope.setTag('module', module);

        Sentry.captureEvent(
          {
            level: 'info',
            message: title.trim(),
            extra: {
              description: description.trim(),
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
  }, [title, module, description, screenshots, t, onCancel, resetForm]);

  const isFormValid = title.trim().length > 0 && module !== undefined && description.trim().length > 0;

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
    setScreenshots(deduped.map((f) => (f.status === 'done' ? f : { ...f, status: 'done' as const })));
  }, []);

  return (
    <AionModal
      visible={visible}
      onCancel={handleCancel}
      footer={null}
      header={t('settings.bugReportTitle')}
      size='medium'
    >
      <div className='flex flex-col gap-16px px-20px pb-20px'>
        {/* Title */}
        <div className='flex flex-col gap-4px'>
          <label className='text-13px text-t-secondary'>
            {t('settings.bugReportTitleLabel')} <span className='text-red-500'>*</span>
          </label>
          <Input
            placeholder={t('settings.bugReportTitlePlaceholder')}
            value={title}
            onChange={(val) => {
              setTitle(val);
              setError('');
            }}
            maxLength={TITLE_MAX_LENGTH}
            showWordLimit
          />
        </div>

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
            autoSize={{ minRows: 4, maxRows: 8 }}
          />
        </div>

        {/* Screenshot Upload */}
        <div className='flex flex-col gap-4px'>
          <label className='text-13px text-t-secondary'>{t('settings.bugReportScreenshotLabel')}</label>
          <Upload
            drag
            multiple
            accept={ACCEPTED_IMAGE_TYPES}
            autoUpload={false}
            fileList={screenshots}
            onChange={handleScreenshotChange}
            limit={MAX_SCREENSHOTS}
            tip={`${t('settings.bugReportScreenshotFormats')}`}
            showUploadList={{ startIcon: null }}
          />
        </div>

        {/* Auto-info Banner */}
        <div className='flex items-center gap-8px px-12px py-10px bg-fill-1 rd-8px text-12px text-t-tertiary'>
          <Info theme='outline' size='16' className='flex-shrink-0' />
          <span>{t('settings.bugReportAutoInfo')}</span>
        </div>

        {/* Error Message */}
        {error && (
          <div className='px-12px py-8px bg-red-50 dark:bg-red-900/20 rd-8px text-13px text-red-500 b-1px b-solid b-red-200 dark:b-red-800'>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className='flex justify-end gap-12px'>
          <Button onClick={handleCancel}>{t('settings.bugReportCancel')}</Button>
          <Button type='primary' onClick={handleSubmit} loading={submitting} disabled={!isFormValid}>
            {t('settings.bugReportSubmit')}
          </Button>
        </div>
      </div>
    </AionModal>
  );
};

export default FeedbackReportModal;
