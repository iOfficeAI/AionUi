import { describe, expect, it } from 'vitest';
import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';
import { normalizeUnifiedToolBlocks } from './unifiedToolBlock';

const baseToolCall = (overrides: Partial<IMessageToolCall['content']>): IMessageToolCall => ({
  id: 'm1',
  conversation_id: 'c1',
  type: 'tool_call',
  content: { call_id: 'call-1', name: 'Edit', status: 'completed', args: {}, ...overrides },
});

describe('normalizeUnifiedToolBlocks: tool_call', () => {
  it('maps edit tool with diff counts from old_string/new_string', () => {
    const [block] = normalizeUnifiedToolBlocks([
      baseToolCall({
        name: 'Edit',
        args: { file_path: '/ws/src/a.ts', old_string: 'a\nb\nc', new_string: 'a\nB\nc\nd' },
        input: { file_path: '/ws/src/a.ts', old_string: 'a\nb\nc', new_string: 'a\nB\nc\nd' },
      }),
    ]);
    expect(block.category).toBe('edit');
    expect(block.fileName).toBe('a.ts');
    expect(block.filePath).toBe('/ws/src/a.ts');
    expect(block.diff).toEqual({ added: 2, removed: 1 });
  });

  it('maps bash tool command and parent_call_id', () => {
    const [block] = normalizeUnifiedToolBlocks([
      baseToolCall({ name: 'Bash', args: { command: 'cargo test' }, parent_call_id: 'task-1' }),
    ]);
    expect(block.category).toBe('bash');
    expect(block.command).toBe('cargo test');
    expect(block.parentCallId).toBe('task-1');
  });

  it('maps task tool subagent fields', () => {
    const [block] = normalizeUnifiedToolBlocks([
      baseToolCall({
        name: 'Task',
        args: { subagent_type: 'general-purpose', description: 'investigate', prompt: 'do things' },
      }),
    ]);
    expect(block.category).toBe('task');
    expect(block.subagentType).toBe('general-purpose');
    expect(block.prompt).toBe('do things');
    expect(block.summary).toBe('investigate');
  });

  it('maps todowrite tool items with field tolerance', () => {
    const [block] = normalizeUnifiedToolBlocks([
      baseToolCall({
        name: 'TodoWrite',
        args: {
          todos: [
            { content: 'step 1', status: 'completed' },
            { content: 'step 2', status: 'in_progress' },
          ],
        },
      }),
    ]);
    expect(block.category).toBe('todo');
    expect(block.todoItems).toEqual([
      { content: 'step 1', status: 'completed' },
      { content: 'step 2', status: 'in_progress' },
    ]);
  });

  it('maps unknown tool to generic and skips messages without call_id', () => {
    const blocks = normalizeUnifiedToolBlocks([
      baseToolCall({ name: 'SomeMcpTool', call_id: '' }),
      baseToolCall({ name: 'SomeMcpTool', call_id: 'x' }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].category).toBe('generic');
  });
});

describe('normalizeUnifiedToolBlocks: tool_group', () => {
  const group = (items: Array<Partial<IMessageToolGroup['content'][number]>>): IMessageToolGroup => ({
    id: 'g1',
    conversation_id: 'c1',
    type: 'tool_group',
    content: items.map((item, i) => ({
      call_id: `g-${i}`,
      description: '',
      name: 'Read',
      render_output_as_markdown: false,
      status: 'Success',
      ...item,
    })) as IMessageToolGroup['content'],
  });

  it('maps PascalCase statuses and per-item names', () => {
    const blocks = normalizeUnifiedToolBlocks([
      group([
        { name: 'Read', status: 'Success', description: 'read a.ts' },
        { name: 'RunCommand', status: 'Executing', description: 'cargo build' },
        { name: 'Grep', status: 'Error', description: 'search x' },
      ]),
    ]);
    expect(blocks.map((b) => [b.category, b.status])).toEqual([
      ['read', 'completed'],
      ['bash', 'running'],
      ['search', 'error'],
    ]);
    expect(blocks[1].summary).toBe('cargo build');
    expect(blocks[1].command).toBeUndefined();
  });

  it('skips confirmation-only items (rendered by the confirmation card, not tool blocks)', () => {
    const blocks = normalizeUnifiedToolBlocks([
      group([
        {
          name: 'Read',
          status: 'Confirming',
          confirmationDetails: { type: 'edit', title: 't', file_name: 'a.ts', file_diff: '' } as never,
        },
      ]),
    ]);
    expect(blocks).toHaveLength(0);
  });
});

describe('normalizeUnifiedToolBlocks: acp_tool_call', () => {
  const acp = (update: Partial<IMessageAcpToolCall['content']['update']>): IMessageAcpToolCall => ({
    id: 'a1',
    conversation_id: 'c1',
    type: 'acp_tool_call',
    content: {
      session_id: 's1',
      update: { sessionUpdate: 'tool_call', tool_call_id: 'tc-1', ...update } as never,
    } as never,
  });

  it('maps kind to category and snake_case status', () => {
    const [block] = normalizeUnifiedToolBlocks([
      acp({ kind: 'execute', status: 'in_progress', title: 'cargo test', rawInput: { command: 'cargo test' } }),
    ]);
    expect(block.category).toBe('bash');
    expect(block.status).toBe('running');
    expect(block.command).toBe('cargo test');
    expect(block.title).toBe('cargo test');
  });

  it('prefers task/todo name matching over kind for task tools', () => {
    const [block] = normalizeUnifiedToolBlocks([
      acp({
        kind: 'other',
        title: 'Task',
        status: 'completed',
        rawInput: { subagent_type: 'explore', prompt: 'p' },
      } as never),
    ]);
    expect(block.category).toBe('task');
    expect(block.subagentType).toBe('explore');
  });

  it('keeps wire compat fields (raw_input snake_case fallback)', () => {
    const [block] = normalizeUnifiedToolBlocks([
      acp({ kind: 'read', status: 'completed', title: 'Read a.ts', raw_input: { file_path: '/ws/a.ts' } } as never),
    ]);
    expect(block.category).toBe('read');
    expect(block.fileName).toBe('a.ts');
  });

  it('skips messages without update', () => {
    expect(
      normalizeUnifiedToolBlocks([{ id: 'x', conversation_id: 'c', type: 'acp_tool_call', content: {} as never }])
    ).toEqual([]);
  });
});
