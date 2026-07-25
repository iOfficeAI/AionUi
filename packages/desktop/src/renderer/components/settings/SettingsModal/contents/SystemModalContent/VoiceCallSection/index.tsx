/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import { getClientBusinessSetting, setClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import {
  normalizeVoiceCallSetting,
  notifyVoiceCallSettingChanged,
  type VoiceCallSetting,
} from '@/renderer/services/speech/voiceCall';
import { Select, Switch } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const modelKey = (providerId: string, model: string) => `${providerId}::${model}`;

const VoiceCallSection: React.FC = () => {
  const { t } = useTranslation();
  const { data: providerConfig } = useProvidersQuery();
  const [setting, setSetting] = useState<VoiceCallSetting>(() => normalizeVoiceCallSetting(undefined));

  useEffect(() => {
    let cancelled = false;
    void getClientBusinessSetting('tools.voiceCall')
      .then((stored) => {
        if (!cancelled) setSetting(normalizeVoiceCallSetting(stored));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 电话对话是纯聊天，不需要 function calling。这里不按
  // function_calling / excludeFromPrimary 能力标记过滤，
  // 只要求 provider 与 model 处于启用状态即可入选。
  const options = useMemo(
    () =>
      (Array.isArray(providerConfig) ? providerConfig : [])
        .filter((provider) => provider.enabled !== false)
        .flatMap((provider) =>
          (provider.models || [])
            .filter((model) => provider.model_enabled?.[model] !== false)
            .map((model) => ({
              value: modelKey(provider.id, model),
              label: `${provider.name || provider.id} · ${model}`,
            }))
        ),
    [providerConfig]
  );
  const selectedModel = setting.providerId && setting.model ? modelKey(setting.providerId, setting.model) : undefined;

  const save = (next: VoiceCallSetting) => {
    const normalized = normalizeVoiceCallSetting(next);
    setSetting(normalized);
    void setClientBusinessSetting('tools.voiceCall', normalized)
      .then(notifyVoiceCallSettingChanged)
      .catch(() => {
        // The next settings reload restores backend state.
      });
  };

  return (
    <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
      <div className='flex items-center justify-between gap-16px'>
        <div>
          <div className='text-14px text-1 font-medium'>{t('settings.voiceCall', { defaultValue: '电话模式' })}</div>
          <div className='text-12px text-3 mt-4px'>
            {t('settings.voiceCallHint', {
              defaultValue: '使用语音输入、快速模型和自动朗读进行连续对话；默认关闭。',
            })}
          </div>
        </div>
        <Switch checked={setting.enabled} onChange={(enabled) => save({ ...setting, enabled })} />
      </div>

      {setting.enabled && (
        <div className='pt-12px border-t border-border-2'>
          <div className='text-13px text-2 mb-8px'>
            {t('settings.voiceCallModel', { defaultValue: '通话用模型（可选）' })}
          </div>
          <Select
            allowClear
            value={selectedModel}
            options={options}
            placeholder={t('settings.voiceCallModelFallback', { defaultValue: '未选择时沿用会话当前模型' })}
            onChange={(value) => {
              const [providerId, ...modelParts] = String(value || '').split('::');
              const model = modelParts.join('::');
              save({ ...setting, providerId: providerId || undefined, model: model || undefined });
            }}
            onClear={() => save({ ...setting, providerId: undefined, model: undefined })}
            className='w-full'
          />
          {options.length === 0 && (
            <div className='text-12px text-3 mt-6px'>
              {t('settings.voiceCallNoModels', {
                defaultValue: '未检测到可选模型商，进入通话时将沿用会话当前模型',
              })}
            </div>
          )}
          <div className='text-12px text-3 mt-6px'>
            {t('settings.voiceCallModelHint', {
              defaultValue: '建议选择响应快的小模型。CLI 会话仍沿用其当前模型。',
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceCallSection;
