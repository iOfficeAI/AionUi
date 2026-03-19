/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse, Message } from '@arco-design/web-react';
import React from 'react';
import AssistantManagement from '@/renderer/pages/settings/AssistantManagement';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '../settingsViewContext';

const AgentModalContent: React.FC = () => {
  const [agentMessage, agentMessageContext] = Message.useMessage({ maxCount: 10 });
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  return (
    <div className='flex flex-col h-full w-full'>
      {agentMessageContext}

      <AionScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide' disableOverflow={isPageMode}>
        <Collapse defaultActiveKey={['smart-assistants']}>
          <AssistantManagement message={agentMessage} />
        </Collapse>
      </AionScrollArea>
    </div>
  );
};

export default AgentModalContent;
