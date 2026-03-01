import type { BadgeProps } from '@arco-design/web-react';
import { Badge } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useMemo, useState } from 'react';
import type { IMessageAcpToolCall, IMessageToolGroup } from '../../common/chatLib';
import './MessageToolGroupSummary.css';

type ToolItem = {
  key: string;
  name: string;
  desc: string;
  status: BadgeProps['status'];
  input?: string;
  output?: string;
};

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const getResultDisplayText = (resultDisplay: IMessageToolGroup['content'][0]['resultDisplay']): string | undefined => {
  if (!resultDisplay) return undefined;
  if (typeof resultDisplay === 'string') return resultDisplay;
  if ('fileDiff' in resultDisplay) return resultDisplay.fileDiff;
  if ('img_url' in resultDisplay) return resultDisplay.relative_path || resultDisplay.img_url;
  return undefined;
};

const ToolGroupMapper = (m: IMessageToolGroup): ToolItem[] => {
  return m.content.map(({ name, callId, description, confirmationDetails, status, resultDisplay }) => {
    let desc = description.slice(0, 100);
    const type = confirmationDetails?.type;
    if (type === 'edit') desc = confirmationDetails.fileName;
    if (type === 'exec') desc = confirmationDetails.command;
    if (type === 'info') desc = confirmationDetails.urls?.join(';') || confirmationDetails.title;
    if (type === 'mcp') desc = confirmationDetails.serverName + ':' + confirmationDetails.toolName;

    // Input: use full description (for error it's JSON.stringify(args), for success it's invocation description)
    // When confirmationDetails exists (Confirming state), use structured details instead
    let input: string | undefined;
    if (confirmationDetails) {
      const { title: _title, type: _type, ...rest } = confirmationDetails;
      if (Object.keys(rest).length) input = formatValue(rest);
    } else if (description) {
      input = description;
    }

    // Output: from resultDisplay (available for success/error/executing states)
    const output = getResultDisplayText(resultDisplay);

    return {
      key: callId,
      name,
      desc,
      status: (status === 'Success' ? 'success' : status === 'Error' ? 'error' : status === 'Canceled' ? 'default' : 'processing') as BadgeProps['status'],
      input,
      output,
    };
  });
};

const ToolAcpMapper = (message: IMessageAcpToolCall): ToolItem | undefined => {
  const update = message.content.update;
  if (!update) return;

  // Input: from rawInput
  const input = update.rawInput ? formatValue(update.rawInput) : undefined;

  // Output: from content items
  let output: string | undefined;
  if (update.content?.length) {
    output = update.content
      .map((item) => {
        if (item.type === 'content' && item.content?.text) return item.content.text;
        if (item.type === 'diff' && item.path) return `[diff] ${item.path}`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return {
    key: update.toolCallId,
    name: (update.rawInput?.description as string) || update.title,
    desc: (update.rawInput?.command as string) || update.kind,
    status: update.status === 'completed' ? 'success' : update.status === 'failed' ? 'error' : ('default' as BadgeProps['status']),
    input,
    output,
  };
};

const ToolItemDetail: React.FC<{ item: ToolItem }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = item.input || item.output;

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge status={item.status} className={item.status === 'processing' ? 'badge-breathing' : ''}></Badge>
        <span className={'flex-1 min-w-0' + (expanded ? ' break-all' : ' truncate') + (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')} onClick={hasDetail ? () => setExpanded(!expanded) : undefined}>
          {`${item.name}(${item.desc})`}
        </span>
        {hasDetail && (
          <span className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors' onClick={() => setExpanded(!expanded)}>
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

const MessageToolGroupSummary: React.FC<{ messages: Array<IMessageToolGroup | IMessageAcpToolCall> }> = ({ messages }) => {
  const [showMore, setShowMore] = useState(() => {
    if (!messages.length) return false;
    return messages.some((m) => (m.type === 'tool_group' && m.content.some((t) => t.status !== 'Success' && t.status !== 'Error' && t.status !== 'Canceled')) || (m.type === 'acp_tool_call' && m.content.update.status !== 'completed'));
  });
  const tools = useMemo(() => {
    return messages
      .map((m) => {
        if (m.type === 'tool_group') return ToolGroupMapper(m);
        return ToolAcpMapper(m);
      })
      .flat();
  }, [messages]);

  return (
    <div>
      <div className='flex items-center gap-10px color-#86909C cursor-pointer' onClick={() => setShowMore(!showMore)}>
        <Badge status='default' text='View Steps' className={'![&_span.arco-badge-status-text]:color-#86909C'}></Badge>
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
