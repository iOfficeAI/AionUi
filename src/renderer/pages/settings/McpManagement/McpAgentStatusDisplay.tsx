import { getAgentLogo } from '@/renderer/utils/agentLogo';
import { iconColors } from '@/renderer/theme/colors';
import { Tag, Tooltip } from '@arco-design/web-react';
import { LoadingOne } from '@icon-park/react';
import React from 'react';

interface McpAgentStatusDisplayProps {
  serverName: string;
  agentInstallStatus: Record<string, string[]>;
  isLoadingAgentStatus: boolean;
}

const McpAgentStatusDisplay: React.FC<McpAgentStatusDisplayProps> = ({ serverName, agentInstallStatus, isLoadingAgentStatus }) => {
  const agents = agentInstallStatus[serverName] || [];

  if (!agents.length && !isLoadingAgentStatus) {
    return null;
  }

  return (
    <div className='flex items-center isolate'>
      <div className='flex items-center'>
        {isLoadingAgentStatus ? (
          <LoadingOne fill={iconColors.primary} className='h-[16px] w-[16px]' />
        ) : (
          agents.map((agent, index) => {
            const logo = getAgentLogo(agent);

            if (logo) {
              const animationDelay = `${(agents.length - 1 - index) * 0.05}s`;

              return (
                <Tooltip key={`${serverName}-${agent}-${index}`} content={agent}>
                  <div
                    className='w-6 h-6 flex items-center relative  cursor-pointer transition-all duration-200 ease-out group-hover:scale-100 group-hover:opacity-100 scale-0 opacity-0'
                    style={{
                      zIndex: index + 1,
                      marginLeft: index === 0 ? 0 : '-4px',
                      transitionDelay: animationDelay,
                    }}
                  >
                    <img src={logo} alt={agent} className='w-[21px] h-[21px] border border-solid border-[var(--color-border-2)] rounded-sm' style={{ backgroundColor: 'var(--dialog-fill-0)' }} />
                  </div>
                </Tooltip>
              );
            }

            return (
              <Tag key={`${serverName}-${agent}-${index}`} size='small' color='green'>
                {agent}
              </Tag>
            );
          })
        )}
      </div>
    </div>
  );
};

export default McpAgentStatusDisplay;
