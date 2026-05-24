import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QRLoginPage from '@renderer/pages/qr-login';

const refreshMock = vi.fn();

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ refresh: refreshMock }),
}));

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path='/qr-login' element={<QRLoginPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('QRLoginPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    refreshMock.mockReset();
  });

  it('submits both camelCase and snake_case QR token fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage('/qr-login?token=abc123');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ qrToken: 'abc123', qr_token: 'abc123' });
  });

  it('shows an error for a missing QR token without calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderPage('/qr-login');

    expect(await screen.findByText('Invalid QR code. / 二维码无效。')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
