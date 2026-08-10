/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Robot } from '@icon-park/react';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';
import { resolveAgentLogo, useAgentLogos } from '@/renderer/utils/model/agentLogo';

/**
 * Shows which runtime engine (CLI) drives an assistant. Frameless by default
 * to keep list rows quiet; pass `showName` when the runtime must remain
 * identifiable in a mixed-source row, or hide the label when nearby context
 * already makes the runtime identity clear.
 */
const RuntimeBadge: React.FC<{
  assistant: Assistant;
  framed?: boolean;
  showLabel?: boolean;
  showName?: boolean;
}> = ({ assistant, framed = false, showLabel = true, showName = false }) => {
  const { t } = useTranslation();
  const logos = useAgentLogos();
  const backend = assistantRuntimeKey(assistant);
  const logo = resolveAgentLogo(logos, { backend });

  return (
    <span
      className={
        framed
          ? 'inline-flex items-center gap-4px rounded-8px border border-solid border-border-2 bg-fill-1 px-8px py-4px text-11px text-t-tertiary'
          : 'inline-flex items-center gap-4px text-11px text-t-tertiary'
      }
      data-testid={`assistant-runtime-${assistant.id}`}
    >
      {showLabel ? (
        <span className='text-t-quaternary'>{t('settings.assistantRuntimeLabel', { defaultValue: 'runtime:' })}</span>
      ) : null}
      {logo ? (
        <img src={logo} alt='' className='h-15px w-15px object-contain' />
      ) : (
        <Robot theme='outline' size={13} fill='currentColor' />
      )}
      {showName && backend ? <span className='max-w-112px truncate'>{backend}</span> : null}
    </span>
  );
};

export default RuntimeBadge;
