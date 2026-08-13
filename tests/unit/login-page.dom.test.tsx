import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import LoginPage from '@/renderer/pages/login/index';
import { EXTERNAL_LOGIN_ALLOWED_ORIGINS } from '@/renderer/api';

const completeExternalLogin = vi.fn();

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    ready: true,
    user: null,
    status: 'unauthenticated',
    completeExternalLogin,
    logout: vi.fn(),
    refresh: vi.fn(),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

function postMessage(data: unknown, origin = EXTERNAL_LOGIN_ALLOWED_ORIGINS[0]) {
  const event = new MessageEvent('message', { data, origin });
  act(() => {
    window.dispatchEvent(event);
  });
}

describe('LoginPage', () => {
  beforeEach(() => {
    completeExternalLogin.mockReset();
  });

  it('ignores messages from disallowed origins', () => {
    render(<LoginPage />);
    postMessage(
      { type: 'external-login-success', token: 't', user: { id: '1', username: 'a' } },
      'https://evil.example.com'
    );
    expect(completeExternalLogin).not.toHaveBeenCalled();
  });

  it('ignores messages with the wrong type', () => {
    render(<LoginPage />);
    postMessage({ type: 'something-else', token: 't' });
    expect(completeExternalLogin).not.toHaveBeenCalled();
  });

  it('ignores messages with an empty token', () => {
    render(<LoginPage />);
    postMessage({ type: 'external-login-success', token: '', user: { id: '1', username: 'a' } });
    expect(completeExternalLogin).not.toHaveBeenCalled();
  });

  it('calls completeExternalLogin on a valid message', () => {
    render(<LoginPage />);
    postMessage({ type: 'external-login-success', token: 'tok-1', user: { id: 'u1', username: 'alice' } });
    expect(completeExternalLogin).toHaveBeenCalledWith('tok-1', { id: 'u1', username: 'alice' });
  });
});
