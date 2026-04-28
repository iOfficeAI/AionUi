import type { BadgeProps } from '@arco-design/web-react';
import { Badge } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useEffect, useMemo, useState } from 'react';
import type { NormalizedToolCall, NormalizedToolStatus, ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages, hasRunningToolMessages } from '@/common/chat/normalizeToolCall';
import './MessageToolGroupSummary.css';

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    case 'canceled':
      return 'default';
    case 'pending':
    default:
      return 'default';
  }
};

const ToolItemDetail: React.FC<{ item: NormalizedToolCall }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = item.input || item.output;

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge
          status={statusToBadge(item.status)}
          className={item.status === 'running' ? 'badge-breathing' : ''}
        />
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
        >
          <span className='font-medium text-13px'>{item.name}</span>
          {item.description && item.description !== item.name && (
            <span className='m-l-4px opacity-80 text-13px'>{item.description}</span>
          )}
        </span>
        {hasDetail && (
          <span
            className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors'
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className='tool-detail-panel m-l-20px m-t-4px'>
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
  const hasRunning = hasRunningToolMessages(messages);
  const [showMore, setShowMore] = useState(hasRunning);

  useEffect(() => {
    if (hasRunning) setShowMore(true);
  }, [hasRunning]);

  const tools = useMemo(() => normalizeToolMessages(messages), [messages]);

  return (
    <div>
      <div className='flex items-center gap-10px color-#86909C cursor-pointer' onClick={() => setShowMore(!showMore)}>
        <Badge status='default' text='View Steps' className={'![&_span.arco-badge-status-text]:color-#86909C'} />
        {showMore ? <IconDown /> : <IconRight />}
      </div>
      {showMore && (
        <div className='p-l-20px flex flex-col gap-8px pt-8px'>
          {tools.map((item) => (
            <ToolItemDetail key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(MessageToolGroupSummary);
