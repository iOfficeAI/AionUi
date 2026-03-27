import type { ConversationCommandQueueItem } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { Button, Tag, Typography } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const getCommandPreview = (input: string): string => input.replace(/\s+/g, ' ').trim();

type CommandQueuePanelProps = {
  items: ConversationCommandQueueItem[];
  running: boolean;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onMoveUp: (commandId: string) => void;
  onMoveDown: (commandId: string) => void;
  onRemove: (commandId: string) => void;
  onClear: () => void;
};

const CommandQueuePanel: React.FC<CommandQueuePanelProps> = ({
  items,
  running,
  paused,
  onPause,
  onResume,
  onMoveUp,
  onMoveDown,
  onRemove,
  onClear,
}) => {
  const { t } = useTranslation();

  const countLabel = useMemo(
    () => t('conversation.commandQueue.count', { count: items.length, defaultValue: `${items.length} queued` }),
    [items.length, t]
  );

  const statusLabel = paused
    ? t('conversation.commandQueue.paused', { defaultValue: 'Paused' })
    : running
      ? t('conversation.commandQueue.running', { defaultValue: 'Waiting for current task' })
      : t('conversation.commandQueue.ready', { defaultValue: 'Ready to continue' });

  const statusHint = paused
    ? t('conversation.commandQueue.pausedHint', {
        defaultValue: 'Queue is paused. Resume when you want to continue.',
      })
    : running
      ? t('conversation.commandQueue.autoRun', {
          defaultValue: 'Runs automatically after the current task finishes',
        })
      : t('conversation.commandQueue.readyHint', {
          defaultValue: 'The next command will start automatically once resumed.',
        });

  if (items.length === 0) {
    return null;
  }

  return (
    <div className='mb-12px'>
      <div className='border b-solid b-border-2 bg-fill-1 rd-16px p-12px flex flex-col gap-8px'>
        <div className='flex items-center justify-between gap-8px'>
          <div className='flex items-center gap-8px flex-wrap min-w-0'>
            <Typography.Text className='text-13px font-500'>
              {t('conversation.commandQueue.title', { defaultValue: 'Queued Commands' })}
            </Typography.Text>
            <Tag size='small' color='arcoblue'>
              {countLabel}
            </Tag>
            <Tag size='small' color={paused ? 'orangered' : running ? 'gold' : 'green'}>
              {statusLabel}
            </Tag>
            <Typography.Text type='secondary' className='text-12px'>
              {statusHint}
            </Typography.Text>
          </div>
          <div className='flex items-center gap-4px'>
            {paused ? (
              <Button size='mini' type='text' onClick={onResume}>
                {t('conversation.commandQueue.resume', { defaultValue: 'Resume' })}
              </Button>
            ) : (
              <Button size='mini' type='text' onClick={onPause}>
                {t('conversation.commandQueue.pause', { defaultValue: 'Pause' })}
              </Button>
            )}
            <Button size='mini' type='text' status='danger' onClick={onClear}>
              {t('conversation.commandQueue.clear', { defaultValue: 'Clear queue' })}
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-8px'>
          {items.map((item, index) => {
            const preview = getCommandPreview(item.input);
            const fileCountLabel =
              item.files.length > 0
                ? t('conversation.commandQueue.files', {
                    count: item.files.length,
                    defaultValue: `${item.files.length} files`,
                  })
                : null;

            return (
              <div key={item.id} className='flex items-start gap-8px bg-fill-2 rd-12px p-8px'>
                <Tag size='small'>{index + 1}</Tag>
                <div className='min-w-0 flex-1 flex flex-col gap-4px'>
                  <Typography.Ellipsis rows={2} showTooltip={{ type: 'tooltip' }}>
                    {preview}
                  </Typography.Ellipsis>
                  {fileCountLabel ? (
                    <Tag size='small' color='gray'>
                      {fileCountLabel}
                    </Tag>
                  ) : null}
                </div>
                <div className='flex items-center gap-4px shrink-0'>
                  <Button size='mini' type='text' disabled={index === 0} onClick={() => onMoveUp(item.id)}>
                    {t('conversation.commandQueue.moveUp', { defaultValue: 'Up' })}
                  </Button>
                  <Button
                    size='mini'
                    type='text'
                    disabled={index === items.length - 1}
                    onClick={() => onMoveDown(item.id)}
                  >
                    {t('conversation.commandQueue.moveDown', { defaultValue: 'Down' })}
                  </Button>
                  <Button size='mini' type='text' status='danger' onClick={() => onRemove(item.id)}>
                    {t('conversation.commandQueue.remove', { defaultValue: 'Remove' })}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CommandQueuePanel;
