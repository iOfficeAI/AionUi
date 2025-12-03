/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse, Message } from '@arco-design/web-react';
import React from 'react';
import CustomAcpAgent from '@/renderer/pages/settings/CustomAcpAgent';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';

const AgentModalContent: React.FC = () => {
  const [agentMessage, agentMessageContext] = Message.useMessage({ maxCount: 10 });

  return (
    <div className='flex flex-col h-full w-full'>
      {agentMessageContext}

      <AionScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide'>
        <Collapse defaultActiveKey={['custom-acp-agent']}>
          <CustomAcpAgent message={agentMessage} />
        </Collapse>
      </AionScrollArea>
    </div>
  );
};

export default AgentModalContent;
