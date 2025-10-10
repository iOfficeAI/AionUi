import type { IMcpServer } from '@/common/storage';
import { Check, CloseOne, CloseSmall, Loading } from '@icon-park/react';
import React from 'react';
import McpAgentStatusDisplay from './McpAgentStatusDisplay';
import McpServerActions from './McpServerActions';

interface McpServerHeaderProps {
  server: IMcpServer;
  agentInstallStatus: Record<string, string[]>;
  isLoadingAgentStatus: boolean;
  isTestingConnection: boolean;
  onTestConnection: (server: IMcpServer) => void;
  onEditServer: (server: IMcpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onToggleServer: (serverId: string, enabled: boolean) => void;
}

const getStatusIcon = (status?: IMcpServer['status']) => {
  switch (status) {
    case 'connected':
      return <Check fill={'#00b42a'} className={'h-[24px] items-center'} />;
    case 'testing':
      return <Loading fill={'#165dff'} className={'h-[24px]'} />;
    case 'error':
      return <CloseSmall fill={'#f53f3f'} className={'h-[24px]'} />;
    default:
      return <CloseOne fill={'#86909c'} className={'h-[24px]'} />;
  }
};

const McpServerHeader: React.FC<McpServerHeaderProps> = ({ server, agentInstallStatus, isLoadingAgentStatus, isTestingConnection, onTestConnection, onEditServer, onDeleteServer, onToggleServer }) => {
  return (
    <div className='flex items-center justify-between'>
      <div className='flex items-center gap-2'>
        <span>{server.name}</span>
        <span className='flex items-center mt-8px'>{getStatusIcon(server.status)}</span>
      </div>
      <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
        <McpAgentStatusDisplay serverName={server.name} agentInstallStatus={agentInstallStatus} isLoadingAgentStatus={isLoadingAgentStatus} />
        <McpServerActions server={server} isTestingConnection={isTestingConnection} onTestConnection={onTestConnection} onEditServer={onEditServer} onDeleteServer={onDeleteServer} onToggleServer={onToggleServer} />
      </div>
    </div>
  );
};

export default McpServerHeader;
