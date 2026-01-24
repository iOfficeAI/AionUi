import type { BadgeProps } from '@arco-design/web-react';
import { Badge } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useMemo, useState } from 'react';
import type { IMessageAcpToolCall, IMessageToolGroup } from '../../common/chatLib';
import './MessageToolGroupSummary.css';

const ToolGroupMapper = (m: IMessageToolGroup) => {
  return m.content.map(({ name, callId, description, confirmationDetails, status }) => {
    let desc = description.slice(0, 100);
    const type = confirmationDetails?.type;
    if (type === 'edit') desc = confirmationDetails.fileName;
    if (type === 'exec') desc = confirmationDetails.command;
    if (type === 'info') desc = confirmationDetails.urls?.join(';') || confirmationDetails.title;
    if (type === 'mcp') desc = confirmationDetails.serverName + ':' + confirmationDetails.toolName;
    return {
      key: callId,
      name: name,
      desc,
      status: (status === 'Success' ? 'success' : status === 'Error' ? 'error' : status === 'Canceled' ? 'default' : 'processing') as BadgeProps['status'],
    };
  });
};

const ToolAcpMapper = (message: IMessageAcpToolCall) => {
  const update = message.content.update;
  if (!update) return;
  return {
    key: update.toolCallId,
    name: update.rawInput?.description || update.title,
    desc: update.rawInput?.command || update.kind,
    status: update.status === 'completed' ? 'success' : update.status === 'failed' ? 'error' : ('default' as BadgeProps['status']),
  };
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
          {tools.map((item) => {
            return (
              <div key={item.key} className='flex flex-row color-#86909C gap-12px'>
                <Badge status={item.status} className={item.status === 'processing' ? 'badge-breathing' : ''}></Badge>
                <span>{`${item.name}(${item.desc})`} </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default React.memo(MessageToolGroupSummary);
