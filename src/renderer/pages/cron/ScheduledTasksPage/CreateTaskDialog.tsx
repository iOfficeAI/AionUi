/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Input, Select, Message, TimePicker, Radio } from '@arco-design/web-react';
import ModalWrapper from '@renderer/components/base/ModalWrapper';
import { Robot } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { ICreateCronJobParams, ICronAgentConfig, ICronJob } from '@/common/adapter/ipcBridge';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@/renderer/pages/guid/constants';
import dayjs from 'dayjs';

const FormItem = Form.Item;
const TextArea = Input.TextArea;
const Option = Select.Option;
const OptGroup = Select.OptGroup;

interface CreateTaskDialogProps {
  visible: boolean;
  onClose: () => void;
  /** When provided, the dialog operates in edit mode */
  editJob?: ICronJob;
  conversationId?: string;
  conversationTitle?: string;
  agentType?: string;
}

type FrequencyType = 'manual' | 'hourly' | 'daily' | 'weekdays' | 'weekly';

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
 */
function parseCronExpr(expr: string): { frequency: FrequencyType; time: string; weekday: string } {
  if (!expr) return { frequency: 'manual', time: '09:00', weekday: 'MON' };

  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return { frequency: 'daily', time: '09:00', weekday: 'MON' };

  const [min, hour, , , dow] = parts;

  // Hourly: 0 * * * *
  if (hour === '*') return { frequency: 'hourly', time: '09:00', weekday: 'MON' };

  const hh = String(hour).padStart(2, '0');
  const mm = String(min).padStart(2, '0');
  const time = `${hh}:${mm}`;

  // Weekdays: min hour * * MON-FRI
  if (dow === 'MON-FRI') return { frequency: 'weekdays', time, weekday: 'MON' };

  // Weekly: min hour * * DAY
  if (dow !== '*') {
    const dayUpper = dow.toUpperCase();
    const matched = WEEKDAYS.find((d) => d.value === dayUpper);
    if (matched) return { frequency: 'weekly', time, weekday: dayUpper };
    return { frequency: 'daily', time, weekday: 'MON' };
  }

  // Daily: min hour * * *
  return { frequency: 'daily', time, weekday: 'MON' };
}

/**
 * Infer the agent selection key from an ICronJob's agentConfig.
 */
function getAgentKeyFromJob(job: ICronJob): string | undefined {
  const config = job.metadata.agentConfig;
  if (!config) return undefined;
  if (config.isPreset && config.customAgentId) return `preset:${config.customAgentId}`;
  return `cli:${config.backend}`;
}

