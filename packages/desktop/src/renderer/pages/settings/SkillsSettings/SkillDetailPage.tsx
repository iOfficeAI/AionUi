/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SkillDetailPage — detail view for a single skill, styled after the
 * assistant editor page (sticky top bar + centered section cards).
 *
 * A single "used by" list is the source of truth for the skill↔assistant
 * relation (GitHub-collaborators pattern): rows link to the assistant and
 * expose an inline remove; an "Add assistant" dropdown lists only the
 * assistants not yet attached. Builtin assistants are read-only because
 * their update path only accepts agent/defaults fields.
 */

import { ipcBridge } from '@/common';
import type { LarkCliStatus } from '@/common/adapter/ipcBridge';
import type { Assistant, UpdateAssistantRequest } from '@/common/types/agent/assistantTypes';
import { resolveLocaleKey } from '@/common/utils';
import { useTalkToButler } from '@/renderer/hooks/assistant/useTalkToButler';
import AssistantAvatar from '@/renderer/pages/settings/AssistantSettings/AssistantAvatar';
import { Button, Dropdown, Menu, Message, Spin, Typography } from '@arco-design/web-react';
import { ApplicationOne, ArrowLeft, Close, MessageOne, NewLark, Permissions, Plus, Right } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import useSWR, { mutate as swrMutate } from 'swr';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import SkillFileBrowser from './SkillFileBrowser';
import { getAssistantsUsingSkill } from './SkillUsedByStack';

interface SkillInfo {
  name: string;
  description: string;
  location: string;
  is_auto_inject: boolean;
  is_custom: boolean;
  source?: 'builtin' | 'custom' | 'cron' | 'extension';
}

