import type { HookInfo } from './AssistantManagement/types';

export const filterHooksByQuery = (hooks: HookInfo[], query: string): HookInfo[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return hooks;
  }

  return hooks.filter((hook) => {
    const searchableParts = [hook.name, hook.description || '', hook.location];
    return searchableParts.some((part) => part.toLowerCase().includes(normalizedQuery));
  });
};

export const summarizeHookLibrary = (hooks: HookInfo[]) => {
  const customCount = hooks.filter((hook) => hook.isCustom).length;
  return {
    total: hooks.length,
    custom: customCount,
    builtin: hooks.length - customCount,
  };
};
