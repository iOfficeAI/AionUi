import type { SlashCommandItem } from '@/common/chat/slash/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * The value currently in the text field the event fired on, or null when the
 * event carries no such target. This is the authoritative, synchronous input
 * text — unlike the controlled `input` prop, which updates a render later and
 * can lag a fast keystroke.
 */
function readInputValue(event: ReactKeyboardEvent): string | null {
  const target = event.currentTarget as { value?: unknown } | null;
  return target && typeof target.value === 'string' ? target.value : null;
}

// Match slash followed by command name (alphanumeric, underscore, hyphen only)
// 匹配斜杠后跟命令名（仅允许字母数字、下划线、连字符）
const SLASH_QUERY_RE = /^\/([a-zA-Z0-9_-]*)$/;

export function matchSlashQuery(input: string): string | null {
  const match = input.match(SLASH_QUERY_RE);
  return match ? match[1] : null;
}

export interface ActiveItemScrollInput {
  containerScrollTop: number;
  containerHeight: number;
  itemOffsetTop: number;
  itemOffsetHeight: number;
}

export function getScrollTopForActiveItem(input: ActiveItemScrollInput): number {
  const { containerScrollTop, containerHeight, itemOffsetTop, itemOffsetHeight } = input;
  if (containerHeight <= 0) {
    return containerScrollTop;
  }

  const viewportTop = containerScrollTop;
  const viewportBottom = containerScrollTop + containerHeight;
  const itemTop = itemOffsetTop;
  const itemBottom = itemOffsetTop + itemOffsetHeight;

  if (itemTop < viewportTop) {
    return itemTop;
  }
  if (itemBottom > viewportBottom) {
    return itemBottom - containerHeight;
  }
  return containerScrollTop;
}

export function getFuzzyMatchIndices(value: string, query: string): number[] | null {
  const keyword = query.trim();
  if (!keyword) {
    return [];
  }

  const valueLower = value.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  const startIndex = valueLower.indexOf(keywordLower);
  if (startIndex < 0) {
    return null;
  }

  return Array.from({ length: keywordLower.length }, (_item, index) => startIndex + index);
}

export function filterSlashCommands(commands: SlashCommandItem[], query: string): SlashCommandItem[] {
  const keyword = query.trim();
  if (!keyword) {
    return commands;
  }

  return commands.filter((command) => getFuzzyMatchIndices(command.name, keyword) !== null);
}

function getSelectionBehavior(command: SlashCommandItem): 'execute' | 'insert' {
  if (command.selectionBehavior) {
    return command.selectionBehavior;
  }
  return command.kind === 'builtin' ? 'execute' : 'insert';
}

interface UseSlashCommandControllerOptions {
  input: string;
  commands: SlashCommandItem[];
  onExecuteBuiltin?: (name: string) => void;
  onSelectTemplate?: (name: string) => void;
}

export function useSlashCommandController(options: UseSlashCommandControllerOptions) {
  const { input, commands, onExecuteBuiltin, onSelectTemplate } = options;
  const query = useMemo(() => matchSlashQuery(input), [input]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Reset state only when query changes, not when commands array updates.
  // This prevents dropdown from reopening when ACP dynamically adds commands
  // while the user is typing.
  useEffect(() => {
    setActiveIndex(0);
    setDismissed(false);
  }, [query]);

  const filteredCommands = useMemo(() => {
    if (query === null) {
      return [];
    }
    return filterSlashCommands(commands, query);
  }, [commands, query]);

  const isOpen = query !== null && !dismissed && filteredCommands.length > 0;

  // Latest values mirrored into refs so the keydown handler can decide from a
  // freshly-computed command list (see onKeyDown) without depending on the
  // possibly-stale closure captured at render time.
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const dismissedRef = useRef(dismissed);
  dismissedRef.current = dismissed;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  const executeFromList = useCallback(
    (list: SlashCommandItem[], index: number) => {
      const command = list[index];
      if (!command) {
        return false;
      }
      if (getSelectionBehavior(command) === 'insert') {
        onSelectTemplate?.(command.name);
      } else if (command.kind === 'builtin') {
        onExecuteBuiltin?.(command.name);
      } else {
        onSelectTemplate?.(command.name);
      }
      setDismissed(true);
      return true;
    },
    [onExecuteBuiltin, onSelectTemplate]
  );

  const executeCommand = useCallback(
    (index: number) => executeFromList(filteredCommands, index),
    [executeFromList, filteredCommands]
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      // Enter and Tab both accept the active command, matching the @-mention
      // dropdown (see resolveAtFileMenuKey). Shift+Enter inserts a newline, so it
      // must not accept; Tab always does.
      const isAccept = (event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab';
      if (isAccept) {
        // Resolve the menu from the live DOM value, NOT the memoized isOpen /
        // filteredCommands. The textarea is controlled by an async `input` prop,
        // so on fast typing the keystroke can land before React re-renders this
        // hook with the latest text; the captured state would then be stale and
        // let the raw "/command" text send instead of selecting the command.
        const liveValue = readInputValue(event) ?? input;
        const liveQuery = matchSlashQuery(liveValue);
        if (liveQuery === null || dismissedRef.current) {
          return false;
        }
        const liveFiltered = filterSlashCommands(commandsRef.current, liveQuery);
        if (liveFiltered.length === 0) {
          return false;
        }
        event.preventDefault();
        const index = Math.min(activeIndexRef.current, liveFiltered.length - 1);
        return executeFromList(liveFiltered, index);
      }

      // Navigation and dismissal only act on a menu that is actually open. A
      // stale-closed isOpen here is harmless: these keys never send a message.
      if (!isOpen) {
        return false;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(true);
        return true;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filteredCommands.length);
        return true;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return true;
      }

      return false;
    },
    [executeFromList, filteredCommands.length, input, isOpen]
  );

  return {
    query,
    isOpen,
    activeIndex,
    filteredCommands,
    onKeyDown,
    onSelectByIndex: executeCommand,
    setDismissed,
    setActiveIndex,
  };
}
