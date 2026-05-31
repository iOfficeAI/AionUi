import hotkeys, { type KeyHandler } from 'hotkeys-js';
import type { CommandContext } from '@/renderer/commands/types';
import type { EffectiveShortcutBinding } from './types';
import { toHotkeysPattern } from './accelerator';

type RegisterHotkeyBindingsParams = {
  bindings: EffectiveShortcutBinding[];
  context: CommandContext;
};

type RegisteredHotkeyBinding = {
  pattern: string;
  handler: KeyHandler;
};

const HOTKEYS_SCOPE = '__aionui_internal_global__';

let filterInstalled = false;
let activeRegistrationCount = 0;
let previousFilter: typeof hotkeys.filter | null = null;
let previousScope: string | null = null;

const installFilter = (): void => {
  if (filterInstalled) return;
  previousFilter = hotkeys.filter;
  previousScope = hotkeys.getScope();
  hotkeys.filter = (event) => {
    return !event.isComposing;
  };
  filterInstalled = true;
};

const uninstallFilter = (): void => {
  if (!filterInstalled) return;
  if (previousFilter) {
    hotkeys.filter = previousFilter;
  }
  if (previousScope) {
    hotkeys.setScope(previousScope);
  }
  previousFilter = null;
  previousScope = null;
  filterInstalled = false;
};

export const registerHotkeyBindings = ({ bindings, context }: RegisterHotkeyBindingsParams): (() => void) => {
  installFilter();
  activeRegistrationCount += 1;
  hotkeys.setScope(HOTKEYS_SCOPE);

  const registered: RegisteredHotkeyBinding[] = [];

  for (const binding of bindings) {
    const pattern = toHotkeysPattern(binding.accelerator);
    if (!pattern || !binding.command.run) continue;

    const handler: KeyHandler = (event) => {
      const command = binding.command;
      if (!command.run) return;
      if (event.defaultPrevented || event.isComposing) return;
      if (command.when && !command.when(context)) return;

      event.preventDefault();
      void command.run(context);
      return false;
    };

    hotkeys(pattern, { scope: HOTKEYS_SCOPE, keydown: true, keyup: false, capture: true }, handler);
    registered.push({ pattern, handler });
  }

  return () => {
    for (const binding of registered) {
      hotkeys.unbind(binding.pattern, HOTKEYS_SCOPE, binding.handler);
    }
    activeRegistrationCount = Math.max(0, activeRegistrationCount - 1);
    if (activeRegistrationCount === 0) {
      uninstallFilter();
    }
  };
};
