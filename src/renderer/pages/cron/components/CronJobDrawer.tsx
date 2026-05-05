/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { AcpBackend, AcpSessionConfigOption, AgentBackend } from '@/common/types/acpTypes';
import { ConfigStorage, type TChatConversation } from '@/common/config/storage';
import {
  buildCliAgentParams,
  buildPresetAssistantParams,
} from '@/renderer/pages/conversation/utils/createConversationParams';
import MarkdownView from '@/renderer/components/Markdown';
import { WorkspaceFolderSelect } from '@/renderer/components/workspace';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { emitter } from '@/renderer/utils/emitter';
import { getAgentKey } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import {
  filterSelectableCronConfigOptions,
  getCronConfigOptionTranslationKey,
  getCronConfigOptions,
  resolveCronAgentBackend,
  resolveCronInitialConfigValues,
  resolveCronInitialMode,
} from '@/renderer/pages/cron/cronAgentConfigUtils';
import { buildCronSchedule, scheduleToDraft } from '@/renderer/pages/cron/cronScheduleUtils';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import MarkdownEditor from '@/renderer/pages/conversation/Preview/components/editors/MarkdownEditor';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Message,
  Select,
  Switch,
  Tabs,
} from '@arco-design/web-react';
import { AlarmClock, Play } from '@icon-park/react';
import dayjs from 'dayjs';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type CronJobDrawerMode = 'create' | 'edit';

type CronJobDrawerProps = {
  visible: boolean;
  mode: CronJobDrawerMode;
  job?: ICronJob | null;
  conversation?: TChatConversation | null;
  seedConversation?: TChatConversation | null;
  availableAgents: AvailableAgent[];
  onClose: () => void;
};

type CronJobFormValues = {
  name: string;
  enabled: boolean;
  queueMode: boolean;
  agentKey?: string;
  workspace?: string;
  firstRunAt: dayjs.Dayjs;
  intervalValue: number;
  intervalUnit: 'minute' | 'hour' | 'day' | 'week' | 'workday' | 'month' | 'year';
};

const CRON_UNIT_KEY_MAP = {
  minute: 'cron.unit.minute',
  hour: 'cron.unit.hour',
  day: 'cron.unit.day',
  week: 'cron.unit.week',
  workday: 'cron.unit.workday',
  month: 'cron.unit.month',
  year: 'cron.unit.year',
} as const;

const FormItem = Form.Item;

