import { Collapse } from '@arco-design/web-react';
import React from 'react';
import type { IMcpServer } from '@/common/storage';
import McpServerHeader from './McpServerHeader';
import McpServerToolsList from './McpServerToolsList';

interface McpServerItemProps {
  server: IMcpServer;
  isCollapsed: boolean;
  agentInstallStatus: Record<string, string[]>;
  isServerLoading: (serverName: string) => boolean;
  isTestingConnection: boolean;
  onToggleCollapse: () => void;
  onTestConnection: (server: IMcpServer) => void;
  onEditServer: (server: IMcpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onToggleServer: (serverId: string, enabled: boolean) => void;
}

const McpServerItem: React.FC<McpServerItemProps> = ({ server, isCollapsed, agentInstallStatus, isServerLoading, isTestingConnection, onToggleCollapse, onTestConnection, onEditServer, onDeleteServer, onToggleServer }) => {
  return (
    <Collapse key={server.id} activeKey={isCollapsed ? ['1'] : []} onChange={onToggleCollapse} className='mb-4'>
      <Collapse.Item header={<McpServerHeader server={server} agentInstallStatus={agentInstallStatus} isServerLoading={isServerLoading} isTestingConnection={isTestingConnection} onTestConnection={onTestConnection} onEditServer={onEditServer} onDeleteServer={onDeleteServer} onToggleServer={onToggleServer} />} name='1' className={'[&_div.arco-collapse-item-content-box]:py-3'}>
        <McpServerToolsList server={server} />
      </Collapse.Item>
    </Collapse>
  );
};

export default McpServerItem;
