/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { SpeechModelDownloadStatus, SpeechToTextConfig } from '@/common/types/provider/speech';
import AionSelect from '@/renderer/components/base/AionSelect';
import { SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT } from '@/renderer/services/SpeechToTextService';
import { getClientBusinessSetting, setClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import { getModelStreamCapability } from '@/renderer/services/speech/speechStreamPolicy';
import { Button, Divider, Form, Input, Message, Progress, Switch } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SpeechTestPanel from './SpeechTestPanel';
import {
  DEEPGRAM_SPEECH_MODEL_PRESETS,
  DEFAULT_SPEECH_TO_TEXT_CONFIG,
  LOCAL_SPEECH_MODEL_PRESETS,
  OPENAI_SPEECH_MODEL_PRESETS,
  SPEECH_LANGUAGE_OPTIONS,
  applySpeechSource,
  buildModelOptions,
  deriveSpeechSource,
  getAutoTranscriptionPrompt,
  isValidHttpUrl,
  migrateSpeechLanguage,
  normalizeSpeechToTextConfig,
  type SpeechSource,
} from './speechSettingsUtils';

type OpenAIField = keyof NonNullable<SpeechToTextConfig['openai']>;
type DeepgramField = keyof NonNullable<SpeechToTextConfig['deepgram']>;

const FieldLabel: React.FC<{ labelKey: string; requirement: 'required' | 'optional' }> = ({
  labelKey,
  requirement,
}) => {
  const { t } = useTranslation();
  return (
    <span className='inline-flex items-center gap-6px'>
      <span>{t(labelKey)}</span>
      <span aria-hidden='true' className='text-12px text-t-tertiary'>
        ({t(requirement === 'required' ? 'settings.speechToTextRequired' : 'settings.speechToTextOptional')})
      </span>
    </span>
  );
};

const VoiceInputSection: React.FC = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SpeechToTextConfig>(DEFAULT_SPEECH_TO_TEXT_CONFIG);
  // Source is UI state, only initialized from the stored config. A purely
  // derived source would snap "custom" back to "openai" while base_url is
  // still empty, making custom mode unreachable for fresh users.
  const [source, setSource] = useState<SpeechSource>('openai');
  const lastCustomBaseUrlRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    const loadSpeechConfig = async () => {
      try {
        const stored = await getClientBusinessSetting('tools.speechToText');
        if (cancelled) {
          return;
        }
        const normalized = migrateSpeechLanguage(normalizeSpeechToTextConfig(stored));
        setConfig(normalized);
        setSource(deriveSpeechSource(normalized));
        if (deriveSpeechSource(normalized) === 'custom') {
          lastCustomBaseUrlRef.current = normalized.openai?.base_url ?? '';
        }
      } catch (error) {
        console.error('Failed to load speech-to-text config:', error);
      }
    };

    void loadSpeechConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateConfig = useCallback((updater: (current: SpeechToTextConfig) => SpeechToTextConfig) => {
    setConfig((current) => {
      const next = normalizeSpeechToTextConfig(updater(current));
      void setClientBusinessSetting('tools.speechToText', next).catch((error) => {
        console.error('Failed to save speech-to-text config:', error);
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT));
      }
      return next;
    });
  }, []);

  const handleSourceChange = useCallback(
    (value: string) => {
      setSource(value as SpeechSource);
      updateConfig((current) => {
        if (deriveSpeechSource(current) === 'custom') {
          lastCustomBaseUrlRef.current = current.openai?.base_url ?? '';
        }
        return applySpeechSource(current, value as SpeechSource, lastCustomBaseUrlRef.current);
      });
    },
    [updateConfig]
  );

  const handleOpenAIChange = useCallback(
    (field: OpenAIField, value: string) => {
      updateConfig(
        (current) =>
          ({
            ...current,
            openai: { ...DEFAULT_SPEECH_TO_TEXT_CONFIG.openai, ...current.openai, [field]: value },
          }) as SpeechToTextConfig
      );
    },
    [updateConfig]
  );

  const handleDeepgramChange = useCallback(
    (field: DeepgramField, value: string | boolean) => {
      updateConfig(
        (current) =>
          ({
            ...current,
            deepgram: { ...DEFAULT_SPEECH_TO_TEXT_CONFIG.deepgram, ...current.deepgram, [field]: value },
          }) as SpeechToTextConfig
      );
    },
    [updateConfig]
  );

  type LocalField = keyof NonNullable<SpeechToTextConfig['local']>;

  const handleLocalChange = useCallback(
    (field: LocalField, value: string) => {
      updateConfig(
        (current) =>
          ({
            ...current,
            local: { ...DEFAULT_SPEECH_TO_TEXT_CONFIG.local, ...current.local, [field]: value },
          }) as SpeechToTextConfig
      );
    },
    [updateConfig]
  );

  const isLocal = source === 'local';
  const isDeepgram = source === 'deepgram';
  const isCustom = source === 'custom';
  const activeLanguage =
    (isLocal ? config.local?.language : isDeepgram ? config.deepgram?.language : config.openai?.language) ?? '';
  const activeModel =
    (isLocal ? config.local?.model : isDeepgram ? config.deepgram?.model : config.openai?.model) ??
    (isLocal ? 'parakeet-tdt-0.6b-v3-int8' : '');
  const activeApiKey = (isDeepgram ? config.deepgram?.api_key : config.openai?.api_key) ?? '';
  const modelPresets = isLocal
    ? LOCAL_SPEECH_MODEL_PRESETS
    : isDeepgram
      ? DEEPGRAM_SPEECH_MODEL_PRESETS
      : OPENAI_SPEECH_MODEL_PRESETS;
  const customBaseUrl = config.openai?.base_url ?? '';
  const isBaseUrlInvalid = isCustom && customBaseUrl.trim() !== '' && !isValidHttpUrl(customBaseUrl);

  const [localModelStatus, setLocalModelStatus] = useState<SpeechModelDownloadStatus | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!isLocal || !activeModel || !ipcBridge.speech) {
      return;
    }
    let cancelled = false;

    const check = async () => {
      try {
        const res = await ipcBridge.speech?.checkModel?.invoke({ modelId: activeModel });
        if (!cancelled && res?.status) {
          setLocalModelStatus(res.status);
        }
      } catch {
        // ignore
      }
    };

    void check();

    const off = ipcBridge.speech?.onDownloadProgress?.on?.((progress) => {
      if (progress.modelId === activeModel) {
        setLocalModelStatus({
          modelId: progress.modelId,
          status: progress.percent >= 100 ? 'ready' : 'downloading',
          progress: progress.percent,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
        });
        if (progress.percent >= 100) {
          setIsDownloading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      off?.();
    };
  }, [activeModel, isLocal]);

  const handleDownloadModel = useCallback(async () => {
    if (!activeModel || isDownloading || !ipcBridge.speech) {
      return;
    }
    try {
      setIsDownloading(true);
      await ipcBridge.speech.downloadModel.invoke({ modelId: activeModel });
      setLocalModelStatus({
        modelId: activeModel,
        status: 'ready',
        progress: 100,
        downloadedBytes: 0,
        totalBytes: 0,
      });
      Message.success(t('settings.speechToTextLocalModelReady'));
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloading(false);
    }
  }, [activeModel, isDownloading, t]);

  const handleModelChange = useCallback(
    (value: string) => {
      if (isLocal) {
        handleLocalChange('model', value);
      } else if (isDeepgram) {
        handleDeepgramChange('model', value);
      } else {
        handleOpenAIChange('model', value);
      }
    },
    [handleDeepgramChange, handleLocalChange, handleOpenAIChange, isDeepgram, isLocal]
  );

  const handleLanguageChange = useCallback(
    (value: string) => {
      if (isLocal) {
        handleLocalChange('language', value);
        return;
      }
      if (isDeepgram) {
        handleDeepgramChange('language', value);
        return;
      }
      // Whisper-family `zh` is script-ambiguous: pair the language with a
      // same-script prompt (undefined clears it for non-Chinese languages).
      updateConfig(
        (current) =>
          ({
            ...current,
            openai: {
              ...DEFAULT_SPEECH_TO_TEXT_CONFIG.openai,
              ...current.openai,
              language: value,
              prompt: getAutoTranscriptionPrompt(value),
            },
          }) as SpeechToTextConfig
      );
    },
    [handleDeepgramChange, handleLocalChange, isDeepgram, isLocal, updateConfig]
  );

  const handleApiKeyChange = useCallback(
    (value: string) => {
      if (isDeepgram) {
        handleDeepgramChange('api_key', value);
      } else {
        handleOpenAIChange('api_key', value);
      }
    },
    [handleDeepgramChange, handleOpenAIChange, isDeepgram]
  );

  return (
    <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
      <div className='flex items-center justify-between gap-12px mb-8px'>
        <div className='flex flex-col gap-4px'>
          <span className='text-14px text-t-primary'>{t('settings.speechToText')}</span>
          <span className='text-13px text-t-secondary'>{t('settings.speechToTextDescription')}</span>
        </div>
        <Switch
          checked={config.enabled}
          onChange={(checked) => updateConfig((current) => ({ ...current, enabled: checked }))}
        />
      </div>

      {config.enabled && (
        <>
          <Divider className='mt-0px mb-20px' />

          <Form layout='horizontal' labelAlign='left' className='space-y-12px'>
            <Form.Item label={t('settings.speechToTextSource')}>
              <AionSelect value={source} onChange={handleSourceChange}>
                <AionSelect.Option value='local'>{t('settings.speechToTextSourceLocal')}</AionSelect.Option>
                <AionSelect.Option value='openai'>{t('settings.speechToTextSourceOpenAI')}</AionSelect.Option>
                <AionSelect.Option value='deepgram'>{t('settings.speechToTextSourceDeepgram')}</AionSelect.Option>
                <AionSelect.Option value='custom'>{t('settings.speechToTextSourceCustom')}</AionSelect.Option>
              </AionSelect>
            </Form.Item>

            {!isLocal && isCustom && (
              <Form.Item
                label={<FieldLabel labelKey='settings.speechToTextBaseUrl' requirement='required' />}
                validateStatus={isBaseUrlInvalid ? 'error' : undefined}
                help={isBaseUrlInvalid ? t('settings.speechToTextBaseUrlInvalid') : undefined}
              >
                <Input
                  value={customBaseUrl}
                  placeholder={t('settings.speechToTextBaseUrlPlaceholder')}
                  onChange={(value) => handleOpenAIChange('base_url', value)}
                />
              </Form.Item>
            )}

            {!isLocal && (
              <Form.Item
                label={
                  <FieldLabel labelKey='settings.speechToTextApiKey' requirement={isCustom ? 'optional' : 'required'} />
                }
              >
                <Input.Password value={activeApiKey} visibilityToggle onChange={handleApiKeyChange} />
              </Form.Item>
            )}

            <Form.Item label={t('settings.speechToTextModel')}>
              <div className='flex flex-col gap-8px w-full'>
                <AionSelect
                  value={activeModel || undefined}
                  onChange={handleModelChange}
                  allowCreate={isCustom}
                  showSearch={isCustom}
                  placeholder={isCustom ? t('settings.speechToTextModelPlaceholder') : undefined}
                >
                  {buildModelOptions(modelPresets, activeModel).map((model) => {
                    const capability = isLocal ? 'unsupported' : getModelStreamCapability(source, model);
                    const badgeText =
                      capability === 'supported'
                        ? t('settings.speechToTextStreamingBadge')
                        : capability === 'unsupported'
                          ? t('settings.speechToTextWholeBadge')
                          : null;
                    return (
                      <AionSelect.Option key={model} value={model}>
                        {model}
                        {badgeText !== null && <span className='text-12px text-t-tertiary ms-8px'>{badgeText}</span>}
                      </AionSelect.Option>
                    );
                  })}
                </AionSelect>

                {isLocal && (
                  <div className='flex items-center justify-between gap-12px mt-4px p-10px bg-fill-2 rd-8px'>
                    {localModelStatus?.status === 'ready' ? (
                      <span className='text-13px text-success flex items-center gap-6px'>
                        ✓ {t('settings.speechToTextLocalModelReady')}
                      </span>
                    ) : isDownloading || localModelStatus?.status === 'downloading' ? (
                      <div className='flex flex-col gap-4px w-full'>
                        <div className='flex justify-between text-12px text-t-secondary'>
                          <span>{t('settings.speechToTextDownloadingModel')}</span>
                          <span>{localModelStatus?.progress ?? 0}%</span>
                        </div>
                        <Progress percent={localModelStatus?.progress ?? 0} size='small' showText={false} />
                      </div>
                    ) : (
                      <div className='flex items-center justify-between w-full'>
                        <span className='text-12px text-t-secondary'>Parakeet TDT (~670 MB)</span>
                        <Button size='small' type='primary' loading={isDownloading} onClick={handleDownloadModel}>
                          {t('settings.speechToTextDownloadModel')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Form.Item>

            <Form.Item label={t('settings.speechToTextLanguage')}>
              <AionSelect value={activeLanguage} onChange={handleLanguageChange}>
                {SPEECH_LANGUAGE_OPTIONS.map((option) => (
                  <AionSelect.Option key={option.value || 'auto'} value={option.value}>
                    {option.label ?? t('settings.speechToTextLanguageAuto')}
                  </AionSelect.Option>
                ))}
              </AionSelect>
            </Form.Item>
          </Form>
          <SpeechTestPanel config={config} source={source} />
        </>
      )}
    </div>
  );
};

export default VoiceInputSection;
