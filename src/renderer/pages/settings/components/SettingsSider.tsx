import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import {
  Communication,
  Computer,
  Earth,
  Gemini,
  Info,
  Lightning,
  LinkCloud,
  Puzzle,
  Robot,
  System,
  Toolkit,
} from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@arco-design/web-react';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

/** Builtin settings tab IDs in display order (must match router paths). */
const BUILTIN_TAB_IDS = [
  'gemini',
  'model',
  'agent',
  'skills-hub',
  'tools',
  'display',
  'webui',
  'system',
  'about',
] as const;

type SiderItem = {
  id: string;
  label: string;
  icon: React.ReactElement;
  isImageIcon?: boolean;
  /** Route path segment — for builtins: `/settings/{path}`, for extensions: `/settings/ext/{id}` */
  path: string;
};

const SettingsSider: React.FC<{ collapsed?: boolean; tooltipEnabled?: boolean }> = ({
  collapsed = false,
  tooltipEnabled = false,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isDesktop = isElectronDesktop();

  const [extensionTabs, setExtensionTabs] = useState<IExtensionSettingsTab[]>([]);
  const { resolveExtTabName } = useExtI18n();

  const loadExtensionTabs = useCallback(async (): Promise<IExtensionSettingsTab[]> => {
    const maxAttempts = 20;
    const retryDelayCapMs = 300;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const tabs = (await extensionsIpc.getSettingsTabs.invoke()) ?? [];
        if (tabs.length > 0 || attempt === maxAttempts - 1) {
          return tabs;
        }
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts - 1) {
          throw error;
        }
      }

      await new Promise((resolve) => window.setTimeout(resolve, Math.min(100 * (attempt + 1), retryDelayCapMs)));
    }

    if (lastError) {
      throw lastError;
    }

    return [];
  }, []);

  useEffect(() => {
    let disposed = false;

    const syncExtensionTabs = async () => {
      try {
        const tabs = await loadExtensionTabs();
        if (!disposed) {
          setExtensionTabs(tabs);
        }
      } catch (err) {
        if (!disposed) {
          console.error('[SettingsSider] Failed to load extension settings tabs:', err);
        }
      }
    };

    void syncExtensionTabs();
    const unsubscribe = extensionsIpc.stateChanged.on(() => {
      void syncExtensionTabs();
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [loadExtensionTabs]);

  const menus: SiderItem[] = useMemo(() => {
    // Build builtin items
    const builtinMap: Record<string, SiderItem> = {
      gemini: { id: 'gemini', label: t('settings.gemini'), icon: <Gemini />, path: 'gemini' },
      model: { id: 'model', label: t('settings.model'), icon: <LinkCloud />, path: 'model' },
      agent: {
        id: 'agent',
        label: t('settings.assistants', { defaultValue: 'Assistants' }),
        icon: <Robot />,
        path: 'agent',
      },
      'skills-hub': {
        id: 'skills-hub',
        label: t('settings.skillsHub.title', { defaultValue: 'Skills Hub' }),
        icon: <Lightning />,
        path: 'skills-hub',
      },
      tools: { id: 'tools', label: t('settings.tools'), icon: <Toolkit />, path: 'tools' },
      display: { id: 'display', label: t('settings.display'), icon: <Computer />, path: 'display' },
      webui: {
        id: 'webui',
        label: t('settings.webui'),
        icon: isDesktop ? <Earth /> : <Communication />,
        path: 'webui',
      },
      system: { id: 'system', label: t('settings.system'), icon: <System />, path: 'system' },
      about: { id: 'about', label: t('settings.about'), icon: <Info />, path: 'about' },
    };

    // Start with ordered builtin IDs
    const result: SiderItem[] = BUILTIN_TAB_IDS.map((id) => builtinMap[id]);

    // Extension tabs with position anchoring
    const beforeMap = new Map<string, IExtensionSettingsTab[]>();
    const afterMap = new Map<string, IExtensionSettingsTab[]>();
    const unanchored: IExtensionSettingsTab[] = [];

    for (const tab of extensionTabs) {
      if (!tab.position) {
        unanchored.push(tab);
        continue;
      }
      const { anchor, placement } = tab.position;
      const map = placement === 'before' ? beforeMap : afterMap;
      let list = map.get(anchor);
      if (!list) {
        list = [];
        map.set(anchor, list);
      }
      list.push(tab);
    }

    // Helper to create SiderItem from extension tab
    const toSiderItem = (tab: IExtensionSettingsTab): SiderItem => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      return {
        id: tab.id,
        label: resolveExtTabName(tab),
        icon: resolvedIcon ? <img src={resolvedIcon} alt='' className='w-full h-full object-contain' /> : <Puzzle />,
        isImageIcon: Boolean(resolvedIcon),
        path: `ext/${tab.id}`,
      };
    };

    // Insert anchored tabs (reverse iteration to preserve indices)
    for (let i = result.length - 1; i >= 0; i--) {
      const builtinId = result[i].id;
      const afters = afterMap.get(builtinId);
      if (afters) {
        result.splice(i + 1, 0, ...afters.map(toSiderItem));
      }
      const befores = beforeMap.get(builtinId);
      if (befores) {
        result.splice(i, 0, ...befores.map(toSiderItem));
      }
    }

    // Append unanchored before "system"
    if (unanchored.length > 0) {
      const systemIdx = result.findIndex((item) => item.id === 'system');
      const insertIdx = systemIdx >= 0 ? systemIdx : result.length;
      result.splice(insertIdx, 0, ...unanchored.map(toSiderItem));
    }

    return result;
  }, [t, isDesktop, extensionTabs, resolveExtTabName]);

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  return (
    <div
      className={classNames('flex-1 min-h-0 settings-sider flex flex-col gap-2px overflow-y-auto overflow-x-hidden', {
        'settings-sider--collapsed': collapsed,
      })}
    >
      {menus.map((item) => {
        const isSelected = pathname.includes(item.path);
        return (
          <Tooltip key={item.id} {...siderTooltipProps} content={item.label} position='right'>
            <div
              data-settings-id={item.id}
              data-settings-path={item.path}
              className={classNames(
                'settings-sider__item hover:bg-aou-1 px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden group shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px',
                {
                  '!bg-aou-2 ': isSelected,
                }
              )}
              onClick={() => {
                Promise.resolve(navigate(`/settings/${item.path}`, { replace: true })).catch((error) => {
                  console.error('Navigation failed:', error);
                });
              }}
            >
              {item.isImageIcon ? (
                <div className='mt-2px ml-2px mr-8px w-20px h-20px flex shrink-0 items-center justify-center'>
                  {item.icon}
                </div>
              ) : (
                React.cloneElement(
                  item.icon as React.ReactElement<{
                    theme?: string;
                    size?: string | number;
                    className?: string;
                    strokeWidth?: number;
                  }>,
                  {
                    theme: 'outline',
                    size: '20',
                    strokeWidth: 3,
                    className: 'mt-2px ml-2px mr-8px flex text-t-secondary',
                  }
                )
              )}
              <FlexFullContainer className='h-24px'>
                <div className='settings-sider__item-label text-nowrap overflow-hidden inline-block w-full text-14px lh-24px whitespace-nowrap text-t-primary'>
                  {item.label}
                </div>
              </FlexFullContainer>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

export default SettingsSider;
