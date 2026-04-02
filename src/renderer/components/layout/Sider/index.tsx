import { Delete, Peoples } from '@icon-park/react';
import { Popconfirm } from '@arco-design/web-react';
import React, { Suspense, useEffect, useRef, useState } from 'react';
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
import TeamCreateModal from '@renderer/pages/team/components/TeamCreateModal';
import SiderToolbar from './SiderToolbar';
import SiderSearchEntry from './SiderSearchEntry';
import SiderScheduledEntry from './SiderScheduledEntry';
import SiderFooter from './SiderFooter';
import CronJobSiderSection from './CronJobSiderSection';

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
  const [teamSectionCollapsed, setTeamSectionCollapsed] = useState(false);
  const { teams, mutate: refreshTeams, removeTeam } = useTeamList();
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
              {!collapsed && (
                <div className='shrink-0 mb-4px'>
                  <div
                    className='flex items-center justify-between px-12px py-8px cursor-pointer group'
                    onClick={() => setTeamSectionCollapsed((prev) => !prev)}
                  >
                    <span className='text-13px text-t-secondary font-bold leading-20px'>
                      {t('team.sider.title', { defaultValue: '群聊' })}
                    </span>
                    <div
                      className='h-20px w-20px rd-4px flex items-center justify-center cursor-pointer hover:bg-fill-3 transition-all shrink-0'
                      onClick={(e) => {
                        e.stopPropagation();
                        setCreateTeamVisible(true);
                      }}
                    >
                      <Peoples
                        theme='outline'
                        size='14'
                        fill='var(--color-text-2)'
                        className='block leading-none'
                        style={{ lineHeight: 0 }}
                      />
                    </div>
                  </div>
                  {!teamSectionCollapsed &&
                    teams.length > 0 &&
                    teams.map((team) => (
                      <div
                        key={team.id}
                        className='py-8px flex items-center px-12px rd-8px cursor-pointer hover:bg-hover group relative overflow-hidden shrink-0'
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
                          fill={iconColors.primary}
                          className='block leading-none shrink-0'
                          style={{ lineHeight: 0 }}
                        />
                        <span className='text-t-primary text-14px truncate flex-1 ml-10px'>{team.name}</span>
                        <Popconfirm
                          title={t('team.deleteConfirm', { defaultValue: 'Delete this team?' })}
                          onOk={async (e) => {
                            e?.stopPropagation();
                            await removeTeam(team.id);
                            if (pathname.startsWith(`/team/${team.id}`)) {
                              Promise.resolve(navigate('/')).catch(() => {});
                            }
                          }}
                          onCancel={(e) => e?.stopPropagation()}
                        >
                          <div
                            className='opacity-0 group-hover:opacity-100 shrink-0 p-2px rd-4px hover:bg-fill-3'
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Delete theme='outline' size='14' fill='var(--color-text-3)' />
                          </div>
                        </Popconfirm>
                      </div>
                    ))}
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
    </div>
  );
};

export default Sider;
