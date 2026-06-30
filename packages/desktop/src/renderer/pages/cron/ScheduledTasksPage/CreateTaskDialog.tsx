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
import { resolveLocaleKey } from '@/common/utils';
import type { ICreateCronJobParams, ICronJob, ICronJobUpdateParams } from '@/common/adapter/ipcBridge';
import { useConversationAssistants } from '@renderer/pages/conversation/hooks/useConversationAssistants';
import { resolveAgentLogo, useAgentLogos } from '@renderer/utils/model/agentLogo';
import dayjs from 'dayjs';
import type { TProviderWithModel } from '@/common/config/storage';
import { type AcpModelInfo } from '@/common/types/platform/acpTypes';
import { useManagedAgentRuntimeCatalog } from '@/renderer/hooks/agent/useManagedAgents';
import { useModelProviderList } from '@renderer/hooks/agent/useModelProviderList';
import GuidModelSelector from '@renderer/pages/guid/components/GuidModelSelector';
import { buildAssistantModelInfo } from '@renderer/pages/guid/hooks/useGuidAssistantSelection';
import { WorkspaceFolderSelect } from '@renderer/components/workspace';
import { createCronSchedule } from '@renderer/pages/cron/cronUtils';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import { resolveAssistantAvatar } from '@renderer/utils/model/assistantAvatar';
import { resolveAssistantName } from '@renderer/utils/model/assistantDisplay';
import { resolveCronAgentConfig } from './resolveCronAgentConfig';
import { assistantRuntimeKey, isAionrsAssistant } from '@/common/types/agent/assistantTypes';

const FormItem = Form.Item;
const TextArea = Input.TextArea;
const Option = Select.Option;

