import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/components/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Spin: () => React.createElement('div', {}, 'Spin'),
}));

import BtwOverlay from '@/renderer/components/chat/BtwOverlay';

describe('BtwOverlay keyboard dismissal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('does not dismiss immediately on the submit keypress timing window', () => {
    const onDismiss = vi.fn();

    render(
      <BtwOverlay answer='' isLoading isOpen onDismiss={onDismiss} parentTaskRunning question='what file did we use?' />
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
