import { describe, expect, it } from 'vitest';
import type { UnifiedToolBlock } from './unifiedToolBlock';
import { partitionByParent, groupIntoSegments, type ToolSegment } from './toolBlockGrouping';

const block = (
  key: string,
  category: UnifiedToolBlock['category'],
  extra: Partial<UnifiedToolBlock> = {}
): UnifiedToolBlock => ({
  key,
  category,
  status: 'completed',
  title: key,
  outputKind: 'text',
  raw: { type: 'tool_call' } as never,
  ...extra,
});

describe('partitionByParent', () => {
  it('routes child blocks under their parent task and keeps order otherwise', () => {
    const blocks = [
      block('r1', 'read'),
      block('task-1', 'task'),
      block('c1', 'read', { parentCallId: 'task-1' }),
      block('c2', 'bash', { parentCallId: 'task-1' }),
      block('r2', 'read'),
    ];
    const { rootBlocks, childrenByParent } = partitionByParent(blocks);
    expect(rootBlocks.map((b) => b.key)).toEqual(['r1', 'task-1', 'r2']);
    expect(childrenByParent.get('task-1')?.map((b) => b.key)).toEqual(['c1', 'c2']);
  });

  it('degrades orphan children (parent missing) back into the flat flow', () => {
    const blocks = [block('c1', 'read', { parentCallId: 'nope' }), block('r1', 'read')];
    const { rootBlocks, childrenByParent } = partitionByParent(blocks);
    expect(rootBlocks.map((b) => b.key)).toEqual(['c1', 'r1']);
    expect(childrenByParent.size).toBe(0);
  });

  it('re-groups when the parent arrives later (pure recompute)', () => {
    const late = [block('c1', 'read', { parentCallId: 'task-1' })];
    expect(partitionByParent(late).rootBlocks).toHaveLength(1);
    const withParent = [...late, block('task-1', 'task')];
    expect(partitionByParent(withParent).rootBlocks.map((b) => b.key)).toEqual(['task-1']);
  });
});

describe('groupIntoSegments', () => {
  it('merges consecutive file-ish blocks into a list segment', () => {
    const segments = groupIntoSegments([block('r1', 'read'), block('e1', 'edit'), block('s1', 'search')]);
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('list');
    expect((segments[0] as Extract<ToolSegment, { kind: 'list' }>).blocks).toHaveLength(3);
  });

  it('merges consecutive bash blocks into a timeline segment', () => {
    const segments = groupIntoSegments([block('b1', 'bash'), block('b2', 'bash')]);
    expect(segments[0].kind).toBe('bash-timeline');
  });

  it('merges consecutive todo blocks keeping only the latest with update count', () => {
    const segments = groupIntoSegments([
      block('t1', 'todo', { todoItems: [{ content: 'a', status: 'completed' }] }),
      block('t2', 'todo', {
        todoItems: [
          { content: 'a', status: 'completed' },
          { content: 'b', status: 'in_progress' },
        ],
      }),
    ]);
    const seg = segments[0] as Extract<ToolSegment, { kind: 'todo' }>;
    expect(seg.updateCount).toBe(2);
    expect(seg.latest.key).toBe('t2');
  });

  it('keeps single non-aggregating blocks as single segments and breaks segments on category change', () => {
    const segments = groupIntoSegments([block('r1', 'read'), block('b1', 'bash'), block('g1', 'generic')]);
    expect(segments.map((s) => s.kind)).toEqual(['single', 'single', 'single']);
  });

  it('task blocks aggregate into a list segment', () => {
    const segments = groupIntoSegments([block('t1', 'task'), block('t2', 'task')]);
    expect(segments[0].kind).toBe('list');
  });

  it('single-block categories do not form segments of one when isolated', () => {
    const segments = groupIntoSegments([block('r1', 'read')]);
    expect(segments[0].kind).toBe('single');
  });
});
