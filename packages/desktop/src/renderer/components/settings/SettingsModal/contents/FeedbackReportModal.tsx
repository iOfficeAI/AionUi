/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@renderer/components/base/AionModal';
import { FEEDBACK_MODULES } from './feedbackModules';
import { useTalkToButler } from '@/renderer/hooks/assistant/useTalkToButler';
import { uploadFileViaHttp } from '@/renderer/services/FileService';
import { Button, Input, Select, Message, Upload } from '@arco-design/web-react';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import { Info } from '@icon-park/react';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { RefTextAreaType } from '@arco-design/web-react/es/Input/textarea';
import { useTranslation } from 'react-i18next';
import {
  type FeedbackAttachment,
  type FeedbackEventExtra,
  type FeedbackEventTags,
  submitFeedbackReport,
} from '@/renderer/services/feedback/submitFeedbackReport';
import type {
  FeedbackDiagnosticsExplicitContext,
  FeedbackDiagnosticsProfile,
} from '@/common/types/feedbackDiagnostics';
import { captureFeedbackRoute } from '@/renderer/services/feedback/routeContext';

export type { FeedbackEventExtra, FeedbackEventTags } from '@/renderer/services/feedback/submitFeedbackReport';

const DESCRIPTION_MAX_LENGTH = 2000;
const MAX_SCREENSHOTS = 3;
const ACCEPTED_IMAGE_TYPES = '.png,.jpg,.jpeg,.gif';

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

export type PrefilledScreenshot = {
  filename: string;
  data: Uint8Array;
  type: string;
};

type FeedbackReportModalProps = {
  visible: boolean;
  onCancel: () => void;
  defaultModule?: string;
  prefilledScreenshots?: PrefilledScreenshot[];
  feedbackTags?: FeedbackEventTags;
  feedbackExtra?: FeedbackEventExtra;
  feedbackDiagnosticsContext?: {
    explicitContext?: FeedbackDiagnosticsExplicitContext;
    explicitProfiles?: FeedbackDiagnosticsProfile[];
    routeAtOpen?: string;
  };
};

