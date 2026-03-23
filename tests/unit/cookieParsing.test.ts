import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IncomingMessage } from 'http';

// Mock AuthService before importing TokenMiddleware
vi.mock('../../src/process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    verifyToken: vi.fn(),
    verifyWebSocketToken: vi.fn(),
  },
}));

vi.mock('../../src/process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: { findById: vi.fn() },
}));

describe('extractWebSocketToken – cookie parsing with special characters', () => {
  let TokenMiddleware: typeof import('../../src/process/webserver/auth/middleware/TokenMiddleware').TokenMiddleware;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../src/process/webserver/auth/middleware/TokenMiddleware');
    TokenMiddleware = mod.TokenMiddleware;
  });

  function fakeReq(headers: Record<string, string | undefined>): IncomingMessage {
    return { headers } as unknown as IncomingMessage;
  }

  it('extracts token from a normal cookie', () => {
    const req = fakeReq({ cookie: 'aionui-session=mytoken123' });
    expect(TokenMiddleware.extractWebSocketToken(req)).toBe('mytoken123');
  });

  it('extracts token when cookie value contains = characters', () => {
    const req = fakeReq({ cookie: 'other=a=b=c; aionui-session=tok=en' });
    expect(TokenMiddleware.extractWebSocketToken(req)).toBe('tok=en');
  });

  it('extracts token when other cookies contain malformed % sequences', () => {
    const req = fakeReq({ cookie: 'bad=test%XY; aionui-session=goodtoken' });
    expect(TokenMiddleware.extractWebSocketToken(req)).toBe('goodtoken');
  });

  it('extracts token when cookie value is a bare % character', () => {
    const req = fakeReq({ cookie: 'noise=%; aionui-session=valid' });
    expect(TokenMiddleware.extractWebSocketToken(req)).toBe('valid');
  });

  it('handles token value that itself contains %', () => {
    const req = fakeReq({ cookie: 'aionui-session=token%25with%25percent' });
    expect(TokenMiddleware.extractWebSocketToken(req)).toBe('token%with%percent');
  });

  it('returns null when cookie header is missing', () => {
    const req = fakeReq({});
    expect(TokenMiddleware.extractWebSocketToken(req)).toBeNull();
  });

  it('returns null when session cookie is absent', () => {
    const req = fakeReq({ cookie: 'other=value; another=123' });
    expect(TokenMiddleware.extractWebSocketToken(req)).toBeNull();
  });

  it('prefers Authorization header over cookie', () => {
    const req = fakeReq({
      authorization: 'Bearer headertoken',
      cookie: 'aionui-session=cookietoken',
    });
    expect(TokenMiddleware.extractWebSocketToken(req)).toBe('headertoken');
  });
});
