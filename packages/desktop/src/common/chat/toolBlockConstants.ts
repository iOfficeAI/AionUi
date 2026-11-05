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
const READ_TOOL_NAMES = new Set([
  'read',
  'read_file',
  'readfile',
  'view_file',
  'viewfile',
  'read_multiple_files',
  'open_file',
]);
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
  /** i18n key for the block header title (fallback when no raw tool name). */
  titleKey: string;
}

export const TOOL_BLOCK_META: Record<ToolCategory, ToolBlockMeta> = {
  edit: { titleKey: 'messages.toolBlocks.editTitle' },
  bash: { titleKey: 'messages.toolBlocks.bashTitle' },
  read: { titleKey: 'messages.toolBlocks.readTitle' },
  search: { titleKey: 'messages.toolBlocks.searchTitle' },
  task: { titleKey: 'messages.toolBlocks.taskTitle' },
  todo: { titleKey: 'messages.toolBlocks.todoTitle' },
  generic: { titleKey: 'messages.toolBlocks.genericTitle' },
};

/** Known tool names -> a more specific title than the category default
 * (e.g. write/edit both map to category `edit` but show different actions).
 * Keys are lowercase; lookup via getToolTitleKey. */
const TOOL_NAME_TITLE_KEYS: Record<string, string> = {
  edit: 'messages.toolBlocks.editTitle',
  edit_file: 'messages.toolBlocks.editTitle',
  multi_edit: 'messages.toolBlocks.editTitle',
  replace: 'messages.toolBlocks.replaceString',
  replace_string: 'messages.toolBlocks.replaceString',
  write: 'messages.toolBlocks.writeFile',
  writefile: 'messages.toolBlocks.writeFile',
  write_to_file: 'messages.toolBlocks.writeFile',
  apply_patch: 'messages.toolBlocks.applyPatch',
  bash: 'messages.toolBlocks.bashTitle',
  run_terminal_cmd: 'messages.toolBlocks.bashTitle',
  shell_command: 'messages.toolBlocks.bashTitle',
  execute_command: 'messages.toolBlocks.executeCommand',
  executecommand: 'messages.toolBlocks.executeCommand',
  read: 'messages.toolBlocks.readTitle',
  read_file: 'messages.toolBlocks.readTitle',
  readfile: 'messages.toolBlocks.readTitle',
  view_file: 'messages.toolBlocks.readTitle',
  viewfile: 'messages.toolBlocks.readTitle',
  open_file: 'messages.toolBlocks.readTitle',
  read_multiple_files: 'messages.toolBlocks.readTitle',
  editfile: 'messages.toolBlocks.editTitle',
  writetofile: 'messages.toolBlocks.writeFile',
  runcommand: 'messages.toolBlocks.bashTitle',
  shellcommand: 'messages.toolBlocks.bashTitle',
  execute: 'messages.toolBlocks.bashTitle',
  terminal: 'messages.toolBlocks.bashTitle',
  grep: 'messages.toolBlocks.searchTitle',
  search: 'messages.toolBlocks.searchTitle',
  search_files: 'messages.toolBlocks.searchTitle',
  searchtext: 'messages.toolBlocks.searchTitle',
  codebase_search: 'messages.toolBlocks.searchTitle',
  glob: 'messages.toolBlocks.fileMatch',
  find: 'messages.toolBlocks.findFile',
  list: 'messages.toolBlocks.listFilesTitle',
  listdirectory: 'messages.toolBlocks.listFilesTitle',
  fetch: 'messages.toolBlocks.webFetch',
  webfetch: 'messages.toolBlocks.webFetch',
  web_search: 'messages.toolBlocks.webSearch',
  websearch: 'messages.toolBlocks.webSearch',
  googlewebsearch: 'messages.toolBlocks.webSearch',
  task: 'messages.toolBlocks.taskTitle',
  agent: 'messages.toolBlocks.taskTitle',
  todowrite: 'messages.toolBlocks.todoTitle',
  todo_write: 'messages.toolBlocks.todoTitle',
  update_plan: 'messages.toolBlocks.updatePlan',
  delete: 'messages.toolBlocks.deleteFile',
  deletefile: 'messages.toolBlocks.deleteFile',
  explore: 'messages.toolBlocks.exploreTitle',
  createdirectory: 'messages.toolBlocks.createDirectory',
  movefile: 'messages.toolBlocks.moveFile',
  copyfile: 'messages.toolBlocks.copyFile',
};

/** Case-insensitive tool name -> specific i18n title key; undefined for
 * unknown names (caller falls back to the category title or a prettified
 * raw name). */
export function getToolTitleKey(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return TOOL_NAME_TITLE_KEYS[name.toLowerCase()];
}
