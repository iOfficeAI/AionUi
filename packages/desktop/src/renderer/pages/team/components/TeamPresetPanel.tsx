import { DeleteOne, Plus } from '@icon-park/react';
import { Button, Input, List, Message, Modal, Empty, Spin } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { TTeam, TeamPreset } from '@/common/types/team/teamTypes';
import { useAuth } from '@renderer/hooks/context/AuthContext';

type Props = { visible: boolean; onClose: () => void; team?: TTeam };

export function buildTeamPresetInput(team: TTeam, name: string, userId: string) {
  const members = team.assistants.map((assistant, order) => ({
    assistant_backend: assistant.assistant_backend,
    assistant_id: assistant.assistant_id,
    model: assistant.model,
    assistant_name: assistant.assistant_name,
    role: assistant.role,
    order,
  }));
  const leader = members.find((member) => member.role === 'leader') ?? members[0];
  return {
    user_id: userId,
    name: name.trim(),
    description: '',
    expertise_tags: [] as string[],
    example_prompts: [] as string[],
    leader,
    members: members.filter((member) => member !== leader),
  };
}

/** Small, non-invasive preset manager. It deliberately lives beside TeamCreateModal
 * so upstream TeamPage/warmup and Project Explorer remain untouched. */
const TeamPresetPanel: React.FC<Props> = ({ visible, onClose, team }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [presets, setPresets] = useState<TeamPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const userId = user?.id ?? 'system_default_user';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPresets(await ipcBridge.teamPreset.list.invoke({ user_id: userId }));
    } catch (error) {
      console.error('Failed to load team presets', error);
      Message.error(t('settings.no_presets', { defaultValue: 'Unable to load presets' }));
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => {
    if (visible) void load();
  }, [load, visible]);

  const saveCurrentTeam = async () => {
    if (!team || !name.trim() || team.assistants.length === 0) return;
    setSaving(true);
    try {
      await ipcBridge.teamPreset.create.invoke(buildTeamPresetInput(team, name, userId));
      setName('');
      Message.success(t('common.saveSuccess'));
      await load();
    } catch (error) {
      console.error('Failed to save team preset', error);
      Message.error(t('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = (preset: TeamPreset) => {
    Modal.confirm({
      title: t('settings.delete_preset_confirm', { defaultValue: 'Delete this preset?' }),
      onOk: async () => {
        await ipcBridge.teamPreset.delete.invoke({ id: preset.id });
        await load();
      },
    });
  };

  return (
    <Modal
      title={t('settings.preset', { defaultValue: 'Team presets' })}
      visible={visible}
      onCancel={onClose}
      footer={null}
    >
      {team && (
        <div className='flex gap-8px mb-12px'>
          <Input
            value={name}
            onChange={setName}
            placeholder={t('settings.edit_preset', { defaultValue: 'Preset name' })}
          />
          <Button
            data-testid='team-preset-save-btn'
            type='primary'
            icon={<Plus />}
            loading={saving}
            disabled={!name.trim()}
            onClick={() => void saveCurrentTeam()}
          >
            {t('common.save')}
          </Button>
        </div>
      )}
      {loading ? (
        <Spin className='w-full py-16px' />
      ) : presets.length === 0 ? (
        <Empty description={t('settings.no_presets', { defaultValue: 'No presets' })} />
      ) : (
        <List
          dataSource={presets}
          render={(preset) => (
            <List.Item
              key={preset.id}
              actions={[
                <Button key='delete' type='text' status='danger' icon={<DeleteOne />} onClick={() => remove(preset)} />,
              ]}
            >
              <List.Item.Meta
                title={preset.name}
                description={preset.description || `${preset.members.length + 1} members`}
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
};

export default TeamPresetPanel;
