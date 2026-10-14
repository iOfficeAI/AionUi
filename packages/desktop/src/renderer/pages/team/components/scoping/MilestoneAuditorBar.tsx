/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Space, Spin, Tag, Typography } from '@arco-design/web-react';
import { Audit, CheckOne, CloseOne, LoadingOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { TeamMilestone, TeamScopingStatus } from '@/common/types/teamwork';

const { Text } = Typography;

export type MilestoneAuditorBarProps = {
  status: TeamScopingStatus;
  activeMilestone?: TeamMilestone;
  activeRole?: string;
  auditorFeedback?: string;
  totalMilestones?: number;
  currentMilestoneIndex?: number;
};

export const MilestoneAuditorBar: React.FC<MilestoneAuditorBarProps> = ({
  status,
  activeMilestone,
  activeRole,
  auditorFeedback,
  totalMilestones = 1,
  currentMilestoneIndex = 1,
}) => {
  const { t } = useTranslation();

  if (status !== 'executing' && status !== 'auditing' && status !== 'verified') {
    return null;
  }

  const isAuditing = status === 'auditing' || activeRole === 'auditor';
  const isVerified = status === 'verified' && !activeMilestone;

  return (
    <div className='mb-3 p-2.5 rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-2)] shadow-sm'>
      <div className='flex items-center justify-between'>
        <Space align='center' size='medium'>
          <Audit
            theme='filled'
            size='18'
            className={isAuditing ? 'text-green-500 animate-pulse' : 'text-[var(--color-primary)]'}
          />

          <div>
            <div className='flex items-center gap-2'>
              <Text className='font-semibold text-xs text-[var(--color-text-1)]'>
                {isVerified
                  ? t('team.scoping.allMilestonesVerified', { defaultValue: 'All Milestones Verified' })
                  : activeMilestone?.title ||
                    t('team.scoping.activeMilestone', {
                      current: currentMilestoneIndex,
                      total: totalMilestones,
                      defaultValue: `Milestone ${currentMilestoneIndex} of ${totalMilestones}`,
                    })}
              </Text>

              {isAuditing && (
                <Tag color='green' size='small' className='animate-pulse' icon={<Spin size={12} />}>
                  {t('team.scoping.auditorGateActive', { defaultValue: 'Auditor Verifying Diff & Tests' })}
                </Tag>
              )}

              {isVerified && (
                <Tag color='green' size='small' icon={<CheckOne />}>
                  {t('team.scoping.verifiedTag', { defaultValue: 'VERIFIED' })}
                </Tag>
              )}

              {!isAuditing && !isVerified && activeMilestone && (
                <Tag color='arcoblue' size='small' icon={<LoadingOne className='animate-spin' />}>
                  {t('team.scoping.workerActive', { defaultValue: 'Worker Executing' })}
                </Tag>
              )}
            </div>

            {activeMilestone?.description && (
              <Text type='secondary' className='text-xs line-clamp-1'>
                {activeMilestone.description}
              </Text>
            )}
          </div>
        </Space>

        <Space size='small'>
          {activeRole && (
            <Tag color='purple' size='small'>
              {t('team.scoping.roleLabel', {
                role: activeRole.toUpperCase(),
                defaultValue: `Role: ${activeRole.toUpperCase()}`,
              })}
            </Tag>
          )}
          <Text type='secondary' className='text-xs font-mono'>
            {currentMilestoneIndex}/{totalMilestones}
          </Text>
        </Space>
      </div>

      {auditorFeedback && (
        <Alert
          type='warning'
          className='mt-2.5 text-xs'
          icon={<CloseOne />}
          title={t('team.scoping.auditorRemediationTitle', { defaultValue: 'Auditor Verification Gate Feedback' })}
          content={
            <div className='font-mono text-xs whitespace-pre-wrap mt-1 text-[var(--color-text-2)]'>
              {auditorFeedback}
            </div>
          }
        />
      )}
    </div>
  );
};
