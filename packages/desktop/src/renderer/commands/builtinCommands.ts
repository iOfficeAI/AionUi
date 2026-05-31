import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import {
  dispatchChatAttachFileEvent,
  dispatchChatOpenModelSelectorEvent,
  dispatchChatSelectWorkspaceEvent,
  dispatchCommandPaletteOpenEvent,
} from '@/renderer/utils/chat/chatShortcutEvents';
import { dispatchTeamCreateEvent, dispatchTeamSwitchEvent } from '@/renderer/utils/team/teamShortcutEvents';
import {
  dispatchWorkspaceChangesEvent,
  dispatchWorkspaceExpandEvent,
  dispatchWorkspaceOpenFolderEvent,
  dispatchWorkspaceSearchEvent,
  dispatchWorkspaceToggleEvent,
} from '@/renderer/utils/workspace/workspaceEvents';
import type { CommandContext, CommandDefinition } from './types';

const getCurrentConversationId = (pathname: string): string | null =>
  pathname.match(/^\/conversation\/([^/]+)/)?.[1] ?? null;

const getCycledConversationId = (
  visibleConversationIds: string[],
  activeConversationId: string | null,
  direction: 1 | -1
): string | null => {
  if (visibleConversationIds.length < 2 || !activeConversationId) {
    return null;
  }

  const activeIndex = visibleConversationIds.findIndex((conversationId) => conversationId === activeConversationId);
  if (activeIndex === -1) {
    return null;
  }

  const nextIndex = (activeIndex + direction + visibleConversationIds.length) % visibleConversationIds.length;
  return visibleConversationIds[nextIndex] ?? null;
};

const isConversationOrTeamRoute = (ctx: CommandContext): boolean =>
  ctx.location.pathname.startsWith('/conversation/') ||
  (TEAM_MODE_ENABLED && ctx.location.pathname.startsWith('/team/'));

const getSettingsReturnPath = (ctx: CommandContext): string => {
  if (ctx.lastNonSettingsPath) {
    return ctx.lastNonSettingsPath;
  }
  const recentConversationId = ctx.visibleConversationIds[0];
  return recentConversationId ? `/conversation/${recentConversationId}` : '/guid';
};

