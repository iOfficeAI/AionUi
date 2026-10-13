/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Input, Radio, Space, Tag, Typography, Progress } from '@arco-design/web-react';
import { CheckOne, CloseOne, SettingTwo } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { ScopingQuestion } from '@/common/types/teamwork';

const { Title, Text, Paragraph } = Typography;

export type ScopingInterviewProps = {
  teamId: string;
  userRequest: string;
  questions: ScopingQuestion[];
  onSubmitAnswers: (answers: Record<string, string>) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'architecture':
      return 'arcoblue';
    case 'testing':
      return 'green';
    case 'constraints':
      return 'orange';
    case 'scope':
      return 'purple';
    default:
      return 'gray';
  }
};

export const ScopingInterview: React.FC<ScopingInterviewProps> = ({
  userRequest,
  questions,
  onSubmitAnswers,
  onCancel,
  loading = false,
}) => {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) {
      if (q.options && q.options.length > 0) {
        initial[q.id] = q.options[0];
      }
    }
    return initial;
  });

  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  const handleSelectOption = (questionId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const handleCustomTextChange = (questionId: string, text: string) => {
    setCustomAnswers((prev) => ({ ...prev, [questionId]: text }));
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
  };

  const answeredCount = Object.keys(answers).filter((k) => (answers[k] || '').trim().length > 0).length;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  const handleSubmit = async () => {
    await onSubmitAnswers(answers);
  };

  return (
    <Card
      className='mb-4 border border-[var(--color-border-2)] rounded-lg shadow-sm bg-[var(--color-bg-2)]'
      title={
        <Space align='center'>
          <SettingTwo theme='filled' size='18' className='text-[var(--color-primary)]' />
          <Title heading={6} className='!m-0 text-[var(--color-text-1)]'>
            {t('team.scoping.interviewTitle', { defaultValue: 'Pre-Execution Scoping Gate' })}
          </Title>
          <Tag color='arcoblue' size='small'>
            {t('team.scoping.phaseTag', { defaultValue: 'Requirement Gathering' })}
          </Tag>
        </Space>
      }
      extra={
        <Space align='center'>
          <Text type='secondary' className='text-xs'>
            {t('team.scoping.answeredProgress', {
              count: answeredCount,
              total: questions.length,
              defaultValue: `${answeredCount}/${questions.length} Answered`,
            })}
          </Text>
          <Progress percent={progressPercent} size='small' className='w-20' showText={false} />
        </Space>
      }
    >
      <Paragraph className='text-[var(--color-text-2)] text-xs mb-4'>
        {t('team.scoping.interviewSubtitle', {
          defaultValue:
            'The Lead/Sentinel agent is scoping technical bounds and milestone acceptance criteria before team agents touch files.',
        })}
      </Paragraph>

      <div className='p-3 rounded mb-4 bg-[var(--color-fill-2)] border border-[var(--color-border-1)]'>
        <Text className='font-semibold text-xs block mb-1 text-[var(--color-text-1)]'>
          {t('team.scoping.originalRequest', { defaultValue: 'User Request:' })}
        </Text>
        <Text className='text-xs text-[var(--color-text-2)] italic'>{userRequest}</Text>
      </div>

      <div className='space-y-4 max-h-[360px] overflow-y-auto pr-1'>
        {questions.map((q, idx) => (
          <div key={q.id} className='p-3 rounded border border-[var(--color-border-2)] bg-[var(--color-bg-1)]'>
            <div className='flex items-center justify-between mb-2'>
              <Space>
                <Tag size='small' color={getCategoryColor(q.category)}>
                  {q.category.toUpperCase()}
                </Tag>
                <Text className='font-medium text-xs text-[var(--color-text-1)]'>
                  {idx + 1}. {q.question}
                </Text>
              </Space>
            </div>

            {q.options && q.options.length > 0 && (
              <Radio.Group
                direction='vertical'
                value={answers[q.id]}
                onChange={(val) => handleSelectOption(q.id, val)}
                className='w-full mb-2'
              >
                {q.options.map((opt) => (
                  <Radio key={opt} value={opt} className='text-xs'>
                    {opt}
                  </Radio>
                ))}
              </Radio.Group>
            )}

            <Input
              size='small'
              placeholder={
                q.placeholder || t('team.scoping.customPlaceholder', { defaultValue: 'Or specify custom answer...' })
              }
              value={customAnswers[q.id] || ''}
              onChange={(val) => handleCustomTextChange(q.id, val)}
              className='mt-1'
            />
          </div>
        ))}
      </div>

      <div className='flex justify-end gap-2 mt-4 pt-3 border-t border-[var(--color-border-1)]'>
        <Button size='small' onClick={onCancel} icon={<CloseOne />}>
          {t('team.scoping.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button size='small' type='primary' loading={loading} onClick={handleSubmit} icon={<CheckOne />}>
          {t('team.scoping.generatePlan', { defaultValue: 'Submit Answers & Generate Plan' })}
        </Button>
      </div>
    </Card>
  );
};
