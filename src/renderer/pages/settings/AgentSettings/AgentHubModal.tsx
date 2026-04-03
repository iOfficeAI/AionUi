import React from 'react';
import { Button, Typography, Tooltip, Link } from '@arco-design/web-react';
import { IconDownload, IconRefresh } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import ModalWrapper from '@/renderer/components/base/ModalWrapper';
import { useHubAgents } from '@/renderer/hooks/agent/useHubAgents';
import type { IHubAgentItem } from '@/common/types/hub';
import { resolveAgentLogo } from '@renderer/utils/model/agentLogo';
import { openExternalUrl } from '@/renderer/utils/platform';

interface AgentHubModalProps {
  visible: boolean;
  onCancel: () => void;
}

const AION_HUB_REPO_URL = 'https://github.com/iOfficeAI/AionHub';

export const AgentHubModal: React.FC<AgentHubModalProps> = ({ visible, onCancel }) => {
  const { t } = useTranslation();
  const { agents, loading, error, install, retryInstall, update } = useHubAgents();
  const actionButtonClassName = '!min-w-80px !rounded-9px !px-10px';
  const openAionHubRepo = () => {
    void openExternalUrl(AION_HUB_REPO_URL).catch(console.error);
  };

  const renderActionBtn = (agent: IHubAgentItem) => {
    switch (agent.status) {
      case 'not_installed':
        return (
          <Button
            type='primary'
            size='small'
            icon={<IconDownload />}
            className={actionButtonClassName}
            onClick={() => install(agent.name)}
          >
            {t('settings.agentManagement.marketInstall', { defaultValue: 'Install' })}
          </Button>
        );
      case 'installing':
      case 'uninstalling':
        return (
          <Button type='primary' size='small' loading disabled className={actionButtonClassName}>
            {t('settings.agentManagement.marketInstalling', { defaultValue: 'Installing...' })}
          </Button>
        );
      case 'installed':
        return (
          <Button size='small' type='secondary' disabled className={actionButtonClassName}>
            {t('settings.installed', { defaultValue: 'Installed' })}
          </Button>
        );
      case 'install_failed':
        return (
          <Tooltip content={agent.installError || t('common.failed', { defaultValue: 'Failed' })}>
            <Button
              status='danger'
              size='small'
              icon={<IconRefresh />}
              className={actionButtonClassName}
              onClick={() => retryInstall(agent.name)}
            >
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </Tooltip>
        );
      case 'update_available':
        return (
          <Button
            type='primary'
            size='small'
            icon={<IconDownload />}
            className={actionButtonClassName}
            onClick={() => update(agent.name)}
          >
            {t('settings.agentManagement.marketUpdate', { defaultValue: 'Update' })}
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <ModalWrapper
      title={t('settings.agentManagement.installFromMarket')}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      autoFocus={false}
      focusLock={true}
      style={{ width: 1000, maxWidth: '96vw' }}
    >
      <div className='max-h-[70vh] overflow-y-auto pr-4px'>
        <div className='mb-12px flex flex-wrap items-center justify-start gap-x-6px gap-y-2px text-left'>
          <Typography.Text type='secondary' className='text-12px leading-18px text-t-secondary'>
            {t('settings.agentManagement.marketContributionHint', {
              defaultValue: 'Want a new Agent listed here?',
            })}
          </Typography.Text>
          <Link className='text-12px leading-18px' onClick={openAionHubRepo}>
            {t('settings.agentManagement.marketContributionAction', {
              defaultValue: 'Open a PR on AionHub',
            })}
          </Link>
        </div>

        {loading ? (
          <div className='flex items-center justify-center py-48px'>
            <Typography.Text type='secondary'>
              {t('common.loading', { defaultValue: 'Please wait...' })}
            </Typography.Text>
          </div>
        ) : error ? (
          <div className='flex items-center justify-center py-48px text-center'>
            <Typography.Text type='secondary' className='text-13px text-t-secondary'>
              {error}
            </Typography.Text>
          </div>
        ) : agents.length === 0 ? (
          <div className='flex items-center justify-center py-48px text-center'>
            <Typography.Text type='secondary' className='text-13px text-t-secondary'>
              {t('settings.agentManagement.marketEmpty', { defaultValue: 'No agents available in the market.' })}
            </Typography.Text>
          </div>
        ) : (
          <div data-testid='agent-hub-grid' className='grid grid-cols-1 gap-10px sm:grid-cols-2 lg:grid-cols-4'>
            {agents.map((agent) => {
              const logo = resolveAgentLogo({
                icon: agent.icon,
                backend: agent.contributes?.acpAdapters?.[0],
              });

              return (
                <div
                  key={agent.name}
                  data-testid='agent-hub-card'
                  className='flex min-h-[144px] flex-col rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-10px transition-colors hover:border-[var(--color-border-3)]'
                >
                  <Typography.Text
                    bold
                    className='mb-6px block min-h-36px text-center text-13px leading-18px line-clamp-2'
                  >
                    {agent.displayName}
                  </Typography.Text>

                  <div className='mb-6px flex h-40px items-center justify-center'>
                    {logo ? (
                      <img src={logo} alt={agent.displayName} className='h-36px w-36px rounded-10px object-contain' />
                    ) : (
                      <div className='flex h-36px w-36px items-center justify-center rounded-10px bg-fill-2 text-16px font-bold text-t-secondary'>
                        {agent.displayName.charAt(0)}
                      </div>
                    )}
                  </div>

                  <Typography.Text className='mb-10px block min-h-28px text-center text-11px leading-15px text-t-secondary line-clamp-2'>
                    {agent.description}
                  </Typography.Text>

                  <div className='mt-auto flex justify-center'>{renderActionBtn(agent)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalWrapper>
  );
};
