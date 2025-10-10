import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import { Tag } from '@arco-design/web-react';
import { Loading } from '@icon-park/react';
import React from 'react';

interface McpAgentStatusDisplayProps {
  serverName: string;
  agentInstallStatus: Record<string, string[]>;
  isLoadingAgentStatus: boolean;
}

// Agent logo 映射
const getAgentLogo = (agent: string) => {
  switch (agent.toLowerCase()) {
    case 'claude':
      return ClaudeLogo;
    case 'gemini':
      return GeminiLogo;
    case 'qwen':
      return QwenLogo;
    case 'iflow':
      return IflowLogo;
    case 'codex':
      return CodexLogo;
    default:
      return null;
  }
};

const McpAgentStatusDisplay: React.FC<McpAgentStatusDisplayProps> = ({ serverName, agentInstallStatus, isLoadingAgentStatus }) => {
  const hasAgents = agentInstallStatus[serverName] && agentInstallStatus[serverName].length > 0;

  if (!hasAgents && !isLoadingAgentStatus) {
    return null;
  }

  return (
    <div className='flex items-center -space-x-1'>
      {isLoadingAgentStatus && !agentInstallStatus[serverName] ? (
        <Loading fill={'#165dff'} className={'h-[16px] w-[16px]'} />
      ) : (
        agentInstallStatus[serverName]?.map((agent, index) => {
          const LogoComponent = getAgentLogo(agent);
          return LogoComponent ? (
            <div key={agent} className='w-6 h-6 rounded-full bg-white border-2 border-white shadow-sm' style={{ zIndex: agentInstallStatus[serverName].length - index }} title={agent}>
              <img src={LogoComponent} alt={agent} className='w-full h-full rounded-full w-[14px] h-[14px]' />
            </div>
          ) : (
            <Tag key={agent} size='small' color='green'>
              {agent}
            </Tag>
          );
        })
      )}
    </div>
  );
};

export default McpAgentStatusDisplay;
