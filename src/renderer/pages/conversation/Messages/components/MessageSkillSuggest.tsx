/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ISkillSuggestArtifact } from '@/common/adapter/ipcBridge';
import React from 'react';
import SkillSuggestCard from './SkillSuggestCard';

const MessageSkillSuggest: React.FC<{ artifact: ISkillSuggestArtifact }> = ({ artifact }) => {
  const rawContent = artifact.payload as
    | ISkillSuggestArtifact['payload']
    | {
        skill_content?: string;
      }
    | string;
  const content =
    typeof rawContent === 'string'
      ? (() => {
          try {
            return JSON.parse(rawContent) as ISkillSuggestArtifact['payload'] & { skill_content?: string };
          } catch {
            return {} as ISkillSuggestArtifact['payload'] & { skill_content?: string };
          }
        })()
      : rawContent;
  const cron_job_id = 'cron_job_id' in content && typeof content.cron_job_id === 'string' ? content.cron_job_id : '';
  const name = 'name' in content && typeof content.name === 'string' ? content.name : '';
  const description = 'description' in content && typeof content.description === 'string' ? content.description : '';
  const skillContent =
    'skillContent' in content && typeof content.skillContent === 'string'
      ? content.skillContent
      : typeof content.skill_content === 'string'
        ? content.skill_content
        : '';

  return (
    <div data-testid='message-skill-suggest' className='max-w-780px w-full mx-auto'>
      <SkillSuggestCard
        artifact_id={artifact.id}
        conversation_id={artifact.conversation_id}
        suggestion={{ name, description, content: skillContent }}
        cron_job_id={cron_job_id}
      />
    </div>
  );
};

export default MessageSkillSuggest;
