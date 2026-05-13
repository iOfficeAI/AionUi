import { dispatchChatMessageJump } from '@/renderer/utils/chat/chatMinimapEvents';
import { Button, Card, Tag } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SubagentSummaryEntry } from './summary';

const STATUS_COLOR: Record<SubagentSummaryEntry['status'], string> = {
  active: 'arcoblue',
  completed: 'green',
  failed: 'red',
};

const SubagentNavigator: React.FC<{
  conversationId: string;
  entries: SubagentSummaryEntry[];
}> = ({ conversationId, entries }) => {
  const { t } = useTranslation();

  return (
    <Card className='w-full' size='small' bordered>
      <div className='flex flex-col gap-12px'>
        <div className='flex items-center justify-between gap-12px flex-wrap'>
          <div className='min-w-0'>
            <div className='text-14px font-medium text-t-primary'>{t('conversation.subagentNavigator.title')}</div>
            <div className='text-12px text-t-secondary'>
              {t('conversation.subagentNavigator.description', { count: entries.length })}
            </div>
          </div>
          <Tag color='gray'>{entries.length}</Tag>
        </div>
        <div className='flex flex-wrap gap-8px'>
          {entries.map((entry) => (
            <Button
              key={entry.id}
              size='small'
              type='secondary'
              shape='round'
              aria-label={t('conversation.subagentNavigator.jumpTo', { name: entry.label })}
              onClick={() => {
                dispatchChatMessageJump({
                  conversationId,
                  messageId: entry.messageId,
                  align: 'center',
                });
              }}
            >
              <span className='inline-flex items-center gap-8px max-w-280px'>
                <span className='truncate'>{entry.label}</span>
                <span className='text-t-secondary'>{t(`conversation.subagentNavigator.status.${entry.status}`)}</span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default SubagentNavigator;
