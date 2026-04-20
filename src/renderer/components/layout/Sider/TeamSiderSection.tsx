/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeleteOne, EditOne, Peoples, Plus, Pushpin } from '@icon-park/react';
import { Input, Message, Modal, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import { iconColors } from '@renderer/styles/colors';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { blurActiveElement } from '@renderer/utils/ui/focus';
import { useTeamList } from '@renderer/pages/team/hooks/useTeamList';
import { useSiderTeamBadges } from '@renderer/pages/team/hooks/useSiderTeamBadges';
import TeamCreateModal from '@renderer/pages/team/components/TeamCreateModal';
import { ipcBridge } from '@/common';
import SiderItem from './SiderItem';
import type { SiderMenuItem } from './SiderItem';

const TEAM_PINNED_KEY = 'team-pinned-ids';

type SiderTooltipProps = React.ComponentProps<typeof Tooltip>;

interface TeamSiderSectionProps {
  collapsed: boolean;
  pathname: string;
  siderTooltipProps: Partial<SiderTooltipProps>;
  onSessionClick?: () => void;
}

const TeamSiderSection: React.FC<TeamSiderSectionProps> = ({
  collapsed,
  pathname,
  siderTooltipProps,
  onSessionClick,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { teams, mutate: refreshTeams, removeTeam } = useTeamList();
  const teamBadgeCounts = useSiderTeamBadges(teams);
  const { mutate: globalMutate } = useSWRConfig();

  const [createTeamVisible, setCreateTeamVisible] = useState(false);

  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(TEAM_PINNED_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(TEAM_PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const [renameVisible, setRenameVisible] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameId || !renameName.trim()) return;
    setRenameLoading(true);
    try {
      await ipcBridge.team.renameTeam.invoke({ id: renameId, name: renameName.trim() });
      await refreshTeams();
      await globalMutate(`team/${renameId}`);
      Message.success(t('team.sider.renameSuccess'));
      setRenameVisible(false);
      setRenameId(null);
      setRenameName('');
    } catch (err) {
      console.error('Failed to rename team:', err);
      Message.error(t('team.sider.rename'));
    } finally {
      setRenameLoading(false);
    }
  }, [globalMutate, refreshTeams, renameId, renameName, t]);

  const sortedTeams = useMemo(() => {
    const pinned = teams.filter((team) => pinnedIds.includes(team.id));
    const unpinned = teams.filter((team) => !pinnedIds.includes(team.id));
    return [...pinned, ...unpinned];
  }, [teams, pinnedIds]);

  const handleTeamClick = useCallback(
    (teamId: string) => {
      cleanupSiderTooltips();
      blurActiveElement();
      Promise.resolve(navigate(`/team/${teamId}`)).catch(console.error);
      if (onSessionClick) onSessionClick();
    },
    [navigate, onSessionClick]
  );

  return (
    <>
      {collapsed ? (
        sortedTeams.length > 0 && (
          <div className='shrink-0 flex flex-col gap-2px'>
            {sortedTeams.map((team) => {
              const isActive = pathname.startsWith(`/team/${team.id}`);
              return (
                <Tooltip key={team.id} {...siderTooltipProps} content={team.name} position='right'>
                  <div
                    data-testid={`collapsed-team-item-${team.id}`}
                    className={classNames(
                      'relative w-full h-40px flex items-center justify-center cursor-pointer transition-colors rd-8px',
                      isActive ? '!bg-active' : 'hover:bg-fill-3 active:bg-fill-4'
                    )}
                    onClick={() => handleTeamClick(team.id)}
                  >
                    <Peoples
                      data-testid={`collapsed-team-icon-${team.id}`}
                      data-icon-fill={iconColors.primary}
                      theme='outline'
                      size='20'
                      fill={iconColors.primary}
                      style={{ lineHeight: 0 }}
                    />
                    {(teamBadgeCounts.get(team.id) ?? 0) > 0 && (
                      <span
                        className='absolute top-4px right-4px w-18px h-18px rounded-full text-10px font-bold flex items-center justify-center leading-none'
                        style={{ backgroundColor: '#F53F3F', color: '#fff', lineHeight: 1 }}
                      >
                        {(teamBadgeCounts.get(team.id) ?? 0) > 99 ? '99+' : teamBadgeCounts.get(team.id)}
                      </span>
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        )
      ) : (
        <div className='shrink-0 flex flex-col gap-2px mb-8px'>
          <div className='flex items-center justify-between px-12px py-8px'>
            <span className='text-13px text-t-secondary font-bold leading-20px'>{t('team.sider.title')}</span>
            <div
              className='h-20px w-20px rd-4px flex items-center justify-center cursor-pointer hover:bg-fill-3 transition-all shrink-0'
              onClick={() => setCreateTeamVisible(true)}
            >
              <Plus theme='outline' size='14' fill='var(--color-text-2)' style={{ lineHeight: 0 }} />
            </div>
          </div>
          {sortedTeams.length > 0 &&
            sortedTeams.map((team) => {
              const isPinned = pinnedIds.includes(team.id);
              const menuItems: SiderMenuItem[] = [
                {
                  key: 'pin',
                  icon: <Pushpin theme='outline' size='14' />,
                  label: isPinned ? t('team.sider.unpin') : t('team.sider.pin'),
                },
                {
                  key: 'rename',
                  icon: <EditOne theme='outline' size='14' />,
                  label: t('team.sider.rename'),
                },
                {
                  key: 'delete',
                  icon: <DeleteOne theme='outline' size='14' />,
                  label: t('team.sider.delete'),
                  danger: true,
                },
              ];
              const teamBadge = teamBadgeCounts.get(team.id) ?? 0;
              return (
                <div key={team.id} className='relative group'>
                  <SiderItem
                    icon={<Peoples theme='outline' size='20' fill={iconColors.primary} style={{ lineHeight: 0 }} />}
                    name={team.name}
                    selected={pathname.startsWith(`/team/${team.id}`)}
                    pinned={isPinned}
                    menuItems={menuItems}
                    onMenuAction={(key) => {
                      if (key === 'pin') {
                        togglePin(team.id);
                      } else if (key === 'rename') {
                        setRenameId(team.id);
                        setRenameName(team.name);
                        setRenameVisible(true);
                      } else if (key === 'delete') {
                        Modal.confirm({
                          title: t('team.sider.deleteConfirm'),
                          content: t('team.sider.deleteConfirmContent'),
                          okText: t('team.sider.deleteOk'),
                          cancelText: t('team.sider.deleteCancel'),
                          okButtonProps: { status: 'warning' },
                          onOk: async () => {
                            await removeTeam(team.id);
                            Message.success(t('team.sider.deleteSuccess'));
                            if (pathname.startsWith(`/team/${team.id}`)) {
                              Promise.resolve(navigate('/')).catch(() => {});
                            }
                          },
                          style: { borderRadius: '12px' },
                          alignCenter: true,
                          getPopupContainer: () => document.body,
                        });
                      }
                    }}
                    onClick={() => handleTeamClick(team.id)}
                  />
                  {teamBadge > 0 && (
                    <span
                      className='absolute right-11px top-1/2 -translate-y-1/2 w-18px h-18px rounded-full text-10px font-bold flex items-center justify-center pointer-events-none z-10 group-hover:hidden'
                      style={{ backgroundColor: '#F53F3F', color: '#fff', lineHeight: 1 }}
                    >
                      {teamBadge > 99 ? '99+' : teamBadge}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}
      <TeamCreateModal
        visible={createTeamVisible}
        onClose={() => setCreateTeamVisible(false)}
        onCreated={(team) => {
          void refreshTeams();
          Promise.resolve(navigate(`/team/${team.id}`)).catch(console.error);
        }}
      />
      <Modal
        title={t('team.sider.renameTitle')}
        visible={renameVisible}
        onOk={() => void handleRenameConfirm()}
        onCancel={() => {
          setRenameVisible(false);
          setRenameId(null);
          setRenameName('');
        }}
        okText={t('team.sider.renameOk')}
        cancelText={t('team.sider.renameCancel')}
        confirmLoading={renameLoading}
        okButtonProps={{ disabled: !renameName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameName}
          onChange={setRenameName}
          onPressEnter={() => void handleRenameConfirm()}
          placeholder={t('team.sider.renamePlaceholder')}
          allowClear
        />
      </Modal>
    </>
  );
};

export default TeamSiderSection;
