/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for AgentChatDelegator.
 *
 * Tests @mention parsing, allowed agent validation, message delegation flow,
 * and swarm @mention routing (via parseMentionsWithAllowList).
 */

// Mock dependencies before importing the module
jest.mock('@/common/utils', () => ({
  uuid: () => `test-uuid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
}));

jest.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        emit: jest.fn(),
      },
    },
  },
}));

jest.mock('@/common/chatLib', () => ({
  transformMessage: jest.fn((msg: any) => {
    if (!msg) return null;
    return {
      id: `transformed-${msg.msg_id}`,
      msg_id: msg.msg_id,
      conversation_id: msg.conversation_id,
      type: msg.type === 'content' ? 'text' : msg.type,
      position: msg.type === 'user_content' ? 'right' : 'left',
      content: { content: msg.data },
      createdAt: msg.timestamp || Date.now(),
      agentMeta: msg.agentMeta,
    };
  }),
}));

jest.mock('@/process/services/conversationService', () => ({
  ConversationService: {
    createConversation: jest.fn(),
  },
}));

jest.mock('@/process/WorkerManage', () => ({
  __esModule: true,
  default: {
    getTaskById: jest.fn(),
  },
}));

jest.mock('@/process/message', () => ({
  addOrUpdateMessage: jest.fn(),
}));

import { AgentChatDelegator } from '@/process/agentchat/AgentChatDelegator';
import { ipcBridge } from '@/common';
import { ConversationService } from '@/process/services/conversationService';
import WorkerManage from '@/process/WorkerManage';
import { addOrUpdateMessage } from '@/process/message';

/** All parent conversation IDs used in tests — cleaned up after each test */
const TEST_IDS = ['test-parent', 'test-parent-2', 'fwd-persist-parent', 'fwd-thought-parent', 'swarm-test'];

describe('AgentChatDelegator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Remove all delegators created during tests to prevent leaks
    for (const id of TEST_IDS) {
      try {
        AgentChatDelegator.remove(id);
      } catch (_e) {
        /* ignore */
      }
    }
  });

  describe('parseMentionsWithAllowList', () => {
    it('should parse @mentions that are in the allow list', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('@architect please review this code', ['architect', 'developer']);
      expect(result.mentions).toEqual(['architect']);
      expect(result.cleanText).toBe('please review this code');
    });

    it('should ignore @mentions not in the allow list', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('@gemini explain this code', ['architect', 'developer']);
      expect(result.mentions).toEqual([]);
      expect(result.cleanText).toBe('explain this code');
    });

    it('should handle multiple mentions with mixed valid/invalid', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('@architect @gemini @developer review this', ['architect', 'developer']);
      expect(result.mentions).toEqual(['architect', 'developer']);
      expect(result.cleanText).toBe('review this');
    });

    it('should be case-insensitive for agent names', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('@Architect @DEVELOPER hello', ['architect', 'developer']);
      expect(result.mentions).toEqual(['architect', 'developer']);
    });

    it('should deduplicate mentions', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('@architect @architect do this', ['architect']);
      expect(result.mentions).toEqual(['architect']);
    });

    it('should return empty mentions for text without @', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('just a regular message', ['architect', 'developer']);
      expect(result.mentions).toEqual([]);
      expect(result.cleanText).toBe('just a regular message');
    });

    it('should handle empty allow list', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('@architect do this', []);
      expect(result.mentions).toEqual([]);
    });

    it('should handle empty text', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('', ['architect']);
      expect(result.mentions).toEqual([]);
      expect(result.cleanText).toBe('');
    });

    it('should handle @mentions mid-sentence', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('hey @developer can you help @reviewer with the PR?', ['architect', 'developer', 'reviewer']);
      expect(result.mentions).toEqual(['developer', 'reviewer']);
      expect(result.cleanText).toBe('hey  can you help  with the PR?');
    });

    it('should not match partial agent names', () => {
      const result = AgentChatDelegator.parseMentionsWithAllowList('@arch do this', ['architect', 'developer']);
      expect(result.mentions).toEqual([]);
    });
  });

  describe('parseMentions (instance method)', () => {
    it('should only accept mentions from the allowed agents set', () => {
      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      const result = delegator.parseMentions('@codex explain this @gemini help');
      expect(result.mentions).toContain('codex');
      // gemini is not allowed, should be excluded
      expect(result.mentions).not.toContain('gemini');
      // claude (default backend) is always allowed
    });

    it('should always include the default backend in allowed set', () => {
      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', []);
      const result = delegator.parseMentions('@claude do this');
      expect(result.mentions).toEqual(['claude']);
    });

    it('should strip all @mentions from clean text (including invalid ones)', () => {
      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      const result = delegator.parseMentions('@codex @gemini explain this');
      expect(result.cleanText).toBe('explain this');
    });
  });

  describe('getOrCreate', () => {
    it('should create a new delegator', () => {
      expect(AgentChatDelegator.has('test-parent')).toBe(false);
      AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      expect(AgentChatDelegator.has('test-parent')).toBe(true);
    });

    it('should return the same delegator for the same conversation', () => {
      const d1 = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      const d2 = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      expect(d1).toBe(d2);
    });

    it('should create different delegators for different conversations', () => {
      const d1 = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      const d2 = AgentChatDelegator.getOrCreate('test-parent-2', '/tmp', 'claude', ['codex']);
      expect(d1).not.toBe(d2);
    });
  });

  describe('remove', () => {
    it('should remove delegator from registry', () => {
      AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      expect(AgentChatDelegator.has('test-parent')).toBe(true);
      AgentChatDelegator.remove('test-parent');
      expect(AgentChatDelegator.has('test-parent')).toBe(false);
    });

    it('should be safe to remove non-existent delegator', () => {
      expect(() => AgentChatDelegator.remove('nonexistent')).not.toThrow();
    });
  });

  describe('getAllowedAgents', () => {
    it('should return configured agents plus default backend', () => {
      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex', 'qwen']);
      const allowed = delegator.getAllowedAgents();
      expect(allowed).toContain('claude');
      expect(allowed).toContain('codex');
      expect(allowed).toContain('qwen');
    });

    it('should not contain duplicates', () => {
      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['claude', 'codex']);
      const allowed = delegator.getAllowedAgents();
      const claudeCount = allowed.filter((a) => a === 'claude').length;
      expect(claudeCount).toBe(1);
    });
  });

  describe('delegateMessage', () => {
    it('should return false when there are no @mentions', async () => {
      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      const result = await delegator.delegateMessage('hello world', 'msg-1');
      expect(result).toBe(false);
    });

    it('should return false when only the default backend is mentioned', async () => {
      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      const result = await delegator.delegateMessage('@claude hello', 'msg-1');
      expect(result).toBe(false);
    });

    it('should return false when mentions are not in allowed list', async () => {
      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      const result = await delegator.delegateMessage('@gemini hello', 'msg-1');
      expect(result).toBe(false);
    });

    it('should return true and emit user_content when delegating to allowed non-default agent', async () => {
      // Mock child conversation creation
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: true,
        conversation: { id: 'child-conv-1' },
      });

      const mockManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onStream: jest.fn(),
        onFinish: jest.fn(),
        kill: jest.fn(),
      };
      (WorkerManage.getTaskById as jest.Mock).mockReturnValue(mockManager);

      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      const result = await delegator.delegateMessage('@codex explain this', 'msg-1');

      expect(result).toBe(true);

      // Should emit user_content to parent conversation
      const emitCalls = (ipcBridge.conversation.responseStream.emit as jest.Mock).mock.calls;
      const userContentEmit = emitCalls.find(([msg]: any) => msg.type === 'user_content' && msg.conversation_id === 'test-parent');
      expect(userContentEmit).toBeDefined();
      expect(userContentEmit[0].data).toBe('@codex explain this');

      // Should save user message to DB
      expect(addOrUpdateMessage).toHaveBeenCalledWith('test-parent', expect.objectContaining({ position: 'right' }));
    });

    it('should create a child conversation for the mentioned agent', async () => {
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: true,
        conversation: { id: 'child-conv-codex' },
      });

      const mockManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onStream: jest.fn(),
        onFinish: jest.fn(),
        kill: jest.fn(),
      };
      (WorkerManage.getTaskById as jest.Mock).mockReturnValue(mockManager);

      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      await delegator.delegateMessage('@codex explain this', 'msg-1');

      // Should create conversation with correct backend
      expect(ConversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'acp',
          extra: expect.objectContaining({
            backend: 'codex',
          }),
        })
      );
    });

    it('should send clean text (without mentions) to the child agent', async () => {
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: true,
        conversation: { id: 'child-conv-codex' },
      });

      const mockManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onStream: jest.fn(),
        onFinish: jest.fn(),
        kill: jest.fn(),
      };
      (WorkerManage.getTaskById as jest.Mock).mockReturnValue(mockManager);

      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      await delegator.delegateMessage('@codex explain this code', 'msg-1');

      // sendMessage should receive cleaned text
      expect(mockManager.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'explain this code',
        })
      );
    });

    it('should also send to default backend when it is mentioned alongside others', async () => {
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: true,
        conversation: { id: 'child-conv-codex' },
      });

      const mockChildManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onStream: jest.fn(),
        onFinish: jest.fn(),
        kill: jest.fn(),
      };

      const mockDefaultManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        kill: jest.fn(),
      };

      (WorkerManage.getTaskById as jest.Mock).mockImplementation((id: string) => {
        if (id === 'test-parent') return mockDefaultManager;
        return mockChildManager;
      });

      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      const result = await delegator.delegateMessage('@claude @codex review this', 'msg-1');

      expect(result).toBe(true);
      // Default backend should also receive the message
      expect(mockDefaultManager.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'review this' }));
    });

    it('should emit error when child conversation creation fails', async () => {
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Backend not available',
      });

      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      await delegator.delegateMessage('@codex do something', 'msg-1');

      const emitCalls = (ipcBridge.conversation.responseStream.emit as jest.Mock).mock.calls;
      const errorEmit = emitCalls.find(([msg]: any) => msg.type === 'error');
      expect(errorEmit).toBeDefined();
      expect(errorEmit[0].data).toContain('Failed to start agent');
    });

    it('should reuse existing child conversation on subsequent messages', async () => {
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: true,
        conversation: { id: 'child-conv-codex' },
      });

      const mockManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onStream: jest.fn(),
        onFinish: jest.fn(),
        kill: jest.fn(),
      };
      (WorkerManage.getTaskById as jest.Mock).mockReturnValue(mockManager);

      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);

      await delegator.delegateMessage('@codex first question', 'msg-1');
      await delegator.delegateMessage('@codex second question', 'msg-2');

      // Should only create conversation once
      expect(ConversationService.createConversation).toHaveBeenCalledTimes(1);
      // But send two messages
      expect(mockManager.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should emit start event with agentMeta when delegating', async () => {
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: true,
        conversation: { id: 'child-conv-codex' },
      });

      const mockManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onStream: jest.fn(),
        onFinish: jest.fn(),
        kill: jest.fn(),
      };
      (WorkerManage.getTaskById as jest.Mock).mockReturnValue(mockManager);

      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      await delegator.delegateMessage('@codex hello', 'msg-1');

      const emitCalls = (ipcBridge.conversation.responseStream.emit as jest.Mock).mock.calls;
      const startEmit = emitCalls.find(([msg]: any) => msg.type === 'start');
      expect(startEmit).toBeDefined();
      expect(startEmit[0].agentMeta).toEqual(
        expect.objectContaining({
          role: 'codex',
          name: 'Codex',
        })
      );
    });
  });

  describe('response forwarding', () => {
    it('should forward content from child to parent with agentMeta', async () => {
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: true,
        conversation: { id: 'child-conv-codex' },
      });

      let streamCallback: ((msg: any) => void) | undefined;
      const mockManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onStream: jest.fn((cb: any) => {
          streamCallback = cb;
        }),
        onFinish: jest.fn(),
        kill: jest.fn(),
      };
      (WorkerManage.getTaskById as jest.Mock).mockReturnValue(mockManager);

      const delegator = AgentChatDelegator.getOrCreate('test-parent', '/tmp', 'claude', ['codex']);
      await delegator.delegateMessage('@codex hello', 'msg-1');

      // Simulate child agent streaming content
      expect(streamCallback).toBeDefined();
      streamCallback!({
        type: 'content',
        data: 'Here is my response',
        msg_id: 'child-msg-1',
        conversation_id: 'child-conv-codex',
      });

      const emitCalls = (ipcBridge.conversation.responseStream.emit as jest.Mock).mock.calls;
      const contentEmit = emitCalls.find(([msg]: any) => msg.type === 'content' && msg.conversation_id === 'test-parent' && msg.agentMeta?.role === 'codex');
      expect(contentEmit).toBeDefined();
      expect(contentEmit[0].data).toBe('Here is my response');
      expect(contentEmit[0].agentMeta.name).toBe('Codex');
    });

    it('should persist accumulated content on finish', async () => {
      // Use a unique parent ID to avoid cached child from prior tests
      const parentId = 'fwd-persist-parent';
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: true,
        conversation: { id: 'fwd-persist-child' },
      });

      let streamCallback: ((msg: any) => void) | undefined;
      let finishCallback: ((output: string) => void) | undefined;
      const mockManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onStream: jest.fn((cb: any) => {
          streamCallback = cb;
        }),
        onFinish: jest.fn((cb: any) => {
          finishCallback = cb;
        }),
        kill: jest.fn(),
      };
      (WorkerManage.getTaskById as jest.Mock).mockReturnValue(mockManager);

      const delegator = AgentChatDelegator.getOrCreate(parentId, '/tmp', 'claude', ['codex']);
      await delegator.delegateMessage('@codex hello', 'msg-1');

      // Simulate streaming chunks
      streamCallback!({ type: 'content', data: 'Part 1 ', msg_id: 'child-msg', conversation_id: 'fwd-persist-child' });
      streamCallback!({ type: 'content', data: 'Part 2', msg_id: 'child-msg', conversation_id: 'fwd-persist-child' });

      // Simulate finish
      finishCallback!('Part 1 Part 2');

      // Should save consolidated message to parent DB
      expect(addOrUpdateMessage).toHaveBeenCalledWith(
        parentId,
        expect.objectContaining({
          agentMeta: expect.objectContaining({ role: 'codex', name: 'Codex' }),
        })
      );

      // Should emit finish event
      const emitCalls = (ipcBridge.conversation.responseStream.emit as jest.Mock).mock.calls;
      const finishEmit = emitCalls.find(([msg]: any) => msg.type === 'finish' && msg.agentMeta?.role === 'codex');
      expect(finishEmit).toBeDefined();
    });

    it('should forward thought events for typing indicator', async () => {
      // Use a unique parent ID to avoid cached child from prior tests
      const parentId = 'fwd-thought-parent';
      (ConversationService.createConversation as jest.Mock).mockResolvedValue({
        success: true,
        conversation: { id: 'fwd-thought-child' },
      });

      let streamCallback: ((msg: any) => void) | undefined;
      const mockManager = {
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        onStream: jest.fn((cb: any) => {
          streamCallback = cb;
        }),
        onFinish: jest.fn(),
        kill: jest.fn(),
      };
      (WorkerManage.getTaskById as jest.Mock).mockReturnValue(mockManager);

      const delegator = AgentChatDelegator.getOrCreate(parentId, '/tmp', 'claude', ['codex']);
      await delegator.delegateMessage('@codex think about this', 'msg-1');

      // Simulate thought event
      streamCallback!({
        type: 'thought',
        data: 'thinking...',
        msg_id: 'child-msg',
        conversation_id: 'fwd-thought-child',
      });

      const emitCalls = (ipcBridge.conversation.responseStream.emit as jest.Mock).mock.calls;
      const thoughtEmit = emitCalls.find(([msg]: any) => msg.type === 'thought' && msg.conversation_id === parentId);
      expect(thoughtEmit).toBeDefined();
      expect(thoughtEmit[0].agentMeta.role).toBe('codex');
    });
  });
});
