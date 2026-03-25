import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import { Tag, Tooltip } from '@arco-design/web-react';
import { LoadingOne } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';

interface McpAgentStatusDisplayProps {
  serverName: string;
  agentInstallStatus: Record<string, string[]>;
  isLoadingAgentStatus: boolean;
  /** Read-only rows (extension MCP) can keep icons visible without hover */
  alwaysVisible?: boolean;
}

const McpAgentStatusDisplay: React.FC<McpAgentStatusDisplayProps> = ({
  serverName,
  agentInstallStatus,
  isLoadingAgentStatus,
  alwaysVisible = false,
}) => {
  const agents = agentInstallStatus[serverName] || [];
  const agentsKey = useMemo(() => agents.join('|'), [agents]);
  const [isAlwaysVisibleAnimatedIn, setIsAlwaysVisibleAnimatedIn] = useState(!alwaysVisible);

  useEffect(() => {
    if (!alwaysVisible) return;

    if (isLoadingAgentStatus || agents.length === 0) {
      setIsAlwaysVisibleAnimatedIn(false);
      return;
    }

    setIsAlwaysVisibleAnimatedIn(false);
    const frameId = window.requestAnimationFrame(() => {
      setIsAlwaysVisibleAnimatedIn(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [agentsKey, alwaysVisible, isLoadingAgentStatus, agents.length]);

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
                    className={`w-6 h-6 flex items-center relative cursor-pointer transition-all duration-200 ease-out ${
                      alwaysVisible
                        ? isAlwaysVisibleAnimatedIn
                          ? 'scale-100 opacity-100'
                          : 'scale-0 opacity-0'
                        : 'group-hover:scale-100 group-hover:opacity-100 scale-0 opacity-0'
                    }`}
                    style={{
                      zIndex: index + 1,
                      marginLeft: index === 0 ? 0 : '-4px',
                      transitionDelay: animationDelay,
                    }}
                  >
                    <img
                      src={logo}
                      alt={agent}
                      className='w-[21px] h-[21px] border border-solid border-[var(--color-border-2)] rounded-sm'
                      style={{ backgroundColor: 'var(--dialog-fill-0)' }}
                    />
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
