/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSkillRepository } from '@/renderer/hooks/skill/useSkillRepository';
import type { SkillEntry } from '@process/skills/types';
import { Button, Card, Empty, Input, Message, Modal, Space, Switch, Tag, Typography } from '@arco-design/web-react';
import { Delete, FolderOpen, Refresh, Search, Toolkit } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SettingsPageWrapper from './components/SettingsPageWrapper';

/** Source badge config: label + Arco Tag color */
const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  bundled: { label: 'Bundled', color: 'blue' },
  custom: { label: 'Custom', color: 'green' },
  remote: { label: 'Remote', color: 'purple' },
  'auto-detected': { label: 'Auto', color: 'cyan' },
};

/** Resolve the display badge for a skill entry, accounting for origin subtypes. */
const getBadge = (entry: SkillEntry): { label: string; color: string } => {
  if (entry.metadata.origin === 'skills-market') {
    return { label: 'Market', color: 'arcoblue' };
  }
  if (entry.metadata.origin === 'extension') {
    return { label: 'Extension', color: 'orangered' };
  }
  return SOURCE_BADGE[entry.source] ?? { label: entry.source, color: 'gray' };
};

const SkillsHubSettings: React.FC = () => {
  const { t } = useTranslation();
  const { skills, globalConfig, loading, saving, refresh, setGlobalEnabled, addSkill, removeSkill } =
    useSkillRepository();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return skills;
    const q = searchQuery.toLowerCase();
    return skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.metadata.description?.toLowerCase().includes(q),
    );
  }, [skills, searchQuery]);

  const handleImportFolder = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dialog = (window as any).electron?.dialog;
      if (!dialog) {
        Message.error(t('settings.skillsHub.dialogUnavailable', { defaultValue: 'File dialog not available' }));
        return;
      }
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: t('settings.skillsHub.selectFolder', { defaultValue: 'Select skill folder' }),
      });
      if (result && !result.canceled && result.filePaths?.[0]) {
        await addSkill(result.filePaths[0]);
        Message.success(t('settings.skillsHub.importSuccess', { defaultValue: 'Skill imported' }));
      }
    } catch (_err) {
      Message.error(t('settings.skillsHub.importError', { defaultValue: 'Import failed' }));
    }
  };

  const handleRemove = (name: string) => {
    Modal.confirm({
      title: t('settings.skillsHub.confirmRemove', { defaultValue: 'Remove skill?' }),
      content: t('settings.skillsHub.confirmRemoveDesc', {
        name,
        defaultValue: `Remove "${name}" from the repository?`,
      }),
      onOk: async () => {
        try {
          await removeSkill(name);
          Message.success(t('settings.skillsHub.removeSuccess', { defaultValue: 'Skill removed' }));
        } catch (_err) {
          Message.error(t('settings.skillsHub.removeError', { defaultValue: 'Failed to remove skill' }));
        }
      },
    });
  };

  const isEnabled = (name: string): boolean => {
    const setting = globalConfig[name];
    return setting ? setting.enabled : true;
  };

  return (
    <SettingsPageWrapper>
      {/* Header */}
      <div className="flex items-center justify-between mb-16px">
        <Typography.Title heading={5} className="m-0!">
          {t('settings.skillsHub.title', { defaultValue: 'Skills Hub' })}
        </Typography.Title>
        <Space size={8}>
          <Button icon={<Refresh />} loading={loading} onClick={() => void refresh()} size="small">
            {t('settings.skillsHub.refresh', { defaultValue: 'Refresh' })}
          </Button>
          <Button type="primary" icon={<FolderOpen />} onClick={() => void handleImportFolder()} size="small">
            {t('settings.skillsHub.import', { defaultValue: 'Import' })}
          </Button>
        </Space>
      </div>

      {/* Search */}
      <Input
        prefix={<Search size={14} />}
        placeholder={t('settings.skillsHub.search', { defaultValue: 'Search skills...' })}
        value={searchQuery}
        onChange={setSearchQuery}
        allowClear
        className="mb-12px"
      />

      {/* Summary */}
      <div className="text-12px text-t-tertiary mb-8px">
        {t('settings.skillsHub.count', {
          total: skills.length,
          enabled: skills.filter((s) => isEnabled(s.name)).length,
          defaultValue: `${skills.length} skills, ${skills.filter((s) => isEnabled(s.name)).length} enabled`,
        })}
      </div>

      {/* Skill List */}
      {filteredSkills.length === 0 && !loading ? (
        <Empty description={t('settings.skillsHub.empty', { defaultValue: 'No skills found' })} />
      ) : (
        <div className="flex flex-col gap-8px">
          {filteredSkills.map((skill) => {
            const badge = getBadge(skill);
            const enabled = isEnabled(skill.name);
            const canRemove = skill.source !== 'bundled';
            const marketVersion = skill.metadata.market?.version;

            return (
              <Card key={skill.name} size="small" className="hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-12px">
                  {/* Avatar */}
                  <div className="w-36px h-36px rd-8px bg-fill-3 flex items-center justify-center shrink-0">
                    <Toolkit size={18} className="text-t-secondary" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-6px">
                      <span className="text-14px font-medium text-t-primary truncate">{skill.name}</span>
                      <Tag size="small" color={badge.color}>
                        {badge.label}
                      </Tag>
                      {marketVersion && (
                        <Tag size="small" color="arcoblue">
                          v{marketVersion}
                        </Tag>
                      )}
                      {skill.status !== 'healthy' && (
                        <Tag size="small" color="red">
                          {skill.status}
                        </Tag>
                      )}
                    </div>
                    <div className="text-12px text-t-tertiary truncate mt-2px">
                      {skill.metadata.description || skill.name}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-8px shrink-0">
                    <Switch
                      size="small"
                      checked={enabled}
                      loading={saving}
                      onChange={(checked) => void setGlobalEnabled(skill.name, checked)}
                    />
                    {canRemove && (
                      <Button
                        type="text"
                        icon={<Delete size={14} />}
                        size="mini"
                        status="danger"
                        onClick={() => handleRemove(skill.name)}
                      />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </SettingsPageWrapper>
  );
};

export default SkillsHubSettings;
