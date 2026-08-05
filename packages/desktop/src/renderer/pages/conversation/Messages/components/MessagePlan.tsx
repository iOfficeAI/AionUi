import type { IMessagePlan } from '@/common/chat/chatLib';
import { Button, Spin } from '@arco-design/web-react';
import { CheckOne, Round } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './MessagePlan.module.css';

const getCurrentStep = (entries: IMessagePlan['content']['entries']): number => {
  const activeIndex = entries.findIndex((entry) => entry.status === 'in_progress');
  if (activeIndex >= 0) return activeIndex + 1;

  const pendingIndex = entries.findIndex((entry) => entry.status === 'pending');
  if (pendingIndex >= 0) return pendingIndex + 1;

  return entries.length;
};

const MessagePlan: React.FC<{ message: IMessagePlan; onNavigateToLatest?: () => void }> = ({
  message,
  onNavigateToLatest,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { entries } = message.content;
  const expand = useCallback(() => setExpanded(true), []);
  const collapse = useCallback(() => setExpanded(false), []);

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        collapse();
      }
    },
    [collapse]
  );

  if (entries.length === 0) return null;

  const isRunning = entries.some((entry) => entry.status === 'in_progress');
  const progress = t('messages.plan.progress', {
    current: getCurrentStep(entries),
    total: entries.length,
  });
  const panelId = `message-plan-${message.id}`;

  return (
    <div className={styles.plan} data-testid='message-plan'>
      <div
        className={styles.trigger}
        onMouseEnter={expand}
        onMouseLeave={collapse}
        onFocusCapture={expand}
        onBlurCapture={handleBlur}
      >
        {expanded ? (
          <div id={panelId} className={styles.card} role='list'>
            {entries.map((entry, index) => (
              <div
                className={styles.item}
                data-status={entry.status}
                key={`${index}-${entry.content}`}
                role='listitem'
                aria-label={`${t(`messages.plan.status.${entry.status}`)}: ${entry.content}`}
              >
                <span className={styles.statusIcon} aria-hidden='true'>
                  {entry.status === 'in_progress' ? (
                    <Spin size={12} />
                  ) : entry.status === 'completed' ? (
                    <CheckOne theme='outline' size='14' strokeWidth={3} />
                  ) : (
                    <Round theme='outline' size='14' strokeWidth={3} />
                  )}
                </span>
                <span className={styles.content}>{entry.content}</span>
              </div>
            ))}
          </div>
        ) : null}

        <Button
          className={styles.toggle}
          type='secondary'
          size='small'
          aria-controls={panelId}
          aria-expanded={expanded}
          aria-label={`${t('messages.scrollToBottom')}, ${progress}`}
          title={t('messages.scrollToBottom')}
          onClick={onNavigateToLatest}
        >
          <span
            className={styles.progressIcon}
            data-running={isRunning}
            data-testid='message-plan-progress-icon'
            aria-hidden='true'
          >
            {isRunning ? <Spin size={13} /> : <Round theme='outline' size='13' strokeWidth={3} />}
          </span>
          <span>{progress}</span>
        </Button>
      </div>
    </div>
  );
};

export default MessagePlan;
