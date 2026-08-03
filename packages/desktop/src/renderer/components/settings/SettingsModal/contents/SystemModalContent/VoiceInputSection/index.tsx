/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import type { VoiceInputHotkeySetting } from '@/common/config/clientSettings';
import AionSelect from '@/renderer/components/base/AionSelect';
import { SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT } from '@/renderer/services/SpeechToTextService';
import { getClientBusinessSetting, setClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import { getModelStreamCapability } from '@/renderer/services/speech/speechStreamPolicy';
import { Button, Divider, Form, Input, InputNumber, Switch } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SpeechTestPanel from './SpeechTestPanel';
import {
  DEFAULT_SPEECH_TO_TEXT_CONFIG,
  DEFAULT_VOICE_INPUT_HOTKEY_SETTING,
  VOICE_INPUT_HOTKEY_CHANGED_EVENT,
  normalizeAutoSendUndoMs,
  normalizeSpeechToTextConfig,
  normalizeVoiceInputHotkeySetting,
  DEEPGRAM_SPEECH_MODEL_PRESETS,
  OPENAI_SPEECH_MODEL_PRESETS,
  SPEECH_LANGUAGE_OPTIONS,
  applySpeechSource,
  buildModelOptions,
  deriveSpeechSource,
  getAutoTranscriptionPrompt,
  isValidHttpUrl,
  migrateSpeechLanguage,
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

  // Global voice-input hotkey (MVP: press to start, press again to stop).
  // Off by default — when disabled the app behaves identically to the original
  // build, so this is purely additive.
  const [hotkey, setHotkey] = useState<VoiceInputHotkeySetting>(DEFAULT_VOICE_INPUT_HOTKEY_SETTING);
  const [capturingHotkey, setCapturingHotkey] = useState(false);

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

  // Load the global voice-input hotkey setting (separate key from the STT
  // config, defaulting to disabled/off).
  useEffect(() => {
    let cancelled = false;
    const loadHotkey = async () => {
      try {
        const stored = await getClientBusinessSetting('feature.voiceInputHotkey');
        if (!cancelled) {
          setHotkey(normalizeVoiceInputHotkeySetting(stored));
        }
      } catch (error) {
        console.error('Failed to load voice-input hotkey setting:', error);
      }
    };
    void loadHotkey();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveHotkey = useCallback((next: VoiceInputHotkeySetting) => {
    setHotkey(next);
    void setClientBusinessSetting('feature.voiceInputHotkey', next).catch((error) => {
      console.error('Failed to save voice-input hotkey setting:', error);
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(VOICE_INPUT_HOTKEY_CHANGED_EVENT));
    }
  }, []);

  const handleHotkeyEnabledChange = useCallback(
    (checked: boolean | string) => {
      saveHotkey({ enabled: Boolean(checked), accelerator: hotkey.accelerator });
    },
    [hotkey.accelerator, saveHotkey]
  );

  // Capture the next key combination as the hotkey accelerator.
  const handleHotkeyCapture = useCallback(() => {
    setCapturingHotkey(true);
  }, []);

  useEffect(() => {
    if (!capturingHotkey) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      // Ignore lone modifier presses — wait for a real key.
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
        return;
      }
      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) {
        parts.push('CommandOrControl');
      }
      if (event.altKey) {
        parts.push('Alt');
      }
      if (event.shiftKey) {
        parts.push('Shift');
      }
      const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
      const accelerator = [...parts, key].join('+');
      saveHotkey({ enabled: hotkey.enabled, accelerator });
      setCapturingHotkey(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturingHotkey, hotkey.enabled, saveHotkey]);

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

  const handleAutoSendChange = useCallback(
    (checked: boolean | string) => {
      updateConfig((current) => ({ ...current, autoSend: Boolean(checked) }));
    },
    [updateConfig]
  );

  const handleAutoSendUndoMsChange = useCallback(
    (value: number) => {
      updateConfig((current) => ({ ...current, autoSendUndoMs: normalizeAutoSendUndoMs(value) }));
    },
    [updateConfig]
  );

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

  const isDeepgram = source === 'deepgram';
  const isCustom = source === 'custom';
  const activeLanguage = (isDeepgram ? config.deepgram?.language : config.openai?.language) ?? '';
  const activeModel = (isDeepgram ? config.deepgram?.model : config.openai?.model) ?? '';
  const activeApiKey = (isDeepgram ? config.deepgram?.api_key : config.openai?.api_key) ?? '';
  const modelPresets = isDeepgram ? DEEPGRAM_SPEECH_MODEL_PRESETS : OPENAI_SPEECH_MODEL_PRESETS;
  const customBaseUrl = config.openai?.base_url ?? '';
  const isBaseUrlInvalid = isCustom && customBaseUrl.trim() !== '' && !isValidHttpUrl(customBaseUrl);

  const handleModelChange = useCallback(
    (value: string) => {
      if (isDeepgram) {
        handleDeepgramChange('model', value);
      } else {
        handleOpenAIChange('model', value);
      }
    },
    [handleDeepgramChange, handleOpenAIChange, isDeepgram]
  );

  const handleLanguageChange = useCallback(
    (value: string) => {
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
    [handleDeepgramChange, isDeepgram, updateConfig]
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
                <AionSelect.Option value='openai'>{t('settings.speechToTextSourceOpenAI')}</AionSelect.Option>
                <AionSelect.Option value='deepgram'>{t('settings.speechToTextSourceDeepgram')}</AionSelect.Option>
                <AionSelect.Option value='custom'>{t('settings.speechToTextSourceCustom')}</AionSelect.Option>
              </AionSelect>
            </Form.Item>

            {isCustom && (
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

            <Form.Item
              label={
                <FieldLabel labelKey='settings.speechToTextApiKey' requirement={isCustom ? 'optional' : 'required'} />
              }
            >
              <Input.Password value={activeApiKey} visibilityToggle onChange={handleApiKeyChange} />
            </Form.Item>

            <Form.Item label={t('settings.speechToTextModel')}>
              <AionSelect
                value={activeModel || undefined}
                onChange={handleModelChange}
                allowCreate={isCustom}
                showSearch={isCustom}
                placeholder={isCustom ? t('settings.speechToTextModelPlaceholder') : undefined}
              >
                {buildModelOptions(modelPresets, activeModel).map((model) => {
                  const capability = getModelStreamCapability(source, model);
                  const badgeText =
                    capability === 'supported'
                      ? t('settings.speechToTextStreamingBadge')
                      : capability === 'unsupported'
                        ? t('settings.speechToTextWholeBadge')
                        : null;
                  return (
                    <AionSelect.Option key={model} value={model}>
                      {model}
                      {badgeText !== null && <span className='text-12px text-t-tertiary ml-8px'>{badgeText}</span>}
                    </AionSelect.Option>
                  );
                })}
              </AionSelect>
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

          <Divider className='mt-20px mb-20px' />

          <div className='flex flex-col gap-16px'>
            <span className='text-14px text-t-primary'>
              {t('settings.voiceInputConveniences', { defaultValue: '语音输入便捷设置' })}
            </span>

            <div className='flex items-center justify-between gap-12px'>
              <div className='flex flex-col gap-4px'>
                <span className='text-13px text-t-primary'>
                  {t('settings.voiceInputAutoSend', { defaultValue: '转写后自动发送' })}
                </span>
                <span className='text-12px text-t-secondary'>
                  {t('settings.voiceInputAutoSendHint', {
                    defaultValue: '开启后，语音转写完成会先进入可撤销窗口，倒计时结束自动发送',
                  })}
                </span>
              </div>
              <Switch checked={Boolean(config.autoSend)} onChange={handleAutoSendChange} />
            </div>

            {config.autoSend && (
              <Form.Item label={t('settings.voiceInputUndoSeconds', { defaultValue: '撤销窗口（秒）' })}>
                <InputNumber
                  min={1}
                  max={10}
                  step={0.5}
                  value={normalizeAutoSendUndoMs(config.autoSendUndoMs) / 1000}
                  onChange={(value) => handleAutoSendUndoMsChange(Number(value) * 1000)}
                  style={{ width: 140 }}
                />
              </Form.Item>
            )}

            <Divider className='mt-0px mb-0px' />

            <div className='flex items-center justify-between gap-12px'>
              <div className='flex flex-col gap-4px'>
                <span className='text-13px text-t-primary'>
                  {t('settings.voiceInputHotkey', { defaultValue: '全局快捷键' })}
                </span>
                <span className='text-12px text-t-secondary'>
                  {t('settings.voiceInputHotkeyHint', {
                    defaultValue: '开启后可用快捷键开始/停止录音（再次按下同一组合键切换）',
                  })}
                </span>
              </div>
              <Switch checked={hotkey.enabled} onChange={handleHotkeyEnabledChange} />
            </div>

            {hotkey.enabled && (
              <Form.Item label={t('settings.voiceInputHotkeyAccelerator', { defaultValue: '快捷键组合' })}>
                <div className='flex items-center gap-8px'>
                  <Button size='small' type={capturingHotkey ? 'primary' : 'secondary'} onClick={handleHotkeyCapture}>
                    {capturingHotkey
                      ? t('settings.voiceInputHotkeyCapturing', { defaultValue: '请按下快捷键…' })
                      : hotkey.accelerator}
                  </Button>
                  {capturingHotkey && (
                    <Button size='small' type='text' onClick={() => setCapturingHotkey(false)}>
                      {t('common.cancel', { defaultValue: '取消' })}
                    </Button>
                  )}
                </div>
              </Form.Item>
            )}
          </div>

          <SpeechTestPanel config={config} source={source} />
        </>
      )}
    </div>
  );
};

export default VoiceInputSection;