export const builtinCommands: CommandDefinition[] = [
  {
    id: 'conversation.new',
    titleKey: 'settings.keyboardShortcuts.commands.conversationNew',
    defaultTitle: 'New conversation',
    category: 'conversation',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+T',
    run: ({ navigate }) => {
      void navigate('/guid');
    },
  },
  {
    id: 'conversation.selectWorkspace',
    titleKey: 'settings.keyboardShortcuts.commands.conversationSelectWorkspace',
    defaultTitle: 'Select conversation workspace',
    category: 'conversation',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+O',
    allowInEditable: true,
    run: ({ location, navigate }) => {
      if (getCurrentConversationId(location.pathname)) {
        dispatchChatSelectWorkspaceEvent();
        return;
      }
      void navigate('/guid');
    },
  },
  {
    id: 'conversation.nextVisible',
    titleKey: 'settings.keyboardShortcuts.commands.conversationNextVisible',
    defaultTitle: 'Next visible conversation',
    category: 'conversation',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'Ctrl+Tab',
    when: ({ location, visibleConversationIds }) =>
      Boolean(getCycledConversationId(visibleConversationIds, getCurrentConversationId(location.pathname), 1)),
    run: ({ location, navigate, visibleConversationIds }) => {
      const targetConversationId = getCycledConversationId(
        visibleConversationIds,
        getCurrentConversationId(location.pathname),
        1
      );
      if (targetConversationId) {
        void navigate(`/conversation/${targetConversationId}`);
      }
    },
  },
  {
    id: 'conversation.previousVisible',
    titleKey: 'settings.keyboardShortcuts.commands.conversationPreviousVisible',
    defaultTitle: 'Previous visible conversation',
    category: 'conversation',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'Ctrl+Shift+Tab',
    when: ({ location, visibleConversationIds }) =>
      Boolean(getCycledConversationId(visibleConversationIds, getCurrentConversationId(location.pathname), -1)),
    run: ({ location, navigate, visibleConversationIds }) => {
      const targetConversationId = getCycledConversationId(
        visibleConversationIds,
        getCurrentConversationId(location.pathname),
        -1
      );
      if (targetConversationId) {
        void navigate(`/conversation/${targetConversationId}`);
      }
    },
  },
  {
    id: 'app.openSettings',
    titleKey: 'settings.keyboardShortcuts.commands.appOpenSettings',
    defaultTitle: 'Toggle settings',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+,',
    run: (ctx) => {
      if (ctx.location.pathname.startsWith('/settings')) {
        void ctx.navigate(getSettingsReturnPath(ctx));
        return;
      }
      void ctx.navigate('/settings/agent');
    },
  },
  {
    id: 'model.openSettings',
    titleKey: 'settings.keyboardShortcuts.commands.modelOpenSettings',
    defaultTitle: 'Open model settings',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'Ctrl+Alt+N',
    allowInEditable: true,
    run: ({ navigate }) => {
      void navigate('/settings/model');
    },
  },
  {
    id: 'app.toggleSidebar',
    titleKey: 'settings.keyboardShortcuts.commands.appToggleSidebar',
    defaultTitle: 'Toggle sidebar',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+B',
    when: ({ layout }) => Boolean(layout?.setSiderCollapsed),
    run: ({ layout }) => {
      if (!layout?.setSiderCollapsed) return;
      layout.setSiderCollapsed(!layout.siderCollapsed);
    },
  },
  {
    id: 'appearance.toggleTheme',
    titleKey: 'settings.keyboardShortcuts.commands.appearanceToggleTheme',
    defaultTitle: 'Toggle light/dark theme',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+Shift+T',
    run: ({ appearance }) => {
      void appearance.setTheme(appearance.theme === 'dark' ? 'light' : 'dark');
    },
  },
  {
    id: 'capabilities.openMcpTools',
    titleKey: 'settings.keyboardShortcuts.commands.capabilitiesOpenMcpTools',
    defaultTitle: 'Open MCP tools settings',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+;',
    allowInEditable: true,
    run: ({ navigate }) => {
      void navigate('/settings/capabilities?tab=tools');
    },
  },
  {
    id: 'chat.attachFile',
    titleKey: 'settings.keyboardShortcuts.commands.chatAttachFile',
    defaultTitle: 'Attach file',
    category: 'conversation',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+U',
    allowInEditable: true,
    when: (ctx) => isConversationOrTeamRoute(ctx),
    run: () => {
      dispatchChatAttachFileEvent();
    },
  },
  {
    id: 'chat.openModelSelector',
    titleKey: 'settings.keyboardShortcuts.commands.chatOpenModelSelector',
    defaultTitle: 'Open chat model selector',
    category: 'conversation',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+Shift+M',
    allowInEditable: true,
    when: (ctx) => isConversationOrTeamRoute(ctx),
    run: () => {
      dispatchChatOpenModelSelectorEvent();
    },
  },
  {
    id: 'input.toggleDictation',
    titleKey: 'settings.keyboardShortcuts.commands.inputToggleDictation',
    defaultTitle: 'Toggle dictation',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+Shift+D',
    run: () => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent('aionui:speech-input-toggle'));
    },
  },
  {
    id: 'commandPalette.open',
    titleKey: 'settings.keyboardShortcuts.commands.commandPaletteOpen',
    defaultTitle: 'Open command palette',
    category: 'conversation',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+Shift+P',
    when: (ctx) => isConversationOrTeamRoute(ctx),
    run: () => {
      dispatchCommandPaletteOpenEvent();
    },
  },
  {
    id: 'capabilities.openSkills',
    titleKey: 'settings.keyboardShortcuts.commands.capabilitiesOpenSkills',
    defaultTitle: 'Open skills settings',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: null,
    run: ({ navigate }) => {
      void navigate('/settings/capabilities?tab=skills');
    },
  },
  {
    id: 'automation.openScheduledTasks',
    titleKey: 'settings.keyboardShortcuts.commands.automationOpenScheduledTasks',
    defaultTitle: 'Open scheduled tasks',
    category: 'app',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: null,
    run: ({ navigate }) => {
      void navigate('/scheduled');
    },
  },
  {
    id: 'navigation.back',
    titleKey: 'settings.keyboardShortcuts.commands.navigationBack',
    defaultTitle: 'Back',
    category: 'navigation',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+[',
    when: ({ navigationHistory }) => Boolean(navigationHistory?.canBack),
    run: ({ navigationHistory }) => {
      navigationHistory?.back();
    },
  },
  {
    id: 'navigation.forward',
    titleKey: 'settings.keyboardShortcuts.commands.navigationForward',
    defaultTitle: 'Forward',
    category: 'navigation',
    scope: 'app',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+]',
    when: ({ navigationHistory }) => Boolean(navigationHistory?.canForward),
    run: ({ navigationHistory }) => {
      navigationHistory?.forward();
    },
  },
  {
    id: 'workspace.searchFiles',
    titleKey: 'settings.keyboardShortcuts.commands.workspaceSearchFiles',
    defaultTitle: 'Search workspace files',
    category: 'workspace',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+P',
    when: (ctx) => ctx.workspaceAvailable && isConversationOrTeamRoute(ctx),
    run: (ctx) => {
      if (ctx.workspaceAvailable) {
        dispatchWorkspaceExpandEvent();
        dispatchWorkspaceSearchEvent();
      }
    },
  },
  {
    id: 'workspace.openChanges',
    titleKey: 'settings.keyboardShortcuts.commands.workspaceOpenChanges',
    defaultTitle: 'Open workspace changes',
    category: 'workspace',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: null,
    when: (ctx) => ctx.workspaceAvailable && isConversationOrTeamRoute(ctx),
    run: (ctx) => {
      if (ctx.workspaceAvailable) {
        dispatchWorkspaceExpandEvent();
        dispatchWorkspaceChangesEvent();
      }
    },
  },
  {
    id: 'workspace.openFolder',
    titleKey: 'settings.keyboardShortcuts.commands.workspaceOpenFolder',
    defaultTitle: 'Open workspace in file manager',
    category: 'workspace',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'Ctrl+Alt+W',
    allowInEditable: true,
    when: (ctx) => ctx.workspaceAvailable && isConversationOrTeamRoute(ctx),
    run: (ctx) => {
      if (ctx.workspaceAvailable) {
        dispatchWorkspaceExpandEvent();
        dispatchWorkspaceOpenFolderEvent();
      }
    },
  },
  {
    id: 'workspace.togglePanel',
    titleKey: 'settings.keyboardShortcuts.commands.workspaceTogglePanel',
    defaultTitle: 'Toggle workspace panel',
    category: 'workspace',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'CtrlOrCmd+Shift+E',
    when: (ctx) => ctx.workspaceAvailable && isConversationOrTeamRoute(ctx),
    run: (ctx) => {
      if (ctx.workspaceAvailable) {
        dispatchWorkspaceToggleEvent();
      }
    },
  },
  {
    id: 'team.switch',
    titleKey: 'settings.keyboardShortcuts.commands.teamSwitch',
    defaultTitle: 'Switch team',
    category: 'team',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'Ctrl+G',
    when: () => TEAM_MODE_ENABLED,
    run: () => {
      dispatchTeamSwitchEvent();
    },
  },
  {
    id: 'team.create',
    titleKey: 'settings.keyboardShortcuts.commands.teamCreate',
    defaultTitle: 'Create team',
    category: 'team',
    scope: 'route',
    risk: 'normal',
    status: 'enabled',
    defaultShortcut: 'Ctrl+Shift+W',
    allowInEditable: true,
    when: () => TEAM_MODE_ENABLED,
    run: () => {
      dispatchTeamCreateEvent();
    },
  },
  {
    id: 'conversation.findCurrent',
    titleKey: 'settings.keyboardShortcuts.commands.conversationFindCurrent',
    defaultTitle: 'Find in current conversation',
    category: 'conversation',
    scope: 'existingLocal',
    risk: 'normal',
    status: 'existing',
    defaultShortcut: 'CtrlOrCmd+F',
    reservedReason: 'Handled by ConversationTitleMinimap capture listener; not migrated in V1.',
  },
  {
    id: 'conversation.searchAll',
    titleKey: 'settings.keyboardShortcuts.commands.conversationSearchAll',
    defaultTitle: 'Search all conversations',
    category: 'conversation',
    scope: 'existingLocal',
    risk: 'normal',
    status: 'existing',
    defaultShortcut: 'CtrlOrCmd+Shift+F',
    reservedReason: 'Handled by ConversationSearchPopover capture listener; not migrated in V1.',
  },
  {
    id: 'app.zoomIn',
    titleKey: 'settings.keyboardShortcuts.commands.appZoomIn',
    defaultTitle: 'Zoom in',
    category: 'app',
    scope: 'mainProcess',
    risk: 'normal',
    status: 'reserved',
    defaultShortcut: 'CtrlOrCmd+=',
    reservedReason: 'Owned by Electron main process before-input-event zoom handling.',
  },
  {
    id: 'app.zoomOut',
    titleKey: 'settings.keyboardShortcuts.commands.appZoomOut',
    defaultTitle: 'Zoom out',
    category: 'app',
    scope: 'mainProcess',
    risk: 'normal',
    status: 'reserved',
    defaultShortcut: 'CtrlOrCmd+-',
    reservedReason: 'Owned by Electron main process before-input-event zoom handling.',
  },
  {
    id: 'app.zoomReset',
    titleKey: 'settings.keyboardShortcuts.commands.appZoomReset',
    defaultTitle: 'Reset zoom',
    category: 'app',
    scope: 'mainProcess',
    risk: 'normal',
    status: 'reserved',
    defaultShortcut: 'CtrlOrCmd+0',
    reservedReason: 'Owned by Electron main process before-input-event zoom handling.',
  },
];
