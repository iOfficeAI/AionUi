/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { Form, Input, Select, Message, TimePicker, Radio, Button } from '@arco-design/web-react';
import ModalWrapper from '@renderer/components/base/ModalWrapper';
import { Down, Robot } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { ICreateCronJobParams, ICronAgentConfig, ICronJob } from '@/common/adapter/ipcBridge';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import { resolveAgentLogo } from '@renderer/utils/model/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@/renderer/pages/guid/constants';
import dayjs from 'dayjs';
import { getFullAutoMode } from '@renderer/utils/model/agentModes';
import type { TProviderWithModel } from '@/common/config/storage';
import { type AcpModelInfo } from '@/common/types/platform/acpTypes';
import { useModelProviderList } from '@renderer/hooks/agent/useModelProviderList';
import GuidModelSelector from '@renderer/pages/guid/components/GuidModelSelector';
import { WorkspaceFolderSelect } from '@renderer/components/workspace';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents, type AgentMetadata } from '@renderer/utils/model/agentTypes';
import { createCronSchedule } from '@renderer/pages/cron/cronUtils';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import { resolveSupportedConversationType } from '@renderer/utils/model/agentTypeSupportPolicy';

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
  conversation_title?: string;
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
 * Infer the agent selection key from an ICronJob's agent_config.
 */
function getAgentKeyFromJob(job: ICronJob, cliAgents: { backend?: string; agent_type: string }[]): string | undefined {
  const config = job.metadata.agent_config;
  if (config) {
    if (config.is_preset && config.custom_agent_id) return `preset:${config.custom_agent_id}`;
    // For ACP agents config.backend is the vendor label (e.g. "claude");
    // for aionrs it's a provider hash — match against the agent list to decide.
    const matched = cliAgents.find((a) => (a.backend || a.agent_type) === config.backend);
    if (matched) return `cli:${config.backend}`;
  }
  if (job.metadata.agent_type) return `cli:${job.metadata.agent_type}`;
  return undefined;
}

