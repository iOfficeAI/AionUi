import type { UnifiedToolBlock } from './unifiedToolBlock';

export interface ParentPartition {
  /** Flat-flow blocks (subagent steps removed, orphans re-inserted at original index). */
  rootBlocks: UnifiedToolBlock[];
  /** parentCallId -> child steps, only for parents present in rootBlocks. */
  childrenByParent: Map<string, UnifiedToolBlock[]>;
}

/** Split subagent steps (parent_call_id set) from the flat flow. Pure recompute
 * per render, so late-arriving parents re-group naturally. Orphan children
 * (parent never arrives) degrade back into the flat flow at their position. */
export function partitionByParent(blocks: UnifiedToolBlock[]): ParentPartition {
  const parentKeys = new Set(blocks.filter((b) => b.parentCallId === undefined).map((b) => b.key));
  const childrenByParent = new Map<string, UnifiedToolBlock[]>();
  const rootBlocks: UnifiedToolBlock[] = [];
  for (const block of blocks) {
    const parent = block.parentCallId;
    if (parent && parentKeys.has(parent)) {
      const list = childrenByParent.get(parent);
      if (list) list.push(block);
      else childrenByParent.set(parent, [block]);
    } else {
      rootBlocks.push(block);
    }
  }
  return { rootBlocks, childrenByParent };
}

export type ToolSegment =
  | { kind: 'single'; block: UnifiedToolBlock }
  | { kind: 'list'; blocks: UnifiedToolBlock[] }
  | { kind: 'bash-timeline'; blocks: UnifiedToolBlock[] }
  | { kind: 'todo'; blocks: UnifiedToolBlock[]; latest: UnifiedToolBlock; updateCount: number };

const LIST_CATEGORIES = new Set(['read', 'edit', 'search']);

/** Aggregate consecutive same-category root blocks into segments. List
 * segments hold ONE category so the header names the actual action. */
export function groupIntoSegments(blocks: UnifiedToolBlock[]): ToolSegment[] {
  const segments: ToolSegment[] = [];
  const pushSegment = (kind: ToolSegment['kind'], members: UnifiedToolBlock[]) => {
    if (members.length === 0) return;
    if (members.length === 1) {
      segments.push({ kind: 'single', block: members[0] });
      return;
    }
    if (kind === 'bash-timeline') segments.push({ kind, blocks: members });
    else if (kind === 'todo')
      segments.push({ kind, blocks: members, latest: members[members.length - 1], updateCount: members.length });
    else segments.push({ kind: 'list', blocks: members });
  };

  let currentKind: ToolSegment['kind'] | null = null;
  let currentCategory: UnifiedToolBlock['category'] | null = null;
  let currentMembers: UnifiedToolBlock[] = [];
  for (const block of blocks) {
    const kind: ToolSegment['kind'] =
      block.category === 'bash'
        ? 'bash-timeline'
        : block.category === 'todo'
          ? 'todo'
          : LIST_CATEGORIES.has(block.category)
            ? 'list'
            : 'single';
    const sameGroup =
      currentKind !== null &&
      kind === currentKind &&
      kind !== 'single' &&
      (kind !== 'list' || block.category === currentCategory);
    if (sameGroup) {
      currentMembers.push(block);
    } else {
      pushSegment(currentKind ?? 'single', currentMembers);
      currentKind = kind;
      currentCategory = block.category;
      currentMembers = [block];
    }
  }
  pushSegment(currentKind ?? 'single', currentMembers);
  return segments;
}