const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  visible,
  onClose,
  editJob,
  conversationId,
  conversationTitle,
  agentType,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { cliAgents, presetAssistants } = useConversationAgents();
  const [frequency, setFrequency] = useState<FrequencyType>('manual');
  const [time, setTime] = useState('09:00');
  const [weekday, setWeekday] = useState('MON');

  const isEditMode = !!editJob;
  const [executionMode, setExecutionMode] = useState<'new_conversation' | 'existing'>('new_conversation');

  // Populate form when entering edit mode
  useEffect(() => {
    if (!visible) return;
    if (editJob) {
      const cronExpr = editJob.schedule.kind === 'cron' ? editJob.schedule.expr : '';
      const parsed = parseCronExpr(cronExpr);
      setFrequency(parsed.frequency);
      setTime(parsed.time);
      setWeekday(parsed.weekday);
      setExecutionMode(editJob.target.executionMode || 'existing');
      form.setFieldsValue({
        name: editJob.name,
        description: editJob.schedule.description || editJob.name,
        prompt: editJob.target.payload.text,
        agent: getAgentKeyFromJob(editJob),
      });
    } else {
      form.resetFields();
      setFrequency('manual');
      setTime('09:00');
      setWeekday('MON');
      setExecutionMode('new_conversation');
    }
  }, [visible, editJob, form]);

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
      default:
        return { expr: '', description: '' };
    }
  }, [frequency, time, weekday, t]);

  const handleFrequencyChange = (value: FrequencyType) => {
    setFrequency(value);
  };

  const resolveAgentConfig = (agentValue: string) => {
    const colonIdx = agentValue.indexOf(':');
    const agentKind = agentValue.substring(0, colonIdx);
    const agentId = agentValue.substring(colonIdx + 1);

    let agentConfig: ICronAgentConfig | undefined;
    let resolvedAgentType: ICreateCronJobParams['agentType'] = (agentType ||
      'claude') as ICreateCronJobParams['agentType'];

    if (agentKind === 'cli') {
      const agent = cliAgents.find((a) => a.backend === agentId);
      if (agent) {
        resolvedAgentType = agent.backend;
        agentConfig = {
          backend: agent.backend,
          name: agent.name,
          cliPath: agent.cliPath,
        };
      }
    } else if (agentKind === 'preset') {
      const agent = presetAssistants.find((a) => a.customAgentId === agentId);
      if (agent) {
        resolvedAgentType = agent.backend;
        agentConfig = {
          backend: agent.backend,
          name: agent.name,
          isPreset: true,
          customAgentId: agent.customAgentId,
          presetAgentType: agent.presetAgentType,
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
          jobId: editJob!.id,
          updates: {
            name: values.name,
            schedule: { kind: 'cron', expr: scheduleExpr, description: scheduleDesc },
            target: {
              ...editJob!.target,
              payload: { kind: 'message', text: values.prompt },
              executionMode,
            },
            metadata: {
              ...editJob!.metadata,
              agentType: resolvedAgentType,
              agentConfig,
              updatedAt: Date.now(),
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
          conversationId: '',
          conversationTitle,
          agentType: resolvedAgentType,
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
      style={{ maxWidth: 520 }}
      unmountOnExit
    >
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
                    logo = (
                      <img src={logoSrc} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                    );
                  }
                }
              } else if (type === 'preset') {
                const agent = presetAssistants.find((a) => a.customAgentId === id);
                if (agent) {
                  name = agent.name;
                  const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
                  const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');
                  if (avatarImage) {
                    logo = (
                      <img src={avatarImage} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                    );
                  } else if (isEmoji) {
                    logo = <span style={{ fontSize: 14, lineHeight: '16px' }}>{agent.avatar}</span>;
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
                          <img src={logo} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
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
                    <Option key={`preset:${agent.customAgentId}`} value={`preset:${agent.customAgentId}`}>
                      <div className='flex items-center gap-8px'>
                        {avatarImage ? (
                          <img
                            src={avatarImage}
                            alt={agent.name}
                            style={{ width: 16, height: 16, objectFit: 'contain' }}
                          />
                        ) : isEmoji ? (
                          <span style={{ fontSize: 14, lineHeight: '16px' }}>{agent.avatar}</span>
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
          <Radio.Group value={executionMode} onChange={setExecutionMode} type='button' disabled={isEditMode}>
            <Radio value='new_conversation'>{t('cron.page.form.newConversation')}</Radio>
            <Radio value='existing'>{t('cron.page.form.existingConversation')}</Radio>
          </Radio.Group>
          <div className='text-text-3 text-12px mt-4px'>
            {isEditMode
              ? t('cron.page.form.executionModeEditHint')
              : executionMode === 'new_conversation'
                ? t('cron.page.form.newConversationHint')
                : t('cron.page.form.existingConversationHint')}
          </div>
        </FormItem>

        <FormItem
          label={t('cron.page.form.prompt')}
          field='prompt'
          rules={[{ required: true, message: t('cron.page.form.promptRequired') }]}
        >
          <TextArea placeholder={t('cron.page.form.promptPlaceholder')} autoSize={{ minRows: 4, maxRows: 10 }} />
        </FormItem>

        {/* Frequency */}
        <FormItem label={t('cron.page.form.frequency')}>
          <Select value={frequency} onChange={handleFrequencyChange}>
            <Option value='manual'>{t('cron.page.freq.manual')}</Option>
            <Option value='hourly'>{t('cron.page.freq.hourly')}</Option>
            <Option value='daily'>{t('cron.page.freq.daily')}</Option>
            <Option value='weekdays'>{t('cron.page.freq.weekdays')}</Option>
            <Option value='weekly'>{t('cron.page.freq.weekly')}</Option>
          </Select>
        </FormItem>

        {/* Time picker - shown for daily/weekdays/weekly */}
        {showTimePicker && (
          <div className='flex items-center gap-12px mb-16px'>
            <TimePicker
              format='HH:mm'
              value={dayjs(`2000-01-01 ${time}`)}
              onChange={(_timeStr, time) => {
                if (time) {
                  setTime(time.format('HH:mm'));
                }
              }}
              allowClear={false}
              style={{ width: 120 }}
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

        {/* Hint text */}
        {frequency !== 'manual' && <p className='text-text-3 text-12px mt-0 mb-16px'>{t('cron.page.scheduleHint')}</p>}
      </Form>
    </ModalWrapper>
  );
};

export default CreateTaskDialog;
