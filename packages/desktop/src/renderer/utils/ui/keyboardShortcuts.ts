import { isMacOS } from '@/renderer/utils/platform';

const EMBEDDED_EDITOR_SELECTOR = ['.cm-editor', '.cm-content', '.monaco-editor', '.xterm', 'webview', 'iframe'].join(
  ','
);

const EDITABLE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
].join(',');

type PrimaryShortcutOptions = {
  key: string;
  shiftKey?: boolean;
  targetGuard?: 'all-editable' | 'embedded-editor';
};

/** Match the platform-native primary modifier without accepting mixed chords. */
export const isPlatformPrimaryModifier = (event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean => {
  return isMacOS() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
};

const isBlockingElement = (
  target: EventTarget | null,
  targetGuard: NonNullable<PrimaryShortcutOptions['targetGuard']>
): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest(EMBEDDED_EDITOR_SELECTOR)) {
    return true;
  }

  return targetGuard === 'all-editable' && Boolean(target.closest(EDITABLE_SELECTOR));
};

/**
 * Returns whether an application shortcut should yield to an editable or
 * embedded surface. The composed path covers editor content inside shadow DOM;
 * activeElement covers retargeted events from embedded surfaces.
 */
export const isShortcutBlockedByTarget = (
  event: KeyboardEvent,
  targetGuard: NonNullable<PrimaryShortcutOptions['targetGuard']> = 'all-editable'
): boolean => {
  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  if (eventPath.some((target) => isBlockingElement(target, targetGuard))) {
    return true;
  }

  return typeof document !== 'undefined' && isBlockingElement(document.activeElement, targetGuard);
};

/** Match an exact platform-native Cmd/Ctrl shortcut without consuming editor input. */
export const isPrimaryApplicationShortcut = (
  event: KeyboardEvent,
  { key, shiftKey = false, targetGuard = 'all-editable' }: PrimaryShortcutOptions
): boolean => {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey) {
    return false;
  }

  if (!isPlatformPrimaryModifier(event) || event.shiftKey !== shiftKey) {
    return false;
  }

  return event.key.toLowerCase() === key.toLowerCase() && !isShortcutBlockedByTarget(event, targetGuard);
};
