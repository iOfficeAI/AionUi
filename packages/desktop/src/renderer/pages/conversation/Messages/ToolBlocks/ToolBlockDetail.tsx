/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';

/** Labeled Input/Output pre blocks used by Generic/Bash/Task detail areas. */
const ToolBlockDetail: React.FC<{ block: UnifiedToolBlock; showInput?: boolean; showOutput?: boolean; outputError?: boolean }> = ({
  block,
  showInput = true,
  showOutput = true,
  outputError = false,
}) => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-6px'>
      {showInput && block.input && (
        <div>
          <div className='tool-detail-label'>{t('messages.toolBlocks.inputLabel')}</div>
          <pre className='tool-detail-content tool-block__mono'>{block.input}</pre>
        </div>
      )}
      {showOutput && block.output && (
        <div>
          <div className='tool-detail-label'>{t('messages.toolBlocks.outputLabel')}</div>
          <pre className={`tool-detail-content tool-block__mono${outputError ? ' tool-block__output--error' : ''}`}>{block.output}</pre>
        </div>
      )}
    </div>
  );
};

export default ToolBlockDetail;
