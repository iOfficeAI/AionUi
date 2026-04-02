import React, { useState } from 'react';
import { Button, Input, Select } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import AionModal from '@renderer/components/base/AionModal';
import { useConversationAgents } from '@renderer/pages/conversation/hooks/useConversationAgents';
import { agentKey, AgentOptionLabel } from './agentSelectUtils';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (data: { agentName: string; agentKey: string }) => void;
};

const AddAgentModal: React.FC<Props> = ({ visible, onClose, onConfirm }) => {
  const { t } = useTranslation();
  const { cliAgents, presetAssistants } = useConversationAgents();
  const [agentName, setAgentName] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);

  const allAgents = [...cliAgents, ...presetAssistants];

  const handleClose = () => {
    setAgentName('');
    setSelectedKey(undefined);
    onClose();
  };

  const handleConfirm = () => {
    if (!agentName.trim() || !selectedKey) return;
    onConfirm({ agentName: agentName.trim(), agentKey: selectedKey });
    handleClose();
  };

  const canConfirm = agentName.trim().length > 0 && selectedKey !== undefined;

  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      header={t('team.addAgent.title', { defaultValue: 'Add Agent' })}
      footer={
        <div className='flex justify-end pt-4px'>
          <Button
            type='primary'
            disabled={!canConfirm}
            onClick={handleConfirm}
            className='px-20px min-w-80px'
            style={{ borderRadius: 8 }}
          >
            {t('team.addAgent.confirm', { defaultValue: 'Add' })}
          </Button>
        </div>
      }
      size='small'
    >
      <div className='flex flex-col gap-20px p-20px'>
        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.addAgent.name', { defaultValue: 'Agent Name' })}
          </label>
          <Input
            placeholder={t('team.addAgent.namePlaceholder', { defaultValue: 'Enter agent name' })}
            value={agentName}
            onChange={setAgentName}
          />
        </div>

        <div className='flex flex-col gap-6px'>
          <label className='text-sm text-[var(--color-text-2)] font-medium'>
            {t('team.addAgent.type', { defaultValue: 'Agent Type' })}
          </label>
          <Select
            placeholder={t('team.addAgent.typePlaceholder', { defaultValue: 'Select agent type' })}
            value={selectedKey}
            onChange={setSelectedKey}
            showSearch
            allowClear
            getPopupContainer={() => document.body}
            renderFormat={(option) => {
              const agent = option?.value ? allAgents.find((a) => agentKey(a) === option.value) : undefined;
              return agent ? <AgentOptionLabel agent={agent} /> : <span>{option?.children}</span>;
            }}
          >
            {cliAgents.length > 0 && (
              <Select.OptGroup label={t('conversation.dropdown.cliAgents', { defaultValue: 'CLI Agents' })}>
                {cliAgents.map((agent) => (
                  <Select.Option key={agentKey(agent)} value={agentKey(agent)}>
                    <AgentOptionLabel agent={agent} />
                  </Select.Option>
                ))}
              </Select.OptGroup>
            )}
            {presetAssistants.length > 0 && (
              <Select.OptGroup
                label={t('conversation.dropdown.presetAssistants', { defaultValue: 'Preset Assistants' })}
              >
                {presetAssistants.map((agent) => (
                  <Select.Option key={agentKey(agent)} value={agentKey(agent)}>
                    <AgentOptionLabel agent={agent} />
                  </Select.Option>
                ))}
              </Select.OptGroup>
            )}
          </Select>
        </div>
      </div>
    </AionModal>
  );
};

export default AddAgentModal;
