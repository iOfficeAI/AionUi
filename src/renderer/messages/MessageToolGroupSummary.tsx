import type { BadgeProps } from '@arco-design/web-react';
import { Badge } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useMemo, useState } from 'react';
import type { IMessageToolGroup } from '../../common/chatLib';

const MessageToolGroupSummary: React.FC<{ messages: IMessageToolGroup[] }> = ({ messages }) => {
  const [showMore, setShowMore] = useState(false);
  const tools = useMemo(() => {
    return messages
      .map((m) => {
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
              <div className='flex flex-row color-#86909C gap-12px'>
                <Badge key={item.key} status={item.status}></Badge>
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
