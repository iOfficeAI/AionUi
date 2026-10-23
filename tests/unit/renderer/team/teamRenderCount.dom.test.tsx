import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTabOverflow } from '@/renderer/pages/conversation/Preview/hooks/useTabOverflow';

describe('Render-Count Optimizations & Tab Overflow Batching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Single-View Tab Switching Render Count', () => {
    const slot1RenderSpy = vi.fn();
    const slot2RenderSpy = vi.fn();
    const slot3RenderSpy = vi.fn();

    type MockSlotProps = {
      slotId: string;
      title: string;
      onRender: () => void;
    };

    const MemoizedMockChatSlot = React.memo<MockSlotProps>(({ slotId, title, onRender }) => {
      onRender();
      return <div data-testid={`chat-content-${slotId}`}>{title}</div>;
    });

    const TestHarness: React.FC = () => {
      const [activeSlotId, setActiveSlotId] = useState('slot-1');
      const assistants = [
        { slotId: 'slot-1', title: 'Lead Agent', spy: slot1RenderSpy },
        { slotId: 'slot-2', title: 'Coder Agent', spy: slot2RenderSpy },
        { slotId: 'slot-3', title: 'Reviewer Agent', spy: slot3RenderSpy },
      ];

      return (
        <div>
          <button data-testid='switch-to-slot-2' onClick={() => setActiveSlotId('slot-2')}>
            Switch to 2
          </button>
          <button data-testid='switch-to-slot-3' onClick={() => setActiveSlotId('slot-3')}>
            Switch to 3
          </button>
          {assistants.map((item) => (
            <div
              key={item.slotId}
              data-testid={`slot-wrapper-${item.slotId}`}
              style={{ display: item.slotId === activeSlotId ? 'flex' : 'none' }}
            >
              <MemoizedMockChatSlot slotId={item.slotId} title={item.title} onRender={item.spy} />
            </div>
          ))}
        </div>
      );
    };

    it('mounts all slots once and does not re-render inactive slots during tab switching', () => {
      render(<TestHarness />);

      // On initial mount, all 3 slots render exactly once to warm up their DOM
      expect(slot1RenderSpy).toHaveBeenCalledTimes(1);
      expect(slot2RenderSpy).toHaveBeenCalledTimes(1);
      expect(slot3RenderSpy).toHaveBeenCalledTimes(1);

      // Verify slot-1 is visible, slot-2 and slot-3 are hidden via CSS
      expect(screen.getByTestId('slot-wrapper-slot-1')).toHaveStyle({ display: 'flex' });
      expect(screen.getByTestId('slot-wrapper-slot-2')).toHaveStyle({ display: 'none' });
      expect(screen.getByTestId('slot-wrapper-slot-3')).toHaveStyle({ display: 'none' });

      // Switch active tab to slot-2
      act(() => {
        fireEvent.click(screen.getByTestId('switch-to-slot-2'));
      });

      // Crucial assertion: None of the memoized child slots should have re-rendered!
      // Only the wrapper <div> changed display from 'none' to 'flex' or vice versa.
      expect(slot1RenderSpy).toHaveBeenCalledTimes(1);
      expect(slot2RenderSpy).toHaveBeenCalledTimes(1);
      expect(slot3RenderSpy).toHaveBeenCalledTimes(1);

      expect(screen.getByTestId('slot-wrapper-slot-1')).toHaveStyle({ display: 'none' });
      expect(screen.getByTestId('slot-wrapper-slot-2')).toHaveStyle({ display: 'flex' });
      expect(screen.getByTestId('slot-wrapper-slot-3')).toHaveStyle({ display: 'none' });

      // Switch active tab to slot-3
      act(() => {
        fireEvent.click(screen.getByTestId('switch-to-slot-3'));
      });

      // Still zero additional re-renders of the child components!
      expect(slot1RenderSpy).toHaveBeenCalledTimes(1);
      expect(slot2RenderSpy).toHaveBeenCalledTimes(1);
      expect(slot3RenderSpy).toHaveBeenCalledTimes(1);

      expect(screen.getByTestId('slot-wrapper-slot-3')).toHaveStyle({ display: 'flex' });
    });
  });

  describe('updateTabOverflow Batching & Non-blocking RAF', () => {
    const OverflowTestHarness: React.FC = () => {
      const { tabsContainerRef } = useTabOverflow([]);
      return (
        <div ref={tabsContainerRef} data-testid='tabs-container' style={{ width: '300px', overflowX: 'auto' }}>
          <div style={{ width: '800px' }}>Tab items</div>
        </div>
      );
    };

    it('schedules tab overflow measurement with requestAnimationFrame instead of running synchronous layout query on each tick', () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
      render(<OverflowTestHarness />);

      const initialRafCount = rafSpy.mock.calls.length;
      const container = screen.getByTestId('tabs-container');

      // Simulate rapid scroll events on the container
      act(() => {
        fireEvent.scroll(container);
        fireEvent.scroll(container);
        fireEvent.scroll(container);
      });

      // Multiple events were scheduled via requestAnimationFrame
      expect(rafSpy.mock.calls.length).toBeGreaterThan(initialRafCount);

      rafSpy.mockRestore();
    });
  });
});
