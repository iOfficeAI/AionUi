import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import {
  Cat,
  Communication,
  Computer,
  Earth,
  Gemini,
  Info,
  Lightning,
  LinkCloud,
  Puzzle,
  Robot,
  Speed,
  System,
} from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@arco-design/web-react';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

/** Builtin settings tab IDs in display order (must match router paths). */
export const BUILTIN_TAB_IDS = [
  'gemini',
  'agent',
  'model',
  'assistants',
  'capabilities',
  'display',
  'webui',
  'pet',
  'system',
  'about',
] as const;

/**
 * Legacy anchor IDs that have been merged into other tabs.
 * When an extension anchors to one of these, it is redirected to the new host.
 * This keeps older extensions working without requiring them to update.
 */
export const LEGACY_ANCHOR_REMAP: Record<string, string> = {
  'skills-hub': 'capabilities',
  tools: 'capabilities',
};

/**
 * Group headers displayed above specific builtin tabs.
 * The header is rendered once, immediately before the first item whose id matches.
 * Extension tabs anchored between these builtins inherit the enclosing group visually.
 */
const GROUP_HEADER_BEFORE: Record<string, string> = {
  gemini: 'settings.groupAiCore',
  display: 'settings.groupApp',
  about: 'settings.groupAbout',
};

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

  const { menus, groupHeaderAt } = useMemo(() => {
    // Build builtin items
    const builtinMap: Record<string, SiderItem> = {
      gemini: { id: 'gemini', label: t('settings.gemini'), icon: <Gemini />, path: 'gemini' },
      model: { id: 'model', label: t('settings.model'), icon: <LinkCloud />, path: 'model' },
      assistants: {
        id: 'assistants',
        label: t('settings.assistants', { defaultValue: 'Assistants' }),
        icon: <Robot />,
        path: 'assistants',
      },
      agent: {
        id: 'agent',
        label: t('settings.agents', { defaultValue: 'Agents' }),
        icon: <Speed />,
        path: 'agent',
      },
      capabilities: {
        id: 'capabilities',
        label: t('settings.capabilities', { defaultValue: 'Capabilities' }),
        icon: <Lightning />,
        path: 'capabilities',
      },
      display: { id: 'display', label: t('settings.display'), icon: <Computer />, path: 'display' },
      webui: {
        id: 'webui',
        label: t('settings.webui'),
        icon: isDesktop ? <Earth /> : <Communication />,
        path: 'webui',
      },
      pet: { id: 'pet', label: t('pet.desktopPet'), icon: <Cat />, path: 'pet' },
      system: { id: 'system', label: t('settings.system'), icon: <System />, path: 'system' },
      about: { id: 'about', label: t('settings.about'), icon: <Info />, path: 'about' },
    };

    // Start with ordered builtin IDs, hiding desktop-only tabs in browser mode
    const result: SiderItem[] = BUILTIN_TAB_IDS.filter((id) => isDesktop || id !== 'pet').map((id) => builtinMap[id]);

    // Extension tabs with position anchoring
    const beforeMap = new Map<string, IExtensionSettingsTab[]>();
    const afterMap = new Map<string, IExtensionSettingsTab[]>();
    const unanchored: IExtensionSettingsTab[] = [];

    for (const tab of extensionTabs) {
      if (!tab.position) {
        unanchored.push(tab);
        continue;
      }
      const { anchor: rawAnchor, placement } = tab.position;
      const anchor = LEGACY_ANCHOR_REMAP[rawAnchor] ?? rawAnchor;
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

    // Compute group header render positions.
    //
    // A header must appear before the first *visible* item of its group, which may
    // be an extension tab anchored with placement='before' to the group's first
    // builtin — not the builtin itself. Otherwise such an extension would render
    // above the header and visually belong to the previous group.
    const headerAt = new Map<number, string>();
    for (const [builtinId, headerKey] of Object.entries(GROUP_HEADER_BEFORE)) {
      const builtinIdx = result.findIndex((item) => item.id === builtinId);
      if (builtinIdx < 0) continue;
      const beforeCount = beforeMap.get(builtinId)?.length ?? 0;
      headerAt.set(builtinIdx - beforeCount, headerKey);
    }

    return { menus: result, groupHeaderAt: headerAt };
  }, [t, isDesktop, extensionTabs, resolveExtTabName]);

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  return (
    <div
      className={classNames('h-full settings-sider flex flex-col gap-2px overflow-y-auto overflow-x-hidden', {
        'settings-sider--collapsed': collapsed,
      })}
    >
      {menus.map((item, index) => {
        const isSelected = pathname.includes(item.path);
        const groupHeaderKey = groupHeaderAt.get(index);
        const groupHeader =
          groupHeaderKey && !collapsed ? (
            <div className='settings-sider__group-header px-10px pt-12px pb-4px text-11px font-medium text-t-tertiary uppercase tracking-wider select-none'>
              {t(groupHeaderKey)}
            </div>
          ) : null;
        return (
          <React.Fragment key={item.id}>
            {groupHeader}
            <Tooltip {...siderTooltipProps} content={item.label} position='right'>
              <div
                data-settings-id={item.id}
                data-settings-path={item.path}
                className={classNames(
                  'settings-sider__item h-40px rd-8px flex items-center gap-8px group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px transition-colors',
                  collapsed ? 'w-full justify-center px-0' : 'justify-start px-10px',
                  {
                    'hover:bg-[rgba(var(--primary-6),0.14)]': !isSelected,
                    '!bg-active': isSelected,
                  }
                )}
                onClick={() => {
                  Promise.resolve(navigate(`/settings/${item.path}`, { replace: true })).catch((error) => {
                    console.error('Navigation failed:', error);
                  });
                }}
              >
                {/* Leading icon — fixed 28px column to align with main sider rows */}
                <span className='w-28px h-28px flex items-center justify-center shrink-0'>
                  {item.isImageIcon ? (
                    <span className='w-18px h-18px flex items-center justify-center'>{item.icon}</span>
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
                        className: 'block leading-none text-t-secondary',
                      }
                    )
                  )}
                </span>
                <FlexFullContainer className='h-24px collapsed-hidden'>
                  <div
                    className={classNames(
                      'settings-sider__item-label text-nowrap overflow-hidden inline-block w-full text-14px lh-24px whitespace-nowrap',
                      isSelected ? 'text-t-primary font-medium' : 'text-t-primary'
                    )}
                  >
                    {item.label}
                  </div>
                </FlexFullContainer>
              </div>
            </Tooltip>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default SettingsSider;
