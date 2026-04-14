import type { IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import {
  Api,
  Cat,
  Communication,
  Computer,
  Earth,
  Gemini,
  Info,
  Lightning,
  LinkCloud,
  Robot,
  System,
  Toolkit,
} from '@icon-park/react';
import type { TFunction } from 'i18next';
import React from 'react';

type SettingsIconComponent = React.ComponentType<{
  theme?: string;
  size?: string | number;
  className?: string;
  strokeWidth?: number;
}>;

type SettingsBuiltinDefinition = {
  id: string;
  path: string;
  labelKey: string;
  defaultValue?: string;
  resolveIcon: (isDesktop: boolean) => SettingsIconComponent;
};

export type SettingsNavItem = {
  id: string;
  label: string;
  path: string;
  iconComponent?: SettingsIconComponent;
  iconUrl?: string;
};

export type SettingsRouteDefinition = {
  id: string;
  path: string;
  component: React.LazyExoticComponent<React.ComponentType>;
};

export const DEFAULT_SETTINGS_ROUTE = 'gemini';
export const EMBEDDED_SETTINGS_EXTENSION_NAMES = new Set(['api-diagnostics-devtools']);
export const LEGACY_SETTINGS_ANCHOR_REMAP: Record<string, string> = {
  'skills-hub': 'capabilities',
  tools: 'capabilities',
};

const SETTINGS_BUILTIN_DEFINITIONS: SettingsBuiltinDefinition[] = [
  {
    id: 'gemini',
    path: 'gemini',
    labelKey: 'settings.gemini',
    resolveIcon: () => Gemini,
  },
  {
    id: 'model',
    path: 'model',
    labelKey: 'settings.model',
    resolveIcon: () => LinkCloud,
  },
  {
    id: 'assistants',
    path: 'assistants',
    labelKey: 'settings.assistants',
    defaultValue: 'Assistants',
    resolveIcon: () => Robot,
  },
  {
    id: 'agent',
    path: 'agent',
    labelKey: 'settings.agents',
    defaultValue: 'Agents',
    resolveIcon: () => Toolkit,
  },
  {
    id: 'capabilities',
    path: 'capabilities',
    labelKey: 'settings.capabilities',
    defaultValue: 'Capabilities',
    resolveIcon: () => Lightning,
  },
  {
    id: 'display',
    path: 'display',
    labelKey: 'settings.display',
    resolveIcon: () => Computer,
  },
  {
    id: 'webui',
    path: 'webui',
    labelKey: 'settings.webui',
    resolveIcon: (isDesktop) => (isDesktop ? Earth : Communication),
  },
  {
    id: 'api',
    path: 'api',
    labelKey: 'settings.api',
    resolveIcon: () => Api,
  },
  {
    id: 'pet',
    path: 'pet',
    labelKey: 'pet.desktopPet',
    resolveIcon: () => Cat,
  },
  {
    id: 'system',
    path: 'system',
    labelKey: 'settings.system',
    resolveIcon: () => System,
  },
  {
    id: 'about',
    path: 'about',
    labelKey: 'settings.about',
    resolveIcon: () => Info,
  },
];

const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const CapabilitiesSettings = React.lazy(() => import('@renderer/pages/settings/CapabilitiesSettings'));
const DisplaySettings = React.lazy(() => import('@renderer/pages/settings/DisplaySettings'));
const GeminiSettings = React.lazy(() => import('@renderer/pages/settings/GeminiSettings'));
const ModeSettings = React.lazy(() => import('@renderer/pages/settings/ModeSettings'));
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const PetSettings = React.lazy(() => import('@renderer/pages/settings/PetSettings'));
const ApiSettingsPage = React.lazy(
  () => import('@renderer/components/settings/SettingsModal/contents/ApiSettingsContent/ApiSettingsPage')
);

export const SETTINGS_ROUTE_DEFINITIONS: SettingsRouteDefinition[] = [
  { id: 'gemini', path: 'gemini', component: GeminiSettings },
  { id: 'model', path: 'model', component: ModeSettings },
  { id: 'assistants', path: 'assistants', component: AssistantSettings },
  { id: 'agent', path: 'agent', component: AgentSettings },
  { id: 'capabilities', path: 'capabilities', component: CapabilitiesSettings },
  { id: 'display', path: 'display', component: DisplaySettings },
  { id: 'webui', path: 'webui', component: WebuiSettings },
  { id: 'api', path: 'api', component: ApiSettingsPage },
  { id: 'pet', path: 'pet', component: PetSettings },
  { id: 'system', path: 'system', component: SystemSettings },
  { id: 'about', path: 'about', component: SystemSettings },
];

export const isSettingsRouteActive = (pathname: string, itemPath: string): boolean => {
  const targetPath = `/settings/${itemPath}`;
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
};

export const buildBuiltinSettingsNavItems = ({
  isDesktop,
  t,
}: {
  isDesktop: boolean;
  t: TFunction;
}): SettingsNavItem[] =>
  SETTINGS_BUILTIN_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.defaultValue
      ? t(definition.labelKey, { defaultValue: definition.defaultValue })
      : t(definition.labelKey),
    path: definition.path,
    iconComponent: definition.resolveIcon(isDesktop),
  }));

const toExtensionNavItem = (
  tab: IExtensionSettingsTab,
  resolveExtTabName: (tab: IExtensionSettingsTab) => string
): SettingsNavItem => ({
  id: tab.id,
  label: resolveExtTabName(tab),
  path: `ext/${tab.id}`,
  iconUrl: resolveExtensionAssetUrl(tab.icon) || tab.icon,
});

export const buildSettingsNavItems = ({
  builtinItems,
  extensionTabs,
  resolveExtTabName,
}: {
  builtinItems: SettingsNavItem[];
  extensionTabs: IExtensionSettingsTab[];
  resolveExtTabName: (tab: IExtensionSettingsTab) => string;
}): SettingsNavItem[] => {
  const result = [...builtinItems];
  const beforeMap = new Map<string, IExtensionSettingsTab[]>();
  const afterMap = new Map<string, IExtensionSettingsTab[]>();
  const unanchored: IExtensionSettingsTab[] = [];

  for (const tab of extensionTabs.filter((item) => !EMBEDDED_SETTINGS_EXTENSION_NAMES.has(item._extensionName))) {
    if (!tab.position) {
      unanchored.push(tab);
      continue;
    }

    const anchor = LEGACY_SETTINGS_ANCHOR_REMAP[tab.position.anchor] ?? tab.position.anchor;
    const map = tab.position.placement === 'before' ? beforeMap : afterMap;
    let list = map.get(anchor);
    if (!list) {
      list = [];
      map.set(anchor, list);
    }
    list.push(tab);
  }

  for (let index = result.length - 1; index >= 0; index--) {
    const builtinId = result[index].id;
    const afterTabs = afterMap.get(builtinId);
    if (afterTabs) {
      result.splice(index + 1, 0, ...afterTabs.map((tab) => toExtensionNavItem(tab, resolveExtTabName)));
    }

    const beforeTabs = beforeMap.get(builtinId);
    if (beforeTabs) {
      result.splice(index, 0, ...beforeTabs.map((tab) => toExtensionNavItem(tab, resolveExtTabName)));
    }
  }

  if (unanchored.length > 0) {
    const systemIndex = result.findIndex((item) => item.id === 'system');
    const insertIndex = systemIndex >= 0 ? systemIndex : result.length;
    result.splice(insertIndex, 0, ...unanchored.map((tab) => toExtensionNavItem(tab, resolveExtTabName)));
  }

  return result;
};
