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
