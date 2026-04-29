import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ISkillSuggestArtifact } from '@/common/adapter/ipcBridge';

const mockSkillSuggestCard = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/pages/conversation/Messages/components/SkillSuggestCard', () => ({
  default: (props: unknown) => {
    mockSkillSuggestCard(props);
    return <div data-testid='skill-suggest-card' />;
  },
}));

import MessageSkillSuggest from '@/renderer/pages/conversation/Messages/components/MessageSkillSuggest';

function buildArtifact(payload: unknown): ISkillSuggestArtifact {
  return {
    id: 'artifact-1',
    conversation_id: 'conv-1',
    cron_job_id: 'cron-1',
    kind: 'skill_suggest',
    status: 'pending',
    payload: payload as ISkillSuggestArtifact['payload'],
    created_at: 1000,
    updated_at: 1000,
  };
}

describe('MessageSkillSuggest', () => {
  it('passes camelCase skillContent through to SkillSuggestCard', () => {
    render(
      <MessageSkillSuggest
        artifact={buildArtifact({
          cron_job_id: 'cron-1',
          name: 'daily-brief',
          description: 'Daily brief',
          skillContent: '# skill body',
        })}
      />
    );

    expect(screen.getByTestId('message-skill-suggest')).toBeInTheDocument();
    expect(screen.getByTestId('skill-suggest-card')).toBeInTheDocument();
    expect(mockSkillSuggestCard).toHaveBeenCalledWith({
      artifact_id: 'artifact-1',
      conversation_id: 'conv-1',
      suggestion: {
        name: 'daily-brief',
        description: 'Daily brief',
        content: '# skill body',
      },
      cron_job_id: 'cron-1',
    });
  });

  it('falls back to snake_case skill_content from persisted backend artifacts', () => {
    render(
      <MessageSkillSuggest
        artifact={buildArtifact({
          cron_job_id: 'cron-2',
          name: 'morning-brief',
          description: 'Morning brief',
          skill_content: '# persisted skill body',
        })}
      />
    );

    expect(screen.getByTestId('skill-suggest-card')).toBeInTheDocument();
    expect(mockSkillSuggestCard).toHaveBeenCalledWith({
      artifact_id: 'artifact-1',
      conversation_id: 'conv-1',
      suggestion: {
        name: 'morning-brief',
        description: 'Morning brief',
        content: '# persisted skill body',
      },
      cron_job_id: 'cron-2',
    });
  });

  it('parses persisted JSON string payload from database hydration', () => {
    render(
      <MessageSkillSuggest
        artifact={buildArtifact(
          JSON.stringify({
            cron_job_id: 'cron-3',
            name: 'weekly-brief',
            description: 'Weekly brief',
            skill_content: '# json skill body',
          })
        )}
      />
    );

    expect(screen.getByTestId('skill-suggest-card')).toBeInTheDocument();
    expect(mockSkillSuggestCard).toHaveBeenCalledWith({
      artifact_id: 'artifact-1',
      conversation_id: 'conv-1',
      suggestion: {
        name: 'weekly-brief',
        description: 'Weekly brief',
        content: '# json skill body',
      },
      cron_job_id: 'cron-3',
    });
  });
});
