/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { TTeam } from '@/common/types/team/teamTypes';
import { emitter } from '@/renderer/utils/emitter';

// Mock translation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let str = (options?.defaultValue as string) ?? key;
      if (options) {
        for (const [k, v] of Object.entries(options)) {
          str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
      }
      return str;
    },
  }),
}));

const sendMessageMock = vi.fn();
const sendMessageToAgentMock = vi.fn();
const askSideQuestionMock = vi.fn();
const cancelRunMock = vi.fn();
const resetAgentContextMock = vi.fn();
const resetConversationMock = vi.fn();
const readAssistantRuleMock = vi.fn();
const writeAssistantRuleMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      sendMessage: { invoke: (...args: unknown[]) => sendMessageMock(...args) },
      sendMessageToAgent: { invoke: (...args: unknown[]) => sendMessageToAgentMock(...args) },
      cancelRun: { invoke: (...args: unknown[]) => cancelRunMock(...args) },
      resetAgentContext: { invoke: (...args: unknown[]) => resetAgentContextMock(...args) },
    },
    conversation: {
      askSideQuestion: { invoke: (...args: unknown[]) => askSideQuestionMock(...args) },
      reset: { invoke: (...args: unknown[]) => resetConversationMock(...args) },
    },
    fs: {
      readAssistantRule: { invoke: (...args: unknown[]) => readAssistantRuleMock(...args) },
      writeAssistantRule: { invoke: (...args: unknown[]) => writeAssistantRuleMock(...args) },
    },
  },
  uuid: () => 'mock-uuid-e2e',
}));

const loadAllConversationMessagesPagedMock = vi.fn();
vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  loadAllConversationMessagesPaged: (...args: unknown[]) => loadAllConversationMessagesPagedMock(...args),
}));

// Mock TeamChatView dependencies
let capturedTeamSendMessage: ((payload: { input: string; files: [] }) => Promise<void>) | undefined;

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  __esModule: true,
  default: (props: { teamSendMessage?: (payload: { input: string; files: [] }) => Promise<void> }) => {
    if (props.teamSendMessage) {
      capturedTeamSendMessage = props.teamSendMessage;
    }
    return <div data-testid='mock-acp-chat' />;
  },
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-aionrs-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/legacy/LegacyReadOnlyConversation', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-legacy-chat' />,
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: { name: 'Leader Agent', backend: 'claude' } }),
}));

vi.mock('@/renderer/pages/team/hooks/TeamTabsContext', () => ({
  useTeamTabs: () => ({ activeSlotId: 'leader-slot', switchTab: vi.fn() }),
}));

import TeamChatView from '@/renderer/pages/team/components/TeamChatView';
import {
  clearTeamMemory,
  getTeamMemory,
  injectRetainedSkillsIntoPrompt,
  isTaskMemoryInjected,
  resetTeamForNewTask,
} from '@/renderer/pages/team/utils/teamMemoryManager';

