import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';

const t = ((key: string, options?: Record<string, unknown>) => {
  switch (key) {
    case 'conversation.createError.codes.TEAM_ASSISTANT_ID_REQUIRED':
      return 'Please select an assistant before creating the team.';
    case 'conversation.createError.codes.TEAM_ASSISTANT_NOT_FOUND':
      return `Assistant ${String(options?.assistantId)} is no longer available.`;
    case 'conversation.createError.codes.TEAM_ASSISTANT_FIELD_UNSUPPORTED':
      return `Use assistant_id instead of ${String(options?.field)}.`;
    default:
      return String(options?.defaultValue ?? key);
  }
}) as unknown as TFunction;

describe('getConversationCreateErrorMessage', () => {
  it('localizes missing assistant identity errors from backend codes', () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/teams',
      status: 400,
      body: {
        error: 'spawn_agent.assistant_id is required',
        code: 'TEAM_ASSISTANT_ID_REQUIRED',
        details: { field: 'assistant_id' },
      },
    });

    expect(getConversationCreateErrorMessage(error, t)).toBe('Please select an assistant before creating the team.');
  });

  it('localizes missing assistant targets with assistant_id details', () => {
    const error = new BackendHttpError({
      method: 'POST',
      path: '/api/teams',
      status: 400,
      body: {
        error: 'Preset assistant not found: bare:deadbeef',
        code: 'TEAM_ASSISTANT_NOT_FOUND',
        details: { assistant_id: 'bare:deadbeef' },
      },
    });

    expect(getConversationCreateErrorMessage(error, t)).toBe('Assistant bare:deadbeef is no longer available.');
  });
});
