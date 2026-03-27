import React from 'react';
import CustomAcpAgent from '@/renderer/pages/settings/AgentSettings/CustomAcpAgent';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { Collapse, Message } from '@arco-design/web-react';

const AcpSettings: React.FC = () => {
  const [message, messageContext] = Message.useMessage({ maxCount: 10 });

  return (
    <SettingsPageWrapper>
      {messageContext}
      <Collapse defaultActiveKey={['custom-acp-agent']}>
        <CustomAcpAgent message={message} />
      </Collapse>
    </SettingsPageWrapper>
  );
};

export default AcpSettings;
