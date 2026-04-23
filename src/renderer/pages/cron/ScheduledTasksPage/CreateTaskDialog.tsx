/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Input, Select, Message, TimePicker, Radio, Button } from '@arco-design/web-react';
import ModalWrapper from '@renderer/components/base/ModalWrapper';
import { Down, Robot } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { ICreateCronJobParams, ICronAgentConfig, ICronJob } from '@/common/adapter/ipcBridge';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@/renderer/pages/guid/constants';
import dayjs from 'dayjs';
import AcpConfigSelector from '@renderer/components/agent/AcpConfigSelector';
import { getFullAutoMode } from '@renderer/utils/model/agentModes';
import type { TProviderWithModel } from '@/common/config/storage';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackendAll, AcpModelInfo, AcpSessionConfigOption, AgentBackend } from '@/common/types/acpTypes';
import { useModelProviderList } from '@renderer/hooks/agent/useModelProviderList';
import GuidModelSelector from '@renderer/pages/guid/components/GuidModelSelector';
import { WorkspaceFolderSelect } from '@renderer/components/workspace';

const FormItem = Form.Item;
const TextArea = Input.TextArea;
const Option = Select.Option;
const OptGroup = Select.OptGroup;

interface CreateTaskDialogProps {
  visible: boolean;
  onClose: () => void;
  /** When provided, the dialog operates in edit mode */
  editJob?: ICronJob;
  conversation_id?: string;
  conversationTitle?: string;
  agent_type?: string;
}

type FrequencyType = 'manual' | 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'custom';
type ExecutionMode = 'new_conversation' | 'existing';

const WEEKDAYS = [
  { value: 'MON', label: 'monday' },
  { value: 'TUE', label: 'tuesday' },
  { value: 'WED', label: 'wednesday' },
  { value: 'THU', label: 'thursday' },
  { value: 'FRI', label: 'friday' },
  { value: 'SAT', label: 'saturday' },
  { value: 'SUN', label: 'sunday' },
];

/**
 * Infer frequency type and time/weekday from a cron expression for edit mode.
 * Returns 'custom' for expressions that don't match our preset formats.
 */
function parseCronExpr(expr: string): { frequency: FrequencyType; time: string; weekday: string } {
  if (!expr) return { frequency: 'manual', time: '09:00', weekday: 'MON' };

  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return { frequency: 'daily', time: '09:00', weekday: 'MON' };

  const [min, hour, day, month, dow] = parts;

  // Hourly: 0 * * * *
  if (hour === '*' && min === '0' && day === '*' && month === '*' && dow === '*') {
    return { frequency: 'hourly', time: '09:00', weekday: 'MON' };
  }

  // Weekdays: min hour * * MON-FRI
  if (dow === 'MON-FRI' && day === '*' && month === '*') {
    const hh = String(hour).padStart(2, '0');
    const mm = String(min).padStart(2, '0');
    const time = `${hh}:${mm}`;
    return { frequency: 'weekdays', time, weekday: 'MON' };
  }

  // Weekly: min hour * * DAY
  if (dow !== '*' && day === '*' && month === '*') {
    const dayUpper = dow.toUpperCase();
    const matched = WEEKDAYS.find((d) => d.value === dayUpper);
    if (matched) {
      const hh = String(hour).padStart(2, '0');
      const mm = String(min).padStart(2, '0');
      const time = `${hh}:${mm}`;
      return { frequency: 'weekly', time, weekday: dayUpper };
    }
    return { frequency: 'daily', time: '09:00', weekday: 'MON' };
  }

  // Daily: min hour * * * - only if all parts match the expected pattern
  if (day === '*' && month === '*' && dow === '*') {
    // Check if hour and minute are simple numbers (not expressions like */4)
    const hourNum = Number(hour);
    const minNum = Number(min);
    if (!isNaN(hourNum) && !isNaN(minNum) && hourNum >= 0 && hourNum <= 23 && minNum >= 0 && minNum <= 59) {
      const hh = String(hourNum).padStart(2, '0');
      const mm = String(minNum).padStart(2, '0');
      const time = `${hh}:${mm}`;
      return { frequency: 'daily', time, weekday: 'MON' };
    }
  }

  // Custom: any expression that doesn't match our presets
  return { frequency: 'custom', time: '09:00', weekday: 'MON' };
}

