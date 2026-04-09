import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PetEventBridge } from '@process/pet/petEventBridge';

// Minimal mock types matching the interfaces used by PetEventBridge
type MockStateMachine = { requestState: ReturnType<typeof vi.fn> };
type MockIdleTicker = { resetIdle: ReturnType<typeof vi.fn> };

function createMocks() {
  const sm: MockStateMachine = { requestState: vi.fn() };
  const ticker: MockIdleTicker = { resetIdle: vi.fn() };
  return { sm, ticker };
}

describe('PetEventBridge', () => {
  let bridge: PetEventBridge;
  let sm: MockStateMachine;
  let ticker: MockIdleTicker;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ sm, ticker } = createMocks());
    // Cast mocks to satisfy constructor parameter types
    bridge = new PetEventBridge(sm as never, ticker as never);
  });

  afterEach(() => {
    bridge.dispose();
    vi.useRealTimers();
  });

  // ── handleBridgeMessage ───────────────────────────────────────────

  describe('handleBridgeMessage', () => {
    it('routes confirmation.add to notification state', () => {
      bridge.handleBridgeMessage('confirmation.add', {});
      expect(ticker.resetIdle).toHaveBeenCalledOnce();
      expect(sm.requestState).toHaveBeenCalledWith('notification');
    });

    it('returns early for confirmation.add without checking stream data', () => {
      // Even with a stream-like payload, confirmation.add should short-circuit
      bridge.handleBridgeMessage('confirmation.add', { type: 'text' });
      expect(sm.requestState).toHaveBeenCalledOnce();
      expect(sm.requestState).toHaveBeenCalledWith('notification');
    });

    describe.each([['chat.response.stream'], ['openclaw.response.stream']])('stream channel %s', (channel) => {
      it.each([
        ['thinking', 'thinking'],
        ['thought', 'thinking'],
        ['text', 'working'],
        ['content', 'working'],
        // `finish` routes to `done` (bubble + check completion signal),
        // not `happy` — `happy` is now reserved for the right-click
        // "pat" interaction so the two carry distinct meanings.
        ['finish', 'done'],
        ['error', 'error'],
      ])('maps msg.type "%s" → state "%s"', (msgType, expectedState) => {
        bridge.handleBridgeMessage(channel, { type: msgType });
        expect(ticker.resetIdle).toHaveBeenCalledOnce();
        expect(sm.requestState).toHaveBeenCalledWith(expectedState);
      });

      it('ignores message with unknown type', () => {
        bridge.handleBridgeMessage(channel, { type: 'unknown_type' });
        expect(ticker.resetIdle).not.toHaveBeenCalled();
        expect(sm.requestState).not.toHaveBeenCalled();
      });

      it('ignores message with no type property', () => {
        bridge.handleBridgeMessage(channel, { foo: 'bar' });
        expect(sm.requestState).not.toHaveBeenCalled();
      });

      it('ignores undefined data', () => {
        bridge.handleBridgeMessage(channel, undefined);
        expect(sm.requestState).not.toHaveBeenCalled();
      });

      it('ignores null data', () => {
        bridge.handleBridgeMessage(channel, null);
        expect(sm.requestState).not.toHaveBeenCalled();
      });
    });

    it('ignores unknown channel names', () => {
      bridge.handleBridgeMessage('some.other.channel', { type: 'text' });
      expect(ticker.resetIdle).not.toHaveBeenCalled();
      expect(sm.requestState).not.toHaveBeenCalled();
    });

    it('does nothing when disposed', () => {
      bridge.dispose();
      bridge.handleBridgeMessage('confirmation.add', {});
      bridge.handleBridgeMessage('chat.response.stream', { type: 'text' });
      expect(ticker.resetIdle).not.toHaveBeenCalled();
      expect(sm.requestState).not.toHaveBeenCalled();
    });
  });

  // ── handleUserSendMessage ─────────────────────────────────────────

  describe('handleUserSendMessage', () => {
    it('resets idle and requests thinking state', () => {
      bridge.handleUserSendMessage();
      expect(ticker.resetIdle).toHaveBeenCalledOnce();
      expect(sm.requestState).toHaveBeenCalledWith('thinking');
    });

    it('does nothing when disposed', () => {
      bridge.dispose();
      bridge.handleUserSendMessage();
      expect(ticker.resetIdle).not.toHaveBeenCalled();
      expect(sm.requestState).not.toHaveBeenCalled();
    });
  });

  // ── handleTurnCompleted ───────────────────────────────────────────

  describe('handleTurnCompleted', () => {
    it('resets idle and requests done state', () => {
      bridge.handleTurnCompleted();
      expect(ticker.resetIdle).toHaveBeenCalledOnce();
      expect(sm.requestState).toHaveBeenCalledWith('done');
    });

    it('does nothing when disposed', () => {
      bridge.dispose();
      bridge.handleTurnCompleted();
      expect(ticker.resetIdle).not.toHaveBeenCalled();
      expect(sm.requestState).not.toHaveBeenCalled();
    });
  });

  // ── handleConfirmationAdd ─────────────────────────────────────────

  describe('handleConfirmationAdd', () => {
    it('resets idle and requests notification state', () => {
      bridge.handleConfirmationAdd();
      expect(ticker.resetIdle).toHaveBeenCalledOnce();
      expect(sm.requestState).toHaveBeenCalledWith('notification');
    });

    it('does nothing when disposed', () => {
      bridge.dispose();
      bridge.handleConfirmationAdd();
      expect(ticker.resetIdle).not.toHaveBeenCalled();
      expect(sm.requestState).not.toHaveBeenCalled();
    });
  });

  // ── dispose ───────────────────────────────────────────────────────

  describe('dispose', () => {
    it('is safe to call multiple times', () => {
      bridge.dispose();
      bridge.dispose(); // should not throw
    });

    it('prevents all handlers from executing after disposal', () => {
      bridge.dispose();

      bridge.handleBridgeMessage('confirmation.add', {});
      bridge.handleBridgeMessage('chat.response.stream', { type: 'finish' });
      bridge.handleUserSendMessage();
      bridge.handleTurnCompleted();
      bridge.handleConfirmationAdd();

      expect(ticker.resetIdle).not.toHaveBeenCalled();
      expect(sm.requestState).not.toHaveBeenCalled();
    });
  });
});
