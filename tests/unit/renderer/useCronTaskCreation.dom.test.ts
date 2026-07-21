/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the "Create scheduled task" action on the conversation history
 * context menu (#3657). The action pre-fills the SendBox with the cron default
 * prompt and focuses it, so the user can create an AionUi scheduled task via
 * the /cron skill.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';
import { useCronTaskCreation } from '@/renderer/pages/conversation/GroupedHistory/hooks/useCronTaskCreation';
import { emitter } from '@/renderer/utils/emitter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const navigate = vi.fn();
let paramsId: string | undefined = undefined;

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ id: paramsId }),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

const emit = vi.mocked(emitter.emit);

const makeConversation = (id: string): TChatConversation =>
  ({
    id,
    name: id,
  }) as unknown as TChatConversation;

describe('useCronTaskCreation (#3657)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paramsId = 'active-1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills the cron prompt and focuses the sendbox for the active conversation without navigating', () => {
    const { result } = renderHook(() => useCronTaskCreation());

    act(() => {
      result.current(makeConversation('active-1'));
    });

    // No route change needed — the target SendBox is already mounted.
    expect(navigate).not.toHaveBeenCalled();
    // Emits the default prompt text and a focus request.
    expect(emit).toHaveBeenCalledWith('sendbox.fill', 'cron.status.defaultPrompt');
    expect(emit).toHaveBeenCalledWith('sendbox.focus');
  });

  it('navigates to the target conversation before filling when it is not active', () => {
    // Make rAF synchronous so the mount-latency retry loop runs within act().
    let frame = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frame += 1;
      cb(frame);
      return frame;
    });

    const { result } = renderHook(() => useCronTaskCreation());

    act(() => {
      result.current(makeConversation('other-2'));
    });

    expect(navigate).toHaveBeenCalledWith('/conversation/other-2');
    // The fill is retried across frames until the target SendBox mounts; at
    // least one fill must have been emitted.
    const fillCalls = emit.mock.calls.filter(([event]) => event === 'sendbox.fill');
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);
    expect(fillCalls[0]).toEqual(['sendbox.fill', 'cron.status.defaultPrompt']);
  });
});
