import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageSkillSuggest } from '@/common/chat/chatLib';

const mockSkillSuggestCard = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/pages/conversation/Messages/components/SkillSuggestCard', () => ({
  default: (props: unknown) => {
    mockSkillSuggestCard(props);
    return <div data-testid='skill-suggest-card' />;
  },
}));

import MessageSkillSuggest from '@/renderer/pages/conversation/Messages/components/MessageSkillSuggest';

describe('MessageSkillSuggest', () => {
  it('passes camelCase skillContent through to SkillSuggestCard', () => {
    const message: IMessageSkillSuggest = {
      id: 'msg-1',
      msg_id: 'stream-1',
      conversation_id: 'conv-1',
      type: 'skill_suggest',
      position: 'center',
      content: {
        cron_job_id: 'cron-1',
        name: 'daily-brief',
        description: 'Daily brief',
        skillContent: '# skill body',
      },
    };

    render(<MessageSkillSuggest message={message} />);

    expect(screen.getByTestId('skill-suggest-card')).toBeInTheDocument();
    expect(mockSkillSuggestCard).toHaveBeenCalledWith({
      suggestion: {
        name: 'daily-brief',
        description: 'Daily brief',
        content: '# skill body',
      },
      cron_job_id: 'cron-1',
    });
  });

  it('falls back to snake_case skill_content from persisted backend messages', () => {
    const message = {
      id: 'msg-2',
      msg_id: 'stream-2',
      conversation_id: 'conv-2',
      type: 'skill_suggest',
      position: 'center',
      content: {
        cron_job_id: 'cron-2',
        name: 'morning-brief',
        description: 'Morning brief',
        skill_content: '# persisted skill body',
      },
    } as IMessageSkillSuggest;

    render(<MessageSkillSuggest message={message} />);

    expect(screen.getByTestId('skill-suggest-card')).toBeInTheDocument();
    expect(mockSkillSuggestCard).toHaveBeenCalledWith({
      suggestion: {
        name: 'morning-brief',
        description: 'Morning brief',
        content: '# persisted skill body',
      },
      cron_job_id: 'cron-2',
    });
  });

  it('parses persisted JSON string content from database hydration', () => {
    const message = {
      id: 'msg-3',
      msg_id: 'stream-3',
      conversation_id: 'conv-3',
      type: 'skill_suggest',
      position: 'center',
      content: JSON.stringify({
        cron_job_id: 'cron-3',
        name: 'weekly-brief',
        description: 'Weekly brief',
        skill_content: '# json skill body',
      }),
    } as IMessageSkillSuggest;

    render(<MessageSkillSuggest message={message} />);

    expect(screen.getByTestId('skill-suggest-card')).toBeInTheDocument();
    expect(mockSkillSuggestCard).toHaveBeenCalledWith({
      suggestion: {
        name: 'weekly-brief',
        description: 'Weekly brief',
        content: '# json skill body',
      },
      cron_job_id: 'cron-3',
    });
  });
});
