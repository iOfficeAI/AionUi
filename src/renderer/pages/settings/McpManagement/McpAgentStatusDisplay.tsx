import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import { Tag, Tooltip } from '@arco-design/web-react';
import { LoadingOne } from '@icon-park/react';
import React from 'react';
import { iconColors } from '@/renderer/theme/colors';

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
<<<<<<< HEAD
    <div className='flex items-center isolate'>
=======
    <div className='flex items-center'>
>>>>>>> origin/main
      {isLoadingAgentStatus ? (
        <LoadingOne fill={iconColors.primary} className={'h-[16px] w-[16px]'} />
      ) : (
        agentInstallStatus[serverName]?.map((agent, index) => {
          const LogoComponent = getAgentLogo(agent);
          const totalAgents = agentInstallStatus[serverName].length;
          // 从右往左展开：最右边的（最后一个）延迟最短，最左边的（第一个）延迟最长
          const animationDelay = `${(totalAgents - 1 - index) * 0.05}s`;

          return LogoComponent ? (
<<<<<<< HEAD
            <Tooltip key={`${serverName}-${agent}-${index}`} content={agent}>
              <div
                className='w-6 h-6 flex items-center relative hover:z-[100] cursor-pointer transition-all duration-200 ease-out group-hover:scale-100 group-hover:opacity-100 scale-0 opacity-0'
                style={{
                  zIndex: index + 1,
                  marginLeft: index === 0 ? 0 : '-4px',
                  transitionDelay: animationDelay,
                }}
              >
                <img src={LogoComponent} alt={agent} className='w-[21px] h-[21px] border-solid border-1 rounded-sm' style={{ backgroundColor: 'var(--bg-base)' }} />
=======
            <Tooltip key={agent} content={agent}>
              <div
                className='w-6 h-6 flex items-center relative hover:z-10 cursor-pointer'
                style={{
                  zIndex: index,
                  marginLeft: index === 0 ? 0 : '-4px',
                }}
              >
                <img src={LogoComponent} alt={agent} className='w-[21px] h-[21px] border-solid border-1 rounded-sm bg-base' />
>>>>>>> origin/main
              </div>
            </Tooltip>
          ) : (
            <Tag key={`${serverName}-${agent}-${index}`} size='small' color='green'>
              {agent}
            </Tag>
          );
        })
      )}
    </div>
  );
};

export default McpAgentStatusDisplay;
