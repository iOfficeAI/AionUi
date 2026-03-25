import { ipcBridge } from '@/common';
import type { VoiceInputConfig, VoiceInputState, VoiceInputStats } from '@/common/types/voiceInput';
import { DEFAULT_VOICE_INPUT_CONFIG, EMPTY_VOICE_INPUT_STATS } from '@/common/types/voiceInput';
import { Alert, Button, Form, Input, Select, Space, Switch, Tag, Typography } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const splitListInput = (value: string): string[] => {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
};

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat().format(value);
};

const formatDuration = (translate: (key: string) => string, durationMs: number): string => {
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds <= 0) {
    return translate('settings.voiceInput.durationLessThanSecond');
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}${translate('settings.voiceInput.durationHoursShort')}`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}${translate('settings.voiceInput.durationMinutesShort')}`);
  }

  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}${translate('settings.voiceInput.durationSecondsShort')}`);
  }

  return parts.join(' ');
};

const statusColorMap: Record<string, string> = {
  idle: 'gray',
  recording: 'red',
  transcribing: 'orange',
  inserted: 'green',
  copied: 'arcoblue',
  error: 'orangered',
  unsupported: 'gray',
  granted: 'green',
  denied: 'red',
  restricted: 'orange',
  'not-determined': 'gray',
  copied_status: 'arcoblue',
  recorded: 'gray',
  failed: 'red',
};

const VoiceInputSection: React.FC = () => {
  const { t } = useTranslation();
  const voiceInputApi = ipcBridge.voiceInput;
  const [draft, setDraft] = useState<VoiceInputConfig>(DEFAULT_VOICE_INPUT_CONFIG);
  const [state, setState] = useState<VoiceInputState | null>(null);
  const [stats, setStats] = useState<VoiceInputStats>(EMPTY_VOICE_INPUT_STATS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<'permissions' | 'start' | 'stop' | null>(null);

  const languageHintsText = useMemo(() => draft.providers.dashscope.languageHints.join(', '), [draft]);
  const hotwordsText = useMemo(() => draft.providers.dashscope.hotwords.join('\n'), [draft]);
  const statItems = useMemo(
    () => [
      {
        label: t('settings.voiceInput.totalTranscriptions'),
        value: formatNumber(stats.totalTranscriptionCount),
      },
      {
        label: t('settings.voiceInput.totalRecordingDuration'),
        value: formatDuration(t, stats.totalRecordingDurationMs),
      },
      {
        label: t('settings.voiceInput.totalTranscribedCharacters'),
        value: formatNumber(stats.totalTranscribedCharacterCount),
      },
    ],
    [stats, t]
  );

  const refreshRuntimeData = async (): Promise<void> => {
    if (!voiceInputApi) {
      setState({
        supported: false,
        enabled: false,
        providerId: DEFAULT_VOICE_INPUT_CONFIG.providerId,
        triggerMode: DEFAULT_VOICE_INPUT_CONFIG.triggerMode,
        status: 'unsupported',
        permissions: {
          microphone: 'unsupported',
          accessibility: 'unsupported',
        },
        updatedAt: Date.now(),
      });
      setStats(EMPTY_VOICE_INPUT_STATS);
      return;
    }

    const [nextState, nextStats] = await Promise.all([
      voiceInputApi.getState.invoke(),
      voiceInputApi.getStats.invoke(),
    ]);
    setState(nextState);
    setStats(nextStats);
  };

  const refresh = async (): Promise<void> => {
    if (!voiceInputApi) {
      setDraft(DEFAULT_VOICE_INPUT_CONFIG);
      await refreshRuntimeData();
      return;
    }

    const config = await voiceInputApi.getConfig.invoke();
    setDraft(config);
    await refreshRuntimeData();
  };

  const persistDraft = async (): Promise<VoiceInputConfig | null> => {
    if (!voiceInputApi) {
      return null;
    }

    const saved = await voiceInputApi.setConfig.invoke({ config: draft });
    setDraft(saved);
    return saved;
  };

  useEffect(() => {
    let disposed = false;

    void refresh()
      .catch((error) => {
        console.error('[VoiceInputSection] Failed to load voice input data:', error);
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    const unsubscribe = voiceInputApi?.stateChanged.on((nextState) => {
      if (!disposed) {
        setState(nextState);
        void voiceInputApi.getStats
          .invoke()
          .then((nextStats) => {
            if (!disposed) {
              setStats(nextStats);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [voiceInputApi]);

  const updateDraft = (updater: (current: VoiceInputConfig) => VoiceInputConfig): void => {
    setDraft((current) => updater(current));
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await persistDraft();
      await refreshRuntimeData();
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPermissions = async (): Promise<void> => {
    setActionLoading('permissions');
    try {
      await voiceInputApi?.requestPermissions.invoke();
      await refreshRuntimeData();
    } finally {
      setActionLoading(null);
    }
  };

  const handleStart = async (): Promise<void> => {
    setActionLoading('start');
    try {
      await persistDraft();
      await voiceInputApi?.startManualCapture.invoke();
      await refreshRuntimeData();
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async (): Promise<void> => {
    setActionLoading('stop');
    try {
      await voiceInputApi?.stopManualCapture.invoke();
      await refreshRuntimeData();
    } finally {
      setActionLoading(null);
    }
  };

  const renderPermissionTag = (label: string, value: string | undefined) => (
    <div className='flex items-center justify-between gap-12px'>
      <span className='text-13px text-t-secondary'>{label}</span>
      <Tag color={statusColorMap[value || 'gray'] || 'gray'}>
        {t(`settings.voiceInput.permissions.${value || 'unsupported'}`)}
      </Tag>
    </div>
  );

  return (
    <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-16px'>
      <div className='flex items-start justify-between gap-16px'>
        <div className='space-y-4px'>
          <div className='text-15px text-t-primary font-600'>{t('settings.voiceInput.title')}</div>
          <div className='text-13px text-t-secondary'>{t('settings.voiceInput.description')}</div>
        </div>
        <Switch
          checked={draft.enabled}
          onChange={(checked) =>
            updateDraft((current) => ({
              ...current,
              enabled: checked,
            }))
          }
        />
      </div>

      {state?.supported === false && <Alert type='warning' content={t('settings.voiceInput.platformNotSupported')} />}

      {loading ? null : (
        <Form layout='vertical' className='space-y-12px'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
            <Form.Item label={t('settings.voiceInput.provider')}>
              <Select
                value={draft.providerId}
                options={[{ label: 'DashScope', value: 'dashscope' }]}
                onChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    providerId: value as VoiceInputConfig['providerId'],
                  }))
                }
              />
            </Form.Item>
            <Form.Item label={t('settings.voiceInput.triggerMode')}>
              <Select
                value={draft.triggerMode}
                options={[
                  {
                    label: t('settings.voiceInput.triggerModes.right_command_hold'),
                    value: 'right_command_hold',
                  },
                  { label: t('settings.voiceInput.triggerModes.fn_hold'), value: 'fn_hold' },
                ]}
                onChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    triggerMode: value as VoiceInputConfig['triggerMode'],
                  }))
                }
              />
            </Form.Item>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
            <Form.Item label={t('settings.voiceInput.apiKey')}>
              <Input.Password
                value={draft.providers.dashscope.apiKey}
                placeholder='sk-...'
                onChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    providers: {
                      ...current.providers,
                      dashscope: {
                        ...current.providers.dashscope,
                        apiKey: value,
                      },
                    },
                  }))
                }
              />
            </Form.Item>
            <Form.Item label={t('settings.voiceInput.model')}>
              <Input
                value={draft.providers.dashscope.model}
                onChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    providers: {
                      ...current.providers,
                      dashscope: {
                        ...current.providers.dashscope,
                        model: value,
                      },
                    },
                  }))
                }
              />
            </Form.Item>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-12px'>
            <Form.Item label={t('settings.voiceInput.region')}>
              <Select
                value={draft.providers.dashscope.region}
                options={[
                  { label: t('settings.voiceInput.regions.beijing'), value: 'beijing' },
                  { label: t('settings.voiceInput.regions.singapore'), value: 'singapore' },
                ]}
                onChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    providers: {
                      ...current.providers,
                      dashscope: {
                        ...current.providers.dashscope,
                        region: value as VoiceInputConfig['providers']['dashscope']['region'],
                      },
                    },
                  }))
                }
              />
            </Form.Item>
            <Form.Item label={t('settings.voiceInput.vocabularyId')}>
              <Input
                value={draft.providers.dashscope.vocabularyId}
                onChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    providers: {
                      ...current.providers,
                      dashscope: {
                        ...current.providers.dashscope,
                        vocabularyId: value,
                      },
                    },
                  }))
                }
              />
            </Form.Item>
          </div>

          <Form.Item label={t('settings.voiceInput.languageHints')}>
            <Input
              value={languageHintsText}
              placeholder='zh, en'
              onChange={(value) =>
                updateDraft((current) => ({
                  ...current,
                  providers: {
                    ...current.providers,
                    dashscope: {
                      ...current.providers.dashscope,
                      languageHints: splitListInput(value),
                    },
                  },
                }))
              }
            />
          </Form.Item>

          <Form.Item label={t('settings.voiceInput.hotwords')}>
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 6 }}
              value={hotwordsText}
              placeholder={t('settings.voiceInput.hotwordsPlaceholder')}
              onChange={(value) =>
                updateDraft((current) => ({
                  ...current,
                  providers: {
                    ...current.providers,
                    dashscope: {
                      ...current.providers.dashscope,
                      hotwords: splitListInput(value),
                    },
                  },
                }))
              }
            />
          </Form.Item>

          <div className='flex items-center justify-between gap-12px flex-wrap'>
            <div className='flex items-center gap-8px'>
              <span className='text-13px text-t-secondary'>{t('settings.voiceInput.autoInsert')}</span>
              <Switch
                checked={draft.autoInsert}
                onChange={(checked) =>
                  updateDraft((current) => ({
                    ...current,
                    autoInsert: checked,
                  }))
                }
              />
            </div>
            <Space wrap>
              <Button loading={saving} type='primary' onClick={() => void handleSave()}>
                {t('common.save')}
              </Button>
              <Button loading={actionLoading === 'permissions'} onClick={() => void handleRequestPermissions()}>
                {t('settings.voiceInput.requestPermissions')}
              </Button>
              <Button loading={actionLoading === 'start'} onClick={() => void handleStart()}>
                {t('settings.voiceInput.startTest')}
              </Button>
              <Button loading={actionLoading === 'stop'} onClick={() => void handleStop()}>
                {t('settings.voiceInput.stopTest')}
              </Button>
            </Space>
          </div>
        </Form>
      )}

      {state && (
        <div className='space-y-8px'>
          <div className='text-14px text-t-primary font-600'>{t('settings.voiceInput.runtime')}</div>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-8px'>
            <div className='flex items-center justify-between gap-12px'>
              <span className='text-13px text-t-secondary'>{t('settings.voiceInput.currentStatus')}</span>
              <Tag color={statusColorMap[state.status] || 'gray'}>
                {t(`settings.voiceInput.statuses.${state.status}`)}
              </Tag>
            </div>
            {renderPermissionTag(t('settings.voiceInput.microphonePermission'), state.permissions.microphone)}
            {renderPermissionTag(t('settings.voiceInput.accessibilityPermission'), state.permissions.accessibility)}
            <div className='flex items-center justify-between gap-12px'>
              <span className='text-13px text-t-secondary'>{t('settings.voiceInput.sourceApp')}</span>
              <span className='text-13px text-t-primary'>{state.sourceAppName || '-'}</span>
            </div>
          </div>

          {state.lastTranscript && (
            <div className='space-y-4px'>
              <div className='text-13px text-t-secondary'>{t('settings.voiceInput.lastTranscript')}</div>
              <Typography.Paragraph className='!mb-0 text-13px text-t-primary whitespace-pre-wrap'>
                {state.lastTranscript}
              </Typography.Paragraph>
            </div>
          )}

          {state.lastError && <Alert type='error' content={state.lastError} />}
        </div>
      )}

      <div className='space-y-8px'>
        <div className='flex items-center justify-between gap-12px'>
          <div className='text-14px text-t-primary font-600'>{t('settings.voiceInput.activity')}</div>
          <Button size='mini' onClick={() => void refresh()}>
            {t('common.refresh')}
          </Button>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-8px'>
          {statItems.map((item) => (
            <div key={item.label} className='rd-12px bg-fill-2 p-12px space-y-6px'>
              <div className='text-12px text-t-secondary'>{item.label}</div>
              <div className='text-22px leading-[1.2] font-600 text-t-primary break-words'>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VoiceInputSection;
