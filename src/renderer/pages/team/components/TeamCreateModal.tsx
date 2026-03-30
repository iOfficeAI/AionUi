import React, { useState } from 'react';
import { Modal, Steps, Button, Input, Radio } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { TTeam, TeamAgent, WorkspaceMode } from '@process/team/types';
import { useAuth } from '@renderer/hooks/context/AuthContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (team: TTeam) => void;
};

type AgentDraft = {
  agentType: string;
  agentName: string;
  conversationId: string;
};

const INITIAL_DRAFT: AgentDraft = {
  agentType: '',
  agentName: '',
  conversationId: '',
};

const TeamCreateModal: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('shared');
  const [_dispatchAgent, setDispatchAgent] = useState<AgentDraft>(INITIAL_DRAFT);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setStep(0);
    setName('');
    setWorkspace('');
    setWorkspaceMode('shared');
    setDispatchAgent(INITIAL_DRAFT);
    onClose();
  };

  const handleCreate = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const agents: TeamAgent[] = [
        {
          slotId: `slot-${crypto.randomUUID().slice(0, 8)}`,
          conversationId: '',
          role: 'dispatch',
          agentType: 'acp',
          agentName: name,
        },
      ];
      const team = await ipcBridge.team.create.invoke({
        userId: user.id,
        name,
        workspace,
        workspaceMode,
        agents,
      });
      onCreated(team);
      handleClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={t('team.create.title', { defaultValue: 'Create Team' })}
      visible={visible}
      onCancel={handleClose}
      footer={null}
      style={{ width: 560 }}
      autoFocus={false}
      focusLock
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
    >
      <Steps current={step} className='mb-6'>
        <Steps.Step title={t('team.create.step.dispatch', { defaultValue: 'Dispatch Agent' })} />
        <Steps.Step title={t('team.create.step.subAgents', { defaultValue: 'Sub Agents' })} />
        <Steps.Step title={t('team.create.step.workspace', { defaultValue: 'Workspace' })} />
      </Steps>

      {step === 0 && (
        <div className='flex flex-col gap-4'>
          <Input
            placeholder={t('team.create.namePlaceholder', { defaultValue: 'Team name' })}
            value={name}
            onChange={setName}
          />
          <p className='text-[var(--color-text-3)] text-sm'>
            {t('team.create.dispatchHint', {
              defaultValue: 'Set a name for your team and configure the dispatch agent.',
            })}
          </p>
          <Button type='primary' disabled={!name.trim()} onClick={() => setStep(1)}>
            {t('team.create.next', { defaultValue: 'Next' })}
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className='flex flex-col gap-4'>
          <p className='text-[var(--color-text-3)] text-sm'>
            {t('team.create.subAgentsHint', { defaultValue: 'Sub agents can be added after the team is created.' })}
          </p>
          <div className='flex gap-2 justify-between mt-4'>
            <Button onClick={() => setStep(0)}>{t('team.create.back', { defaultValue: 'Back' })}</Button>
            <Button type='primary' onClick={() => setStep(2)}>
              {t('team.create.next', { defaultValue: 'Next' })}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className='flex flex-col gap-4'>
          <Input
            placeholder={t('team.create.workspacePlaceholder', { defaultValue: 'Workspace path (optional)' })}
            value={workspace}
            onChange={setWorkspace}
          />
          <Radio.Group value={workspaceMode} onChange={(val) => setWorkspaceMode(val as WorkspaceMode)}>
            <Radio value='shared'>{t('team.create.workspaceShared', { defaultValue: 'Shared' })}</Radio>
            <Radio value='isolated'>{t('team.create.workspaceIsolated', { defaultValue: 'Isolated' })}</Radio>
          </Radio.Group>
          <div className='flex gap-2 justify-between mt-4'>
            <Button onClick={() => setStep(1)}>{t('team.create.back', { defaultValue: 'Back' })}</Button>
            <Button type='primary' loading={loading} onClick={handleCreate}>
              {t('team.create.confirm', { defaultValue: 'Create Team' })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default TeamCreateModal;
