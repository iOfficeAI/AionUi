import type { IMessageAcpToolCall, IMessageToolGroup } from '@/common/chat/chatLib';
import { describe, expect, it } from 'vitest';

import { extractSubagentSummaryEntries } from '@/renderer/pages/conversation/Messages/subagents/summary';

describe('extractSubagentSummaryEntries', () => {
  it('detects known subagent tool calls from Gemini tool groups', () => {
    const message = {
      id: 'msg-1',
      type: 'tool_group',
      content: [
        {
          callId: 'call-1',
          name: 'codebase_investigator',
          description: 'Inspect authentication flow',
          renderOutputAsMarkdown: false,
          status: 'Executing',
        },
      ],
    } as IMessageToolGroup;

    expect(extractSubagentSummaryEntries([message])).toEqual([
      {
        id: 'msg-1:call-1',
        label: 'Inspect authentication flow',
        messageId: 'msg-1',
        status: 'active',
      },
    ]);
  });

  it('detects ACP tool calls whose title indicates delegated subagent work', () => {
    const message = {
      id: 'msg-2',
      type: 'acp_tool_call',
      content: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tool-1',
          status: 'completed',
          title: 'Delegate to agent',
          kind: 'execute',
          rawInput: {
            description: 'Delegate to agent: security reviewer',
          },
        },
      },
    } as IMessageAcpToolCall;

    expect(extractSubagentSummaryEntries([message])).toEqual([
      {
        id: 'msg-2:tool-1',
        label: 'Delegate to agent: security reviewer',
        messageId: 'msg-2',
        status: 'completed',
      },
    ]);
  });

  it('ignores normal tool calls that are unrelated to subagents', () => {
    const toolGroup = {
      id: 'msg-3',
      type: 'tool_group',
      content: [
        {
          callId: 'call-2',
          name: 'run_shell_command',
          description: 'npm test',
          renderOutputAsMarkdown: false,
          status: 'Success',
        },
      ],
    } as IMessageToolGroup;

    expect(extractSubagentSummaryEntries([toolGroup])).toEqual([]);
  });
});
