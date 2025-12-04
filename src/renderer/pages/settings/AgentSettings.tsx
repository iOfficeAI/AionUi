/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse, Message } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import CustomAcpAgent from '@renderer/pages/settings/CustomAcpAgent';
import SettingContainer from './components/SettingContainer';

const AgentSettings: React.FC = () => {
  const { t } = useTranslation();
  const [agentMessage, agentMessageContext] = Message.useMessage({ maxCount: 10 });

  return (
    <SettingContainer title={t('settings.agent') || 'Agent'} bodyContainer>
      {agentMessageContext}
      <Collapse defaultActiveKey={['custom-acp-agent']}>
        <CustomAcpAgent message={agentMessage} />
      </Collapse>
    </SettingContainer>
  );
};

export default AgentSettings;
