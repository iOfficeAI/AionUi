import type { IMcpServer } from '@/common/config/storage';
import { Button, Dropdown, Menu, Popover, Tooltip } from '@arco-design/web-react';
import { Check, CloseSmall, Info, LoadingOne, Refresh, Write, DeleteFour, SettingOne, Login } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { McpOAuthStatus } from '@/renderer/hooks/mcp/useMcpOAuth';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';
import { iconColors } from '@/renderer/styles/colors';

interface McpServerHeaderProps {
  server: IMcpServer;
  isTestingConnection: boolean;
  oauthStatus?: McpOAuthStatus;
  isLoggingIn?: boolean;
  /** Extension-contributed servers are read-only */
  isReadOnly?: boolean;
  onTestConnection: (server: IMcpServer) => void;
  onEditServer: (server: IMcpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onOAuthLogin?: (server: IMcpServer) => void;
}

const getStatusIcon = (
  last_test_status?: IMcpServer['last_test_status'],
  oauthStatus?: McpOAuthStatus,
  isTestingConnection?: boolean
) => {
  if (isTestingConnection || last_test_status === 'testing' || oauthStatus?.isChecking) {
    return <LoadingOne fill={iconColors.primary} className='h-[24px]' />;
  }

  if (last_test_status === 'error') {
    return <CloseSmall fill={iconColors.danger} className='h-[24px]' />;
  }

  if (oauthStatus?.needsLogin) {
    return <span className='text-orange-500 text-xl font-bold leading-none'>△</span>;
  }

  if (last_test_status === 'connected') {
    return <Check fill={iconColors.success} className='h-[24px] items-center' />;
  }

  if (oauthStatus?.isAuthenticated) {
    return <Check fill={iconColors.success} className='h-[24px] items-center' />;
  }

  return <Info theme='outline' fill={iconColors.secondary} className='h-[24px]' />;
};

const formatStatusTimestamp = (timestamp?: number): string | null => {
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp).toLocaleString();
};

const getStatusPopoverContent = (
  server: IMcpServer,
  t?: (key: string, options?: Record<string, unknown>) => string
) => {
  if (server.last_test_status !== 'error' && server.last_test_status !== 'connected') {
    return null;
  }

  if (server.last_test_status === 'connected') {
    const checkedAt = formatStatusTimestamp(server.last_connected || server.updated_at);
    return (
      <div className='max-w-300px space-y-2 text-13px leading-20px'>
        <div className='font-medium text-t-primary'>
          {t?.('settings.mcpCheckPassedSummary') || 'Manual check passed'}
        </div>
        {checkedAt ? (
          <div className='text-12px leading-18px text-t-secondary'>{`${t?.('settings.mcpCheckedAtLabel') || 'Checked at:'} ${checkedAt}`}</div>
        ) : null}
        <div className='text-12px leading-18px text-t-secondary opacity-80'>
          {t?.('settings.mcpCheckPurposeHint') ||
            'Used to verify whether the MCP configuration is available. It does not represent the real-time status in the current conversation.'}
        </div>
      </div>
    );
  }

  const checkedAt = formatStatusTimestamp(server.updated_at);

  const reasonText =
    server.builtin && server.name === 'chrome-devtools' && server.transport.type === 'stdio'
      ? t?.('settings.mcpInlineCommandHint', {
          command: server.transport.command,
        }) || `Missing ${server.transport.command}. Install it and test again.`
      : t?.('settings.mcpInlineConfigHint') || 'Configuration may be incorrect. Review the MCP JSON and test again.';

  return (
    <div className='max-w-300px space-y-2 text-13px leading-20px'>
      <div className='font-medium text-t-primary'>{t?.('settings.mcpCheckFailedSummary') || 'Manual check failed'}</div>
      <div className='text-t-primary'>{reasonText}</div>
      {checkedAt ? (
        <div className='text-12px leading-18px text-t-secondary'>{`${t?.('settings.mcpCheckedAtLabel') || 'Checked at:'} ${checkedAt}`}</div>
      ) : null}
    </div>
  );
};

