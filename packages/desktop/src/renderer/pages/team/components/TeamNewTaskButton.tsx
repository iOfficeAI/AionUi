/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Button, Dropdown, Menu, Modal, Message, Tooltip, Tag, List } from '@arco-design/web-react';
import { Plus, Down, Brain, Delete } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { TTeam, TeamMemory } from '@/common/types/team/teamTypes';
import type { TeamRunViewState } from '../hooks/useTeamRunView';
import {
  clearTeamMemory,
  getTeamMemory,
  removeTeamDirective,
  removeTeamSkill,
  resetTeamForNewTask,
} from '../utils/teamMemoryManager';

type TeamNewTaskButtonProps = {
  team: TTeam;
  teamRunView?: TeamRunViewState;
  onTaskReset?: () => void;
  disabled?: boolean;
};

export const TeamNewTaskButton: React.FC<TeamNewTaskButtonProps> = ({
  team,
  teamRunView,
  onTaskReset,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [memoryModalVisible, setMemoryModalVisible] = useState(false);
  const [teamMemory, setTeamMemory] = useState<TeamMemory>(() => getTeamMemory(team.id));

  const refreshMemory = useCallback(() => {
    setTeamMemory(getTeamMemory(team.id));
  }, [team.id]);

  const handleStartNewTask = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const hideLoadingMsg = Message.loading({
      content: t('team.newTask.distilling'),
      duration: 0,
    });

    try {
      const result = await resetTeamForNewTask({
        team,
        activeRunId: teamRunView?.activeRun?.team_run_id,
      });

      refreshMemory();
      hideLoadingMsg();

      Message.success(
        t('team.newTask.success', {
          skillsCount: result.skills.length,
          directivesCount: result.systemDirectives.length,
        })
      );

      onTaskReset?.();
    } catch (error) {
      hideLoadingMsg();
      console.error('[TeamNewTaskButton] Failed to start new task:', error);
      Message.error(t('common.unknownError'));
    } finally {
      setLoading(false);
    }
  }, [loading, onTaskReset, refreshMemory, t, team, teamRunView?.activeRun?.team_run_id]);

  const confirmStartNewTask = useCallback(() => {
    Modal.confirm({
      title: t('team.newTask.confirmTitle'),
      content: t('team.newTask.confirmContent'),
      okText: t('team.newTask.confirmOk'),
      cancelText: t('common.cancel'),
      okButtonProps: { type: 'primary' },
      onOk: handleStartNewTask,
    });
  }, [handleStartNewTask, t]);

  const confirmClearMemory = useCallback(() => {
    Modal.confirm({
      title: t('team.newTask.clearMemoryConfirmTitle'),
      content: t('team.newTask.clearMemoryConfirmContent'),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'danger' },
      onOk: () => {
        clearTeamMemory(team.id);
        refreshMemory();
        Message.success(t('team.newTask.clearMemorySuccess'));
      },
    });
  }, [refreshMemory, t, team.id]);

  const handleDeleteSkill = useCallback(
    (skillId: string) => {
      removeTeamSkill(team.id, skillId);
      refreshMemory();
    },
    [refreshMemory, team.id]
  );

  const handleDeleteDirective = useCallback(
    (index: number) => {
      removeTeamDirective(team.id, index);
      refreshMemory();
    },
    [refreshMemory, team.id]
  );

  const totalRetainedCount = useMemo(
    () => teamMemory.skills.length + teamMemory.systemDirectives.length,
    [teamMemory.skills.length, teamMemory.systemDirectives.length]
  );

  const menu = useMemo(
    () => (
      <Menu
        onClickMenuItem={(key) => {
          if (key === 'new-task') {
            confirmStartNewTask();
          } else if (key === 'view-memory') {
            refreshMemory();
            setMemoryModalVisible(true);
          } else if (key === 'clear-memory') {
            confirmClearMemory();
          }
        }}
      >
        <Menu.Item key='new-task'>
          <div className='flex items-center gap-8px'>
            <Plus theme='outline' size='14' />
            <span>{t('team.newTask.button')}</span>
          </div>
        </Menu.Item>
        <Menu.Item key='view-memory'>
          <div className='flex items-center gap-8px'>
            <Brain theme='outline' size='14' />
            <span>
              {t('team.newTask.viewMemory')} ({totalRetainedCount})
            </span>
          </div>
        </Menu.Item>
        {totalRetainedCount > 0 && (
          <Menu.Item key='clear-memory' style={{ color: 'rgb(var(--danger-6))' }}>
            <div className='flex items-center gap-8px'>
              <Delete theme='outline' size='14' />
              <span>{t('team.newTask.clearMemory')}</span>
            </div>
          </Menu.Item>
        )}
      </Menu>
    ),
    [confirmClearMemory, confirmStartNewTask, refreshMemory, t, totalRetainedCount]
  );

  return (
    <>
      <div className='inline-flex items-center flex-row flex-nowrap shrink-0 border border-solid border-[color:var(--border-base)] rounded-6px overflow-hidden bg-2 hover:border-[color:var(--border-3)] transition-colors'>
        <Tooltip content={t('team.newTask.tooltip')} position='bottom'>
          <Button
            type='text'
            size='small'
            disabled={disabled || loading}
            loading={loading}
            onClick={confirmStartNewTask}
            className='flex items-center gap-4px px-8px h-28px font-medium rounded-none text-[color:var(--color-text-1)] hover:bg-[color:var(--fill-2)]'
          >
            <Plus theme='outline' size='14' />
            <span>{t('team.newTask.button')}</span>
            {totalRetainedCount > 0 && (
              <Tag size='small' color='arcoblue' className='ml-2px h-18px leading-16px px-4px text-11px'>
                {totalRetainedCount}
              </Tag>
            )}
          </Button>
        </Tooltip>
        <span className='w-1px h-14px bg-[color:var(--border-base)] shrink-0' />
        <Dropdown droplist={menu} position='br' disabled={disabled || loading}>
          <Button
            type='text'
            size='small'
            disabled={disabled || loading}
            icon={<Down theme='outline' size='12' />}
            className='flex items-center justify-center w-22px h-28px px-0 rounded-none text-[color:var(--color-text-2)] hover:text-[color:var(--color-text-1)] hover:bg-[color:var(--fill-2)]'
            aria-label={t('team.newTask.viewMemory')}
          />
        </Dropdown>
      </div>

      <Modal
        title={
          <div className='flex items-center gap-8px'>
            <Brain theme='outline' size='18' />
            <span>{t('team.newTask.memoryModalTitle')}</span>
          </div>
        }
        visible={memoryModalVisible}
        onOk={() => setMemoryModalVisible(false)}
        onCancel={() => setMemoryModalVisible(false)}
        okText={t('common.confirm')}
        cancelButtonProps={{ style: { display: 'none' } }}
        style={{ width: 620, maxWidth: '90vw' }}
      >
        <div className='max-h-480px overflow-y-auto px-4px flex flex-col gap-16px'>
          {teamMemory.skills.length === 0 && teamMemory.systemDirectives.length === 0 ? (
            <div className='py-32px text-center text-t-secondary text-13px'>{t('team.newTask.emptyMemory')}</div>
          ) : (
            <>
              {teamMemory.skills.length > 0 && (
                <div>
                  <div className='font-semibold text-14px mb-8px text-t-primary flex items-center justify-between'>
                    <span>
                      {t('team.newTask.skillsSection')} ({teamMemory.skills.length})
                    </span>
                  </div>
                  <List
                    size='small'
                    bordered
                    dataSource={teamMemory.skills}
                    render={(skill) => (
                      <List.Item
                        key={skill.id}
                        extra={
                          <Button
                            type='text'
                            status='danger'
                            size='mini'
                            icon={<Delete theme='outline' size='14' />}
                            onClick={() => handleDeleteSkill(skill.id)}
                            aria-label={t('team.newTask.deleteSkill')}
                          />
                        }
                      >
                        <List.Item.Meta
                          title={<span className='font-medium text-13px'>{skill.title}</span>}
                          description={
                            <div className='flex flex-col gap-4px'>
                              <div className='text-12px text-t-secondary whitespace-pre-wrap'>{skill.description}</div>
                              <span className='text-11px text-t-tertiary'>
                                {t('team.newTask.extractedAt', {
                                  time: new Date(skill.extractedAt).toLocaleString(),
                                })}
                              </span>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </div>
              )}

              {teamMemory.systemDirectives.length > 0 && (
                <div>
                  <div className='font-semibold text-14px mb-8px text-t-primary flex items-center justify-between'>
                    <span>
                      {t('team.newTask.directivesSection')} ({teamMemory.systemDirectives.length})
                    </span>
                  </div>
                  <List
                    size='small'
                    bordered
                    dataSource={teamMemory.systemDirectives}
                    render={(directive, index) => (
                      <List.Item
                        key={index}
                        extra={
                          <Button
                            type='text'
                            status='danger'
                            size='mini'
                            icon={<Delete theme='outline' size='14' />}
                            onClick={() => handleDeleteDirective(index)}
                            aria-label={t('team.newTask.deleteSkill')}
                          />
                        }
                      >
                        <span className='text-13px text-t-primary leading-relaxed'>{directive}</span>
                      </List.Item>
                    )}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
};

export default TeamNewTaskButton;
