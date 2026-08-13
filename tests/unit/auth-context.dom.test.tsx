import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/renderer/hooks/context/AuthContext';

const STORAGE_KEY = 'external_auth';

function Probe() {
  const ctx = useAuth();
  return (
    <div>
      <span data-testid='status'>{ctx.status}</span>
      <span data-testid='username'>{ctx.user?.username ?? ''}</span>
      <button
        data-testid='complete'
        onClick={() => ctx.completeExternalLogin('tok-abc', { id: 'u1', username: 'alice' })}
      >
        complete
      </button>
      <button data-testid='logout' onClick={() => void ctx.logout()}>
        logout
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

describe('AuthContext (external login)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('starts unauthenticated when no external_auth is stored', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
  });

  it('starts authenticated when external_auth is stored', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: 'tok-xyz', userId: 'u9', username: 'bob' }));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('username').textContent).toBe('bob');
  });

  it('completeExternalLogin writes localStorage and updates state', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    await act(async () => {
      screen.getByTestId('complete').click();
    });
    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    expect(screen.getByTestId('username').textContent).toBe('alice');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(stored).toEqual({ token: 'tok-abc', userId: 'u1', username: 'alice' });
  });

  it('logout clears external_auth and resets state', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: 'tok-1', userId: 'u1', username: 'alice' }));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    await act(async () => {
      screen.getByTestId('logout').click();
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
