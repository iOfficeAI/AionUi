jest.mock('@/src/services/websocket', () => ({
  wsService: {
    send: jest.fn(),
    onMessage: jest.fn(),
  },
}));

import { bridge } from '@/src/services/bridge';
import { wsService } from '@/src/services/websocket';

const mockSend = wsService.send as jest.Mock;
const mockOnMessage = wsService.onMessage as jest.Mock;

// The bridge constructor called wsService.onMessage(handler) — extract it
function simulateMessage(name: string, data: unknown) {
  const handler = mockOnMessage.mock.calls[0]?.[0];
  handler?.(name, data);
}

describe('BridgeService', () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  describe('emit', () => {
    it('sends a fire-and-forget message via WebSocket', () => {
      bridge.emit('chat:send', { text: 'hello' });
      expect(mockSend).toHaveBeenCalledWith('chat:send', { text: 'hello' });
    });

    it('sends without data', () => {
      bridge.emit('ping');
      expect(mockSend).toHaveBeenCalledWith('ping', undefined);
    });
  });

  describe('on', () => {
    it('subscribes to events and receives data', () => {
      const handler = jest.fn();
      bridge.on('chat:message', handler);

      simulateMessage('chat:message', { text: 'hi' });
      expect(handler).toHaveBeenCalledWith({ text: 'hi' });
    });

    it('supports multiple listeners for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      bridge.on('event-multi', handler1);
      bridge.on('event-multi', handler2);

      simulateMessage('event-multi', 'data');
      expect(handler1).toHaveBeenCalledWith('data');
      expect(handler2).toHaveBeenCalledWith('data');
    });

    it('returns unsubscribe function', () => {
      const handler = jest.fn();
      const unsub = bridge.on('event-unsub', handler);

      simulateMessage('event-unsub', 'first');
      expect(handler).toHaveBeenCalledTimes(1);

      unsub();
      simulateMessage('event-unsub', 'second');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not call handlers for other events', () => {
      const handler = jest.fn();
      bridge.on('event-a', handler);

      simulateMessage('event-b', 'data');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('receives only the first event then auto-unsubscribes', () => {
      const handler = jest.fn();
      bridge.once('one-time', handler);

      simulateMessage('one-time', 'first');
      simulateMessage('one-time', 'second');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('returns manual unsubscribe function', () => {
      const handler = jest.fn();
      const unsub = bridge.once('one-time-unsub', handler);

      unsub();
      simulateMessage('one-time-unsub', 'data');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('request', () => {
    it('sends request and resolves when server responds', async () => {
      const promise = bridge.request('get:sessions');

      expect(mockSend).toHaveBeenCalledWith('get:sessions', undefined);

      // Simulate server response
      simulateMessage('get:sessions', [{ id: 1 }]);

      await expect(promise).resolves.toEqual([{ id: 1 }]);
    });

    it('sends request with data', async () => {
      const promise = bridge.request('create:session', { name: 'test' });
      expect(mockSend).toHaveBeenCalledWith('create:session', { name: 'test' });

      simulateMessage('create:session', { id: 2 });
      await expect(promise).resolves.toEqual({ id: 2 });
    });

    it('rejects on timeout', async () => {
      jest.useFakeTimers();

      const promise = bridge.request('slow:request', undefined, 1000);

      jest.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow("Bridge request 'slow:request' timed out after 1000ms");

      jest.useRealTimers();
    });

    it('cleans up listener after response', async () => {
      const promise = bridge.request('cleanup-test');
      simulateMessage('cleanup-test', 'result');
      await promise;

      // Subsequent messages for same name should not cause issues
      const handler = jest.fn();
      bridge.on('cleanup-test', handler);
      simulateMessage('cleanup-test', 'later');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
