import { configService } from '@/common/config/configService';
import { getBuiltinCommands } from '@/renderer/commands/registry';
import type { CommandContext } from '@/renderer/commands/types';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useNavigationHistory } from '@/renderer/hooks/context/NavigationHistoryContext';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { useVisibleConversationIds } from '@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds';
import { isElectronDesktop } from '@/renderer/utils/platform';
import {
  KEYBOARD_SHORTCUTS_CONFIG_KEY,
  getRegisterableShortcutBindings,
  getShortcutConflicts,
  normalizeKeyboardShortcutsConfig,
} from '@/renderer/shortcuts/shortcutRegistry';
import { registerHotkeyBindings } from '@/renderer/shortcuts/hotkeysAdapter';
import type { KeyboardShortcutsConfig } from '@/renderer/shortcuts/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

type UseGlobalShortcutsParams = {
  workspaceAvailable: boolean;
};

export const useGlobalShortcuts = ({ workspaceAvailable }: UseGlobalShortcutsParams): void => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastNonSettingsPathRef = useRef<string | null>(null);
  const visibleConversationIds = useVisibleConversationIds();
  const layout = useLayoutContext();
  const navigationHistory = useNavigationHistory();
  const { theme, setTheme } = useThemeContext();
  const commands = useMemo(() => getBuiltinCommands(), []);
  const [shortcutConfig, setShortcutConfig] = useState<KeyboardShortcutsConfig | null | undefined>(undefined);
  const locationContext = useMemo(
    () => ({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    }),
    [location.hash, location.pathname, location.search]
  );

  useEffect(() => {
    if (!location.pathname.startsWith('/settings')) {
      lastNonSettingsPathRef.current = `${location.pathname}${location.search}${location.hash}`;
    }
  }, [location.hash, location.pathname, location.search]);
  const visibleConversationIdsKey = visibleConversationIds.join('\0');
  const stableVisibleConversationIds = useMemo(
    () => visibleConversationIds,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleConversationIdsKey]
  );
  const layoutContext = useMemo(
    () =>
      layout
        ? {
            isMobile: layout.isMobile,
            siderCollapsed: layout.siderCollapsed,
            setSiderCollapsed: layout.setSiderCollapsed,
          }
        : null,
    [layout?.isMobile, layout?.setSiderCollapsed, layout?.siderCollapsed]
  );
  const navigationHistoryContext = useMemo(
    () =>
      navigationHistory
        ? {
            canBack: navigationHistory.canBack,
            canForward: navigationHistory.canForward,
            back: navigationHistory.back,
            forward: navigationHistory.forward,
          }
        : null,
    [navigationHistory?.back, navigationHistory?.canBack, navigationHistory?.canForward, navigationHistory?.forward]
  );

  useEffect(() => {
    let cancelled = false;
    void configService
      .whenReady()
      .then(() => {
        if (cancelled) return;
        const saved = configService.get(KEYBOARD_SHORTCUTS_CONFIG_KEY);
        setShortcutConfig(normalizeKeyboardShortcutsConfig(saved, commands).config);
      })
      .catch((error) => {
        console.warn('[shortcuts] Failed to load keyboard shortcut config:', error);
      });

    const unsubscribe = configService.subscribe(KEYBOARD_SHORTCUTS_CONFIG_KEY, (value) => {
      setShortcutConfig(normalizeKeyboardShortcutsConfig(value, commands).config);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [commands]);

  useEffect(() => {
    if (shortcutConfig === undefined) return;

    const conflicts = getShortcutConflicts(commands, shortcutConfig);
    for (const conflict of conflicts) {
      if (conflict.severity === 'error') {
        console.warn('[shortcuts] Conflict detected:', conflict);
      }
    }
  }, [commands, shortcutConfig]);

  useEffect(() => {
    if (!isElectronDesktop()) return;
    if (shortcutConfig === undefined) return;

    const ctx: CommandContext = {
      navigate,
      location: locationContext,
      visibleConversationIds: stableVisibleConversationIds,
      lastNonSettingsPath: lastNonSettingsPathRef.current,
      layout: layoutContext,
      navigationHistory: navigationHistoryContext,
      appearance: {
        theme,
        setTheme,
      },
      workspaceAvailable,
    };
    return registerHotkeyBindings({
      bindings: getRegisterableShortcutBindings(commands, shortcutConfig),
      context: ctx,
    });
  }, [
    commands,
    layoutContext,
    locationContext,
    navigate,
    navigationHistoryContext,
    setTheme,
    shortcutConfig,
    stableVisibleConversationIds,
    theme,
    workspaceAvailable,
  ]);
};
