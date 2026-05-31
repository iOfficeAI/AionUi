import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NormalizedToolCall, ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages, hasRunningToolMessages } from '@/common/chat/normalizeToolCall';
import ToolShell from './ToolShell';
import StatusPill, { STATE_LABEL_FALLBACK, STATE_LABEL_KEY, statusPillFromNormalized } from './StatusPill';
import './MessageToolGroupSummary.css';

const ToolItemRow: React.FC<{ item: NormalizedToolCall }> = ({ item }) => {
  const { t } = useTranslation();
  const state = statusPillFromNormalized(item.status);
  const stateLabel = t(STATE_LABEL_KEY[state], { defaultValue: STATE_LABEL_FALLBACK[state] });
  const hasDetail = Boolean(item.input || item.output);
  const [expanded, setExpanded] = useState(state === 'failed');
  const toggle = () => hasDetail && setExpanded((v) => !v);

  return (
    <div className='flex flex-col'>
      <div className='flex items-center gap-8px'>
        <StatusPill state={state} label={stateLabel} />
        <span
          className={
            'flex-1 min-w-0 text-13px text-t-primary' +
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
        {hasDetail && (
          <button
            type='button'
            className='tool-shell__expander'
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
