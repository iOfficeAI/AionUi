/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { conversation } from '@/common/adapter/ipcBridge';
import type { IAskQuestion, IMessageAsk } from '@/common/chat/chatLib';
import { Button, Checkbox, Input, Radio } from '@arco-design/web-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const OTHER_VALUE = '__aionui_other__';

type MessageQuestionProps = {
  message: IMessageAsk;
};

type Draft = {
  /** selected option labels (multiSelect keeps several; single keeps one) */
  labels: string[];
  /** free text when the Other row is selected */
  other: string;
  otherSelected: boolean;
};

const emptyDraft = (): Draft => ({ labels: [], other: '', otherSelected: false });

/**
 * Structured question card (`ask` frame — claude AskUserQuestion).
 *
 * One submit answers EVERY question at once: claude silently DROPS unanswered
 * questions on an allow (it does not re-ask — live 2.1.178), so per-question
 * submission would be silent data loss. Submit stays disabled until every
 * question has an answer; dismiss sends an explicit decline (a deny on the
 * wire), never an empty allow.
 */
const MessageQuestion: React.FC<MessageQuestionProps> = React.memo(({ message }) => {
  const { t } = useTranslation();
  const content = message.content || ({} as IMessageAsk['content']);
  const questions = useMemo<IAskQuestion[]>(() => (Array.isArray(content.questions) ? content.questions : []), [content.questions]);
  const [drafts, setDrafts] = useState<Draft[]>(() => questions.map(emptyDraft));
  const [submitted, setSubmitted] = useState<'answered' | 'declined' | null>(null);

  const updateDraft = useCallback((index: number, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }, []);

  const answered = (d: Draft) => d.labels.length > 0 || (d.otherSelected && d.other.trim().length > 0);
  const allAnswered = questions.length > 0 && drafts.every(answered);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      await conversation.confirmMessage.invoke({
        confirm_key: JSON.stringify(payload),
        msg_id: message.id,
        conversation_id: message.conversation_id,
        call_id: content.request_id || message.id,
      });
    },
    [content.request_id, message.conversation_id, message.id]
  );

  const handleSubmit = useCallback(async () => {
    // claude keys its answers map by the question TEXT; a multi-select answer
    // is an array of labels (claude joins with ", "). Other-text rides as a
    // plain label — claude accepts arbitrary answer strings.
    const answers = questions.map((q, i) => {
      const d = drafts[i];
      const labels = [...d.labels];
      if (d.otherSelected && d.other.trim()) labels.push(d.other.trim());
      return { question: q.question, labels };
    });
    await send({ answers });
    setSubmitted('answered');
  }, [drafts, questions, send]);

  const handleDecline = useCallback(async () => {
    await send({ ask_decline: true });
    setSubmitted('declined');
  }, [send]);

  if (!questions.length) return null;

  return (
    <div className='rounded-8px border border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-16px max-w-720px' data-testid='message-question'>
      {questions.map((q, qi) => {
        const d = drafts[qi] ?? emptyDraft();
        const multi = q.multiSelect === true;
        return (
          <div key={qi} className={qi > 0 ? 'mt-16px' : ''} data-testid={`message-question-item-${qi}`}>
            {q.header ? <div className='text-12px font-500 text-[var(--color-text-3)] uppercase mb-4px'>{q.header}</div> : null}
            <div className='text-14px font-500 text-[var(--color-text-1)] mb-8px'>{q.question}</div>
            {multi ? (
              <Checkbox.Group direction='vertical' value={d.labels} onChange={(labels) => updateDraft(qi, { labels: labels as string[] })} disabled={submitted !== null}>
                {q.options.map((opt) => (
                  <Checkbox key={opt.label} value={opt.label} data-testid={`message-question-option-${qi}-${opt.label}`}>
                    <span>{opt.label}</span>
                    {opt.description ? <span className='text-12px text-[var(--color-text-3)] ml-8px'>{opt.description}</span> : null}
                  </Checkbox>
                ))}
              </Checkbox.Group>
            ) : (
              <Radio.Group direction='vertical' value={d.otherSelected ? OTHER_VALUE : d.labels[0]} onChange={(value) => (value === OTHER_VALUE ? updateDraft(qi, { labels: [], otherSelected: true }) : updateDraft(qi, { labels: [value], otherSelected: false }))} disabled={submitted !== null}>
                {q.options.map((opt) => (
                  <Radio key={opt.label} value={opt.label} data-testid={`message-question-option-${qi}-${opt.label}`}>
                    <span>{opt.label}</span>
                    {opt.description ? <span className='text-12px text-[var(--color-text-3)] ml-8px'>{opt.description}</span> : null}
                  </Radio>
                ))}
                <Radio value={OTHER_VALUE} data-testid={`message-question-option-${qi}-other`}>
                  {t('messages.askOther')}
                </Radio>
              </Radio.Group>
            )}
            {!multi && d.otherSelected ? <Input className='mt-8px' placeholder={t('messages.askOtherPlaceholder')} value={d.other} onChange={(v) => updateDraft(qi, { other: v })} disabled={submitted !== null} data-testid={`message-question-other-input-${qi}`} /> : null}
          </div>
        );
      })}
      <div className='mt-16px flex gap-8px items-center'>
        {submitted === null ? (
          <>
            <Button type='primary' size='small' disabled={!allAnswered} onClick={handleSubmit} data-testid='message-question-submit'>
              {t('messages.askSubmit')}
            </Button>
            <Button size='small' onClick={handleDecline} data-testid='message-question-decline'>
              {t('messages.askDecline')}
            </Button>
          </>
        ) : (
          <span className='text-12px text-[var(--color-text-3)]'>{submitted === 'answered' ? t('messages.askAnswered') : t('messages.askDeclined')}</span>
        )}
      </div>
    </div>
  );
});

export default MessageQuestion;