const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  visible,
  onClose,
  editJob,
  conversation_id: _conversation_id,
  conversation_title,
  agent_type,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { cliAgents, presetAssistants } = useConversationAgents();
  const { providers, getAvailableModels, formatModelLabel } = useModelProviderList();
  const [frequency, setFrequency] = useState<FrequencyType>('manual');
  const [time, setTime] = useState('09:00');
  const [weekday, setWeekday] = useState('MON');
  const [customCronExpr, setCustomCronExpr] = useState<string>('');

  const isEditMode = !!editJob;
  const [execution_mode, setExecutionMode] = useState<ExecutionMode>('new_conversation');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Advanced settings state
  const [model_id, setModelId] = useState<string | undefined>(undefined);
  const [config_options, setConfigOptions] = useState<Record<string, string> | undefined>(undefined);
  const [workspace, setWorkspace] = useState<string | undefined>(undefined);
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined);

  // Available agents from backend `/api/agents`, shared across SWR cache.
  const { data: detectedAgents } = useSWR<AgentMetadata[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);

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
      setExecutionMode(editJob.target.execution_mode || 'existing');
      setAdvancedOpen(
        Boolean(
          editJob.metadata.agent_config?.model_id ||
          editJob.metadata.agent_config?.workspace ||
          (editJob.metadata.agent_config?.config_options &&
            Object.keys(editJob.metadata.agent_config.config_options).length > 0)
        )
      );
      const agentKey = getAgentKeyFromJob(editJob, cliAgents);
      setSelectedAgent(agentKey);
      form.setFieldsValue({
        name: editJob.name,
        description: getDescriptionInitialValue(editJob),
        prompt: editJob.target.payload.text,
        agent: agentKey,
      });
      // Populate advanced settings from editJob
      setModelId(editJob.metadata.agent_config?.model_id);
      setConfigOptions(editJob.metadata.agent_config?.config_options);
      setWorkspace(editJob.metadata.agent_config?.workspace);
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
      const assistant = presetAssistants.find((a) => a.id === agentId);
      return assistant?.preset_agent_type;
    }
    // CLI agent: agentId is the backend
    return agentId;
  }, [selectedAgent, presetAssistants]);

  const isGeminiMode = resolvedBackend === 'gemini' || resolvedBackend === 'aionrs';

  // Providers compatible with aionrs (AionCLI does not support Google Auth).
  // Computed independent of the current selection so the agent dropdown can
  // disable the aionrs entry when no provider is configured.
  const aionrsProviders = useMemo(
    () => providers.filter((p) => !p.platform?.toLowerCase().includes('gemini-with-google-auth')),
    [providers]
  );
  const hasAionrsProvider = aionrsProviders.length > 0;

  const filteredProviders = useMemo(
    () => (resolvedBackend === 'aionrs' ? aionrsProviders : providers),
    [resolvedBackend, providers, aionrsProviders]
  );

  // Build Gemini current_model from model_id for GuidModelSelector.
  // For aionrs edit mode, prefer the exact provider_id stored on the job —
  // the same model name may exist across multiple providers, so fuzzy match
  // would pick the wrong provider.
  const geminiCurrentModel = useMemo<TProviderWithModel | undefined>(() => {
    if (resolvedBackend !== 'aionrs' || !model_id) return undefined;

    const editedProviderId = resolvedBackend === 'aionrs' ? editJob?.metadata.agent_config?.backend : undefined;
    if (editedProviderId) {
      const byId = filteredProviders.find((p) => p.id === editedProviderId);
      if (byId && getAvailableModels(byId).includes(model_id)) {
        return { ...byId, use_model: model_id } as TProviderWithModel;
      }
    }

    for (const p of filteredProviders) {
      if (getAvailableModels(p).includes(model_id)) {
        return { ...p, use_model: model_id } as TProviderWithModel;
      }
    }
    return undefined;
  }, [resolvedBackend, model_id, filteredProviders, getAvailableModels, editJob]);

  const handleGeminiModelSelect = useCallback(async (model: TProviderWithModel) => {
    setModelId(model.use_model);
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

  // ACP model info derived from the backend `/api/agents` handshake.
  const acpCachedModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!resolvedBackend || resolvedBackend === 'gemini' || resolvedBackend === 'aionrs') return null;
    const matched = detectedAgents?.find((a) => (a.backend ?? a.agent_type) === resolvedBackend);
    const info = matched?.handshake?.available_models as AcpModelInfo | undefined;
    return info?.available_models?.length ? info : null;
  }, [resolvedBackend, detectedAgents]);

  // Auto-pick the first available model from /api/providers when aionrs is
  // selected but none is set yet. Source of truth is the backend provider
  // list — do NOT read from any frontend-cached default.
  useEffect(() => {
    if (resolvedBackend !== 'aionrs' || model_id) return;
    for (const provider of aionrsProviders) {
      const models = getAvailableModels(provider);
      if (models.length > 0) {
        setModelId(models[0]);
        return;
      }
    }
  }, [resolvedBackend, model_id, aionrsProviders, getAvailableModels]);

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
    executionModeOptions.find((option) => option.value === execution_mode) ?? executionModeOptions[0];
  const showModelSelector = Boolean(resolvedBackend && (isGeminiMode || acpCachedModelInfo));
  const advancedFieldCount = Number(showModelSelector) + 1;

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

  const resolveAgentConfig = (agentValue: string) => {
    const colonIdx = agentValue.indexOf(':');
    const agentKind = colonIdx >= 0 ? agentValue.substring(0, colonIdx) : 'cli';
    const agentId = colonIdx >= 0 ? agentValue.substring(colonIdx + 1) : agentValue;

    let agent_config: ICronAgentConfig | undefined;
    let resolvedAgentType: ICreateCronJobParams['agent_type'] = resolveSupportedConversationType(agent_type || 'acp');

    if (agentKind === 'cli') {
      const agent = cliAgents.find((a) => a.backend === agentId || a.agent_type === agentId);
      const backend = (agent?.backend || agent?.agent_type || agentId) as string;

      if (backend === 'aionrs') {
        // aionrs stores provider_id in `agent_config.backend` and the model
        // name in `model_id` — different semantic from ACP, where backend is
        // a vendor label. The executor looks up the provider row by this id.
        if (!geminiCurrentModel || !model_id) {
          throw new Error(t('cron.page.form.aionrsModelRequired'));
        }
        resolvedAgentType = 'aionrs' as ICreateCronJobParams['agent_type'];
        agent_config = {
          backend: geminiCurrentModel.id as string,
          name: geminiCurrentModel.name,
          mode: getFullAutoMode('aionrs'),
          model_id,
          workspace,
        };
      } else if (agent?.agent_type === 'acp') {
        const capitalizedBackend = backend.charAt(0).toUpperCase() + backend.slice(1);
        resolvedAgentType = 'acp';
        agent_config = {
          // cli_path is no longer sent from the frontend — the backend
          // resolves it server-side from the `agent_metadata` catalog.
          backend,
          name: agent.name || capitalizedBackend,
          mode: getFullAutoMode(backend),
          model_id,
          config_options,
          workspace,
        };
      } else if (agent) {
        resolvedAgentType = resolveSupportedConversationType(backend);
      }
    } else if (agentKind === 'preset') {
      const assistant = presetAssistants.find((a) => a.id === agentId);
      if (assistant) {
        const presetBackend = assistant.preset_agent_type;
        resolvedAgentType = resolveSupportedConversationType(presetBackend);
        agent_config = {
          backend: presetBackend as string,
          name: assistant.name,
          is_preset: true,
          custom_agent_id: assistant.id,
          preset_agent_type: presetBackend,
          mode: getFullAutoMode(presetBackend),
          model_id,
          config_options,
          workspace,
        };
      }
    }

    return { agent_config, resolvedAgentType };
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setSubmitting(true);

      const scheduleExpr = scheduleInfo.expr;
      const scheduleDesc = scheduleInfo.description;
      const schedule = createCronSchedule(scheduleExpr, scheduleDesc);

      const { agent_config, resolvedAgentType } = resolveAgentConfig(values.agent);

      if (isEditMode) {
        // Edit mode: update existing job
        await ipcBridge.cron.updateJob.invoke({
          job_id: editJob!.id,
          updates: {
            name: values.name,
            description: values.description,
            schedule,
            target: {
              ...editJob!.target,
              payload: { kind: 'message', text: values.prompt },
              execution_mode,
            },
            metadata: {
              ...editJob!.metadata,
              agent_type: resolvedAgentType,
              agent_config,
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
          schedule,
          prompt: values.prompt,
          conversation_id: _conversation_id ?? '',
          conversation_title,
          agent_type: resolvedAgentType,
          created_by: 'user',
          execution_mode,
          agent_config,
        };
        await ipcBridge.cron.addJob.invoke(params);
        Message.success(t('cron.page.createSuccess'));
      }

      onClose();
    } catch (err) {
      Message.error(getConversationCreateErrorMessage(err, t));
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
                  const agent = cliAgents.find((a) => (a.backend || a.agent_type) === id);
                  if (agent) {
                    name = agent.name;
                    const logoSrc = resolveAgentLogo({
                      icon: agent.icon,
                      backend: agent.backend || agent.agent_type,
                    });
                    if (logoSrc) {
                      logo = <img src={logoSrc} alt={agent.name} className='w-16px h-16px object-contain' />;
                    }
                  }
                } else if (type === 'preset') {
                  const assistant = presetAssistants.find((a) => a.id === id);
                  if (assistant) {
                    name = assistant.name;
                    const avatarImage = assistant.avatar ? CUSTOM_AVATAR_IMAGE_MAP[assistant.avatar] : undefined;
                    const isEmoji = assistant.avatar && !avatarImage && !assistant.avatar.endsWith('.svg');
                    if (avatarImage) {
                      logo = <img src={avatarImage} alt={assistant.name} className='w-16px h-16px object-contain' />;
                    } else if (isEmoji) {
                      logo = <span className='text-14px leading-16px'>{assistant.avatar}</span>;
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
                    const agentKey = agent.backend || agent.agent_type;
                    const logo = resolveAgentLogo({
                      icon: agent.icon,
                      backend: agentKey,
                    });
                    const disabled = agentKey === 'aionrs' && !hasAionrsProvider;
                    return (
                      <Option key={`cli:${agentKey}`} value={`cli:${agentKey}`} disabled={disabled}>
                        <div
                          className='flex items-center gap-8px'
                          title={disabled ? t('cron.page.form.aionrsNoProvider') : undefined}
                        >
                          {logo ? (
                            <img src={logo} alt={agent.name} className='w-16px h-16px object-contain' />
                          ) : (
                            <Robot size='16' />
                          )}
                          <span>{agent.name}</span>
                          {disabled && (
                            <span className='text-12px text-t-tertiary'>{t('cron.page.form.aionrsNoProvider')}</span>
                          )}
                        </div>
                      </Option>
                    );
                  })}
                </OptGroup>
              )}
              {presetAssistants.length > 0 && (
                <OptGroup label={t('conversation.dropdown.presetAssistants')}>
                  {presetAssistants.map((assistant) => {
                    const avatarImage = assistant.avatar ? CUSTOM_AVATAR_IMAGE_MAP[assistant.avatar] : undefined;
                    const isEmoji = assistant.avatar && !avatarImage && !assistant.avatar.endsWith('.svg');
                    return (
                      <Option key={`preset:${assistant.id}`} value={`preset:${assistant.id}`}>
                        <div className='flex items-center gap-8px'>
                          {avatarImage ? (
                            <img src={avatarImage} alt={assistant.name} className='w-16px h-16px object-contain' />
                          ) : isEmoji ? (
                            <span className='text-14px leading-16px'>{assistant.avatar}</span>
                          ) : (
                            <Robot size='16' />
                          )}
                          <span>{assistant.name}</span>
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
              value={execution_mode}
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
                      currentAcpCachedModelInfo={acpCachedModelInfo}
                      selectedAcpModel={model_id ?? null}
                      setSelectedAcpModel={handleAcpModelSelect}
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