interface CreateTaskDialogProps {
  visible: boolean;
  onClose: () => void;
  /** When provided, the dialog operates in edit mode */
  editJob?: ICronJob;
  conversation_id?: string;
  conversation_title?: string;
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

/**
 * Infer the assistant selection key from an ICronJob's agent_config.
 *
 * New jobs persist `assistant_id`; legacy rows fall back to their derived runtime type.
 */
function getAssistantSelectionFromJob(job: ICronJob): string | undefined {
  const config = job.metadata.agent_config;
  if (config) {
    if (config.assistant_id) return config.assistant_id;
  }
  return undefined;
}

const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  visible,
  onClose,
  editJob,
  conversation_id: _conversation_id,
  conversation_title,
}) => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n?.language ?? 'en-US');
  const logos = useAgentLogos();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { presetAssistants } = useConversationAssistants();
  const managedAgentRuntimeCatalog = useManagedAgentRuntimeCatalog();
  const { providers, getAvailableModels } = useModelProviderList();
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
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | undefined>(undefined);

  // Reset transient state whenever the dialog opens. Assistant resolution
  // for edit mode runs in a separate effect — keeping it here would re-fire
  // this reset on every assistant catalog refresh and wipe the user's input.
  useEffect(() => {
    if (!visible) return;
    if (editJob) {
      const cronExpr = editJob.schedule.kind === 'cron' ? editJob.schedule.expr : '';
      const parsed = parseCronExpr(cronExpr);
      const agentKey = getAssistantSelectionFromJob(editJob);
      setFrequency(parsed.frequency);
      setTime(parsed.time);
      setWeekday(parsed.weekday);
      setCustomCronExpr(parsed.frequency === 'custom' ? cronExpr : '');
      setExecutionMode(editJob.target.execution_mode || 'existing');
      setSelectedAssistantId(agentKey);
      setAdvancedOpen(
        Boolean(
          editJob.metadata.agent_config?.model_id ||
          editJob.metadata.agent_config?.workspace ||
          (editJob.metadata.agent_config?.config_options &&
            Object.keys(editJob.metadata.agent_config.config_options).length > 0)
        )
      );
      form.setFieldsValue({
        name: editJob.name,
        assistant: agentKey,
        prompt: editJob.target.payload.text,
      });
      // Populate advanced settings from editJob
      setModelId(editJob.metadata.agent_config?.model_id ?? editJob.metadata.agent_config?.model?.model);
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
      setSelectedAssistantId(undefined);
    }
  }, [visible, editJob, form]);

  // Edit mode needs the assistant catalog to map a stored job to its
  // current assistant id. We isolate this in a separate effect so that
  // catalog refreshes never reach the form-reset path above.
  useEffect(() => {
    if (!visible || !editJob) return;
    const agentKey = getAssistantSelectionFromJob(editJob);
    if (!agentKey) return;
    setSelectedAssistantId(agentKey);
    form.setFieldsValue({ assistant: agentKey });
  }, [visible, editJob, presetAssistants, form]);

  // Resolve backend from the selected assistant.
  const selectedAssistant = useMemo(
    () => (selectedAssistantId ? presetAssistants.find((item) => item.id === selectedAssistantId) : undefined),
    [presetAssistants, selectedAssistantId]
  );

  const resolvedBackend = assistantRuntimeKey(selectedAssistant);
  const selectedAssistantModels = selectedAssistant?.models ?? [];
  const resolveAutoApproveModeFromAgentMetadata = useCallback(
    (assistant: (typeof presetAssistants)[number]): string => {
      const agent = managedAgentRuntimeCatalog.find((item) => item.id === assistant.agent_id);
      return agent?.yolo_id || 'yolo';
    },
    [managedAgentRuntimeCatalog]
  );

  const isGeminiMode = resolvedBackend === 'gemini' || resolvedBackend === 'aionrs';

  // Providers compatible with aionrs (AionCLI does not support Google Auth).
  // Computed independent of the current selection so assistant options backed
  // by aionrs can be disabled when no provider is configured.
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
  // For aionrs edit mode, prefer the exact provider_id stored in model —
  // the same model name may exist across multiple providers, so fuzzy match
  // would pick the wrong provider.
  const geminiCurrentModel = useMemo<TProviderWithModel | undefined>(() => {
    if (resolvedBackend !== 'aionrs' || !model_id) return undefined;

    const editedProviderId =
      resolvedBackend === 'aionrs' ? editJob?.metadata.agent_config?.model?.provider_id : undefined;
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

  const acpCachedModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!resolvedBackend || resolvedBackend === 'gemini' || resolvedBackend === 'aionrs') return null;
    return buildAssistantModelInfo(selectedAssistantModels);
  }, [resolvedBackend, selectedAssistantModels]);

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
  const isOriginalExistingConversationTask = isEditMode && editJob?.target.execution_mode === 'existing';
  const canEditAgentConfig = !isOriginalExistingConversationTask && (!isEditMode || execution_mode !== 'existing');

  const handleFrequencyChange = (value: FrequencyType) => {
    setFrequency(value);
    if (value !== 'custom') {
      setCustomCronExpr('');
    }
  };

  const handleAssistantChange = useCallback((value: string) => {
    setSelectedAssistantId(value);
    // Reset model and config_options when agent changes
    setModelId(undefined);
    setConfigOptions(undefined);
    // Workspace remains unchanged (agent-agnostic)
  }, []);

  const handleWorkspaceClear = useCallback(() => {
    setWorkspace(undefined);
  }, []);

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setSubmitting(true);

      const scheduleExpr = scheduleInfo.expr;
      const scheduleDesc = scheduleInfo.description;
      const schedule = createCronSchedule(scheduleExpr, scheduleDesc);

      const agent_config = canEditAgentConfig
        ? resolveCronAgentConfig({
            agentValue: values.assistant,
            presetAssistants,
            selectedAionrsProvider: geminiCurrentModel
              ? {
                  id: geminiCurrentModel.id as string | undefined,
                  name: geminiCurrentModel.name,
                }
              : undefined,
            model_id,
            config_options,
            workspace,
            localeKey,
            getMode: resolveAutoApproveModeFromAgentMetadata,
            aionrsModelRequiredMessage: t('cron.page.form.aionrsModelRequired'),
          }).agent_config
        : undefined;

      if (isEditMode) {
        const metadata: ICronJobUpdateParams['metadata'] = {
          conversation_title: editJob!.metadata.conversation_title,
        };
        if (canEditAgentConfig) {
          metadata.agent_config = agent_config;
        }

        // Edit mode: update existing job
        const updates: ICronJobUpdateParams = {
          name: values.name,
          schedule,
          target: {
            payload: { kind: 'message', text: values.prompt },
            execution_mode,
          },
          metadata,
          state: {
            max_retries: editJob!.state.max_retries,
          },
        };

        await ipcBridge.cron.updateJob.invoke({
          job_id: editJob!.id,
          updates,
        });
        Message.success(t('cron.page.updateSuccess'));
      } else {
        // Create mode
        const params: ICreateCronJobParams = {
          name: values.name,
          schedule,
          prompt: values.prompt,
          conversation_id: _conversation_id ?? '',
          conversation_title,
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
            label={t('cron.page.form.assistant')}
            field='assistant'
            rules={canEditAgentConfig ? [{ required: true, message: t('cron.page.form.assistantRequired') }] : []}
          >
            <Select
              data-testid='cron-assistant-select'
              value={selectedAssistantId}
              placeholder={t('cron.page.form.assistantPlaceholder')}
              disabled={!canEditAgentConfig}
              onChange={handleAssistantChange}
              renderFormat={(_option, value) => {
                const assistantId = value as unknown as string;
                if (!assistantId) return '';

                const assistant = presetAssistants.find((item) => item.id === assistantId);
                const name = resolveAssistantName(assistant, localeKey, assistantId);
                const avatar = resolveAssistantAvatar(assistant?.avatar);
                const logo = resolveAgentLogo(logos, {
                  backend: assistantRuntimeKey(assistant),
                });

                return (
                  <div className='flex items-center gap-8px'>
                    {avatar.kind === 'image' ? (
                      <img src={avatar.value} alt={name} className='w-16px h-16px object-contain' />
                    ) : avatar.kind === 'emoji' ? (
                      <span className='text-14px leading-16px'>{avatar.value}</span>
                    ) : logo ? (
                      <img src={logo} alt={name} className='w-16px h-16px object-contain' />
                    ) : (
                      <Robot size='16' />
                    )}
                    <span>{name}</span>
                  </div>
                );
              }}
            >
              {presetAssistants.map((assistant) => {
                const name = resolveAssistantName(assistant, localeKey, assistant.name);
                const avatar = resolveAssistantAvatar(assistant.avatar);
                const runtimeKey = assistantRuntimeKey(assistant);
                const logo = resolveAgentLogo(logos, {
                  backend: runtimeKey,
                });
                const disabled = isAionrsAssistant(assistant) && !hasAionrsProvider;
                return (
                  <Option key={assistant.id} value={assistant.id} disabled={disabled}>
                    <div
                      className='flex items-center gap-8px'
                      title={disabled ? t('cron.page.form.aionrsNoProvider') : undefined}
                    >
                      {avatar.kind === 'image' ? (
                        <img src={avatar.value} alt={name} className='w-16px h-16px object-contain' />
                      ) : avatar.kind === 'emoji' ? (
                        <span className='text-14px leading-16px'>{avatar.value}</span>
                      ) : logo ? (
                        <img src={logo} alt={name} className='w-16px h-16px object-contain' />
                      ) : (
                        <Robot size='16' />
                      )}
                      <span>{name}</span>
                      {disabled && (
                        <span className='text-12px text-t-tertiary'>{t('cron.page.form.aionrsNoProvider')}</span>
                      )}
                    </div>
                  </Option>
                );
              })}
            </Select>
            {!canEditAgentConfig && (
              <p className='mb-0 mt-8px text-12px leading-18px text-t-secondary'>
                {t('cron.page.form.assistantLockedExistingConversation')}
              </p>
            )}
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

          {canEditAgentConfig && (
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
          )}
        </Form>
      </div>
    </ModalWrapper>
  );
};

export default CreateTaskDialog;
