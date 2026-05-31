import { isMacOS } from '@/renderer/utils/platform';

export type NormalizedShortcut = {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
};

const MODIFIER_ORDER = ['Ctrl', 'Meta', 'Alt', 'Shift'] as const;

const KEY_ALIASES: Record<string, string> = {
  cmd: 'Meta',
  command: 'Meta',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  option: 'Alt',
  alt: 'Alt',
  shift: 'Shift',
  esc: 'Escape',
  escape: 'Escape',
  space: 'Space',
  tab: 'Tab',
  enter: 'Enter',
  return: 'Enter',
  plus: 'Plus',
  '+': 'Plus',
};

const HOTKEYS_KEY_ALIASES: Record<string, string> = {
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  Escape: 'esc',
  Plus: 'plus',
  Space: 'space',
};

const MODIFIER_EVENT_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift']);

const normalizeKeyToken = (key: string): string => {
  const trimmed = key.trim();
  const alias = KEY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  if (trimmed.length === 1) return trimmed.toLowerCase();
  return trimmed;
};

export const normalizeKeyboardEvent = (event: KeyboardEvent): NormalizedShortcut => {
  let key = event.key;
  if (key === 'ArrowDown' || key === 'Down') key = 'ArrowDown';
  if (key === 'ArrowLeft' || key === 'Left') key = 'ArrowLeft';
  if (key === 'ArrowRight' || key === 'Right') key = 'ArrowRight';
  if (key === 'ArrowUp' || key === 'Up') key = 'ArrowUp';
  if (key === ' ') key = 'Space';
  if (key === '+') key = 'Plus';
  if (key === '?' && event.shiftKey) key = '/';
  if (key === '_' && event.shiftKey) key = '-';
  if (key.length === 1) key = key.toLowerCase();
  return {
    key,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
};

export const acceleratorFromKeyboardEvent = (event: KeyboardEvent): string | null => {
  if (MODIFIER_EVENT_KEYS.has(event.key)) return null;

  const normalized = normalizeKeyboardEvent(event);
  if (!normalized.key) return null;

  const parts: string[] = [];
  if (normalized.ctrl && normalized.meta) {
    parts.push('Ctrl', 'Meta');
  } else if (normalized.ctrl || normalized.meta) {
    parts.push('CtrlOrCmd');
  }
  if (normalized.alt) parts.push('Alt');
  if (normalized.shift) parts.push('Shift');
  parts.push(normalized.key);
  return parts.join('+');
};

export const parseAccelerator = (accelerator: string): NormalizedShortcut | null => {
  const parts = accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const normalized: NormalizedShortcut = {
    key: '',
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
  };

  for (const rawPart of parts) {
    const part = normalizeKeyToken(rawPart);
    if (part === 'CtrlOrCmd') {
      if (isMacOS()) {
        normalized.meta = true;
      } else {
        normalized.ctrl = true;
      }
      continue;
    }
    if (part === 'Ctrl') {
      normalized.ctrl = true;
      continue;
    }
    if (part === 'Meta') {
      normalized.meta = true;
      continue;
    }
    if (part === 'Alt') {
      normalized.alt = true;
      continue;
    }
    if (part === 'Shift') {
      normalized.shift = true;
      continue;
    }
    if (normalized.key) {
      return null;
    }
    normalized.key = part;
  }

  return normalized.key ? normalized : null;
};

export const normalizeAccelerator = (accelerator: string): string | null => {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return null;
  const parts: string[] = [];
  for (const modifier of MODIFIER_ORDER) {
    const key = modifier.toLowerCase() as 'ctrl' | 'meta' | 'alt' | 'shift';
    if (parsed[key]) parts.push(modifier);
  }
  parts.push(parsed.key);
  return parts.join('+');
};

export const getAcceleratorDisplayParts = (accelerator: string | null): string[] => {
  if (!accelerator) return [];
  const isMac = isMacOS();
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'CtrlOrCmd') return isMac ? 'Cmd' : 'Ctrl';
      if (part === 'Meta') return isMac ? 'Cmd' : 'Meta';
      return part;
    })
    .filter(Boolean);
};

export const toHotkeysPattern = (accelerator: string): string | null => {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return null;

  const parts: string[] = [];
  if (parsed.ctrl && parsed.meta) {
    parts.push('ctrl', 'command');
  } else if (parsed.ctrl) {
    parts.push('ctrl');
  } else if (parsed.meta) {
    parts.push('command');
  }
  if (parsed.alt) parts.push('alt');
  if (parsed.shift) parts.push('shift');
  parts.push(HOTKEYS_KEY_ALIASES[parsed.key] ?? parsed.key.toLowerCase());
  return parts.join('+');
};

export const matchesAccelerator = (event: KeyboardEvent, accelerator: string): boolean => {
  const parsed = parseAccelerator(accelerator);
  if (!parsed) return false;
  const normalizedEvent = normalizeKeyboardEvent(event);
  return (
    parsed.key === normalizedEvent.key &&
    parsed.ctrl === normalizedEvent.ctrl &&
    parsed.meta === normalizedEvent.meta &&
    parsed.alt === normalizedEvent.alt &&
    parsed.shift === normalizedEvent.shift
  );
};

export const isEditableShortcutTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;

  const editableElement = target.closest(
    [
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[contenteditable="plaintext-only"]',
      '[contenteditable=""]',
      '.cm-editor',
      '.cm-content',
      '.monaco-editor',
      '.xterm',
      'webview',
      'iframe',
      '[data-shortcuts-scope="editor"]',
      '[data-shortcuts-scope="terminal"]',
      '[data-shortcuts-scope="webview"]',
    ].join(',')
  );

  return Boolean(editableElement);
};