const CronJobDrawer: React.FC<CronJobDrawerProps> = ({
  visible,
  mode,
  job,
  conversation,
  seedConversation,
  availableAgents,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [form] = Form.useForm<CronJobFormValues>();
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [promptTab, setPromptTab] = useState<'markdown' | 'preview'>('markdown');
  const [selectedAgentKey, setSelectedAgentKey] = useState<string | undefined>();
  const [selectedMode, setSelectedMode] = useState('default');
  const [configOptions, setConfigOptions] = useState<AcpSessionConfigOption[]>([]);
  const [selectedConfigOptionValues, setSelectedConfigOptionValues] = useState<Record<string, string>>({});
  const [loadingAgentConfig, setLoadingAgentConfig] = useState(false);
  const [workspaceValue, setWorkspaceValue] = useState('');

  const linkedConversation = mode === 'edit' ? conversation : seedConversation;

  const selectedConversationAgentKey = useMemo(() => {
    return getConversationAgentKey(linkedConversation);
  }, [linkedConversation]);

  const initialValues = useMemo<CronJobFormValues>(() => {
    if (mode === 'edit' && job) {
      const draft = scheduleToDraft(job.schedule);
      return {
        name: job.name,
        enabled: job.enabled,
        queueMode: Boolean(job.target.queueMode),
        agentKey: selectedConversationAgentKey,
        workspace: getConversationWorkspace(linkedConversation) ?? '',
        firstRunAt: dayjs(draft.firstRunAtMs),
        intervalValue: draft.intervalValue,
        intervalUnit: draft.intervalUnit,
      };
    }

    const defaultStartAt = dayjs().add(1, 'hour').startOf('hour');
    return {
      name: '',
      enabled: true,
      queueMode: false,
      agentKey: selectedConversationAgentKey ?? (availableAgents[0] ? getAgentKey(availableAgents[0]) : undefined),
      workspace: getConversationWorkspace(linkedConversation) ?? '',
      firstRunAt: defaultStartAt,
      intervalValue: 1,
      intervalUnit: 'hour',
    };
  }, [availableAgents, job, linkedConversation, mode, selectedConversationAgentKey]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    form.setFieldsValue(initialValues);
    setMessageText(mode === 'edit' && job ? job.target.payload.text : '');
    setPromptTab('markdown');
    setSelectedAgentKey(initialValues.agentKey);
    setWorkspaceValue(initialValues.workspace ?? '');
  }, [form, initialValues, job, mode, visible]);

  const agentOptions = useMemo(
    () =>
      availableAgents.map((agent) => ({
        label: agent.name,
        value: getAgentKey(agent),
      })),
    [availableAgents]
  );
  const selectedAgent = useMemo(
    () => availableAgents.find((agent) => getAgentKey(agent) === selectedAgentKey),
    [availableAgents, selectedAgentKey]
  );
  const selectedAgentBackend = useMemo(() => {
    return resolveCronAgentBackend(selectedAgent) ?? getConversationModeBackend(linkedConversation);
  }, [linkedConversation, selectedAgent]);
  const modeOptions = useMemo(() => getAgentModes(selectedAgentBackend), [selectedAgentBackend]);
  const selectableConfigOptions = useMemo(() => filterSelectableCronConfigOptions(configOptions), [configOptions]);
  const hasExecutionConfig = modeOptions.length > 0 || selectableConfigOptions.length > 0;

  const drawerTitle = mode === 'create' ? t('cron.panel.createTitle') : t('cron.panel.editTitle');
  const linkedConversationName = linkedConversation?.name || t('cron.panel.noConversationLinked');

  useEffect(() => {
    if (!visible) {
      return;
    }

    const persistedConfig = getConversationAgentConfig(linkedConversation);
    if (!selectedAgentBackend) {
      setSelectedMode('default');
      setConfigOptions([]);
      setSelectedConfigOptionValues({});
      return;
    }

    let cancelled = false;
    setLoadingAgentConfig(true);

    const loadAgentConfig = async () => {
      try {
        const [acpConfig, geminiConfig, cachedConfigOptions] = await Promise.all([
          ConfigStorage.get('acp.config'),
          ConfigStorage.get('gemini.config'),
          ConfigStorage.get('acp.cachedConfigOptions'),
        ]);
        if (cancelled) {
          return;
        }

        const backendConfig =
          selectedAgentBackend !== 'custom' && selectedAgentBackend !== 'gemini'
            ? acpConfig?.[selectedAgentBackend as AcpBackend]
            : undefined;
        const nextConfigOptions = getCronConfigOptions(selectedAgentBackend, cachedConfigOptions || undefined);

        setConfigOptions(nextConfigOptions);
        setSelectedMode(
          resolveCronInitialMode(
            selectedAgentBackend,
            selectedAgentBackend === 'gemini'
              ? {
                  preferredMode: geminiConfig?.preferredMode,
                  yoloMode: geminiConfig?.yoloMode,
                }
              : {
                  preferredMode: backendConfig?.preferredMode,
                  yoloMode: backendConfig?.yoloMode,
                },
            persistedConfig?.sessionMode
          )
        );
        setSelectedConfigOptionValues(
          resolveCronInitialConfigValues(
            nextConfigOptions,
            backendConfig?.preferredConfigOptions,
            persistedConfig?.configOptionValues
          )
        );
      } catch (error) {
        console.warn('[CronJobDrawer] Failed to load agent config defaults:', error);
        if (cancelled) {
          return;
        }

        const fallbackConfigOptions = getCronConfigOptions(selectedAgentBackend);
        setConfigOptions(fallbackConfigOptions);
        setSelectedMode(resolveCronInitialMode(selectedAgentBackend, undefined, persistedConfig?.sessionMode));
        setSelectedConfigOptionValues(
          resolveCronInitialConfigValues(fallbackConfigOptions, undefined, persistedConfig?.configOptionValues)
        );
      } finally {
        if (!cancelled) {
          setLoadingAgentConfig(false);
        }
      }
    };

    void loadAgentConfig();

    return () => {
      cancelled = true;
    };
  }, [linkedConversation, selectedAgentBackend, visible]);

  const handleRunNow = async () => {
    if (!job) {
      return;
    }

    setRunningNow(true);
    try {
      await ipcBridge.cron.runJobNow.invoke({ jobId: job.id });
      Message.success(t('cron.runNowSuccess'));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setRunningNow(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      const trimmedMessage = messageText.trim();
      if (!trimmedMessage) {
        throw new Error(t('cron.panel.promptRequired'));
      }

      const firstRunAtMs = dayjs(values.firstRunAt).valueOf();
      const normalizedIntervalValue = Math.max(1, Math.trunc(values.intervalValue));
      const unitLabel = t(CRON_UNIT_KEY_MAP[values.intervalUnit]);
      const scheduleDraft = {
        firstRunAtMs,
        intervalValue: normalizedIntervalValue,
        intervalUnit: values.intervalUnit,
      } as const;
      const schedule = buildCronSchedule(
        scheduleDraft,
        t('cron.panel.scheduleSummary', {
          unit: unitLabel,
          count: normalizedIntervalValue,
          startAt: dayjs(firstRunAtMs).format('YYYY-MM-DD HH:mm'),
        })
      );

      setSaving(true);

      if (mode === 'create') {
        const chosenAgent = availableAgents.find((agent) => getAgentKey(agent) === values.agentKey);
        if (!chosenAgent) {
          throw new Error(t('cron.panel.agentRequired'));
        }

        const workspace = values.workspace?.trim();
        if (!workspace) {
          throw new Error(t('cron.panel.workspaceRequired'));
        }

        const createParams = chosenAgent.isPreset
          ? await buildPresetAssistantParams(chosenAgent, workspace, i18n.language)
          : await buildCliAgentParams(chosenAgent, workspace);
        const configOptionValues =
          selectableConfigOptions.length > 0 && Object.keys(selectedConfigOptionValues).length > 0
            ? selectedConfigOptionValues
            : undefined;

        const conversationParams = {
          ...createParams,
          name: values.name.trim(),
          extra: {
            ...createParams.extra,
            sessionMode: modeOptions.length > 0 ? selectedMode : createParams.extra.sessionMode,
            configOptionValues,
          },
        };

        const createdConversation = await ipcBridge.conversation.create.invoke(conversationParams);
        emitter.emit('chat.history.refresh');

        await ipcBridge.cron.addJob.invoke({
          name: values.name.trim(),
          schedule,
          message: trimmedMessage,
          conversationId: createdConversation.id,
          conversationTitle: createdConversation.name,
          agentType: resolveCronAgentType(createdConversation),
          createdBy: 'user',
          queueMode: values.queueMode,
        });

        Message.success(t('cron.panel.createSuccess'));
      } else if (job) {
        await ipcBridge.cron.updateJob.invoke({
          jobId: job.id,
          updates: {
            name: values.name.trim(),
            enabled: values.enabled,
            schedule,
            target: {
              payload: {
                kind: 'message',
                text: trimmedMessage,
              },
              queueMode: values.queueMode,
            },
          },
        });

        Message.success(t('cron.panel.updateSuccess'));
      }

      onClose();
    } catch (error) {
      if (error instanceof Error) {
        Message.error(error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      placement={isMobile ? 'bottom' : 'right'}
      width={isMobile ? 'calc(100vw - 12px)' : 520}
      height={isMobile ? 'min(90vh, 900px)' : undefined}
      visible={visible}
      onCancel={onClose}
      title={
        <div className='inline-flex items-center gap-8px'>
          <AlarmClock theme='outline' size={18} strokeWidth={4} fill='currentColor' className='flex items-center' />
          <span className='leading-none'>{drawerTitle}</span>
        </div>
      }
      bodyStyle={{
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: isMobile ? '14px 14px 18px' : undefined,
      }}
      footer={
        <div className='flex flex-wrap items-center justify-between gap-8px'>
          <div className='flex items-center gap-8px'>
            {mode === 'edit' && job ? (
              <Button loading={runningNow} icon={<Play theme='outline' size={14} />} onClick={handleRunNow}>
                {t('cron.actions.runNow')}
              </Button>
            ) : null}
          </div>
          <div className='flex items-center gap-8px'>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type='primary' loading={saving} onClick={handleSubmit}>
              {mode === 'create' ? t('common.create') : t('common.save')}
            </Button>
          </div>
        </div>
      }
    >
      <Form form={form} layout='vertical' initialValues={initialValues} className='space-y-12px'>
        <div className='bg-2 rd-16px px-16px py-16px space-y-12px'>
          <FormItem
            field='name'
            label={t('cron.drawer.name')}
            rules={[{ required: true, message: t('cron.drawer.namePlaceholder') }]}
            className='!mb-0'
          >
            <Input placeholder={t('cron.drawer.namePlaceholder')} />
          </FormItem>

          <div className='flex items-center justify-between gap-12px'>
            <span className='text-14px'>{t('cron.drawer.taskStatus')}</span>
            <div className='flex items-center gap-8px'>
              <Form.Item shouldUpdate noStyle>
                {(values) => (
                  <span className='text-14px text-text-3'>
                    {values.enabled ? t('cron.drawer.enabled') : t('cron.drawer.disabled')}
                  </span>
                )}
              </Form.Item>
              <FormItem field='enabled' triggerPropName='checked' noStyle>
                <Switch />
              </FormItem>
            </div>
          </div>
        </div>

        <div className='bg-2 rd-16px px-16px py-16px space-y-12px'>
          <FormItem
            field='agentKey'
            label={t('cron.panel.agentLabel')}
            rules={mode === 'create' ? [{ required: true, message: t('cron.panel.agentRequired') }] : undefined}
            className='!mb-0'
          >
            <Select
              placeholder={t('cron.panel.agentPlaceholder')}
              options={agentOptions}
              disabled={mode === 'edit'}
              allowClear={false}
              onChange={(value) => setSelectedAgentKey(String(value))}
            />
          </FormItem>

          <FormItem
            field='workspace'
            label={t('cron.panel.workspaceLabel')}
            rules={mode === 'create' ? [{ required: true, message: t('cron.panel.workspaceRequired') }] : undefined}
            className='!mb-0'
          >
            <WorkspaceFolderSelect
              value={workspaceValue}
              onChange={(value) => {
                setWorkspaceValue(value);
                form.setFieldValue('workspace', value);
              }}
              onClear={() => {
                setWorkspaceValue('');
                form.setFieldValue('workspace', '');
              }}
              placeholder={t('cron.panel.workspacePlaceholder')}
              inputPlaceholder={t('cron.panel.workspacePlaceholder')}
              recentLabel={t('team.create.recentLabel', { defaultValue: 'Recent' })}
              chooseDifferentLabel={t('team.create.chooseDifferentFolder', {
                defaultValue: 'Choose a different folder',
              })}
              disabled={mode === 'edit'}
              triggerTestId='cron-drawer-workspace-trigger'
              menuTestId='cron-drawer-workspace-menu'
              menuZIndex={10020}
            />
          </FormItem>

          {mode === 'edit' ? (
            <div className='text-12px text-t-secondary'>
              {t('cron.panel.linkedConversation')}: {linkedConversationName}
            </div>
          ) : null}
        </div>

        {hasExecutionConfig ? (
          <div className='bg-2 rd-16px px-16px py-16px space-y-12px'>
            {modeOptions.length > 0 ? (
              <FormItem label={t('agentMode.switchMode')} className='!mb-0'>
                <Select
                  value={selectedMode}
                  options={modeOptions.map((modeOption) => ({
                    label: t(`agentMode.${modeOption.value}`, { defaultValue: modeOption.label }),
                    value: modeOption.value,
                  }))}
                  disabled={mode === 'edit' || loadingAgentConfig}
                  allowClear={false}
                  onChange={(value) => setSelectedMode(String(value))}
                />
              </FormItem>
            ) : null}

            {selectableConfigOptions.map((option) => {
              const currentValue =
                selectedConfigOptionValues[option.id] ||
                option.currentValue ||
                option.selectedValue ||
                option.options?.[0]?.value;

              return (
                <FormItem
                  key={option.id}
                  label={t(`acp.config.${getCronConfigOptionTranslationKey(option.id)}`, {
                    defaultValue: option.name || option.label || option.id,
                  })}
                  className='!mb-0'
                >
                  <Select
                    value={currentValue}
                    options={(option.options || []).map((choice) => ({
                      label: choice.name || choice.label || choice.value,
                      value: choice.value,
                    }))}
                    disabled={mode === 'edit' || loadingAgentConfig}
                    allowClear={false}
                    onChange={(value) =>
                      setSelectedConfigOptionValues((prev) => ({
                        ...prev,
                        [option.id]: String(value),
                      }))
                    }
                  />
                </FormItem>
              );
            })}
          </div>
        ) : null}

        <div className='bg-2 rd-16px px-16px py-16px space-y-12px'>
          <div className='flex items-start justify-between gap-12px'>
            <div className='min-w-0'>
              <div className='text-14px font-medium'>{t('cron.page.form.queueMode')}</div>
              <div className='mt-4px text-12px leading-18px text-t-secondary'>{t('cron.page.form.queueModeHint')}</div>
            </div>
            <FormItem field='queueMode' triggerPropName='checked' noStyle>
              <Switch />
            </FormItem>
          </div>

          <FormItem
            field='firstRunAt'
            label={t('cron.panel.firstRunAtLabel')}
            rules={[{ required: true, message: t('cron.panel.firstRunAtRequired') }]}
            className='!mb-0'
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </FormItem>

          <div className='grid grid-cols-1 gap-12px md:grid-cols-[minmax(0,1fr)_160px]'>
            <FormItem
              field='intervalValue'
              label={t('cron.panel.intervalValueLabel')}
              rules={[{ required: true, message: t('cron.panel.intervalValueRequired') }]}
              className='!mb-0'
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </FormItem>

            <FormItem
              field='intervalUnit'
              label={t('cron.panel.intervalUnitLabel')}
              rules={[{ required: true, message: t('cron.panel.intervalUnitRequired') }]}
              className='!mb-0'
            >
              <Select
                options={[
                  { label: t('cron.unit.minute'), value: 'minute' },
                  { label: t('cron.unit.hour'), value: 'hour' },
                  { label: t('cron.unit.day'), value: 'day' },
                  { label: t('cron.unit.week'), value: 'week' },
                  { label: t('cron.unit.workday'), value: 'workday' },
                  { label: t('cron.unit.month'), value: 'month' },
                  { label: t('cron.unit.year'), value: 'year' },
                ]}
              />
            </FormItem>
          </div>
        </div>

        <div className='bg-2 rd-16px px-16px py-16px space-y-12px'>
          <div className='text-14px font-medium'>{t('cron.drawer.command')}</div>
          <Tabs activeTab={promptTab} onChange={(key) => setPromptTab(key as 'markdown' | 'preview')}>
            <Tabs.TabPane key='markdown' title={t('cron.panel.markdownTab')}>
              <div className='h-280px overflow-hidden rounded-12px border border-solid border-[var(--color-border-2)]'>
                <MarkdownEditor value={messageText} onChange={setMessageText} />
              </div>
            </Tabs.TabPane>
            <Tabs.TabPane key='preview' title={t('cron.panel.previewTab')}>
              <div className='min-h-280px rounded-12px border border-solid border-[var(--color-border-2)] bg-bg-1 p-12px'>
                {messageText.trim() ? (
                  <MarkdownView hiddenCodeCopyButton>{messageText}</MarkdownView>
                ) : (
                  <div className='text-13px text-t-secondary'>{t('cron.drawer.commandPlaceholder')}</div>
                )}
              </div>
            </Tabs.TabPane>
          </Tabs>
        </div>
      </Form>
    </Drawer>
  );
};

function resolveCronAgentType(conversation: TChatConversation): AgentBackend {
  if (conversation.type === 'gemini') {
    return 'gemini';
  }

  if (conversation.type === 'nanobot') {
    return 'nanobot';
  }

  if (conversation.type === 'openclaw-gateway') {
    return getConversationBackend(conversation) ?? 'openclaw-gateway';
  }

  if (conversation.type === 'acp') {
    return getConversationBackend(conversation) ?? 'claude';
  }

  return 'codex';
}

type ConversationCronExtra = {
  workspace?: string;
  backend?: AgentBackend;
  presetAssistantId?: string;
  sessionMode?: string;
  configOptionValues?: Record<string, string>;
};

function getConversationCronExtra(conversation?: TChatConversation | null): ConversationCronExtra | null {
  return conversation ? (conversation.extra as ConversationCronExtra) : null;
}

function getConversationWorkspace(conversation?: TChatConversation | null): string | undefined {
  return getConversationCronExtra(conversation)?.workspace;
}

function getConversationBackend(conversation?: TChatConversation | null): AgentBackend | undefined {
  return getConversationCronExtra(conversation)?.backend;
}

function getConversationModeBackend(conversation?: TChatConversation | null): string | undefined {
  if (!conversation) {
    return undefined;
  }

  if (conversation.type === 'gemini') {
    return 'gemini';
  }

  if (conversation.type === 'codex') {
    return 'codex';
  }

  if (conversation.type === 'acp') {
    return getConversationBackend(conversation);
  }

  return undefined;
}

function getConversationAgentConfig(
  conversation?: TChatConversation | null
): Pick<ConversationCronExtra, 'sessionMode' | 'configOptionValues'> | null {
  const extra = getConversationCronExtra(conversation);
  if (!extra) {
    return null;
  }

  return {
    sessionMode: extra.sessionMode,
    configOptionValues: extra.configOptionValues,
  };
}

function getConversationAgentKey(conversation?: TChatConversation | null): string | undefined {
  if (!conversation) {
    return undefined;
  }

  const extra = getConversationCronExtra(conversation);
  if (extra?.presetAssistantId) {
    return `custom:${extra.presetAssistantId}`;
  }

  if (conversation.type === 'gemini') {
    return 'gemini';
  }

  if (conversation.type === 'nanobot') {
    return 'nanobot';
  }

  if (conversation.type === 'codex') {
    return 'codex';
  }

  return extra?.backend ?? (conversation.type === 'openclaw-gateway' ? 'openclaw-gateway' : undefined);
}

export default CronJobDrawer;
