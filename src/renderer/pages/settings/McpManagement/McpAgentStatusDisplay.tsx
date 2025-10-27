import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import { Tag } from '@arco-design/web-react';
import { LoadingOne } from '@icon-park/react';
import React from 'react';

interface McpAgentStatusDisplayProps {
  serverName: string;
  agentInstallStatus: Record<string, string[]>;
  isLoadingAgentStatus: boolean;
}

// Agent logo 映射
const AGENT_LOGO_MAP: Record<string, string> = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  qwen: QwenLogo,
  iflow: IflowLogo,
  codex: CodexLogo,
};

const getAgentLogo = (agent: string): string | null => {
  return AGENT_LOGO_MAP[agent.toLowerCase()] || null;
};

const McpAgentStatusDisplay: React.FC<McpAgentStatusDisplayProps> = ({ serverName, agentInstallStatus, isLoadingAgentStatus }) => {
  const hasAgents = agentInstallStatus[serverName] && agentInstallStatus[serverName].length > 0;
  if (!hasAgents && !isLoadingAgentStatus) {
    return null;
  }
  return (
    <div className='flex items-center -space-x-1'>
      {isLoadingAgentStatus ? (
        <LoadingOne fill={'#165dff'} className={'h-[16px] w-[16px]'} />
      ) : (
        agentInstallStatus[serverName]?.map((agent) => {
          const LogoComponent = getAgentLogo(agent);
          return LogoComponent ? (
            <div key={agent} className='w-6 h-6 bg-white border-white flex items-center' title={agent}>
              <img src={LogoComponent} alt={agent} className='w-[21px] h-[21px] border-solid border-[#F7F8FA]' />
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
