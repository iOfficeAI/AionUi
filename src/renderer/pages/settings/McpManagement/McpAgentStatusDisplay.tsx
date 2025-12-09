import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import GooseLogo from '@/renderer/assets/logos/goose.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import OpenCodeLogo from '@/renderer/assets/logos/opencode.svg';
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

const AGENT_LOGO_MAP: Record<string, string> = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  qwen: QwenLogo,
  iflow: IflowLogo,
  codex: CodexLogo,
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
  opencode: OpenCodeLogo,
};

const getAgentLogo = (agent: string): string | null => {
  return AGENT_LOGO_MAP[agent.toLowerCase()] || null;
};

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