const getAvatarColorClass = (name: string) => {
  if (!name) return 'bg-[#165DFF] text-white';
  const colors = [
    'bg-[#165DFF] text-white', // Blue
    'bg-[#00B42A] text-white', // Green
    'bg-[#722ED1] text-white', // Purple
    'bg-[#F5319D] text-white', // Pink
    'bg-[#F77234] text-white', // Orange
    'bg-[#14C9C9] text-white', // Cyan
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const SectionCard: React.FC<{
  title: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  'data-testid'?: string;
}> = ({ title, extra, children, 'data-testid': dataTestId }) => (
  <section data-testid={dataTestId} className='rounded-16px border border-border-2 bg-base px-20px py-18px'>
    <div className='mb-14px flex items-center justify-between gap-12px'>
      <h2 className='m-0 text-14px font-600 text-t-primary'>{title}</h2>
      {extra}
    </div>
    {children}
  </section>
);

const SkillDetailPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n.language);
  const location = useLocation();
  const navigate = useNavigate();
  const talkToButler = useTalkToButler();
  const { skillName = '' } = useParams<{ skillName: string }>();
  const decodedName = decodeURIComponent(skillName);
  const [saving, setSaving] = useState(false);
  const [larkCliAction, setLarkCliAction] = useState<'check' | 'install' | 'restore' | null>(null);

  const { data: skills, isLoading: skillsLoading } = useSWR<SkillInfo[]>('skills.list', () =>
    ipcBridge.fs.listAvailableSkills.invoke()
  );
  const {
    data: assistants,
    isLoading: assistantsLoading,
    mutate: mutateAssistants,
  } = useSWR<Assistant[]>('assistants.list', () => ipcBridge.assistants.list.invoke());

  const skill = useMemo(() => (skills ?? []).find((s) => s.name === decodedName), [skills, decodedName]);
  const isBuiltinLark = skill?.name === 'lark' && skill.source === 'builtin';
  const skillDisplayName = isBuiltinLark ? t('settings.skillsHub.larkSetup.assistantName') : skill?.name;
  const { data: larkCliStatus, mutate: mutateLarkCliStatus } = useSWR<LarkCliStatus>(
    isBuiltinLark ? 'lark-cli.status' : null,
    async () => {
      const result = await ipcBridge.larkCli.status.invoke();
      if (!result.success || !result.data) throw new Error(result.msg || 'Lark CLI status unavailable');
      return result.data;
    }
  );
  const usingAssistants = useMemo(
    () => getAssistantsUsingSkill(decodedName, assistants ?? []),
    [assistants, decodedName]
  );
  // Attachment editing covers user + generated assistants; builtin assistants'
  // update endpoint only accepts agent_id/defaults (see useAssistantEditor).
  const editableAssistants = useMemo(() => (assistants ?? []).filter((a) => a.source !== 'builtin'), [assistants]);
  const readonlyUsers = useMemo(() => usingAssistants.filter((a) => a.source === 'builtin'), [usingAssistants]);

  const assistantLabel = useCallback(
    (assistant: Assistant): string => assistant.name_i18n?.[localeKey] || assistant.name,
    [localeKey]
  );

  const originTab =
    typeof location.state === 'object' &&
    location.state !== null &&
    'skillsTab' in location.state &&
    location.state.skillsTab === 'official'
      ? 'official'
      : 'custom';

  const goBack = useCallback(() => {
    void navigate('/settings/skills', { state: { skillsTab: originTab } });
  }, [navigate, originTab]);

  const editViaChat = useCallback(() => {
    void talkToButler({
      prompt: t('settings.skillsHub.editViaChat.defaultPrompt', {
        skillName: decodedName,
        defaultValue:
          "I'd like to improve this Skill: {{skillName}}\n\nPlease review its content and help me make improvements. My suggestions are:",
      }),
    });
  }, [decodedName, t, talkToButler]);

  const setupLarkViaChat = useCallback(() => {
    void talkToButler({
      prompt: t('settings.skillsHub.larkSetup.prompt'),
    });
  }, [t, talkToButler]);

  const runLarkCliAction = useCallback(
    async (action: 'check' | 'install' | 'restore') => {
      setLarkCliAction(action);
      try {
        let result;
        if (action === 'check') {
          result = await ipcBridge.larkCli.check.invoke();
        } else if (action === 'install') {
          if (!larkCliStatus?.latestVersion) throw new Error('Latest Lark CLI version unavailable');
          result = await ipcBridge.larkCli.install.invoke({ version: larkCliStatus.latestVersion });
        } else {
          result = await ipcBridge.larkCli.restoreBundled.invoke();
        }
        if (!result.success || !result.data) throw new Error(result.msg || 'Lark CLI action failed');
        await mutateLarkCliStatus(result.data, false);
        if (action === 'check') {
          Message.success(
            result.data.updateAvailable
              ? t('settings.skillsHub.larkSetup.updateAvailable', { version: result.data.latestVersion })
              : t('settings.skillsHub.larkSetup.upToDate')
          );
        } else {
          Message.success(
            action === 'install'
              ? t('settings.skillsHub.larkSetup.updateSuccess')
              : t('settings.skillsHub.larkSetup.restoreSuccess')
          );
        }
      } catch (error) {
        console.error('Lark CLI action failed:', error);
        Message.error(t('settings.skillsHub.larkSetup.actionFailed'));
      } finally {
        setLarkCliAction(null);
      }
    },
    [larkCliStatus?.latestVersion, mutateLarkCliStatus, t]
  );

  const openAssistant = useCallback(
    (assistantId: string) => {
      void navigate('/assistants', { state: { openAssistantEditor: true, openAssistantId: assistantId } });
    },
    [navigate]
  );

  const sourceLabel = (s: SkillInfo): string => {
    if (s.source === 'custom') return t('settings.skillsHub.tabCustom', { defaultValue: 'Custom' });
    if (s.source === 'extension') return t('settings.extensionSkills', { defaultValue: 'Extension Skills' });
    if (s.is_auto_inject) return t('settings.autoInjectedSkills', { defaultValue: 'Auto-injected Skills' });
    return t('settings.skillsHub.tabOfficial', { defaultValue: 'Official' });
  };

  /** Attach or detach this skill on a single assistant. */
  const setAttachment = useCallback(
    async (assistant: Assistant, attach: boolean) => {
      setSaving(true);
      try {
        const update: UpdateAssistantRequest = {
          id: assistant.id,
          enabled_skills: attach
            ? Array.from(new Set([...(assistant.enabled_skills ?? []), decodedName]))
            : (assistant.enabled_skills ?? []).filter((n) => n !== decodedName),
        };
        await ipcBridge.assistants.update.invoke(update);
        Message.success(t('settings.skillsHub.detailAttachSuccess', { defaultValue: 'Assistants updated' }));
        await Promise.all([mutateAssistants(), swrMutate('agents.boundAssistants.list')]);
      } catch (error) {
        console.error('Failed to update assistant skills:', error);
        Message.error(t('settings.skillsHub.detailAttachError', { defaultValue: 'Failed to update assistants' }));
      } finally {
        setSaving(false);
      }
    },
    [decodedName, mutateAssistants, t]
  );

  // Assistants that can still be added: editable and not yet using the skill.
  const addableAssistants = useMemo(() => {
    const usingIds = new Set(usingAssistants.map((a) => a.id));
    return editableAssistants.filter((a) => !usingIds.has(a.id));
  }, [editableAssistants, usingAssistants]);

  const loading = skillsLoading || assistantsLoading;

  return (
    <SettingsPageWrapper>
      <div data-testid='skill-detail-page' className='flex flex-col gap-16px'>
        <div className='flex items-center gap-10px'>
          <Button
            type='text'
            icon={<ArrowLeft size={16} />}
            onClick={goBack}
            data-testid='btn-back-skill-detail'
            className='!flex !items-center !gap-4px !rounded-8px !px-6px !text-t-primary'
          >
            {t('settings.skillsHub.detailBackToList', { defaultValue: 'All skills' })}
          </Button>
        </div>

        {loading ? (
          <div className='flex items-center justify-center py-64px'>
            <Spin />
          </div>
        ) : !skill ? (
          <div
            data-testid='skill-detail-not-found'
            className='rounded-12px border border-dashed border-border-1 bg-fill-1 px-16px py-40px text-center text-13px text-t-tertiary'
          >
            {t('settings.skillsHub.detailNotFound', { defaultValue: 'Skill not found. It may have been deleted.' })}
          </div>
        ) : (
          <div className='mx-auto flex w-full max-w-760px flex-col gap-16px'>
            {/* Basic info */}
            <SectionCard
              title={t('settings.skillsHub.detailInfoTitle', { defaultValue: 'Skill info' })}
              data-testid='skill-detail-info'
            >
              <div className='flex gap-16px'>
                {isBuiltinLark ? (
                  <div className='h-48px w-48px shrink-0 rounded-12px flex items-center justify-center bg-[rgba(var(--primary-6),0.08)] text-primary-6 shadow-sm'>
                    <NewLark theme='filled' size={26} fill='currentColor' />
                  </div>
                ) : (
                  <div
                    className={`h-48px w-48px shrink-0 rounded-12px flex items-center justify-center text-18px font-bold shadow-sm text-transform-uppercase ${getAvatarColorClass(skill.name)}`}
                  >
                    {skill.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className='min-w-0 flex flex-col gap-6px'>
                  <div className='flex items-center gap-8px'>
                    <span className='text-16px font-600 text-t-primary'>{skillDisplayName}</span>
                    <span className='rounded-4px border border-border-2 bg-fill-1 px-6px py-1px text-11px text-t-secondary'>
                      {sourceLabel(skill)}
                    </span>
                  </div>
                  <p className='m-0 text-13px leading-relaxed text-t-secondary'>
                    {isBuiltinLark
                      ? t('settings.skillsHub.larkSetup.description')
                      : skill.description ||
                        t('settings.skillsHub.detailNoDescription', { defaultValue: 'No description.' })}
                  </p>
                </div>
              </div>
            </SectionCard>

            {isBuiltinLark ? (
              <SectionCard
                title={t('settings.skillsHub.larkSetup.onboardingTitle')}
                data-testid='lark-setup-guide'
                extra={
                  <span className='rounded-4px bg-[rgba(var(--success-6),0.08)] px-7px py-2px text-11px font-500 text-success-6'>
                    {t('settings.skillsHub.larkSetup.quickSetupBadge')}
                  </span>
                }
              >
                <div className='flex flex-col gap-14px'>
                  <div>
                    <p className='m-0 text-14px font-500 leading-relaxed text-t-primary'>
                      {t('settings.skillsHub.larkSetup.onboardingSubtitle')}
                    </p>
                    <p className='mb-0 mt-4px text-12px leading-relaxed text-t-secondary'>
                      {t('settings.skillsHub.larkSetup.capabilities')}
                    </p>
                  </div>

                  <div className='grid grid-cols-1 gap-8px md:grid-cols-3' data-testid='lark-onboarding-steps'>
                    {[
                      {
                        icon: <ApplicationOne size={18} fill='currentColor' />,
                        title: t('settings.skillsHub.larkSetup.stepPrepareTitle'),
                        description: t('settings.skillsHub.larkSetup.stepPrepareDescription'),
                      },
                      {
                        icon: <Permissions size={18} fill='currentColor' />,
                        title: t('settings.skillsHub.larkSetup.stepAuthorizeTitle'),
                        description: t('settings.skillsHub.larkSetup.stepAuthorizeDescription'),
                      },
                      {
                        icon: <MessageOne size={18} fill='currentColor' />,
                        title: t('settings.skillsHub.larkSetup.stepUseTitle'),
                        description: t('settings.skillsHub.larkSetup.stepUseDescription'),
                      },
                    ].map((step, index) => (
                      <div key={step.title} className='rounded-10px border border-border-2 bg-fill-1 px-12px py-11px'>
                        <div className='mb-7px flex items-center gap-7px text-primary-6'>
                          {step.icon}
                          <span className='text-12px font-600 text-t-primary'>
                            {index + 1}. {step.title}
                          </span>
                        </div>
                        <p className='m-0 text-11px leading-relaxed text-t-secondary'>{step.description}</p>
                      </div>
                    ))}
                  </div>

                  <div className='rounded-8px border border-primary-2 bg-primary-1 px-12px py-10px'>
                    <div className='text-12px font-600 text-t-primary'>
                      {t('settings.skillsHub.larkSetup.permissionTitle')}
                    </div>
                    <p className='mb-0 mt-4px text-11px leading-relaxed text-t-secondary'>
                      {t('settings.skillsHub.larkSetup.permissionNote')}
                    </p>
                  </div>

                  <div>
                    <Button type='primary' size='default' data-testid='btn-setup-lark' onClick={setupLarkViaChat}>
                      {t('settings.skillsHub.larkSetup.startButton')}
                    </Button>
                    <span className='ml-10px text-11px text-t-tertiary'>
                      {t('settings.skillsHub.larkSetup.startHint')}
                    </span>
                  </div>

                  {larkCliStatus ? (
                    <div className='rounded-8px border border-border-2 bg-fill-1 px-12px py-10px text-12px text-t-secondary'>
                      <div className='flex flex-wrap items-center gap-x-16px gap-y-4px'>
                        <span>
                          {t('settings.skillsHub.larkSetup.versionLabel')}: v{larkCliStatus.currentVersion ?? '—'}
                        </span>
                        <span>
                          {t('settings.skillsHub.larkSetup.sourceLabel')}:{' '}
                          {t(
                            larkCliStatus.source === 'managed'
                              ? 'settings.skillsHub.larkSetup.sourceManaged'
                              : 'settings.skillsHub.larkSetup.sourceBundled'
                          )}
                        </span>
                        {larkCliStatus.latestVersion ? (
                          <span>
                            {t('settings.skillsHub.larkSetup.latestLabel')}: v{larkCliStatus.latestVersion}
                          </span>
                        ) : null}
                      </div>
                      {!larkCliStatus.supported ? (
                        <div className='mt-6px text-warning-6'>{t('settings.skillsHub.larkSetup.unsupported')}</div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className='flex flex-wrap gap-8px'>
                    <Button
                      size='small'
                      loading={larkCliAction === 'check'}
                      disabled={!larkCliStatus?.supported || larkCliAction !== null}
                      onClick={() => void runLarkCliAction('check')}
                    >
                      {t('settings.skillsHub.larkSetup.checkUpdate')}
                    </Button>
                    {larkCliStatus?.updateAvailable && larkCliStatus.latestVersion ? (
                      <Button
                        type='primary'
                        size='small'
                        loading={larkCliAction === 'install'}
                        disabled={larkCliAction !== null}
                        onClick={() => void runLarkCliAction('install')}
                      >
                        {t('settings.skillsHub.larkSetup.installUpdate', { version: larkCliStatus.latestVersion })}
                      </Button>
                    ) : null}
                    {larkCliStatus?.source === 'managed' ? (
                      <Button
                        size='small'
                        loading={larkCliAction === 'restore'}
                        disabled={larkCliAction !== null}
                        onClick={() => void runLarkCliAction('restore')}
                      >
                        {t('settings.skillsHub.larkSetup.restoreBundled')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </SectionCard>
            ) : null}

            {/* Single source of truth: assistants using this skill, with inline add/remove */}
            <SectionCard
              title={
                t('settings.skillsHub.detailUsedByTitle', { defaultValue: 'Used by' }) + ` (${usingAssistants.length})`
              }
              data-testid='skill-detail-used-by'
              extra={
                <Dropdown
                  trigger='click'
                  position='br'
                  disabled={saving || addableAssistants.length === 0}
                  droplist={
                    <Menu style={{ maxHeight: 320, overflow: 'auto' }}>
                      {addableAssistants.map((assistant) => (
                        <Menu.Item
                          key={assistant.id}
                          data-testid={`menu-add-assistant-${assistant.id}`}
                          onClick={() => void setAttachment(assistant, true)}
                        >
                          <span className='flex items-center gap-8px'>
                            <AssistantAvatar assistant={assistant} size={20} />
                            <span className='truncate'>{assistantLabel(assistant)}</span>
                          </span>
                        </Menu.Item>
                      ))}
                    </Menu>
                  }
                >
                  <Button
                    size='mini'
                    type='text'
                    loading={saving}
                    icon={<Plus size={14} />}
                    data-testid='btn-add-assistant'
                    className='!h-24px !px-8px !text-12px !text-t-secondary hover:!text-t-primary'
                  >
                    {t('settings.skillsHub.detailAddAssistant', { defaultValue: 'Attach to assistant' })}
                  </Button>
                </Dropdown>
              }
            >
              {usingAssistants.length === 0 ? (
                <div
                  data-testid='skill-detail-used-by-empty'
                  className='rounded-8px bg-fill-1 px-12px py-16px text-center text-12px text-t-tertiary'
                >
                  {t('settings.skillsHub.detailUsedByEmpty', {
                    defaultValue: 'No assistants are using this skill yet.',
                  })}
                </div>
              ) : (
                <div className='flex flex-col gap-4px'>
                  {usingAssistants.map((assistant) => {
                    const isReadonly = readonlyUsers.some((a) => a.id === assistant.id);
                    return (
                      <div
                        key={assistant.id}
                        className='group flex cursor-pointer items-center gap-10px rounded-8px px-12px py-10px transition-colors hover:bg-fill-1'
                        data-testid={`skill-used-by-row-${assistant.id}`}
                        onClick={() => openAssistant(assistant.id)}
                      >
                        <AssistantAvatar assistant={assistant} size={26} />
                        <Typography.Text className='flex-1 truncate text-13px font-500 text-t-primary'>
                          {assistantLabel(assistant)}
                        </Typography.Text>
                        {isReadonly ? (
                          <span className='rounded-4px border border-border-2 bg-fill-1 px-6px py-1px text-11px text-t-tertiary'>
                            {t('settings.skillsHub.detailBuiltinAssistant', { defaultValue: 'Built-in' })}
                          </span>
                        ) : (
                          <Button
                            size='mini'
                            type='text'
                            icon={<Close size={13} />}
                            data-testid={`btn-detach-${assistant.id}`}
                            className='!h-22px !px-6px !text-12px !text-t-tertiary hover:!text-danger-6 opacity-0 group-hover:opacity-100 transition-opacity'
                            onClick={(e) => {
                              e.stopPropagation();
                              void setAttachment(assistant, false);
                            }}
                          >
                            {t('settings.skillsHub.detailDetach', { defaultValue: 'Remove' })}
                          </Button>
                        )}
                        <span className='flex items-center gap-2px text-12px text-t-tertiary group-hover:text-t-secondary'>
                          {t('settings.agentManagement.viewAssistant', { defaultValue: 'View' })}
                          <Right size={13} fill='currentColor' />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={t('settings.skillsHub.detailFilesTitle', { defaultValue: 'Skill files' })}
              data-testid='skill-detail-files'
              extra={
                <Button
                  size='mini'
                  type='text'
                  data-testid='btn-edit-skill-via-chat'
                  onClick={editViaChat}
                  className='!h-24px !px-8px !text-12px !text-t-secondary hover:!text-t-primary'
                >
                  {t('settings.skillsHub.editViaChat.buttonLabel', { defaultValue: 'Edit via chat' })}
                </Button>
              }
            >
              <SkillFileBrowser skill={skill} />
            </SectionCard>
          </div>
        )}
      </div>
    </SettingsPageWrapper>
  );
};

export default SkillDetailPage;
