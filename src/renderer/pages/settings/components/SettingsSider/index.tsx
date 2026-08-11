import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { buildBuiltinSettingsNavItems, buildSettingsNavItems, isSettingsRouteActive } from './settingsNavigation';

export const isSettingsItemSelected = isSettingsRouteActive;

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

  const builtinItems = useMemo(() => buildBuiltinSettingsNavItems({ isDesktop, t }), [isDesktop, t]);
  const menus = useMemo(
    () =>
      buildSettingsNavItems({
        builtinItems,
        extensionTabs,
        resolveExtTabName,
      }),
    [builtinItems, extensionTabs, resolveExtTabName]
  );

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  return (
    <div
      className={classNames('flex-1 min-h-0 settings-sider flex flex-col gap-2px overflow-y-auto overflow-x-hidden', {
        'settings-sider--collapsed': collapsed,
      })}
    >
      {menus.map((item) => {
        const isSelected = isSettingsRouteActive(pathname, item.path);
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
              {item.iconUrl ? (
                <div className='mt-2px ml-2px mr-8px w-20px h-20px flex shrink-0 items-center justify-center'>
                  <img src={item.iconUrl} alt='' className='w-full h-full object-contain' />
                </div>
              ) : item.iconComponent ? (
                React.createElement(item.iconComponent, {
                  theme: 'outline',
                  size: '20',
                  strokeWidth: 3,
                  className: 'mt-2px ml-2px mr-8px flex text-t-secondary',
                })
              ) : null}
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
