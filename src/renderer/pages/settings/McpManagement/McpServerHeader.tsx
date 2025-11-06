import type { IMcpServer } from '@/common/storage';
import { Button, Dropdown, Menu, Switch } from '@arco-design/web-react';
import { Check, CloseOne, CloseSmall, LoadingOne, Refresh, Write, DeleteFour, SettingOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import McpAgentStatusDisplay from './McpAgentStatusDisplay';
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
    <div className='flex items-center justify-between group'>
      <div className='flex items-center gap-2'>
        <span>{server.name}</span>
        <span className='flex items-center mt-8px'>{getStatusIcon(server.status)}</span>
        <Button size='mini' icon={<Refresh size={'14'} />} title={t('settings.mcpTestConnection')} loading={isTestingConnection} onClick={() => onTestConnection(server)} />
      </div>
      <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
        <div className='flex items-center gap-2 invisible group-hover:visible'>
          <McpAgentStatusDisplay serverName={server.name} agentInstallStatus={agentInstallStatus} isLoadingAgentStatus={isServerLoading(server.name)} />
          <Dropdown
            trigger='hover'
            droplist={
              <Menu>
                <Menu.Item key='edit' onClick={() => onEditServer(server)}>
                  <div className='flex items-center gap-2'>
                    <Write size={'14'} />
                    {t('settings.mcpEditServer')}
                  </div>
                </Menu.Item>
                <Menu.Item key='delete' onClick={() => onDeleteServer(server.id)}>
                  <div className='flex items-center gap-2 text-red-500'>
                    <DeleteFour size={'14'} />
                    {t('settings.mcpDeleteServer')}
                  </div>
                </Menu.Item>
              </Menu>
            }
          >
            <Button size='mini' icon={<SettingOne size={'14'} />} />
          </Dropdown>
        </div>
        <Switch checked={server.enabled} onChange={(checked) => onToggleServer(server.id, checked)} size='small' disabled={server.status === 'testing'} />
      </div>
    </div>
  );
};

export default McpServerHeader;
