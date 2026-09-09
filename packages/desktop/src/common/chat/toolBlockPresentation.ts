/** Display-only helpers for tool blocks. Pure functions, no React. */

export function relativizePath(path: string | undefined, workspaceRoot: string | undefined): string | undefined {
  if (!path) return undefined;
  if (workspaceRoot) {
    const root = workspaceRoot.endsWith('/') ? workspaceRoot : workspaceRoot + '/';
    if (path.startsWith(root)) return path.slice(root.length);
    if (path === workspaceRoot) return '.';
  }
  return path.split(/[/\\]/).pop() || path;
}

export function truncate(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined;
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

export function buildLineRangeLabel(start: number | undefined, end: number | undefined): string | undefined {
  if (start === undefined) return undefined;
  if (end === undefined || end === start) return `L${start}`;
  return `L${start}-${end}`;
}

export function diffCountLabel(
  diff: { added: number; removed: number } | undefined
): { added: string; removed: string } | undefined {
  if (!diff || (diff.added === 0 && diff.removed === 0)) return undefined;
  return { added: `+${diff.added}`, removed: `-${diff.removed}` };
}

/** Humanize an unknown tool name for the block header: snake_case ->
 * "Mcp Search Docs", CamelCase -> "Web Search". Natural-language titles
 * (ACP descriptions, lowercase names) pass through unchanged. */
export function prettifyToolName(name: string): string {
  if (name.includes('_')) {
    return name
      .split('_')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  if (/^[A-Z]/.test(name)) {
    return name.replace(/([A-Z])/g, ' $1').trim();
  }
  return name;
}

export type BashCommandKind = 'read' | 'list' | 'search' | 'run';

const READ_COMMAND = /^(cat|head|tail|less|more|nl|bat)\b/;
const SED_PRINT = /^sed\s+-n\b/;
const LIST_COMMAND = /^(ls|tree|find)\b|^git\s+ls-(files|tree)\b/;
const SEARCH_COMMAND = /^(grep|rg|ag|ack)\b|^git\s+grep\b/;

const unwrapShellCommand = (command: string): string => {
  let current = command.trim();
  const wrapper = current.match(/^\/bin\/(?:zsh|bash|sh)\s+(?:-lc|-c)\s+([\s\S]+)$/);
  if (wrapper)
    current = wrapper[1]
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/'\\''/g, "'");
  return current;
};

const stripQuotes = (token: string) => token.replace(/^['"]|['"]$/g, '');

const firstPathToken = (line: string): string | undefined => {
  const tokens = line.split(/\s+/);
  const skip = tokens[0] === 'git' ? 2 : 1;
  for (const token of tokens.slice(skip)) {
    if (token.startsWith('-')) continue;
    return stripQuotes(token);
  }
  return undefined;
};

const sedPath = (line: string): string | undefined => {
  const match = line.match(/^sed\s+-n\s+\S+\s+(\S+)$/);
  return match ? stripQuotes(match[1]) : undefined;
};

/** Classify a shell command by what it actually does (read/list/search/run)
 * so generic command tools can show a precise action title and target path. */
export function classifyBashCommand(command: string | undefined): { kind: BashCommandKind; path?: string } {
  if (!command) return { kind: 'run' };
  const first = unwrapShellCommand(command).split('\n')[0].trim();
  const lower = first.toLowerCase();
  if (SED_PRINT.test(lower)) return { kind: 'read', path: sedPath(first) };
  if (READ_COMMAND.test(lower)) return { kind: 'read', path: firstPathToken(first) };
  if (LIST_COMMAND.test(lower)) return { kind: 'list', path: firstPathToken(first) };
  if (SEARCH_COMMAND.test(lower)) return { kind: 'search' };
  return { kind: 'run' };
}

/** Per-tool icon kinds, mirroring the reference icon map: write gets a
 * pencil, glob a folder, web fetch a globe, delete a trash bin... */
export type ToolIconKey =
  | 'read'
  | 'edit'
  | 'write'
  | 'bash'
  | 'search'
  | 'glob'
  | 'task'
  | 'web'
  | 'delete'
  | 'plan'
  | 'generic';

const TOOL_NAME_ICON_KEYS: Record<string, ToolIconKey> = {
  read: 'read',
  read_file: 'read',
  readfile: 'read',
  view_file: 'read',
  viewfile: 'read',
  open_file: 'read',
  read_multiple_files: 'read',
  edit: 'edit',
  edit_file: 'edit',
  editfile: 'edit',
  multi_edit: 'edit',
  replace: 'edit',
  replace_string: 'edit',
  apply_patch: 'edit',
  write: 'write',
  writefile: 'write',
  write_to_file: 'write',
  writetofile: 'write',
  bash: 'bash',
  run_terminal_cmd: 'bash',
  runcommand: 'bash',
  shell_command: 'bash',
  shellcommand: 'bash',
  execute: 'bash',
  terminal: 'bash',
  execute_command: 'bash',
  executecommand: 'bash',
  grep: 'search',
  search: 'search',
  search_files: 'search',
  searchtext: 'search',
  codebase_search: 'search',
  websearch: 'search',
  web_search: 'search',
  googlewebsearch: 'search',
  glob: 'glob',
  list: 'glob',
  listdirectory: 'glob',
  find: 'search',
  fetch: 'web',
  webfetch: 'web',
  task: 'task',
  agent: 'task',
  todowrite: 'plan',
  todo_write: 'plan',
  update_plan: 'plan',
  delete: 'delete',
  deletefile: 'delete',
};

/** Tool name (+ optional command for command tools) -> icon kind. Passing a
 * command refines command-family tools by what the command does, matching the
 * reference getToolCodicon; dedicated bash blocks simply omit the command. */
export function getToolIconKey(name: string | undefined, command?: string): ToolIconKey {
  const nameKey = name ? TOOL_NAME_ICON_KEYS[name.toLowerCase()] : undefined;
  if (command && nameKey === 'bash') {
    const kind = classifyBashCommand(command).kind;
    if (kind === 'read') return 'read';
    if (kind === 'list') return 'glob';
    if (kind === 'search') return 'search';
  }
  return nameKey ?? 'generic';
}