const FeedbackReportModal: React.FC<FeedbackReportModalProps> = ({
  visible,
  onCancel,
  defaultModule,
  prefilledScreenshots,
  feedbackTags,
  feedbackExtra,
  feedbackDiagnosticsContext,
}) => {
  const { t } = useTranslation();
  const talkToButler = useTalkToButler();

  const [module, setModule] = useState<string | undefined>(defaultModule);
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<UploadItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const descriptionRef = useRef<RefTextAreaType | null>(null);
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setModule(undefined);
    setDescription('');
    setScreenshots([]);
    setError('');
  }, []);

  // Auto-focus the description textarea when the modal opens so users can
  // start typing immediately. Deferred one frame after the open transition so
  // ModalWrapper's internal focus lock has finished installing its traps.
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      descriptionRef.current?.focus?.();
    }, 80);
    return () => window.clearTimeout(id);
  }, [visible]);

  // Seed form with prefilled module + screenshots whenever the modal (re)opens.
  // Prefilled screenshots are auto-captured by the one-click feedback entry points
  // and arrive as raw bytes; wrap them as File/UploadItem so the existing Upload
  // submit flow handles them identically to user-uploaded images.
  useEffect(() => {
    if (!visible) return;
    setModule(defaultModule);
    if (prefilledScreenshots && prefilledScreenshots.length > 0) {
      const items: UploadItem[] = prefilledScreenshots.slice(0, MAX_SCREENSHOTS).map((shot, index) => {
        // Normalize into a Blob so the BlobPart typing accepts SharedArrayBuffer-backed
        // Uint8Array values returned over IPC on some Electron/TS target combos.
        const blob = new Blob([shot.data.slice().buffer as ArrayBuffer], { type: shot.type });
        const file = new File([blob], shot.filename, { type: shot.type });
        return {
          uid: `prefilled-${Date.now()}-${index}`,
          name: shot.filename,
          originFile: file,
          status: 'done',
        };
      });
      setScreenshots(items);
    }
  }, [visible, defaultModule, prefilledScreenshots]);

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
      const attachments = (
        await Promise.all(
          screenshots.map(async (item, index) => {
            if (!item.originFile) {
              return null;
            }

            const buffer = await item.originFile.arrayBuffer();
            const ext = item.originFile.name.split('.').pop() || 'png';
            return {
              filename: `screenshot-${index + 1}-${item.originFile.name}`,
              data: new Uint8Array(buffer),
              contentType: item.originFile.type || `image/${ext}`,
            };
          })
        )
      ).filter((item): item is FeedbackAttachment => item !== null);

      await submitFeedbackReport({
        attachments,
        collectDbDiagnostics: {
          explicitContext: feedbackDiagnosticsContext?.explicitContext,
          explicitProfiles: feedbackDiagnosticsContext?.explicitProfiles,
          routeAtOpen: feedbackDiagnosticsContext?.routeAtOpen,
          routeAtSubmit: captureFeedbackRoute(),
          selectedModule: module,
        },
        collectLogs: true,
        description,
        extra: feedbackExtra,
        module,
        moduleLabel: t(selectedModule?.i18nKey ?? 'settings.bugReportModuleOther'),
        tags: feedbackTags,
      });

      Message.success(t('settings.bugReportSuccess'));
      resetForm();
      onCancel();
    } catch {
      setError(t('settings.bugReportError'));
    } finally {
      setSubmitting(false);
    }
  }, [
    module,
    description,
    screenshots,
    t,
    onCancel,
    resetForm,
    selectedModule,
    feedbackExtra,
    feedbackTags,
    feedbackDiagnosticsContext,
  ]);

  // "Solve via chat": hand the report to the AionUi Butler for on-the-spot
  // diagnosis instead of submitting to the team. The typed description + module
  // become a structured prompt; screenshots are uploaded to disk so they ride
  // along in the chat input (reusing the same upload path as pasted images).
  const handleDiagnose = useCallback(async () => {
    if (!description.trim()) return;
    setError('');
    setDiagnosing(true);
    try {
      const files = (
        await Promise.all(
          screenshots.map(async (item) => {
            if (!item.originFile) return null;
            try {
              return await uploadFileViaHttp(item.originFile);
            } catch (uploadError) {
              console.error('[feedback] failed to upload screenshot for diagnosis:', uploadError);
              return null;
            }
          })
        )
      ).filter((path): path is string => typeof path === 'string' && path.length > 0);

      const moduleLabel = t(selectedModule?.i18nKey ?? 'settings.bugReportModuleOther');
      const prompt = t('settings.talkToButler.prompt.diagnose', {
        defaultValue:
          'I ran into a problem with AionUi, please help me diagnose it.\n\n[Module] {{module}}\n[Description] {{description}}\n[Attachments] see the screenshots in the input.\n\nPlease diagnose the cause and tell me how to fix it.',
        module: moduleLabel,
        description: description.trim(),
      });

      await talkToButler({ prompt, files });
      resetForm();
      onCancel();
    } catch {
      setError(t('settings.bugReportError'));
    } finally {
      setDiagnosing(false);
    }
  }, [description, screenshots, selectedModule, t, talkToButler, resetForm, onCancel]);

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
    <AionModal
      variant='standard'
      header={{ title: t('settings.bugReportTitle'), showClose: true }}
      visible={visible}
      onCancel={handleCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText={t('settings.bugReportSubmit')}
      cancelText={t('settings.bugReportCancel')}
      okButtonProps={{ disabled: !isFormValid }}
      alignCenter
      footer={{
        render: () => (
          <div className='flex items-center justify-between gap-8px'>
            {/* "Solve via chat" is an alternative self-service path — kept on the
                left as a borderless text action so it reads as secondary to the
                primary submit, not as a competing filled button. */}
            <Button
              type='text'
              loading={diagnosing}
              disabled={!description.trim() || submitting}
              onClick={() => void handleDiagnose()}
              data-testid='btn-feedback-diagnose'
              className='!text-primary-6 hover:!text-primary-5'
            >
              {t('settings.talkToButler.solveViaChat', { defaultValue: 'Solve via chat' })}
            </Button>
            <div className='flex items-center gap-8px'>
              <Button onClick={handleCancel} className='px-20px min-w-80px' style={{ borderRadius: 8 }}>
                {t('settings.bugReportCancel')}
              </Button>
              <Button
                type='primary'
                loading={submitting}
                disabled={!isFormValid || diagnosing}
                onClick={() => void handleSubmit()}
                className='px-20px min-w-80px'
                style={{ borderRadius: 8 }}
              >
                {t('settings.bugReportSubmit')}
              </Button>
            </div>
          </div>
        ),
      }}
      className='w-[min(600px,calc(100vw-32px))] max-w-600px'
      autoFocus={false}
      // The feedback modal is global and may be opened from inside another
      // AionModal (e.g. the Agent editor). Arco's default z-index stacks
      // modals in mount order, which leaves the feedback modal under the
      // pre-existing modal when both are open. Bump wrap+mask above the
      // standard 1001 so feedback always appears on top.
      wrapStyle={{ zIndex: 1050 }}
      maskStyle={{ zIndex: 1050 }}
    >
      <div data-testid='feedback-report-scroll-body' className='overflow-x-hidden'>
        <div className='flex flex-col gap-16px'>
          {/* Description */}
          <div className='flex flex-col gap-4px'>
            <label className='text-13px text-t-secondary'>
              {t('settings.bugReportDescriptionLabel')} <span className='text-red-500'>*</span>
            </label>
            <Input.TextArea
              ref={descriptionRef}
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

          {/* Screenshot Upload */}
          <div className='flex flex-col gap-4px'>
            <label className='text-13px text-t-secondary'>
              {t('settings.bugReportScreenshotLabel')}
              {screenshots.length > 0 && (
                <span data-testid='feedback-report-screenshot-count'>
                  {' '}
                  {t('settings.bugReportScreenshotUploaded', { count: screenshots.length })}
                </span>
              )}
            </label>
            <div data-testid='feedback-report-upload-trigger'>
              <Upload
                listType='picture-card'
                multiple
                accept={ACCEPTED_IMAGE_TYPES}
                autoUpload={false}
                fileList={screenshots}
                onChange={handleScreenshotChange}
                limit={MAX_SCREENSHOTS}
                imagePreview
              />
            </div>
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
    </AionModal>
  );
};

export default FeedbackReportModal;
