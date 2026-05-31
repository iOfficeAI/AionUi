import type { NavigateFunction } from 'react-router-dom';
import type { LayoutContextValue } from '@/renderer/hooks/context/LayoutContext';
import type { Theme } from '@/renderer/hooks/system/useTheme';

export type CommandCategory = 'app' | 'conversation' | 'navigation' | 'workspace' | 'preview' | 'developer' | 'team';

export type CommandRisk = 'normal' | 'destructive' | 'confirmRequired' | 'developerOnly';

export type CommandScope = 'app' | 'route' | 'component' | 'mainProcess' | 'existingLocal';

export type CommandStatus = 'enabled' | 'reserved' | 'existing';

export type CommandContext = {
  navigate: NavigateFunction;
  location: {
    pathname: string;
    search: string;
    hash: string;
  };
  visibleConversationIds: string[];
  lastNonSettingsPath: string | null;
  layout: LayoutContextValue | null;
  navigationHistory: {
    canBack: boolean;
    canForward: boolean;
    back: () => void;
    forward: () => void;
  } | null;
  appearance: {
    theme: Theme;
    setTheme: (theme: Theme) => Promise<void>;
  };
  workspaceAvailable: boolean;
};

export type CommandDefinition = {
  id: string;
  titleKey: string;
  defaultTitle: string;
  category: CommandCategory;
  scope: CommandScope;
  risk: CommandRisk;
  status: CommandStatus;
  defaultShortcut?: string | null;
  allowInEditable?: boolean;
  reservedReason?: string;
  when?: (ctx: CommandContext) => boolean;
  run?: (ctx: CommandContext) => void | Promise<void>;
};