describe('New Task / Retained Skills Flow & Token Verification', () => {
  const teamId = 'team-token-verification';
  const leaderConvId = 'conv-leader-1';
  const workerConvId = 'conv-worker-1';

  const mockTeam: TTeam = {
    id: teamId,
    name: 'Full Stack Team',
    assistants: [
      {
        slot_id: 'leader-slot',
        role: 'leader',
        assistant_id: 'asst-leader-id',
        assistant_name: 'Lead Architect',
        conversation_id: leaderConvId,
      },
      {
        slot_id: 'worker-slot',
        role: 'teammate',
        assistant_id: 'asst-worker-id',
        assistant_name: 'Frontend Worker',
        conversation_id: workerConvId,
      },
    ],
  };

  // Simulating large conversation history across turns (thousands of tokens)
  const heavyPriorMessages: TMessage[] = [
    {
      id: 'm1',
      type: 'text',
      position: 'right',
      content: { content: 'Please configure our authentication flow using JWT with httpOnly cookies.' },
      created_at: 100,
    },
    {
      id: 'm2',
      type: 'text',
      position: 'left',
      content: {
        content: `Here is the comprehensive 500-line server implementation:
${'// Intermediate debugging logs and raw trace data...\n'.repeat(40)}
Rule: Always set httpOnly and secure flags on authentication cookies.
Summary:
- Token Security: Store tokens in httpOnly cookies never in localStorage.`,
      },
      created_at: 200,
    },
    {
      id: 'm3',
      type: 'text',
      position: 'right',
      content: { content: 'Also ensure that all API routes validate the JWT signature with RS256.' },
      created_at: 300,
    },
    {
      id: 'm4',
      type: 'text',
      position: 'left',
      content: {
        content: `Updated routes with RS256 validation.
${'// Massive code dump and stack traces...\n'.repeat(50)}`,
      },
      created_at: 400,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    capturedTeamSendMessage = undefined;

    sendMessageMock.mockResolvedValue({ status: 'ok', team_run_id: 'run-1' });
    sendMessageToAgentMock.mockResolvedValue({ status: 'ok', team_run_id: 'run-1' });
    cancelRunMock.mockResolvedValue({ status: 'ok' });
    resetAgentContextMock.mockResolvedValue({ status: 'ok', reset_status: 'completed', runtime_status: 'ready' });
    resetConversationMock.mockResolvedValue({ status: 'ok' });
    readAssistantRuleMock.mockResolvedValue('Core assistant instructions.');
    writeAssistantRuleMock.mockResolvedValue({ status: 'ok' });

    loadAllConversationMessagesPagedMock.mockImplementation((convId: string) => {
      if (convId === leaderConvId) return Promise.resolve(heavyPriorMessages);
      return Promise.resolve([]);
    });

    askSideQuestionMock.mockResolvedValue({
      status: 'ok',
      answer: JSON.stringify({
        skills: [
          {
            title: 'JWT Token Security',
            description: 'Store authentication tokens in httpOnly secure cookies, never in localStorage',
          },
        ],
        systemDirectives: ['Always validate JWT signature with RS256 on protected API routes'],
      }),
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('distills skills, clears message arrays, and verifies only the concise memory block is passed to subsequent prompts', async () => {
    // 1. Initial State: Memory is empty
    expect(getTeamMemory(teamId).skills).toHaveLength(0);
    expect(isTaskMemoryInjected(teamId)).toBe(false);

    // Track message clear events
    const clearedConversations: string[] = [];
    emitter.on('conversation.messages.clear', (convId: string) => {
      clearedConversations.push(convId);
    });

    // 2. Perform "New Task" reset
    const result = await resetTeamForNewTask({
      team: mockTeam,
      activeRunId: 'run-old-task',
    });

    // Verify skills were distilled from the multi-turn session
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].title).toBe('JWT Token Security');
    expect(result.systemDirectives).toEqual(['Always validate JWT signature with RS256 on protected API routes']);

    // Verify conversations were cleared across both agents
    expect(resetConversationMock).toHaveBeenCalledWith({ id: leaderConvId });
    expect(resetConversationMock).toHaveBeenCalledWith({ id: workerConvId });
    expect(clearedConversations).toContain(leaderConvId);
    expect(clearedConversations).toContain(workerConvId);

    // Verify runtime contexts were reset
    expect(resetAgentContextMock).toHaveBeenCalledWith({ team_id: teamId, slot_id: 'leader-slot' });
    expect(resetAgentContextMock).toHaveBeenCalledWith({ team_id: teamId, slot_id: 'worker-slot' });

    // Verify memory is stored
    const memory = getTeamMemory(teamId);
    expect(memory.skills).toHaveLength(1);
    expect(memory.systemDirectives).toHaveLength(1);

    // 3. Mount TeamChatView for Leader
    render(
      <TeamChatView
        team_id={teamId}
        slot_id='leader-slot'
        isLeader={true}
        conversation={{
          id: leaderConvId,
          type: 'acp',
          name: 'Lead Architect',
          created_at: Date.now(),
          updated_at: Date.now(),
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(capturedTeamSendMessage).toBeDefined();

    // 4. Send the FIRST prompt of the new task
    const newTaskPrompt1 = 'Create the user profile database schema.';
    await act(async () => {
      await capturedTeamSendMessage!({ input: newTaskPrompt1, files: [] });
    });

    // Verify what was sent to ipcBridge.team.sendMessage
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const sentPayload = sendMessageMock.mock.calls[0]?.[0];
    const outgoingMessage: string = sentPayload.input;

    // A. Verify the concise memory block is included
    expect(outgoingMessage).toContain('[Retained Team Skills & Operational Directives]');
    expect(outgoingMessage).toContain('JWT Token Security');
    expect(outgoingMessage).toContain('Store authentication tokens in httpOnly secure cookies');
    expect(outgoingMessage).toContain('Always validate JWT signature with RS256');
    expect(outgoingMessage).toContain(newTaskPrompt1);

    // B. Verify ZERO prior turn-by-turn chat transcripts or debugging dumps are included
    expect(outgoingMessage).not.toContain('Here is the comprehensive 500-line server implementation');
    expect(outgoingMessage).not.toContain('Intermediate debugging logs and raw trace data');
    expect(outgoingMessage).not.toContain('Massive code dump and stack traces');

    // C. Verify concise token footprint (payload is small, under 600 characters)
    expect(outgoingMessage.length).toBeLessThan(600);

    // 5. Send the SECOND prompt of the same task session
    const newTaskPrompt2 = 'Add indexed email field to the schema.';
    await act(async () => {
      await capturedTeamSendMessage!({ input: newTaskPrompt2, files: [] });
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    const secondPayload = sendMessageMock.mock.calls[1]?.[0];
    const secondMessage: string = secondPayload.input;

    // Verify memory block is NOT re-injected on subsequent prompts, preventing token accumulation
    expect(secondMessage).toBe(newTaskPrompt2);
    expect(secondMessage).not.toContain('[Retained Team Skills & Operational Directives]');
  });
});
