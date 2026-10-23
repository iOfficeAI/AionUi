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
              className='h-full w-full flex flex-col min-w-0'
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

      // Verify slot-1 is visible, slot-2 and slot-3 are hidden via CSS, and layout has full width flex-col
      const activeSlotWrapper = screen.getByTestId('slot-wrapper-slot-1');
      expect(activeSlotWrapper).toHaveStyle({ display: 'flex' });
      expect(activeSlotWrapper.className).toContain('w-full');
      expect(activeSlotWrapper.className).toContain('flex-col');
      expect(activeSlotWrapper.className).toContain('min-w-0');
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

  describe('Real Component React.memo & Quiet Switch Targets', () => {
    it('verifies SiderItem, TeamTabs, and ConversationRow are exported as React.memo components', async () => {
      const { default: SiderItem } = await import('@/renderer/components/layout/Sider/SiderItem');
      const { default: TeamTabs } = await import('@/renderer/pages/team/components/TeamTabs');
      const { default: ConversationRow } = await import('@/renderer/pages/conversation/GroupedHistory/ConversationRow');

      expect((SiderItem as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
      expect((TeamTabs as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
      expect((ConversationRow as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('keeps inactive conversation rows quiet on chat switch via areConversationRowPropsEqual', async () => {
      const { areConversationRowPropsEqual } =
        await import('@/renderer/pages/conversation/GroupedHistory/ConversationRow');

      const conv3 = { id: 'conv-3', name: 'Chat 3', updated_at: 300, extra: {} } as any;

      const baseProps = {
        conversation: conv3,
        isGenerating: false,
        isWaitingConfirmation: false,
        hasUnread: false,
        isManualUnread: false,
        collapsed: false,
        tooltipEnabled: false,
        batchMode: false,
        checked: false,
        selected: false,
        menuVisible: false,
        dimIcon: false,
        onToggleChecked: vi.fn(),
        onConversationClick: vi.fn(),
        onOpenMenu: vi.fn(),
        onMenuVisibleChange: vi.fn(),
        onEditStart: vi.fn(),
        onCreateCronTask: vi.fn(),
        onArchive: vi.fn(),
        onDelete: vi.fn(),
        onTogglePin: vi.fn(),
        onToggleManualUnread: vi.fn(),
        getJobStatus: () => 'none' as const,
      };

      // Unchanged row stays quiet (returns true)
      expect(areConversationRowPropsEqual(baseProps, { ...baseProps })).toBe(true);

      // Selected change re-renders the row (returns false)
      expect(areConversationRowPropsEqual(baseProps, { ...baseProps, selected: true })).toBe(false);

      // Generating/unread/confirmation changes trigger re-render
      expect(areConversationRowPropsEqual(baseProps, { ...baseProps, isGenerating: true })).toBe(false);
      expect(areConversationRowPropsEqual(baseProps, { ...baseProps, hasUnread: true })).toBe(false);
      expect(areConversationRowPropsEqual(baseProps, { ...baseProps, isWaitingConfirmation: true })).toBe(false);

      // Conversation edit (title/timestamp) triggers re-render
      expect(
        areConversationRowPropsEqual(baseProps, { ...baseProps, conversation: { ...conv3, name: 'New Title' } })
      ).toBe(false);
      expect(
        areConversationRowPropsEqual(baseProps, { ...baseProps, conversation: { ...conv3, modified_at: 999 } })
      ).toBe(false);
    });
  });
});
