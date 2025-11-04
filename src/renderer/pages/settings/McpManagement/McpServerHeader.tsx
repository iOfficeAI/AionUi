import type { IMcpServer } from '@/common/storage';
import { Button } from '@arco-design/web-react';
import { Check, CloseOne, CloseSmall, LoadingOne, Refresh } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import McpAgentStatusDisplay from './McpAgentStatusDisplay';
import McpServerActions from './McpServerActions';
import { iconColors } from '@/renderer/theme/colors';

interface McpServerHeaderProps {
  server: IMcpServer;
  agentInstallStatus: Record<string, string[]>;
  isServerLoading: (serverName: string) => boolean;
  isTestingConnection: boolean;
  onTestConnection: (server: IMcpServer) => void;
  onEditServer: (server: IMcpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onToggleServer: (serverId: string, enabled: boolean) => void;
}

const getStatusIcon = (status?: IMcpServer['status']) => {
  switch (status) {
    case 'connected':
      return <Check fill={iconColors.success} className={'h-[24px] items-center'} />;
    case 'testing':
      return <LoadingOne fill={iconColors.primary} className={'h-[24px]'} />;
    case 'error':
      return <CloseSmall fill={iconColors.danger} className={'h-[24px]'} />;
    default:
      return <CloseOne fill={iconColors.secondary} className={'h-[24px]'} />;
  }
};

const McpServerHeader: React.FC<McpServerHeaderProps> = ({ server, agentInstallStatus, isServerLoading, isTestingConnection, onTestConnection, onEditServer, onDeleteServer, onToggleServer }) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center justify-between'>
      <div className='flex items-center gap-2'>
        <span>{server.name}</span>
        <span className='flex items-center mt-8px'>{getStatusIcon(server.status)}</span>
        <Button size='mini' icon={<Refresh size={'14'} />} title={t('settings.mcpTestConnection')} loading={isTestingConnection} onClick={() => onTestConnection(server)} />
      </div>
      <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
        <McpAgentStatusDisplay serverName={server.name} agentInstallStatus={agentInstallStatus} isLoadingAgentStatus={isServerLoading(server.name)} />
        <McpServerActions server={server} onEditServer={onEditServer} onDeleteServer={onDeleteServer} onToggleServer={onToggleServer} />
      </div>
    </div>
  );
};

export default McpServerHeader;
