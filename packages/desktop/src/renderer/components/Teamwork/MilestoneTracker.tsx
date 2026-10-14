/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Collapse, Space, Steps, Tag, Typography } from '@arco-design/web-react';
import { Check, CheckOne, Close, CloseOne, FileCode, LoadingFour, Plan, PlayOne, Time } from '@icon-park/react';
import type { MilestoneStatus, TeamworkMilestone, TeamworkSessionState } from '@/common/types/teamwork';
import { AgentStatusBadge } from './AgentStatusBadge';

export type MilestoneTrackerProps = {
  session: TeamworkSessionState;
  onConfirmPlan?: () => Promise<void>;
  onAbort?: () => void;
  loading?: boolean;
};

export const MilestoneTracker: React.FC<MilestoneTrackerProps> = ({
  session,
  onConfirmPlan,
  onAbort,
  loading = false,
}) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  const renderStatusBadge = (status: MilestoneStatus) => {
    switch (status) {
      case 'pending':
        return (
          <Tag color='gray' size='small' icon={<Time />}>
            {t('team.teamwork.status.pending')}
          </Tag>
        );
      case 'in_progress':
        return (
          <Tag color='arcoblue' size='small' icon={<LoadingFour className='animate-spin' />}>
            {t('team.teamwork.status.in_progress')}
          </Tag>
        );
      case 'review':
        return (
          <Tag color='orange' size='small' icon={<LoadingFour className='animate-spin' />}>
            {t('team.teamwork.status.review')}
          </Tag>
        );
      case 'verified':
        return (
          <Tag color='green' size='small' icon={<CheckOne />}>
            {t('team.teamwork.status.verified')}
          </Tag>
        );
      case 'failed':
        return (
          <Tag color='red' size='small' icon={<CloseOne />}>
            {t('team.teamwork.status.failed')}
          </Tag>
        );
      default:
        return <Tag size='small'>{status}</Tag>;
    }
  };

  const milestones: TeamworkMilestone[] = session.milestones || [];
  const isPlanReady = session.phase === 'plan_ready';
  const isExecuting = session.phase === 'executing' || session.phase === 'verifying';
  const isCompleted = session.phase === 'completed';
  const isFailed = session.phase === 'failed';

  const handleConfirm = async () => {
    if (!onConfirmPlan || confirming || loading) return;
    setConfirming(true);
    try {
      await onConfirmPlan();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card
      bordered
      className='my-3 rounded-xl border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] shadow-sm'
      title={
        <div className='flex items-center justify-between flex-wrap gap-2 w-full'>
          <div className='flex items-center gap-2'>
            <Plan theme='filled' size='18' fill='var(--color-primary)' />
            <Typography.Title heading={6} className='!m-0 text-base font-semibold'>
              {t('team.teamwork.milestonesTitle')}
            </Typography.Title>
          </div>

          <AgentStatusBadge
            role={session.activeRole || 'sentinel'}
            isExecuting={isExecuting}
            activeToolCall={session.activeToolCall}
            tokenConsumption={session.tokenConsumption}
          />
        </div>
      }
    >
      {/* Plan Ready Banner & Approval Gate */}
      {isPlanReady && (
        <Alert
          type='info'
          className='mb-4 rounded-lg'
          title={t('team.teamwork.planReadyTitle')}
          content={
            <div className='flex items-center justify-between flex-wrap gap-3 mt-2'>
              <span className='text-sm text-[var(--color-text-2)]'>{t('team.teamwork.planReadySubtitle')}</span>
              <Button type='primary' icon={<PlayOne />} loading={confirming || loading} onClick={handleConfirm}>
                {confirming ? t('team.teamwork.confirming') : t('team.teamwork.confirmPlan')}
              </Button>
            </div>
          }
        />
      )}

      {/* Error / Aborted Alert */}
      {isFailed && (
        <Alert
          type='error'
          className='mb-4 rounded-lg'
          title={t('team.teamwork.status.failed')}
          content={session.error || 'Execution halted due to verification failure.'}
        />
      )}

      {/* Completed Alert */}
      {isCompleted && (
        <Alert
          type='success'
          className='mb-4 rounded-lg'
          title={t('team.teamwork.status.completed')}
          content='All milestones have been implemented and independently verified by the Auditor gate.'
        />
      )}

      {/* Milestones List */}
      <div className='space-y-3'>
        {milestones.map((milestone, index) => {
          const isActive = session.activeMilestoneId === milestone.id;

          return (
            <Card
              key={milestone.id}
              className={`rounded-lg border border-solid transition-all duration-200 ${
                isActive
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light-1)] shadow-xs'
                  : 'border-[var(--color-border-1)] bg-[var(--color-fill-1)]'
              }`}
              bordered={false}
            >
              {/* Header */}
              <div className='flex items-center justify-between flex-wrap gap-2 mb-2'>
                <div className='flex items-center gap-2'>
                  <span className='font-bold text-[var(--color-text-1)] text-sm'>#{index + 1}</span>
                  <span className='font-semibold text-[var(--color-text-1)]'>{milestone.title}</span>
                </div>
                <div>{renderStatusBadge(milestone.status)}</div>
              </div>

              {/* Description */}
              <p className='text-xs text-[var(--color-text-3)] mb-3'>{milestone.description}</p>

              {/* Subtasks */}
              {milestone.subtasks && milestone.subtasks.length > 0 && (
                <div className='mb-3'>
                  <div className='text-xs font-semibold text-[var(--color-text-2)] mb-1'>
                    {t('team.teamwork.subtasksTitle')}:
                  </div>
                  <div className='space-y-1'>
                    {milestone.subtasks.map((st) => (
                      <div
                        key={st.id}
                        className='flex items-center justify-between text-xs py-1 px-2 rounded bg-[var(--color-bg-2)] border border-solid border-[var(--color-border-1)]'
                      >
                        <div className='flex items-center gap-2'>
                          {st.status === 'completed' ? (
                            <Check theme='outline' size='14' fill='#00B42A' />
                          ) : (
                            <div className='w-3.5 h-3.5 rounded-full border border-solid border-[var(--color-border-3)]' />
                          )}
                          <span
                            className={
                              st.status === 'completed'
                                ? 'line-through text-[var(--color-text-3)]'
                                : 'text-[var(--color-text-1)]'
                            }
                          >
                            {st.title}
                          </span>
                        </div>
                        {st.assignedRole && (
                          <Tag size='small' color='arcoblue' className='text-[10px]'>
                            {st.assignedRole.toUpperCase()}
                          </Tag>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acceptance Criteria */}
              {milestone.acceptanceCriteria && milestone.acceptanceCriteria.length > 0 && (
                <div>
                  <div className='text-xs font-semibold text-[var(--color-text-2)] mb-1'>
                    {t('team.teamwork.criteriaTitle')}:
                  </div>
                  <ul className='m-0 pl-4 space-y-0.5 text-xs text-[var(--color-text-2)] list-disc'>
                    {milestone.acceptanceCriteria.map((crit, cIdx) => (
                      <li key={cIdx}>{crit}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Review / Auditor Notes */}
              {milestone.reviewNotes && (
                <div className='mt-2 p-2 rounded bg-[var(--color-fill-2)] text-xs text-[var(--color-text-2)] border-l-2 border-solid border-[var(--color-primary)]'>
                  <span className='font-semibold'>Auditor: </span>
                  {milestone.reviewNotes}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Abort button if executing */}
      {isExecuting && onAbort && (
        <div className='flex justify-end mt-4 pt-3 border-t border-solid border-[var(--color-border-1)]'>
          <Button status='danger' icon={<Close />} size='small' onClick={onAbort}>
            {t('team.teamwork.abort')}
          </Button>
        </div>
      )}
    </Card>
  );
};
