/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Form, Input, Radio, Space, Tag, Typography } from '@arco-design/web-react';
import { Check, Close, CloseSmall, Help, Send } from '@icon-park/react';
import type { InterviewQuestion, InterviewQuestionCategory, TeamworkSessionState } from '@/common/types/teamwork';

export type InterviewViewProps = {
  session: TeamworkSessionState;
  onSubmit: (answers: Record<string, string>) => Promise<void>;
  onAbort?: () => void;
  loading?: boolean;
};

const getCategoryColor = (category: InterviewQuestionCategory): string => {
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

export const InterviewView: React.FC<InterviewViewProps> = ({ session, onSubmit, onAbort, loading = false }) => {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...session.answers }));
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const questions: InterviewQuestion[] = session.questions || [];

  const handleSelectOption = (questionId: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleCustomInputChange = (questionId: string, value: string) => {
    setCustomInputs((prev) => ({
      ...prev,
      [questionId]: value,
    }));
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const answeredCount = useMemo(() => {
    return questions.filter((q) => Boolean(answers[q.id]?.trim())).length;
  }, [questions, answers]);

  const handleSubmit = async () => {
    if (submitting || loading) return;
    setSubmitting(true);
    try {
      await onSubmit(answers);
    } finally {
      setSubmitting(false);
    }
  };

  const isFormComplete = answeredCount === questions.length && questions.length > 0;

  // Allow pressing Escape to abort/dismiss the interview
  React.useEffect(() => {
    if (!onAbort) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onAbort();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAbort]);

  return (
    <Card
      bordered
      className='my-3 rounded-xl border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] shadow-sm max-h-[80vh] flex flex-col [&>.arco-card-body]:flex [&>.arco-card-body]:flex-col [&>.arco-card-body]:min-h-0 [&>.arco-card-body]:p-4'
      title={
        <div className='flex items-center gap-2'>
          <Help theme='filled' size='18' fill='var(--color-primary)' />
          <Typography.Title heading={6} className='!m-0 text-base font-semibold'>
            {t('team.teamwork.interviewTitle')}
          </Typography.Title>
        </div>
      }
      extra={
        <Space align='center' size={12}>
          <Tag color={isFormComplete ? 'green' : 'arcoblue'} size='small'>
            {t('team.teamwork.answeredCount', {
              answered: answeredCount,
              total: questions.length,
            })}
          </Tag>
          {onAbort && (
            <Button
              type='text'
              size='mini'
              className='!p-0 h-6 w-6 text-[var(--color-text-3)] hover:text-[var(--color-text-1)]'
              onClick={onAbort}
              icon={<CloseSmall theme='outline' size='18' />}
              aria-label={t('team.teamwork.abort')}
            />
          )}
        </Space>
      }
    >
      <Typography.Paragraph className='text-[var(--color-text-3)] text-sm mb-3 shrink-0'>
        {t('team.teamwork.interviewSubtitle')}
      </Typography.Paragraph>

      <Form layout='vertical' className='flex-1 flex flex-col min-h-0 overflow-hidden'>
        <div
          className='flex-1 min-h-0 space-y-4 max-h-[55vh] overflow-y-auto overscroll-contain pr-2 [scrollbar-width:thin]'
          tabIndex={0}
        >
          {questions.map((question, index) => {
            const currentAnswer = answers[question.id] || '';
            const categoryColor = getCategoryColor(question.category);
            const categoryLabel = t(`team.teamwork.categories.${question.category}`, {
              defaultValue: question.category,
            });

            return (
              <Card
                key={question.id}
                className='mb-4 rounded-lg bg-[var(--color-fill-1)] border border-solid border-[var(--color-border-1)]'
                bordered={false}
              >
                <div className='flex items-start justify-between gap-2 mb-3'>
                  <div className='flex items-start gap-2'>
                    <span className='font-semibold text-[var(--color-text-1)]'>{index + 1}.</span>
                    <span className='font-medium text-[var(--color-text-1)]'>{question.question}</span>
                  </div>
                  <Tag color={categoryColor} size='small' className='shrink-0'>
                    {categoryLabel}
                  </Tag>
                </div>

                {question.options && question.options.length > 0 ? (
                  <Space direction='vertical' className='w-full'>
                    <Radio.Group
                      direction='vertical'
                      value={currentAnswer}
                      onChange={(val) => handleSelectOption(question.id, val)}
                      className='w-full'
                    >
                      {question.options.map((opt) => (
                        <Radio key={opt} value={opt} className='mb-2 text-sm'>
                          {opt}
                        </Radio>
                      ))}
                    </Radio.Group>

                    <Input
                      placeholder={t('team.teamwork.customAnswerPlaceholder')}
                      value={customInputs[question.id] || ''}
                      onChange={(val) => handleCustomInputChange(question.id, val)}
                      className='mt-1'
                      allowClear
                    />
                  </Space>
                ) : (
                  <Input.TextArea
                    placeholder={t('team.teamwork.yourAnswer')}
                    value={currentAnswer}
                    onChange={(val) => handleSelectOption(question.id, val)}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                  />
                )}
              </Card>
            );
          })}
        </div>

        <div className='flex items-center justify-between mt-3 pt-3 border-t border-solid border-[var(--color-border-1)] shrink-0'>
          {onAbort ? (
            <Button status='danger' icon={<Close />} onClick={onAbort} disabled={submitting || loading}>
              {t('team.teamwork.abort')}
            </Button>
          ) : (
            <div />
          )}

          <Button
            type='primary'
            icon={isFormComplete ? <Check /> : <Send />}
            loading={submitting || loading}
            onClick={handleSubmit}
          >
            {submitting ? t('team.teamwork.submitting') : t('team.teamwork.submitAnswers')}
          </Button>
        </div>
      </Form>
    </Card>
  );
};
