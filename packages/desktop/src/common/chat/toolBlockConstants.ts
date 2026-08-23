/** Category of a tool call, deciding which ToolBlock component renders it and
 * how consecutive blocks aggregate in the group view. */
export type ToolCategory = 'edit' | 'bash' | 'read' | 'search' | 'task' | 'todo' | 'generic';

const EDIT_TOOL_NAMES = new Set([
  'edit',
  'edit_file',
  'replace',
  'replace_string',
  'write_to_file',
  'writefile',
  'write',
  'apply_patch',
  'multi_edit',
]);
const BASH_TOOL_NAMES = new Set([
  'bash',
  'run_terminal_cmd',
  'execute_command',
  'shell_command',
  'shellcommand',
  'execute',
  'run_command',
  'runcommand',
  'terminal',
]);
const READ_TOOL_NAMES = new Set(['read', 'read_file', 'view_file', 'viewfile', 'read_multiple_files', 'open_file']);
const SEARCH_TOOL_NAMES = new Set([
  'search',
  'grep',
  'glob',
  'find',
  'web_search',
  'websearch',
  'fetch',
  'search_files',
  'codebase_search',
]);
const TASK_TOOL_NAMES = new Set(['task', 'agent', 'dispatch_agent', 'subagent']);
const TODO_TOOL_NAMES = new Set(['todowrite', 'todo_write']);

const CATEGORY_SETS: Array<[Set<string>, ToolCategory]> = [
  [EDIT_TOOL_NAMES, 'edit'],
  [BASH_TOOL_NAMES, 'bash'],
  [READ_TOOL_NAMES, 'read'],
  [SEARCH_TOOL_NAMES, 'search'],
  [TASK_TOOL_NAMES, 'task'],
  [TODO_TOOL_NAMES, 'todo'],
];

/** Case-insensitive tool-name -> category. Unknown names fall back to `generic`
 * so new agents' tools always have a render path. */
export function categorizeToolName(name: string | undefined): ToolCategory {
  if (!name) return 'generic';
  const lower = name.toLowerCase();
  for (const [set, category] of CATEGORY_SETS) {
    if (set.has(lower)) return category;
  }
  return 'generic';
}

/** ACP `update.kind` -> category (backend already normalizes the kind). */
export function mapAcpKindToCategory(kind: string | undefined): ToolCategory {
  switch (kind) {
    case 'read':
      return 'read';
    case 'edit':
    case 'write':
      return 'edit';
    case 'execute':
      return 'bash';
    case 'search':
    case 'grep':
    case 'glob':
    case 'fetch':
      return 'search';
    default:
      return 'generic';
  }
}

export interface ToolBlockMeta {
  /** i18n key for the block header title. */
  titleKey: string;
  /** Icon-park icon name rendered inside the colored square. */
  icon: string;
}

export const TOOL_BLOCK_META: Record<ToolCategory, ToolBlockMeta> = {
  edit: { titleKey: 'messages.toolBlocks.editTitle', icon: 'Edit' },
  bash: { titleKey: 'messages.toolBlocks.bashTitle', icon: 'Terminal' },
  read: { titleKey: 'messages.toolBlocks.readTitle', icon: 'File' },
  search: { titleKey: 'messages.toolBlocks.searchTitle', icon: 'Search' },
  task: { titleKey: 'messages.toolBlocks.taskTitle', icon: 'Setting' },
  todo: { titleKey: 'messages.toolBlocks.todoTitle', icon: 'CheckList' },
  generic: { titleKey: 'messages.toolBlocks.genericTitle', icon: 'Toolbox' },
};
