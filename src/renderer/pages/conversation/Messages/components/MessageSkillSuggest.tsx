/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageSkillSuggest } from '@/common/chat/chatLib';
import React from 'react';
import SkillSuggestCard from './SkillSuggestCard';

const MessageSkillSuggest: React.FC<{ message: IMessageSkillSuggest }> = ({ message }) => {
  const { cronJobId, name, description, skillContent } = message.content;

  return (
    <div className='max-w-780px w-full mx-auto'>
      <SkillSuggestCard suggestion={{ name, description, content: skillContent }} cronJobId={cronJobId} />
    </div>
  );
};

export default MessageSkillSuggest;