const getStatusText = (
  server: IMcpServer,
  last_test_status?: IMcpServer['last_test_status'],
  oauthStatus?: McpOAuthStatus,
  isTestingConnection?: boolean,
  t?: (key: string, options?: Record<string, unknown>) => string
) => {
  if (isTestingConnection || last_test_status === 'testing' || oauthStatus?.isChecking) {
    return t?.('settings.mcpTesting') || 'testing';
  }

  if (last_test_status === 'error') {
    if (server.builtin && server.name === 'chrome-devtools' && server.transport.type === 'stdio') {
      return (
        t?.('settings.mcpLocalCommandUnavailable', {
          command: server.transport.command,
        }) || `Requires ${server.transport.command} on this machine`
      );
    }
    return t?.('settings.mcpCheckFailedSimple') || 'Failed';
  }

  if (oauthStatus?.needsLogin) {
    return t?.('settings.mcpNeedsLogin') || 'Login required';
  }

  if (last_test_status === 'connected') {
    return t?.('settings.mcpCheckPassedSimple') || 'Manual check passed';
  }

  if (oauthStatus?.isAuthenticated) {
    return t?.('settings.mcpAuthenticated') || 'Authenticated';
  }

  return t?.('settings.mcpDisconnected') || 'Not tested';
};

const supportsOAuth = (server: IMcpServer) =>
  server.transport.type === 'http' || server.transport.type === 'sse' || server.transport.type === 'streamable_http';

const McpServerHeader: React.FC<McpServerHeaderProps> = ({
  server,
  isTestingConnection,
  oauthStatus,
  isLoggingIn,
  isReadOnly,
  onTestConnection,
  onEditServer,
  onDeleteServer,
  onOAuthLogin,
}) => {
  const { t } = useTranslation();

  const oauthCapable = supportsOAuth(server);
  const needsLogin = oauthCapable && oauthStatus?.needsLogin;
  const statusText = getStatusText(server, server.last_test_status, oauthStatus, isTestingConnection, t);
  const statusIcon = getStatusIcon(server.last_test_status, oauthStatus, isTestingConnection);
  const statusPopoverContent = getStatusPopoverContent(server, t);

  const isError = server.last_test_status === 'error';

  return (
    <div className='flex items-center justify-between group'>
      <div className='flex items-center gap-2'>
        <span>{server.name}</span>
        {statusPopoverContent ? (
          <Popover content={statusPopoverContent} trigger='hover' position='top'>
            <span className='flex items-center cursor-default'>{statusIcon}</span>
          </Popover>
        ) : (
          <Tooltip content={statusText} position='top'>
            <span className='flex items-center cursor-default'>{statusIcon}</span>
          </Tooltip>
        )}
        {isError && <FeedbackButton module='mcp-tools' />}
        {!isReadOnly && needsLogin && onOAuthLogin && (
          <Button
            size='mini'
            type='primary'
            icon={<Login size={'14'} />}
            title={t('settings.mcpLogin') || 'Login'}
            loading={isLoggingIn}
            onClick={() => onOAuthLogin(server)}
          >
            {t('settings.mcpLogin') || 'Login'}
          </Button>
        )}
        {!isReadOnly && !needsLogin && (
          <Button
            size='mini'
            icon={<Refresh size={'14'} />}
            title={t('settings.mcpTestConnection')}
            loading={isTestingConnection}
            onClick={() => onTestConnection(server)}
          />
        )}
      </div>
      {!isReadOnly && (
        <div className='flex items-center gap-2 invisible group-hover:visible' onClick={(e) => e.stopPropagation()}>
          {!server.builtin && (
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
          )}
        </div>
      )}
    </div>
  );
};

export default McpServerHeader;
