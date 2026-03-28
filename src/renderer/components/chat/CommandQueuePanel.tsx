import type { ConversationCommandQueueItem } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { Button, Input, Tag, Typography } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const getCommandPreview = (input: string): string => input.replace(/\s+/g, ' ').trim();

type CommandQueuePanelProps = {
  items: ConversationCommandQueueItem[];
  running: boolean;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onUpdate: (commandId: string, input: string) => boolean;
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
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
  onClear,
}) => {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftInput, setDraftInput] = useState('');

  useEffect(() => {
    if (!editingId) {
      return;
    }

    const editingItem = items.find((item) => item.id === editingId);
    if (!editingItem) {
      setEditingId(null);
      setDraftInput('');
    }
  }, [editingId, items]);

  const countLabel = useMemo(
    () => t('conversation.commandQueue.count', { count: items.length, defaultValue: `${items.length} queued` }),
    [items.length, t]
  );

  const statusLabel = paused
    ? t('conversation.commandQueue.paused', { defaultValue: 'Paused' })
    : running
      ? t('conversation.commandQueue.running', { defaultValue: 'Waiting for current task' })
      : t('conversation.commandQueue.ready', { defaultValue: 'Ready to continue' });

  const statusHint = editingId
    ? t('conversation.commandQueue.editingHint', {
        defaultValue: 'Editing pauses the queue. Review your changes, then resume when you are ready.',
      })
    : paused
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

  if (items.length === 0 && !running && !paused) {
    return null;
  }

  const handleStartEdit = (item: ConversationCommandQueueItem) => {
    if (!paused) {
      onPause();
    }
    setEditingId(item.id);
    setDraftInput(item.input);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setDraftInput('');
  };

  const handleSaveEdit = () => {
    if (!editingId) {
      return;
    }

    const originalItem = items.find((item) => item.id === editingId);
    if (!originalItem) {
      handleCancelEdit();
      return;
    }

    if (originalItem.input === draftInput) {
      handleCancelEdit();
      return;
    }

    const didUpdate = onUpdate(editingId, draftInput);
    if (didUpdate) {
      handleCancelEdit();
    }
  };

  return (
    <div className='mb-12px'>
      <div
        className='border b-solid rd-18px p-12px flex flex-col gap-10px'
        style={{
          borderColor: 'color-mix(in srgb, var(--color-border-2) 82%, transparent)',
          background: 'color-mix(in srgb, var(--color-bg-1) 94%, transparent)',
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div className='flex items-start justify-between gap-10px flex-wrap'>
          <div className='min-w-0 flex flex-col gap-6px'>
            <div className='flex items-center gap-8px flex-wrap'>
              <Typography.Text className='text-13px font-600'>
                {t('conversation.commandQueue.title', { defaultValue: 'Queued Commands' })}
              </Typography.Text>
              <Tag size='small' color='arcoblue'>
                {countLabel}
              </Tag>
              <Tag size='small' color={paused ? 'orangered' : running ? 'gold' : 'green'}>
                {statusLabel}
              </Tag>
              {editingId ? (
                <Tag size='small' color='purple'>
                  {t('conversation.commandQueue.editing', { defaultValue: 'Editing' })}
                </Tag>
              ) : null}
            </div>
            <Typography.Text type='secondary' className='text-12px leading-18px'>
              {statusHint}
            </Typography.Text>
          </div>
          {items.length > 0 ? (
            <div className='flex items-center gap-4px'>
              {paused ? (
                <Button size='mini' type='secondary' disabled={Boolean(editingId)} onClick={onResume}>
                  {t('conversation.commandQueue.resume', { defaultValue: 'Resume' })}
                </Button>
              ) : (
                <Button size='mini' type='secondary' onClick={onPause}>
                  {t('conversation.commandQueue.pause', { defaultValue: 'Pause' })}
                </Button>
              )}
              <Button size='mini' type='text' status='danger' onClick={onClear}>
                {t('conversation.commandQueue.clear', { defaultValue: 'Clear queue' })}
              </Button>
            </div>
          ) : null}
        </div>

        {items.length > 0 ? (
          <div className='flex flex-col gap-8px'>
            {items.map((item, index) => {
              const preview = getCommandPreview(item.input);
              const isEditing = item.id === editingId;
              const fileCountLabel =
                item.files.length > 0
                  ? t('conversation.commandQueue.files', {
                      count: item.files.length,
                      defaultValue: `${item.files.length} files`,
                    })
                  : null;

              return (
                <div
                  key={item.id}
                  className='border b-solid rd-14px p-10px flex flex-col gap-8px'
                  style={{
                    borderColor: isEditing
                      ? 'color-mix(in srgb, rgb(var(--primary-6)) 64%, transparent)'
                      : 'color-mix(in srgb, var(--color-border-2) 70%, transparent)',
                    background: isEditing
                      ? 'color-mix(in srgb, var(--color-primary-light-1) 80%, var(--color-bg-1))'
                      : 'color-mix(in srgb, var(--color-fill-1) 78%, transparent)',
                  }}
                >
                  <div className='flex items-start justify-between gap-8px'>
                    <div className='flex items-center gap-6px flex-wrap min-w-0'>
                      <Tag size='small'>{index + 1}</Tag>
                      {index === 0 ? (
                        <Tag size='small' color={paused ? 'orangered' : 'arcoblue'}>
                          {t('conversation.commandQueue.next', { defaultValue: 'Next' })}
                        </Tag>
                      ) : null}
                      {fileCountLabel ? (
                        <Tag size='small' color='gray'>
                          {fileCountLabel}
                        </Tag>
                      ) : null}
                    </div>
                    <div className='flex items-center gap-4px shrink-0 flex-wrap justify-end'>
                      {!isEditing ? (
                        <Button size='mini' type='text' onClick={() => handleStartEdit(item)}>
                          {t('conversation.commandQueue.edit', { defaultValue: 'Edit' })}
                        </Button>
                      ) : null}
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

                  {!isEditing ? (
                    <Typography.Ellipsis rows={3} showTooltip className='text-13px leading-20px'>
                      {preview}
                    </Typography.Ellipsis>
                  ) : (
                    <div className='flex flex-col gap-8px'>
                      <Input.TextArea
                        value={draftInput}
                        autoSize={{ minRows: 3, maxRows: 8 }}
                        placeholder={t('conversation.commandQueue.editPlaceholder', {
                          defaultValue: 'Update the queued command before resuming the queue.',
                        })}
                        onChange={setDraftInput}
                      />
                      <div className='flex items-center justify-between gap-8px flex-wrap'>
                        <Typography.Text type='secondary' className='text-12px'>
                          {t('conversation.commandQueue.editHelper', {
                            defaultValue: 'Changes are saved locally and will run after you resume the queue.',
                          })}
                        </Typography.Text>
                        <div className='flex items-center gap-4px'>
                          <Button size='mini' type='outline' onClick={handleCancelEdit}>
                            {t('conversation.commandQueue.cancelEdit', { defaultValue: 'Cancel' })}
                          </Button>
                          <Button size='mini' type='primary' onClick={handleSaveEdit}>
                            {t('conversation.commandQueue.saveEdit', { defaultValue: 'Save' })}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CommandQueuePanel;
