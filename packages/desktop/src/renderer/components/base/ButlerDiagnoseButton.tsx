/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTalkToButler } from '@/renderer/hooks/assistant/useTalkToButler';
import { Robot } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

type ButlerDiagnoseButtonProps = {
  /** Error text handed to the Butler as diagnosis context. */
  errorText: string;
  /** Additional classes appended to the default pill styling. */
  className?: string;
};

/**
 * Inline "ask the Butler" chip shown next to FeedbackButton on error surfaces.
 * Instead of filing a report, it routes the user to the home chat with the
 * AionUi Butler selected and a diagnosis prompt (including the error text)
 * pre-filled — the same flow as the report modal's "Solve via chat" action.
 */
const ButlerDiagnoseButton: React.FC<ButlerDiagnoseButtonProps> = ({ errorText, className }) => {
  const { t } = useTranslation();
  const talkToButler = useTalkToButler();

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      const prompt = t('settings.talkToButler.prompt.diagnoseChatError', {
        defaultValue:
          'I ran into an error during a conversation in AionUi, please help me diagnose it.\n\n[Error] {{error}}\n\nPlease diagnose the cause and tell me how to fix it.',
        error: errorText.trim(),
      });
      talkToButler({ prompt }).catch((err) => {
        console.error('[ButlerDiagnoseButton] Failed to open butler chat:', err);
      });
    },
    [errorText, t, talkToButler]
  );

  return (
    <button
      type='button'
      role='button'
      onClick={handleClick}
      className={classNames(
        'inline-flex items-center gap-3px cursor-pointer select-none b-none',
        'px-8px py-4px rd-16px',
        'bg-transparent hover:bg-fill-2 text-t-primary',
        'text-13px leading-18px transition-colors duration-150',
        className
      )}
    >
      {/* No pt offset: @icon-park's Robot glyph is vertically centered in its
          viewBox (unlike Comment in FeedbackButton), so items-center alone
          lines it up with the text baseline. */}
      <Robot theme='outline' size='14' fill='currentColor' className='flex-shrink-0' />
      <span>{t('settings.talkToButler.solveWithButler')}</span>
    </button>
  );
};

export default ButlerDiagnoseButton;
