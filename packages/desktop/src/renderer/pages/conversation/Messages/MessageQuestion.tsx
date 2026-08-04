/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { conversation } from '@/common/adapter/ipcBridge';
import type { IAskQuestion, IMessageAsk } from '@/common/chat/chatLib';
import { Button, Card, Checkbox, Input, Radio, Typography } from '@arco-design/web-react';
import { CheckOne } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
// Deliberately the SAME stylesheet as the permission card: the question card is
// the permission card's sibling in the conversation flow and must not look like
// a foreign widget (user feedback, 2026-08-04).
import styles from './components/MessagePermission/PermissionRequestPanel.module.css';

const { Text } = Typography;

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
    <Card className={styles.card} bordered={false} data-testid='message-question'>
      <div className={styles.panel}>
        {questions.map((q, qi) => {
          const d = drafts[qi] ?? emptyDraft();
          // Wire spelling is multi_select (the ws relay snake_cases all keys).
          const multi = q.multiSelect === true || q.multi_select === true;
          return (
            <fieldset key={qi} className={styles.optionsFieldset} disabled={submitted !== null} data-testid={`message-question-item-${qi}`}>
              <legend className={styles.optionsLegend}>{q.header || t('messages.chooseAction')}</legend>
              <div className={styles.heading}>
                <div className={styles.titleRow}>
                  <Text className={styles.title}>{q.question}</Text>
                </div>
              </div>
              {multi ? (
                <Checkbox.Group direction='vertical' value={d.labels} onChange={(labels) => updateDraft(qi, { labels: labels as string[] })} disabled={submitted !== null}>
                  {q.options.map((opt) => (
                    <Checkbox key={opt.label} value={opt.label} data-testid={`message-question-option-${qi}-${opt.label}`}>
                      <span>{opt.label}</span>
                      {opt.description ? <Text className={styles.description}> {opt.description}</Text> : null}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              ) : (
                <Radio.Group direction='vertical' value={d.otherSelected ? OTHER_VALUE : d.labels[0]} onChange={(value) => (value === OTHER_VALUE ? updateDraft(qi, { labels: [], otherSelected: true }) : updateDraft(qi, { labels: [value], otherSelected: false }))} disabled={submitted !== null}>
                  {q.options.map((opt) => (
                    <Radio key={opt.label} value={opt.label} data-testid={`message-question-option-${qi}-${opt.label}`}>
                      <span>{opt.label}</span>
                      {opt.description ? <Text className={styles.description}> {opt.description}</Text> : null}
                    </Radio>
                  ))}
                  <Radio value={OTHER_VALUE} data-testid={`message-question-option-${qi}-other`}>
                    {t('messages.askOther')}
                  </Radio>
                </Radio.Group>
              )}
              {!multi && d.otherSelected ? <Input className={styles.detail} placeholder={t('messages.askOtherPlaceholder')} value={d.other} onChange={(v) => updateDraft(qi, { other: v })} disabled={submitted !== null} data-testid={`message-question-other-input-${qi}`} /> : null}
            </fieldset>
          );
        })}
        {submitted === null ? (
          <div className={styles.optionsGroup}>
            <Button type='primary' className={styles.optionButton} disabled={!allAnswered} onClick={handleSubmit} data-testid='message-question-submit'>
              {t('messages.askSubmit')}
            </Button>
            <Button className={styles.optionButton} onClick={handleDecline} data-testid='message-question-decline'>
              {t('messages.askDecline')}
            </Button>
          </div>
        ) : (
          <div className={`${styles.feedback} ${styles.success}`} role='status' aria-live='polite' data-testid='message-question-status'>
            <CheckOne theme='outline' size='16' aria-hidden='true' />
            <span>{submitted === 'answered' ? t('messages.askAnswered') : t('messages.askDeclined')}</span>
          </div>
        )}
      </div>
    </Card>
  );
});

export default MessageQuestion;
