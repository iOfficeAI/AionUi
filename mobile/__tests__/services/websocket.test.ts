import { WebSocketService } from '@/src/services/websocket';

// --- Mock WebSocket ---
type MockWSInstance = {
  url: string;
  protocols: string | string[];
  readyState: number;
  onopen: ((ev: any) => void) | null;
  onclose: ((ev: any) => void) | null;
  onmessage: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  send: jest.Mock;
  close: jest.Mock;
};

let mockWSInstances: MockWSInstance[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  protocols: string | string[];
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: '' });
  });

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols ?? '';
    mockWSInstances.push(this as unknown as MockWSInstance);
  }
}

// Assign static constants to prototype for readyState comparisons
Object.assign(MockWebSocket.prototype, {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
});

(globalThis as any).WebSocket = MockWebSocket;

function latestWS(): MockWSInstance {
  return mockWSInstances[mockWSInstances.length - 1];
}

function simulateOpen(ws: MockWSInstance) {
  ws.readyState = MockWebSocket.OPEN;
  ws.onopen?.({});
}

function simulateMessage(ws: MockWSInstance, data: object) {
  ws.onmessage?.({ data: JSON.stringify(data) });
}

function simulateClose(ws: MockWSInstance, code = 1000) {
  ws.readyState = MockWebSocket.CLOSED;
  ws.onclose?.({ code, reason: '' });
}

describe('WebSocketService', () => {
  let service: WebSocketService;

  beforeEach(() => {
    jest.useFakeTimers();
    mockWSInstances = [];
    service = new WebSocketService();
    service.configure('localhost', '8080', 'test-token');
  });

  afterEach(() => {
    service.disconnect();
    jest.useRealTimers();
  });

  describe('connect', () => {
    it('creates WebSocket with correct URL and token protocol', () => {
      service.connect();
      const ws = latestWS();
      expect(ws.url).toBe('ws://localhost:8080');
      expect(ws.protocols).toEqual(['test-token']);
    });

    it('transitions to connecting then connected on open', () => {
      const states: string[] = [];
      service.onStateChange((s) => states.push(s));

      service.connect();
      expect(service.state).toBe('connecting');

      simulateOpen(latestWS());
      expect(service.state).toBe('connected');
      expect(states).toEqual(['connecting', 'connected']);
    });

    it('does not create duplicate connection if already open', () => {
      service.connect();
      simulateOpen(latestWS());
      const count = mockWSInstances.length;

      service.connect();
      expect(mockWSInstances.length).toBe(count);
    });
  });

  describe('message handling', () => {
    it('routes messages to handler', () => {
      const handler = jest.fn();
      service.onMessage(handler);
      service.connect();
      simulateOpen(latestWS());

      simulateMessage(latestWS(), { name: 'chat', data: { text: 'hi' } });
      expect(handler).toHaveBeenCalledWith('chat', { text: 'hi' });
    });

    it('responds to ping with pong', () => {
      service.connect();
      const ws = latestWS();
      simulateOpen(ws);

      simulateMessage(ws, { name: 'ping', data: {} });
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"name":"pong"'),
      );
    });

    it('does not route ping to message handler', () => {
      const handler = jest.fn();
      service.onMessage(handler);
      service.connect();
      simulateOpen(latestWS());

      simulateMessage(latestWS(), { name: 'ping', data: {} });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('auth failure', () => {
    it('sets auth_failed on close code 1008 and stops reconnecting', () => {
      service.connect();
      simulateOpen(latestWS());
      const count = mockWSInstances.length;

      simulateClose(latestWS(), 1008);
      expect(service.state).toBe('auth_failed');

      // Should not attempt reconnect
      jest.advanceTimersByTime(10000);
      expect(mockWSInstances.length).toBe(count);
    });

    it('sets auth_failed on auth-expired message', () => {
      service.connect();
      const ws = latestWS();
      simulateOpen(ws);

      // Override close to not trigger onclose automatically
      ws.close = jest.fn();

      simulateMessage(ws, { name: 'auth-expired', data: {} });
      expect(service.state).toBe('auth_failed');
    });
  });

  describe('reconnection', () => {
    it('attempts reconnect on unexpected close', () => {
      service.connect();
      simulateOpen(latestWS());
      const initialCount = mockWSInstances.length;

      // Override close to avoid triggering onclose recursively
      const ws = latestWS();
      ws.close = jest.fn();
      simulateClose(ws, 1006);

      // First reconnect after 500ms
      jest.advanceTimersByTime(500);
      expect(mockWSInstances.length).toBe(initialCount + 1);
    });

    it('applies exponential backoff up to 8s cap', () => {
      service.connect();
      const ws1 = latestWS();
      simulateOpen(ws1);
      ws1.close = jest.fn();
      simulateClose(ws1, 1006);

      // 500ms → first reconnect
      jest.advanceTimersByTime(500);
      const ws2 = latestWS();
      expect(mockWSInstances.length).toBe(2);

      // Fail again → delay doubles to 1000ms (500*2 after first scheduleReconnect)
      ws2.close = jest.fn();
      simulateClose(ws2, 1006);
      jest.advanceTimersByTime(999);
      expect(mockWSInstances.length).toBe(2);
      jest.advanceTimersByTime(1);
      expect(mockWSInstances.length).toBe(3);
    });

    it('resets backoff delay on successful connection', () => {
      service.connect();
      const ws1 = latestWS();
      simulateOpen(ws1);
      ws1.close = jest.fn();
      simulateClose(ws1, 1006);

      jest.advanceTimersByTime(500);
      const ws2 = latestWS();
      simulateOpen(ws2); // Successful reconnect → resets delay

      ws2.close = jest.fn();
      simulateClose(ws2, 1006);

      // Should be back to 500ms
      jest.advanceTimersByTime(500);
      expect(mockWSInstances.length).toBe(3);
    });
  });

  describe('message queue', () => {
    it('queues messages when disconnected and flushes on connect', () => {
      service.connect();
      const ws = latestWS();

      // Send before open (still CONNECTING)
      service.send('test', { value: 1 });
      expect(ws.send).not.toHaveBeenCalled();

      simulateOpen(ws);
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ name: 'test', data: { value: 1 } }));
    });
  });

  describe('disconnect', () => {
    it('clears state and stops reconnection', () => {
      service.connect();
      simulateOpen(latestWS());

      service.disconnect();
      expect(service.state).toBe('disconnected');

      jest.advanceTimersByTime(10000);
      // No new connections after disconnect
      expect(mockWSInstances.length).toBe(1);
    });
  });

  describe('reconnect()', () => {
    it('disconnects and reconnects with reset delay', () => {
      service.connect();
      simulateOpen(latestWS());

      service.reconnect();
      expect(mockWSInstances.length).toBe(2);
      expect(service.state).toBe('connecting');
    });
  });
});
