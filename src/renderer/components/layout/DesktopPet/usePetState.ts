/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from 'react';
import { useAddEventListener } from '@renderer/utils/emitter';

export type PetState = 'idle' | 'thinking' | 'working' | 'happy' | 'sleeping' | 'error' | 'notification' | 'waking';

/**
 * Manages the pet's current animation state.
 *
 * Listens to `pet.state` events from the global emitter
 * and auto-returns to idle after transient states.
 */
export function usePetState() {
  const [state, setState] = useState<PetState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setPetState = useCallback((next: PetState) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    setState(next);

    // Transient states return to idle automatically
    const transientMs: Partial<Record<PetState, number>> = {
      happy: 4000,
      error: 5000,
      notification: 4000,
      waking: 5000,
    };

    const ms = transientMs[next];
    if (ms) {
      timerRef.current = setTimeout(() => setState('idle'), ms);
    }
  }, []);

  useAddEventListener('pet.state', setPetState, [setPetState]);

  return { state, setPetState };
}
