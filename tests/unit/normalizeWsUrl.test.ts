import { describe, expect, it } from 'vitest';
import { normalizeWsUrl } from '@process/agent/openclaw/OpenClawGatewayConnection';

describe('normalizeWsUrl', () => {
  it('should prepend ws:// when no protocol is present', () => {
    expect(normalizeWsUrl('127.0.0.1:42617')).toBe('ws://127.0.0.1:42617');
  });

  it('should prepend ws:// for hostname:port without protocol', () => {
    expect(normalizeWsUrl('localhost:18789')).toBe('ws://localhost:18789');
  });

  it('should keep ws:// URL unchanged', () => {
    expect(normalizeWsUrl('ws://127.0.0.1:18789')).toBe('ws://127.0.0.1:18789');
  });

  it('should keep wss:// URL unchanged', () => {
    expect(normalizeWsUrl('wss://gateway.example.com:443')).toBe('wss://gateway.example.com:443');
  });

  it('should handle case-insensitive protocol', () => {
    expect(normalizeWsUrl('WS://127.0.0.1:18789')).toBe('WS://127.0.0.1:18789');
    expect(normalizeWsUrl('WSS://gateway.example.com')).toBe('WSS://gateway.example.com');
  });
});