function getDescriptionInitialValue(job: ICronJob): string {
  const storedDescription = job.description?.trim();
  if (storedDescription) return storedDescription;
  return '';
}

/**
 * Infer the agent selection key from an ICronJob's agentConfig.
 */
function getAgentKeyFromJob(job: ICronJob): string | undefined {
  const config = job.metadata.agentConfig;
  if (config) {
    if (config.is_preset && config.custom_agent_id) return `preset:${config.custom_agent_id}`;
    return `cli:${config.backend}`;
  }
  // Fallback for legacy jobs without agentConfig
  if (job.metadata.agent_type) return `cli:${job.metadata.agent_type}`;
  return undefined;
}

const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  visible,
  onClose,
  editJob,
  conversation_id: _conversation_id,
  conversationTitle,
  agent_type,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { cliAgents, presetAssistants } = useConversationAgents();
  const { providers, geminiModeLookup, getAvailableModels, formatModelLabel } = useModelProviderList();
  const [frequency, setFrequency] = useState<FrequencyType>('manual');
  const [time, setTime] = useState('09:00');
  const [weekday, setWeekday] = useState('MON');
  const [customCronExpr, setCustomCronExpr] = useState<string>('');

  const isEditMode = !!editJob;
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('new_conversation');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Advanced settings state
  const [model_id, setModelId] = useState<string | undefined>(undefined);
  const [config_options, setConfigOptions] = useState<Record<string, string> | undefined>(undefined);
  const [workspace, setWorkspace] = useState<string | undefined>(undefined);
  const [cached_config_options, setCachedConfigOptions] = useState<unknown[] | undefined>(undefined);
  const [acpCachedModelInfo, setAcpCachedModelInfo] = useState<AcpModelInfo | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined);

  // Populate form when entering edit mode
  useEffect(() => {
    if (!visible) return;
    if (editJob) {
      const cronExpr = editJob.schedule.kind === 'cron' ? editJob.schedule.expr : '';
      const parsed = parseCronExpr(cronExpr);
      setFrequency(parsed.frequency);
      setTime(parsed.time);
      setWeekday(parsed.weekday);
      setCustomCronExpr(parsed.frequency === 'custom' ? cronExpr : '');
      setExecutionMode(editJob.target.executionMode || 'existing');
      setAdvancedOpen(
        Boolean(
          editJob.metadata.agentConfig?.model_id ||
          editJob.metadata.agentConfig?.workspace ||
          (editJob.metadata.agentConfig?.config_options &&
            Object.keys(editJob.metadata.agentConfig.config_options).length > 0)
        )
      );
      const agentKey = getAgentKeyFromJob(editJob);
      setSelectedAgent(agentKey);
      form.setFieldsValue({
        name: editJob.name,
        description: getDescriptionInitialValue(editJob),
        prompt: editJob.target.payload.text,
        agent: agentKey,
      });
      // Populate advanced settings from editJob
      setModelId(editJob.metadata.agentConfig?.model_id);
      setConfigOptions(editJob.metadata.agentConfig?.config_options);
      setWorkspace(editJob.metadata.agentConfig?.workspace);
    } else {
      form.resetFields();
      setFrequency('manual');
      setTime('09:00');
      setWeekday('MON');
      setCustomCronExpr('');
      setExecutionMode('new_conversation');
      setAdvancedOpen(false);
      setModelId(undefined);
      setConfigOptions(undefined);
      setWorkspace(undefined);
      setSelectedAgent(undefined);
    }
  }, [visible, editJob, form]);

  // Resolve backend from selectedAgent (handles both CLI and preset agents)
  const resolvedBackend = useMemo(() => {
    if (!selectedAgent) return undefined;
    const colonIdx = selectedAgent.indexOf(':');
    const agentKind = selectedAgent.substring(0, colonIdx);
    const agentId = selectedAgent.substring(colonIdx + 1);

    if (agentKind === 'preset') {
      const agent = presetAssistants.find((a) => a.custom_agent_id === agentId);
      return agent?.backend;
    }
    // CLI agent: agentId is the backend
    return agentId;
  }, [selectedAgent, presetAssistants]);

  // Load cached config options when backend changes
  useEffect(() => {
    if (!resolvedBackend) {
      setCachedConfigOptions(undefined);
      return;
    }

    ConfigStorage.get('acp.cached_config_options')
      .then((cached) => {
        if (cached && cached[resolvedBackend]) {
          // Filter out model/mode categories — those are handled by dedicated selectors
          const filtered = (cached[resolvedBackend] as Array<{ category?: string }>).filter(
            (opt) => opt.category !== 'model' && opt.category !== 'mode'
          );
          setCachedConfigOptions(filtered as unknown[]);
        } else {
          setCachedConfigOptions(undefined);
        }
      })
      .catch(() => setCachedConfigOptions(undefined));
  }, [resolvedBackend]);

  const isGeminiMode = resolvedBackend === 'gemini' || resolvedBackend === 'aionrs';

  // AionCLI does not support Google Auth — filter it out (mirrors GuidPage.tsx logic)
  const filteredProviders = useMemo(
    () =>
      resolvedBackend === 'aionrs'
        ? providers.filter((p) => !p.platform?.toLowerCase().includes('gemini-with-google-auth'))
        : providers,
    [resolvedBackend, providers]
  );

  // Build Gemini current_model from model_id for GuidModelSelector
  const geminiCurrentModel = useMemo<TProviderWithModel | undefined>(() => {
    if ((resolvedBackend !== 'gemini' && resolvedBackend !== 'aionrs') || !model_id) return undefined;
    for (const p of filteredProviders) {
      if (getAvailableModels(p).includes(model_id)) {
        return { ...p, useModel: model_id } as TProviderWithModel;
      }
    }
    return undefined;
  }, [resolvedBackend, model_id, filteredProviders, getAvailableModels]);

  const handleGeminiModelSelect = useCallback(async (model: TProviderWithModel) => {
    setModelId(model.useModel);
  }, []);

  const handleAcpModelSelect: React.Dispatch<React.SetStateAction<string | null>> = useCallback(
    (action: React.SetStateAction<string | null>) => {
      setModelId((prev) => {
        const next = typeof action === 'function' ? action(prev ?? null) : action;
        return next ?? undefined;
      });
    },
    []
  );

  // Load ACP cached model info when backend changes
  useEffect(() => {
    if (!resolvedBackend || resolvedBackend === 'gemini' || resolvedBackend === 'aionrs') {
      setAcpCachedModelInfo(null);
      return;
    }
    ConfigStorage.get('acp.cachedModels')
      .then((cached) => {
        const info = cached?.[resolvedBackend];
        setAcpCachedModelInfo(info?.available_models?.length ? info : null);
      })
      .catch(() => setAcpCachedModelInfo(null));
  }, [resolvedBackend]);

  // Set default model_id from user preferences when backend changes
  useEffect(() => {
    if (!resolvedBackend || model_id) return;
    if (resolvedBackend === 'gemini') {
      ConfigStorage.get('gemini.defaultModel')
        .then((saved) => {
          const preferred = typeof saved === 'string' ? saved : saved?.useModel;
          if (preferred) setModelId(preferred);
        })
        .catch(() => {});
    } else if (resolvedBackend === 'aionrs') {
      ConfigStorage.get('aionrs.defaultModel')
        .then((saved) => {
          if (saved?.useModel) setModelId(saved.useModel);
        })
        .catch(() => {});
    }
  }, [resolvedBackend, model_id]);

  const showTimePicker = frequency === 'daily' || frequency === 'weekdays' || frequency === 'weekly';
  const showWeekdayPicker = frequency === 'weekly';

  // Build cron expression and description from frequency settings
  const scheduleInfo = useMemo(() => {
    const [hour, minute] = time.split(':').map(Number);
    switch (frequency) {
      case 'manual':
        return { expr: '', description: t('cron.page.scheduleDesc.manual') };
      case 'hourly':
        return { expr: '0 * * * *', description: t('cron.page.scheduleDesc.hourly') };
      case 'daily':
        return { expr: `${minute} ${hour} * * *`, description: t('cron.page.scheduleDesc.dailyAt', { time }) };
      case 'weekdays':
        return { expr: `${minute} ${hour} * * MON-FRI`, description: t('cron.page.scheduleDesc.weekdaysAt', { time }) };
      case 'weekly': {
        const dayLabel = WEEKDAYS.find((d) => d.value === weekday)?.label ?? weekday;
        return {
          expr: `${minute} ${hour} * * ${weekday}`,
          description: t('cron.page.scheduleDesc.weeklyAt', { day: t(`cron.page.weekday.${dayLabel}`), time }),
        };
      }
      case 'custom':
        return { expr: customCronExpr, description: editJob?.schedule.description || customCronExpr };
      default:
        return { expr: '', description: '' };
    }
  }, [frequency, time, weekday, t, customCronExpr, editJob]);

  const executionModeOptions = useMemo(
    () => [
      {
        value: 'new_conversation' as const,
        label: t('cron.page.form.newConversation'),
        description: t('cron.detail.executionModeDescriptionNew'),
      },
      {
        value: 'existing' as const,
        label: t('cron.page.form.existingConversation'),
        description: t('cron.detail.executionModeDescriptionExisting'),
      },
    ],
    [t]
  );

  const selectedExecutionModeOption =
    executionModeOptions.find((option) => option.value === executionMode) ?? executionModeOptions[0];
  const showModelSelector = Boolean(resolvedBackend && (isGeminiMode || acpCachedModelInfo));
  const showConfigSelector = resolvedBackend === 'codex';
  const advancedFieldCount = Number(showModelSelector) + Number(showConfigSelector) + 1;

  const handleFrequencyChange = (value: FrequencyType) => {
    setFrequency(value);
    if (value !== 'custom') {
      setCustomCronExpr('');
    }
  };

  const handleAgentChange = useCallback((value: string) => {
    setSelectedAgent(value);
    // Reset model and config_options when agent changes
    setModelId(undefined);
    setConfigOptions(undefined);
    // Workspace remains unchanged (agent-agnostic)
  }, []);

  const handleWorkspaceClear = useCallback(() => {
    setWorkspace(undefined);
  }, []);

  const handleConfigOptionSelect = useCallback((config_id: string, value: string) => {
    setConfigOptions((prev) => ({ ...prev, [config_id]: value }));
  }, []);

  const resolveAgentConfig = (agentValue: string) => {
    const colonIdx = agentValue.indexOf(':');
    const agentKind = agentValue.substring(0, colonIdx);
    const agentId = agentValue.substring(colonIdx + 1);

    // Merge cached config option defaults with user overrides
    const mergedConfigOptions = (() => {
      if (!Array.isArray(cached_config_options) || cached_config_options.length === 0) return config_options;
      const defaults: Record<string, string> = {};
      for (const opt of cached_config_options as AcpSessionConfigOption[]) {
        const val = opt.current_value || opt.selected_value;
        if (opt.id && val) defaults[opt.id] = val;
      }
      return Object.keys(defaults).length > 0 ? { ...defaults, ...config_options } : config_options;
    })();

    let agentConfig: ICronAgentConfig | undefined;
    let resolvedAgentType: ICreateCronJobParams['agent_type'] = (agent_type ||
      'claude') as ICreateCronJobParams['agent_type'];

    if (agentKind === 'cli') {
      const agent = cliAgents.find((a) => a.backend === agentId);
      if (agent) {
        resolvedAgentType = agent.backend as AcpBackendAll;
        agentConfig = {
          backend: agent.backend as AgentBackend,
          name: agent.name,
          cli_path: agent.cli_path,
          mode: getFullAutoMode(agent.backend),
          model_id,
          config_options: mergedConfigOptions,
          workspace,
        };
      }
    } else if (agentKind === 'preset') {
      const agent = presetAssistants.find((a) => a.custom_agent_id === agentId);
      if (agent) {
        resolvedAgentType = agent.backend as AcpBackendAll;
        agentConfig = {
          backend: agent.backend as AgentBackend,
          name: agent.name,
          is_preset: true,
          custom_agent_id: agent.custom_agent_id,
          presetAgentType: agent.presetAgentType,
          mode: getFullAutoMode(agent.backend),
          model_id,
          config_options: mergedConfigOptions,
          workspace,
        };
      }
    }

    return { agentConfig, resolvedAgentType };
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setSubmitting(true);

      const scheduleExpr = scheduleInfo.expr;
      const scheduleDesc = scheduleInfo.description;

      const { agentConfig, resolvedAgentType } = resolveAgentConfig(values.agent);

      if (isEditMode) {
        // Edit mode: update existing job
        await ipcBridge.cron.updateJob.invoke({
          job_id: editJob!.id,
          updates: {
            name: values.name,
            description: values.description,
            schedule: { kind: 'cron', expr: scheduleExpr, description: scheduleDesc },
            target: {
              ...editJob!.target,
              payload: { kind: 'message', text: values.prompt },
              executionMode,
            },
            metadata: {
              ...editJob!.metadata,
              agent_type: resolvedAgentType,
              agentConfig,
              updated_at: Date.now(),
            },
          },
        });
        Message.success(t('cron.page.updateSuccess'));
      } else {
        // Create mode
        const params: ICreateCronJobParams = {
          name: values.name,
          description: values.description,
          schedule: { kind: 'cron', expr: scheduleExpr, description: scheduleDesc },
          prompt: values.prompt,
          conversation_id: '',
          conversationTitle,
          agent_type: resolvedAgentType,
          createdBy: 'user',
          executionMode,
          agentConfig,
        };
        await ipcBridge.cron.addJob.invoke(params);
        Message.success(t('cron.page.createSuccess'));
      }

      onClose();
    } catch (err) {
      if (err instanceof Error) {
        Message.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalWrapper
      title={isEditMode ? t('cron.page.editTask') : t('cron.page.createTask')}
      visible={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText={t('cron.page.save')}
      cancelText={t('cron.page.cancel')}
      className='w-[min(560px,calc(100vw-32px))] max-w-560px rd-16px'
      unmountOnExit
    >
      <div className='overflow-y-auto px-24px pb-16px pr-18px max-h-[min(68vh,640px)]'>
        <Form form={form} layout='vertical'>
          <FormItem
            label={t('cron.page.form.name')}
            field='name'
            rules={[{ required: true, message: t('cron.page.form.nameRequired') }]}
          >
            <Input placeholder={t('cron.page.form.namePlaceholder')} />
          </FormItem>

          <FormItem
            label={t('cron.page.form.description')}
            field='description'
            rules={[{ required: true, message: t('cron.page.form.descriptionRequired') }]}
          >
            <Input placeholder={t('cron.page.form.descriptionPlaceholder')} />
          </FormItem>

          <FormItem
            label={t('cron.page.form.agent')}
            field='agent'
            rules={[{ required: true, message: t('cron.page.form.agentRequired') }]}
          >
            <Select
              placeholder={t('cron.page.form.agentPlaceholder')}
              onChange={handleAgentChange}
              renderFormat={(_option, value) => {
                // Find selected agent to render logo + name in the trigger
                const strVal = value as unknown as string;
                if (!strVal) return '';
                const [type, id] = strVal.split(':');
                let name = id;
                let logo: React.ReactNode = <Robot size='16' />;
                if (type === 'cli') {
                  const agent = cliAgents.find((a) => a.backend === id);
                  if (agent) {
                    name = agent.name;
                    const logoSrc = getAgentLogo(agent.backend);
                    if (logoSrc) {
                      logo = <img src={logoSrc} alt={agent.name} className='w-16px h-16px object-contain' />;
                    }
                  }
                } else if (type === 'preset') {
                  const agent = presetAssistants.find((a) => a.custom_agent_id === id);
                  if (agent) {
                    name = agent.name;
                    const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
                    const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');
                    if (avatarImage) {
                      logo = <img src={avatarImage} alt={agent.name} className='w-16px h-16px object-contain' />;
                    } else if (isEmoji) {
                      logo = <span className='text-14px leading-16px'>{agent.avatar}</span>;
                    }
                  }
                }
                return (
                  <div className='flex items-center gap-8px'>
                    {logo}
                    <span>{name}</span>
                  </div>
                );
              }}
            >
              {cliAgents.length > 0 && (
                <OptGroup label={t('conversation.dropdown.cliAgents')}>
                  {cliAgents.map((agent) => {
                    const logo = getAgentLogo(agent.backend);
                    return (
                      <Option key={`cli:${agent.backend}`} value={`cli:${agent.backend}`}>
                        <div className='flex items-center gap-8px'>
                          {logo ? (
                            <img src={logo} alt={agent.name} className='w-16px h-16px object-contain' />
                          ) : (
                            <Robot size='16' />
                          )}
                          <span>{agent.name}</span>
                        </div>
                      </Option>
                    );
                  })}
                </OptGroup>
              )}
              {presetAssistants.length > 0 && (
                <OptGroup label={t('conversation.dropdown.presetAssistants')}>
                  {presetAssistants.map((agent) => {
                    const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
                    const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');
                    return (
                      <Option key={`preset:${agent.custom_agent_id}`} value={`preset:${agent.custom_agent_id}`}>
                        <div className='flex items-center gap-8px'>
                          {avatarImage ? (
                            <img src={avatarImage} alt={agent.name} className='w-16px h-16px object-contain' />
                          ) : isEmoji ? (
                            <span className='text-14px leading-16px'>{agent.avatar}</span>
                          ) : (
                            <Robot size='16' />
                          )}
                          <span>{agent.name}</span>
                        </div>
                      </Option>
                    );
                  })}
                </OptGroup>
              )}
            </Select>
          </FormItem>

          <FormItem label={t('cron.page.form.executionMode')}>
            <Radio.Group
              value={executionMode}
              onChange={(value) => setExecutionMode(value as ExecutionMode)}
              className='flex flex-wrap items-center gap-20px'
            >
              {executionModeOptions.map((option) => {
                return (
                  <Radio
                    key={option.value}
                    value={option.value}
                    className='m-0 min-w-0 text-14px text-t-secondary cursor-pointer'
                  >
                    <span className='pl-4px text-14px font-medium text-t-primary'>{option.label}</span>
                  </Radio>
                );
              })}
            </Radio.Group>
            <div className='mt-10px rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-14px py-12px'>
              <p className='m-0 text-12px leading-18px text-t-primary'>{selectedExecutionModeOption.description}</p>
            </div>
          </FormItem>

          <FormItem
            label={t('cron.page.form.prompt')}
            field='prompt'
            rules={[{ required: true, message: t('cron.page.form.promptRequired') }]}
          >
            <TextArea placeholder={t('cron.page.form.promptPlaceholder')} autoSize={{ minRows: 3, maxRows: 8 }} />
          </FormItem>

          {/* Frequency */}
          <FormItem label={t('cron.page.form.frequency')}>
            <Select value={frequency} onChange={handleFrequencyChange}>
              <Option value='manual'>{t('cron.page.freq.manual')}</Option>
              <Option value='hourly'>{t('cron.page.freq.hourly')}</Option>
              <Option value='daily'>{t('cron.page.freq.daily')}</Option>
              <Option value='weekdays'>{t('cron.page.freq.weekdays')}</Option>
              <Option value='weekly'>{t('cron.page.freq.weekly')}</Option>
              {frequency === 'custom' && <Option value='custom'>{t('cron.page.freq.custom')}</Option>}
            </Select>
            {frequency === 'custom' && (
              <p className='mb-0 mt-8px text-12px leading-18px text-t-secondary'>
                {t('cron.page.customCronWarning', { expr: customCronExpr })}
              </p>
            )}
          </FormItem>

          {/* Time picker - shown for daily/weekdays/weekly */}
          {showTimePicker && (
            <div className='flex items-center gap-12px mb-16px'>
              <TimePicker
                format='HH:mm'
                value={dayjs(`2000-01-01 ${time}`)}
                onChange={(_timeStr, pickedTime) => {
                  if (pickedTime) {
                    setTime(pickedTime.format('HH:mm'));
                  }
                }}
                allowClear={false}
                className='w-120px'
              />
            </div>
          )}

          {/* Weekday picker - shown for weekly */}
          {showWeekdayPicker && (
            <div className='mb-16px'>
              <Select value={weekday} onChange={setWeekday}>
                {WEEKDAYS.map((d) => (
                  <Option key={d.value} value={d.value}>
                    {t(`cron.page.weekday.${d.label}`)}
                  </Option>
                ))}
              </Select>
            </div>
          )}

          <div className='mt-16px'>
            <Button
              type='text'
              onClick={() => setAdvancedOpen((open) => !open)}
              className='!h-auto !p-0 hover:!bg-transparent'
            >
              <span className='flex items-center gap-6px text-14px font-medium text-t-primary'>
                <Down
                  size='14'
                  fill='currentColor'
                  className={`shrink-0 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                />
                <span>{t('cron.page.form.advancedSettings')}</span>
              </span>
            </Button>

            {advancedOpen && (
              <div className='mt-12px grid gap-x-16px gap-y-16px md:grid-cols-2'>
                {showModelSelector && (
                  <div className='min-w-0'>
                    <label className='mb-8px block text-14px font-medium text-t-primary'>
                      {t('cron.page.form.model')}
                    </label>
                    <GuidModelSelector
                      isGeminiMode={isGeminiMode}
                      modelList={filteredProviders}
                      current_model={geminiCurrentModel}
                      setCurrentModel={handleGeminiModelSelect}
                      geminiModeLookup={geminiModeLookup}
                      currentAcpCachedModelInfo={acpCachedModelInfo}
                      selectedAcpModel={model_id ?? null}
                      setSelectedAcpModel={handleAcpModelSelect}
                    />
                  </div>
                )}

                {showConfigSelector && (
                  <div className='min-w-0'>
                    <label className='mb-8px block text-14px font-medium text-t-primary'>
                      {t('acp.config.reasoning_effort')}
                    </label>
                    <AcpConfigSelector
                      backend={resolvedBackend}
                      compact={false}
                      initialConfigOptions={cached_config_options}
                      onOptionSelect={handleConfigOptionSelect}
                    />
                  </div>
                )}

                <div className={advancedFieldCount === 1 ? 'md:col-span-2' : ''}>
                  <label className='mb-8px block text-14px font-medium text-t-primary'>
                    {t('cron.page.form.workspace')}
                  </label>
                  <WorkspaceFolderSelect
                    value={workspace}
                    onChange={(next) => setWorkspace(next || undefined)}
                    onClear={handleWorkspaceClear}
                    placeholder={t('cron.page.form.selectFolder')}
                    input_placeholder={t('cron.page.form.workspacePlaceholder')}
                    recentLabel={t('team.create.recentLabel', { defaultValue: 'Recent' })}
                    chooseDifferentLabel={t('team.create.chooseDifferentFolder', {
                      defaultValue: 'Choose a different folder',
                    })}
                    triggerTestId='cron-workspace-trigger'
                    menuTestId='cron-workspace-menu'
                    menuZIndex={10020}
                  />
                </div>
              </div>
            )}
          </div>
        </Form>
      </div>
    </ModalWrapper>
  );
};

export default CreateTaskDialog;
