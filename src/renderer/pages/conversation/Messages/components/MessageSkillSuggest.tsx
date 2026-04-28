/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageSkillSuggest } from '@/common/chat/chatLib';
import React from 'react';
import SkillSuggestCard from './SkillSuggestCard';

const MessageSkillSuggest: React.FC<{ message: IMessageSkillSuggest }> = ({ message }) => {
  const rawContent = message.content as
    | IMessageSkillSuggest['content']
    | {
        skill_content?: string;
      }
    | string;
  const content =
    typeof rawContent === 'string'
      ? (() => {
          try {
            return JSON.parse(rawContent) as IMessageSkillSuggest['content'] & { skill_content?: string };
          } catch {
            return {} as IMessageSkillSuggest['content'] & { skill_content?: string };
          }
        })()
      : rawContent;
  const { cron_job_id, name, description } = content;
  const skillContent = content.skillContent ?? content.skill_content ?? '';

  return (
    <div className='max-w-780px w-full mx-auto'>
      <SkillSuggestCard suggestion={{ name, description, content: skillContent }} cron_job_id={cron_job_id} />
    </div>
  );
};

export default MessageSkillSuggest;
