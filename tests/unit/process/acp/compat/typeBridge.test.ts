// tests/unit/process/acp/compat/typeBridge.test.ts

import { describe, it, expect } from 'vitest';
import {
  toAgentConfig,
  toAcpModelInfo,
  toAcpConfigOptions,
  toResponseMessage,
  type OldAcpAgentConfig,
} from '@process/acp/compat/typeBridge';
import type { AgentConfig, ModelSnapshot, ConfigOption } from '@process/acp/types';
import type { AcpModelInfo, AcpSessionConfigOption } from '@/common/types/acpTypes';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';

describe('typeBridge', () => {
  describe('toAgentConfig', () => {
    it('should convert basic old config to new config', () => {
      const oldConfig: OldAcpAgentConfig = {
        id: 'test-agent-1',
        backend: 'claude',
        workingDir: '/workspace/test',
        onStreamEvent: () => {},
      };

      const result = toAgentConfig(oldConfig);

      expect(result).toMatchObject({
        agentBackend: 'claude',
        agentSource: 'extension',
        agentId: 'test-agent-1',
        cwd: '/workspace/test',
      });
    });

    it('should convert config with custom CLI path', () => {
      const oldConfig: OldAcpAgentConfig = {
        id: 'custom-agent',
        backend: 'custom',
        cliPath: '/custom/path/agent',
        workingDir: '/workspace/custom',
        onStreamEvent: () => {},
        extra: {
          backend: 'custom',
          cliPath: '/custom/path/agent',
        },
      };

      const result = toAgentConfig(oldConfig);

      expect(result.agentSource).toBe('extension');
      expect(result.command).toBe('/custom/path/agent');
    });

    it('should convert custom args and env from extra', () => {
      const oldConfig: OldAcpAgentConfig = {
        id: 'test-agent',
        backend: 'claude',
        workingDir: '/workspace',
        onStreamEvent: () => {},
        extra: {
          backend: 'claude',
          customArgs: ['--verbose', '--debug'],
          customEnv: { DEBUG: 'true', API_KEY: 'secret' },
        },
      };

      const result = toAgentConfig(oldConfig);

      expect(result.args).toEqual(['--verbose', '--debug']);
      expect(result.env).toEqual({ DEBUG: 'true', API_KEY: 'secret' });
    });

    it('should convert yoloMode to yoloMode', () => {
      const oldConfig: OldAcpAgentConfig = {
        id: 'yolo-agent',
        backend: 'claude',
        workingDir: '/workspace',
        onStreamEvent: () => {},
        extra: {
          backend: 'claude',
          yoloMode: true,
        },
      };

      const result = toAgentConfig(oldConfig);

      expect(result.yoloMode).toBe(true);
    });

    it('should convert resumeSessionId from acpSessionId', () => {
      const oldConfig: OldAcpAgentConfig = {
        id: 'resume-agent',
        backend: 'claude',
        workingDir: '/workspace',
        onStreamEvent: () => {},
        extra: {
          backend: 'claude',
          acpSessionId: 'session-123',
        },
      };

      const result = toAgentConfig(oldConfig);

      expect(result.resumeSessionId).toBe('session-123');
    });

    it('should convert teamMcpStdioConfig to teamMcpConfig', () => {
      const oldConfig: OldAcpAgentConfig = {
        id: 'team-agent',
        backend: 'claude',
        workingDir: '/workspace',
        onStreamEvent: () => {},
        extra: {
          backend: 'claude',
          teamMcpStdioConfig: {
            name: 'team-server',
            command: 'node',
            args: ['server.js'],
            env: [
              { name: 'PORT', value: '3000' },
              { name: 'HOST', value: 'localhost' },
            ],
          },
        },
      };

      const result = toAgentConfig(oldConfig);

      expect(result.teamMcpConfig).toEqual({
        name: 'team-server',
        command: 'node',
        args: ['server.js'],
        env: [
          { name: 'PORT', value: '3000' },
          { name: 'HOST', value: 'localhost' },
        ],
      });
    });

    it('should prefer extra fields over root fields', () => {
      const oldConfig: OldAcpAgentConfig = {
        id: 'test-agent',
        backend: 'claude',
        cliPath: '/root/path',
        workingDir: '/workspace',
        customArgs: ['--root'],
        customEnv: { ROOT: 'true' },
        onStreamEvent: () => {},
        extra: {
          backend: 'claude',
          cliPath: '/extra/path',
          customArgs: ['--extra'],
          customEnv: { EXTRA: 'true' },
        },
      };

      const result = toAgentConfig(oldConfig);

      expect(result.command).toBe('/extra/path');
      expect(result.args).toEqual(['--extra']);
      expect(result.env).toEqual({ EXTRA: 'true' });
    });

    // Note: authCredentials are loaded async by loadAuthCredentials() in AcpAgentV2,
    // not by toAgentConfig(). toAgentConfig leaves authCredentials undefined.
    it('should leave authCredentials undefined (loaded async by AcpAgentV2)', () => {
      const oldConfig: OldAcpAgentConfig = {
        id: 'test',
        backend: 'codex',
        workingDir: '/workspace',
        onStreamEvent: () => {},
      };
      const result = toAgentConfig(oldConfig);
      expect(result.authCredentials).toBeUndefined();
    });
  });

  describe('toAcpModelInfo', () => {
    it('should convert ModelSnapshot with current model', () => {
      const snapshot: ModelSnapshot = {
        currentModelId: 'gpt-4',
        availableModels: [
          { modelId: 'gpt-4', name: 'GPT-4' },
          { modelId: 'gpt-3.5', name: 'GPT-3.5' },
        ],
      };

      const result = toAcpModelInfo(snapshot);

      expect(result.currentModelId).toBe('gpt-4');
      expect(result.currentModelLabel).toBe('GPT-4');
      expect(result.availableModels).toEqual([
        { id: 'gpt-4', label: 'GPT-4' },
        { id: 'gpt-3.5', label: 'GPT-3.5' },
      ]);
      expect(result.canSwitch).toBe(true);
      expect(result.source).toBe('models');
    });

    it('should handle null current model', () => {
      const snapshot: ModelSnapshot = {
        currentModelId: null,
        availableModels: [{ modelId: 'gpt-4', name: 'GPT-4' }],
      };

      const result = toAcpModelInfo(snapshot);

      expect(result.currentModelId).toBeNull();
      expect(result.currentModelLabel).toBeNull();
    });

    it('should handle empty available models', () => {
      const snapshot: ModelSnapshot = {
        currentModelId: 'gpt-4',
        availableModels: [],
      };

      const result = toAcpModelInfo(snapshot);

      expect(result.availableModels).toEqual([]);
      expect(result.canSwitch).toBe(false);
    });
  });

  describe('toAcpConfigOptions', () => {
    it('should convert select config option', () => {
      const options: ConfigOption[] = [
        {
          id: 'model-selector',
          name: 'Model',
          type: 'select',
          category: 'model',
          description: 'Select model',
          currentValue: 'gpt-4',
          options: [
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-3.5', name: 'GPT-3.5' },
          ],
        },
      ];

      const result = toAcpConfigOptions(options);

      expect(result).toEqual([
        {
          id: 'model-selector',
          name: 'Model',
          label: 'Model',
          type: 'select',
          category: 'model',
          description: 'Select model',
          currentValue: 'gpt-4',
          selectedValue: 'gpt-4',
          options: [
            { value: 'gpt-4', name: 'GPT-4', label: 'GPT-4' },
            { value: 'gpt-3.5', name: 'GPT-3.5', label: 'GPT-3.5' },
          ],
        },
      ]);
    });

    it('should convert boolean config option', () => {
      const options: ConfigOption[] = [
        {
          id: 'auto-approve',
          name: 'Auto Approve',
          type: 'boolean',
          currentValue: true,
        },
      ];

      const result = toAcpConfigOptions(options);

      expect(result).toEqual([
        {
          id: 'auto-approve',
          name: 'Auto Approve',
          label: 'Auto Approve',
          type: 'boolean',
          currentValue: 'true',
          selectedValue: 'true',
        },
      ]);
    });

    it('should handle options without suboptions', () => {
      const options: ConfigOption[] = [
        {
          id: 'simple-option',
          name: 'Simple',
          type: 'select',
          currentValue: 'value1',
        },
      ];

      const result = toAcpConfigOptions(options);

      expect(result[0].options).toBeUndefined();
    });
  });

  describe('toResponseMessage', () => {
    const conversationId = 'conv-123';

    it('should convert text message', () => {
      const message: TMessage = {
        id: 'msg-1',
        msg_id: 'msg-1',
        conversation_id: conversationId,
        type: 'text',
        position: 'left',
        content: {
          content: 'Hello world',
        },
      };

      const result = toResponseMessage(message, conversationId);

      expect(result.type).toBe('content');
      expect(result.data).toBe('Hello world');
      expect(result.conversation_id).toBe(conversationId);
    });

    it('should convert thinking message', () => {
      const message: TMessage = {
        id: 'msg-2',
        msg_id: 'msg-2',
        conversation_id: conversationId,
        type: 'thinking',
        position: 'left',
        content: {
          content: 'Analyzing the problem\nLet me think...',
          status: 'thinking',
        },
      };

      const result = toResponseMessage(message, conversationId);

      expect(result.type).toBe('thought');
      expect(result.data).toEqual({
        subject: 'Analyzing the problem',
        description: 'Analyzing the problem\nLet me think...',
      });
    });

    it('should convert acpToolCall message', () => {
      const message: TMessage = {
        id: 'msg-3',
        msg_id: 'msg-3',
        conversation_id: conversationId,
        type: 'acp_tool_call',
        position: 'left',
        content: {
          sessionId: 'session-1',
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'tool-1',
            status: 'pending',
            title: 'Read File',
            kind: 'read',
          },
        },
      };

      const result = toResponseMessage(message, conversationId);

      expect(result.type).toBe('acp_tool_call');
      expect(result.data).toEqual(message.content);
    });

    it('should convert plan message', () => {
      const message: TMessage = {
        id: 'msg-4',
        msg_id: 'msg-4',
        conversation_id: conversationId,
        type: 'plan',
        position: 'left',
        content: {
          sessionId: 'session-1',
          entries: [
            { content: 'Step 1', status: 'completed' },
            { content: 'Step 2', status: 'pending' },
          ],
        },
      };

      const result = toResponseMessage(message, conversationId);

      expect(result.type).toBe('plan');
      expect(result.data).toEqual(message.content);
    });

    it('should convert tips warning to thought', () => {
      const message: TMessage = {
        id: 'msg-5',
        msg_id: 'msg-5',
        conversation_id: conversationId,
        type: 'tips',
        position: 'center',
        content: {
          content: 'Processing data...',
          type: 'warning',
        },
      };

      const result = toResponseMessage(message, conversationId);

      expect(result.type).toBe('thought');
      expect(result.data).toEqual({
        subject: 'Processing data...',
        description: 'Processing data...',
      });
    });

    it('should convert tips error to error', () => {
      const message: TMessage = {
        id: 'msg-6',
        msg_id: 'msg-6',
        conversation_id: conversationId,
        type: 'tips',
        position: 'center',
        content: {
          content: 'An error occurred',
          type: 'error',
        },
      };

      const result = toResponseMessage(message, conversationId);

      expect(result.type).toBe('error');
      expect(result.data).toBe('An error occurred');
    });

    it('should skip available_commands messages', () => {
      const message: TMessage = {
        id: 'msg-7',
        msg_id: 'msg-7',
        conversation_id: conversationId,
        type: 'available_commands',
        content: {
          commands: [{ name: '/help', description: 'Show help' }],
        },
      };

      const result = toResponseMessage(message, conversationId);

      expect(result.type).toBe('');
      expect(result.data).toBeNull();
    });

    it('should fallback to content for unknown types', () => {
      const message: TMessage = {
        id: 'msg-8',
        msg_id: 'msg-8',
        conversation_id: conversationId,
        type: 'text',
        content: {
          content: 'Unknown format',
        },
      } as TMessage;

      const result = toResponseMessage(message, conversationId);

      expect(result.type).toBe('content');
      expect(typeof result.data).toBe('string');
    });

    it('should preserve hidden flag', () => {
      const message: TMessage = {
        id: 'msg-9',
        msg_id: 'msg-9',
        conversation_id: conversationId,
        type: 'text',
        position: 'left',
        content: {
          content: 'Hidden message',
        },
        hidden: true,
      };

      const result = toResponseMessage(message, conversationId);

      expect(result.hidden).toBe(true);
    });

    it('should use msg_id for response message', () => {
      const message: TMessage = {
        id: 'internal-id',
        msg_id: 'external-id',
        conversation_id: conversationId,
        type: 'text',
        position: 'left',
        content: {
          content: 'Test',
        },
      };

      const result = toResponseMessage(message, conversationId);

      expect(result.msg_id).toBe('external-id');
    });
  });
});
