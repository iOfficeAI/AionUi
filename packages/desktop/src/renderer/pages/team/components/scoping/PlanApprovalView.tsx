/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Collapse, Input, Space, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, CloseOne, CloseSmall, Edit, FileTextOne, PreviewOpen } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { TeamworkPlan } from '@/common/types/teamwork';

const { Title, Text, Paragraph } = Typography;
const CollapseItem = Collapse.Item;
const { TextArea } = Input;

export type PlanApprovalViewProps = {
  teamId: string;
  plan: TeamworkPlan;
  originalRequestDoc?: string;
  onApprovePlan: (planMarkdown?: string) => Promise<void>;
  onRejectPlan: (reason?: string) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
};

export const PlanApprovalView: React.FC<PlanApprovalViewProps> = ({
  plan,
  originalRequestDoc,
  onApprovePlan,
  onRejectPlan,
  onCancel,
  loading = false,
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedPlanMarkdown, setEditedPlanMarkdown] = useState(plan.specMarkdown || '');
  const [activeTab, setActiveTab] = useState<'plan' | 'spec'>('plan');

  const handleApprove = async () => {
    await onApprovePlan(isEditing ? editedPlanMarkdown : undefined);
  };

  const handleReject = async () => {
    await onRejectPlan('User requested revision before starting team execution.');
  };

  const milestonesCount = plan.milestones?.length ?? 0;
  const totalCriteriaCount = plan.milestones?.reduce((acc, m) => acc + (m.criteria?.length ?? 0), 0) ?? 0;

  return (
    <Card
      className='mb-4 border border-[var(--color-border-2)] rounded-lg shadow-sm bg-[var(--color-bg-2)]'
      title={
        <Space align='center'>
          <FileTextOne theme='filled' size='18' className='text-[var(--color-primary)]' />
          <Title heading={6} className='!m-0 text-[var(--color-text-1)]'>
            {t('team.scoping.planReviewTitle', { defaultValue: 'Team Plan Review & Sign-Off' })}
          </Title>
          <Tag color='orange' size='small'>
            {t('team.scoping.awaitingApprovalTag', { defaultValue: 'Awaiting User Sign-Off' })}
          </Tag>
        </Space>
      }
      extra={
        <Space>
          <Button
            size='mini'
            type={activeTab === 'plan' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('plan')}
          >
            {t('team.scoping.tabPlan', { defaultValue: 'PROJECT_PLAN.md' })}
          </Button>
          {originalRequestDoc && (
            <Button
              size='mini'
              type={activeTab === 'spec' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('spec')}
            >
              {t('team.scoping.tabRequest', { defaultValue: 'ORIGINAL_REQUEST.md' })}
            </Button>
          )}
          <Button size='mini' icon={isEditing ? <PreviewOpen /> : <Edit />} onClick={() => setIsEditing(!isEditing)}>
            {isEditing
              ? t('team.scoping.previewMode', { defaultValue: 'Preview' })
              : t('team.scoping.editPlan', { defaultValue: 'Edit Markdown' })}
          </Button>
          {onCancel && (
            <Button
              type='text'
              size='mini'
              className='!p-0 h-6 w-6 text-[var(--color-text-3)] hover:text-[var(--color-text-1)]'
              onClick={onCancel}
              icon={<CloseSmall theme='outline' size='18' />}
              aria-label={t('team.scoping.cancel', { defaultValue: 'Cancel' })}
            />
          )}
        </Space>
      }
    >
      <div className='flex items-center gap-3 p-2.5 rounded mb-3 bg-[var(--color-fill-2)] border border-[var(--color-border-1)] text-xs'>
        <Space size='large'>
          <Text className='text-[var(--color-text-2)]'>
            {t('team.scoping.milestonesCount', {
              count: milestonesCount,
              defaultValue: `${milestonesCount} Milestones`,
            })}
          </Text>
          <Text className='text-[var(--color-text-2)]'>
            {t('team.scoping.criteriaCount', {
              count: totalCriteriaCount,
              defaultValue: `${totalCriteriaCount} Auditor Criteria`,
            })}
          </Text>
          <Tag color='green' size='small'>
            {t('team.scoping.artifactsReady', { defaultValue: 'Workspace Artifacts Ready' })}
          </Tag>
        </Space>
      </div>

      {activeTab === 'spec' && originalRequestDoc ? (
        <div className='p-3 rounded border border-[var(--color-border-2)] bg-[var(--color-bg-1)] max-h-[350px] overflow-y-auto text-xs font-mono whitespace-pre-wrap text-[var(--color-text-1)]'>
          {originalRequestDoc}
        </div>
      ) : isEditing ? (
        <TextArea
          value={editedPlanMarkdown}
          onChange={(val) => setEditedPlanMarkdown(val)}
          rows={12}
          className='font-mono text-xs w-full mb-2'
          placeholder={t('team.scoping.markdownPlaceholder', { defaultValue: 'Edit PROJECT_PLAN.md content...' })}
        />
      ) : (
        <div className='space-y-3 max-h-[350px] overflow-y-auto pr-1'>
          <Collapse defaultActiveKey={['milestone-1']} className='bg-transparent'>
            {plan.milestones.map((m, idx) => (
              <CollapseItem
                key={m.id}
                name={m.id}
                header={
                  <div className='flex items-center justify-between w-full pr-2'>
                    <Space>
                      <Tag color='arcoblue' size='small'>
                        #{idx + 1}
                      </Tag>
                      <Text className='font-semibold text-xs text-[var(--color-text-1)]'>{m.title}</Text>
                    </Space>
                    <Tag color='gray' size='small'>
                      {m.status.toUpperCase()}
                    </Tag>
                  </div>
                }
              >
                {m.description && (
                  <Paragraph className='text-xs text-[var(--color-text-2)] mb-2 italic'>{m.description}</Paragraph>
                )}

                {m.subtasks && m.subtasks.length > 0 && (
                  <div className='mb-2'>
                    <Text className='font-semibold text-xs block mb-1 text-[var(--color-text-1)]'>
                      {t('team.scoping.subtasks', { defaultValue: 'Assigned Subtasks:' })}
                    </Text>
                    <div className='space-y-1 pl-2'>
                      {m.subtasks.map((st) => (
                        <div key={st.id} className='flex items-center gap-2 text-xs'>
                          <Tag size='small' color='blue'>
                            {st.assignedRole.toUpperCase()}
                          </Tag>
                          <Text className='text-[var(--color-text-2)]'>{st.title}</Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Text className='font-semibold text-xs block mb-1 text-[var(--color-text-1)]'>
                    {t('team.scoping.auditorCriteria', { defaultValue: 'Auditor Acceptance Criteria:' })}
                  </Text>
                  <ul className='list-disc pl-5 space-y-0.5 text-xs text-[var(--color-text-2)]'>
                    {m.criteria.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              </CollapseItem>
            ))}
          </Collapse>
        </div>
      )}

      <div className='flex justify-between items-center mt-4 pt-3 border-t border-[var(--color-border-1)]'>
        <Text type='secondary' className='text-xs'>
          {t('team.scoping.approvalNotice', {
            defaultValue: 'Team agents will only start file edits after you confirm the plan.',
          })}
        </Text>
        <Space>
          {onCancel && (
            <Button size='small' onClick={onCancel} icon={<CloseOne />}>
              {t('team.scoping.cancel', { defaultValue: 'Cancel' })}
            </Button>
          )}
          <Button size='small' onClick={handleReject} icon={<CloseOne />}>
            {t('team.scoping.requestRevision', { defaultValue: 'Reject / Revise' })}
          </Button>
          <Button size='small' type='primary' loading={loading} onClick={handleApprove} icon={<CheckOne />}>
            {t('team.scoping.approveAndStart', { defaultValue: 'Approve & Start Team' })}
          </Button>
        </Space>
      </div>
    </Card>
  );
};
