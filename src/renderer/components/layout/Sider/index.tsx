import { DeleteOne, EditOne, Peoples, Plus, Pushpin } from '@icon-park/react';
import { Input, Message, Modal, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { iconColors } from '@renderer/styles/colors';
import { usePreviewContext } from '@renderer/pages/conversation/Preview/context/PreviewContext';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { blurActiveElement } from '@renderer/utils/ui/focus';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import { useAllCronJobs } from '@renderer/pages/cron/useCronJobs';
import { useTeamList } from '@renderer/pages/team/hooks/useTeamList';
import { useSWRConfig } from 'swr';
import TeamCreateModal from '@renderer/pages/team/components/TeamCreateModal';
import { ipcBridge } from '@/common';
import SiderItem from './SiderItem';
import type { SiderMenuItem } from './SiderItem';
import SiderToolbar from './SiderToolbar';
import SiderSearchEntry from './SiderSearchEntry';
import SiderScheduledEntry from './SiderScheduledEntry';
import SiderFooter from './SiderFooter';
import CronJobSiderSection from './CronJobSiderSection';

const TEAM_PINNED_KEY = 'team-pinned-ids';

const WorkspaceGroupedHistory = React.lazy(() => import('@renderer/pages/conversation/GroupedHistory'));
const SettingsSider = React.lazy(() => import('@renderer/pages/settings/components/SettingsSider'));

interface SiderProps {
  onSessionClick?: () => void;
  collapsed?: boolean;
}

const Sider: React.FC<SiderProps> = ({ onSessionClick, collapsed = false }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const location = useLocation();
  const { pathname, search, hash } = location;

  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closePreview } = usePreviewContext();
  const { theme, setTheme } = useThemeContext();
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [createTeamVisible, setCreateTeamVisible] = useState(false);
  const { teams, mutate: refreshTeams, removeTeam } = useTeamList();
  const { mutate: globalMutate } = useSWRConfig();

  // Pin state
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

  // Rename state
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
  }, [renameId, renameName, refreshTeams, t]);

  // Sorted teams: pinned first
  const sortedTeams = useMemo(() => {
    const pinned = teams.filter((team) => pinnedIds.includes(team.id));
    const unpinned = teams.filter((team) => !pinnedIds.includes(team.id));
    return [...pinned, ...unpinned];
  }, [teams, pinnedIds]);
  const { jobs: cronJobs } = useAllCronJobs();
  const isSettings = pathname.startsWith('/settings');
  const lastNonSettingsPathRef = useRef('/guid');

  useEffect(() => {
    if (!pathname.startsWith('/settings')) {
      lastNonSettingsPathRef.current = `${pathname}${search}${hash}`;
    }
  }, [pathname, search, hash]);

  const handleNewChat = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    setIsBatchMode(false);
    Promise.resolve(navigate('/guid')).catch((error) => {
      console.error('Navigation failed:', error);
    });
    if (onSessionClick) {
      onSessionClick();
    }
  };

  const handleSettingsClick = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    if (isSettings) {
      const target = lastNonSettingsPathRef.current || '/guid';
      Promise.resolve(navigate(target)).catch((error) => {
        console.error('Navigation failed:', error);
      });
    } else {
      Promise.resolve(navigate('/settings/gemini')).catch((error) => {
        console.error('Navigation failed:', error);
      });
    }
    if (onSessionClick) {
      onSessionClick();
    }
  };

  const handleConversationSelect = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    setIsBatchMode(false);
  };

  const handleScheduledClick = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    setIsBatchMode(false);
    Promise.resolve(navigate('/scheduled')).catch((error) => {
      console.error('Navigation failed:', error);
    });
    if (onSessionClick) {
      onSessionClick();
    }
  };

  const handleQuickThemeToggle = () => {
    void setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleCronNavigate = (path: string) => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    Promise.resolve(navigate(path)).catch(console.error);
    if (onSessionClick) onSessionClick();
  };

  const tooltipEnabled = collapsed && !isMobile;
  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);

  const workspaceHistoryProps = {
    collapsed,
    tooltipEnabled,
    onSessionClick,
    batchMode: isBatchMode,
    onBatchModeChange: setIsBatchMode,
  };

  return (
    <div className='size-full flex flex-col'>
      {/* Main content area */}
      <div className='flex-1 min-h-0 overflow-hidden'>
        {isSettings ? (
          <Suspense fallback={<div className='size-full' />}>
            <SettingsSider collapsed={collapsed} tooltipEnabled={tooltipEnabled} />
          </Suspense>
        ) : (
          <div className='size-full flex flex-col'>
            <SiderToolbar
              isMobile={isMobile}
              isBatchMode={isBatchMode}
              collapsed={collapsed}
              siderTooltipProps={siderTooltipProps}
              onNewChat={handleNewChat}
              onToggleBatchMode={() => setIsBatchMode((prev) => !prev)}
            />
            {/* Search entry */}
            <SiderSearchEntry
              isMobile={isMobile}
              collapsed={collapsed}
              siderTooltipProps={siderTooltipProps}
              onConversationSelect={handleConversationSelect}
              onSessionClick={onSessionClick}
            />
            {/* Scheduled tasks nav entry - fixed above scroll */}
            <SiderScheduledEntry
              isMobile={isMobile}
              isActive={pathname === '/scheduled'}
              collapsed={collapsed}
              siderTooltipProps={siderTooltipProps}
              onClick={handleScheduledClick}
            />
            {/* Scrollable content: team + scheduled tasks + conversation history */}
            <div className='flex-1 min-h-0 overflow-y-auto'>
              {/* Team section */}
              {collapsed ? (
                sortedTeams.length > 0 && (
                  <div className='shrink-0 mb-4px'>
                    {sortedTeams.map((team) => {
                      const isActive = pathname.startsWith(`/team/${team.id}`);
                      return (
                        <Tooltip key={team.id} {...siderTooltipProps} content={team.name} position='right'>
                          <div
                            className={classNames(
                              'w-full py-6px flex items-center justify-center cursor-pointer transition-colors rd-8px',
                              isActive
                                ? 'bg-[rgba(var(--primary-6),0.12)] text-primary'
                                : 'hover:bg-fill-3 active:bg-fill-4'
                            )}
                            onClick={() => {
                              cleanupSiderTooltips();
                              blurActiveElement();
                              Promise.resolve(navigate(`/team/${team.id}`)).catch(console.error);
                              if (onSessionClick) onSessionClick();
                            }}
                          >
                            <Peoples
                              theme='outline'
                              size='20'
                              fill={isActive ? 'rgb(var(--primary-6))' : iconColors.primary}
                              style={{ lineHeight: 0 }}
                            />
                          </div>
                        </Tooltip>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className='shrink-0 mb-4px'>
                  <div className='flex items-center justify-between px-12px py-8px'>
                    <span className='text-13px text-t-secondary font-bold leading-20px'>{t('team.sider.title')}</span>
                    <div
                      className='h-20px w-20px rd-4px flex items-center justify-center cursor-pointer hover:bg-fill-3 transition-all shrink-0'
                      onClick={() => setCreateTeamVisible(true)}
                    >
                      <Plus theme='outline' size='14' fill='var(--color-text-2)' />
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
                      return (
                        <SiderItem
                          key={team.id}
                          icon={
                            <Peoples theme='outline' size='20' fill={iconColors.primary} style={{ lineHeight: 0 }} />
                          }
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
                          onClick={() => {
                            cleanupSiderTooltips();
                            blurActiveElement();
                            Promise.resolve(navigate(`/team/${team.id}`)).catch(console.error);
                            if (onSessionClick) onSessionClick();
                          }}
                        />
                      );
                    })}
                </div>
              )}
              {/* Scheduled section */}
              {!collapsed && (
                <CronJobSiderSection jobs={cronJobs} pathname={pathname} onNavigate={handleCronNavigate} />
              )}
              <Suspense fallback={<div className='min-h-200px' />}>
                <WorkspaceGroupedHistory {...workspaceHistoryProps} />
              </Suspense>
            </div>
          </div>
        )}
      </div>
      {/* Footer */}
      <SiderFooter
        isMobile={isMobile}
        isSettings={isSettings}
        theme={theme}
        siderTooltipProps={siderTooltipProps}
        onSettingsClick={handleSettingsClick}
        onThemeToggle={handleQuickThemeToggle}
      />
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
    </div>
  );
};

export default Sider;
