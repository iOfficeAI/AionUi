import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NormalizedToolCall, ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages, hasRunningToolMessages } from '@/common/chat/normalizeToolCall';
import ToolShell from './ToolShell';
import StatusPill, { STATE_LABEL_FALLBACK, STATE_LABEL_KEY, statusPillFromNormalized } from './StatusPill';
import './MessageToolGroupSummary.css';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { ipcBridge } from '@/common';
import { Message, Button, Tooltip } from '@arco-design/web-react';
import AionModal from '@/renderer/components/base/AionModal';
import { Refresh } from '@icon-park/react';
import { iconColors } from '@/renderer/styles/colors';

const REVERTABLE_KINDS: ReadonlySet<string> = new Set(['edit', 'write', 'execute', 'apply_patch']);

const ToolItemRow: React.FC<{ item: NormalizedToolCall }> = ({ item }) => {
  const { t } = useTranslation();
  const conversationContext = useConversationContextSafe();
  const state = statusPillFromNormalized(item.status);
  const stateLabel = t(STATE_LABEL_KEY[state], { defaultValue: STATE_LABEL_FALLBACK[state] });
  const hasDetail = Boolean(item.input || item.output);
  const [expanded, setExpanded] = useState(state === 'failed');
  const [revertOpen, setRevertOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const toggle = () => hasDetail && setExpanded((v) => !v);

  const showRevert = item.key && item.status === 'completed' && item.kind && REVERTABLE_KINDS.has(item.kind) && Boolean(conversationContext);

  const handleRevertConfirm = async () => {
    if (!item.key || !conversationContext?.conversation_id) return;
    setReverting(true);
    try {
      const result = await ipcBridge.conversation.revertToolCall.invoke({
        conversation_id: conversationContext.conversation_id,
        tool_call_id: item.key,
      });
      Message.success(
        t('messages.revertToolCallSuccess', {
          defaultValue: 'Tool call reverted — {{files}} file(s) restored',
          files: result.files_reverted,
        })
      );
      setRevertOpen(false);
    } catch (error) {
      Message.error(t('messages.revertToolCallFailed', { defaultValue: 'Failed to revert tool call' }));
      console.error('[MessageToolGroupSummary] revertToolCall failed:', error);
    } finally {
      setReverting(false);
    }
  };

  return (
    <>
      <div className='flex flex-col' data-tool-id={item.key}>
        <div className='flex items-center gap-8px'>
          <StatusPill state={state} label={stateLabel} />
          <span
            className={
              'flex-1 min-w-0 text-13px text-t-primary flex items-center' +
              (expanded ? ' break-all' : ' truncate') +
              (hasDetail ? ' cursor-pointer' : '')
            }
            onClick={hasDetail ? toggle : undefined}
          >
            <span className='font-medium'>{item.name}</span>
            {item.description && item.description !== item.name && (
              <span className='m-l-4px opacity-80'>{item.description}</span>
            )}
          </span>
          {showRevert && (
            <Tooltip content={t('messages.revertToolCall', { defaultValue: 'Revert this tool call' })}>
              <button
                type='button'
                className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors m-l-auto shrink-0'
                onClick={(e) => {
                  e.stopPropagation();
                  setRevertOpen(true);
                }}
                style={{ lineHeight: 0 }}
              >
                <Refresh theme='outline' size='14' fill={iconColors.secondary} />
              </button>
            </Tooltip>
          )}
          {hasDetail && (
            <button
              type='button'
              className='tool-shell__expander shrink-0 m-l-4px'
              aria-expanded={expanded}
              onClick={toggle}
              title={expanded ? 'Hide details' : 'Show details'}
            >
              {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
            </button>
          )}
        </div>
        {expanded && hasDetail && (
          <div className='tool-detail-panel m-l-8px m-t-4px'>
            {item.input && (
              <div className='tool-detail-section'>
                <div className='tool-detail-label'>Input</div>
                <pre className='tool-detail-content'>{item.input}</pre>
              </div>
            )}
            {item.output && (
              <div className='tool-detail-section'>
                <div className='tool-detail-label'>Output</div>
                <pre className='tool-detail-content'>{item.output}</pre>
              </div>
            )}
          </div>
        )}
      </div>
      {showRevert && (
        <AionModal
          visible={revertOpen}
          size='small'
          style={{ width: 420, height: 'auto' }}
          header={{ title: t('messages.revertToolCallConfirmTitle', { defaultValue: 'Revert Tool Call?' }), showClose: true }}
          contentStyle={{ padding: '20px 24px 0' }}
          onCancel={() => !reverting && setRevertOpen(false)}
          footer={{
            render: () => (
              <div className='flex justify-end gap-10px pt-20px'>
                <Button
                  className='px-20px min-w-80px'
                  style={{ borderRadius: 'var(--radius-control)' }}
                  onClick={() => setRevertOpen(false)}
                >
                  {t('conversation.history.cancelDelete', { defaultValue: 'Cancel' })}
                </Button>
                <Button
                  type='primary'
                  status='warning'
                  loading={reverting}
                  className='px-20px min-w-80px'
                  style={{ borderRadius: 'var(--radius-control)' }}
                  onClick={() => void handleRevertConfirm()}
                >
                  {t('messages.confirm', { defaultValue: 'Confirm' })}
                </Button>
              </div>
            ),
          }}
        >
          <div className='text-14px leading-22px text-t-secondary'>
            {t('messages.revertToolCallConfirmMessage', { defaultValue: 'Reverting this call will undo the file changes this tool made. The OpenCode session state is NOT changed.' })}
          </div>
        </AionModal>
      )}
    </>
  );
};

const MessageToolGroupSummary: React.FC<{ messages: ToolMessage[] }> = ({ messages }) => {
  const { t } = useTranslation();
  const hasRunning = hasRunningToolMessages(messages);
  const tools = useMemo(() => normalizeToolMessages(messages), [messages]);

  const groupState = hasRunning ? 'running' : 'success';
  const stateLabel = t(STATE_LABEL_KEY[groupState], { defaultValue: STATE_LABEL_FALLBACK[groupState] });
  const title = t('messages.toolShell.viewSteps', { defaultValue: 'View Steps' });
  const meta = tools.length > 0 ? `· ${tools.length}` : undefined;

  return (
    <ToolShell
      state={groupState}
      stateLabel={stateLabel}
      title={title}
      meta={meta}
      defaultExpanded={hasRunning}
      collapsible
    >
      <div className='flex flex-col gap-8px'>
        {tools.map((item) => (
          <ToolItemRow key={item.key} item={item} />
        ))}
      </div>
    </ToolShell>
  );
};

export default React.memo(MessageToolGroupSummary);
