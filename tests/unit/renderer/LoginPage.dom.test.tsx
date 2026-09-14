import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = {
  status: 'unauthenticated',
  login: vi.fn(),
  register: vi.fn(),
  sendEmailVerification: vi.fn(),
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => <div>loader</div>,
}));

import LoginPage from '@renderer/pages/login';

const obfuscate = (value: string): string => btoa(encodeURIComponent(value)).split('').toReversed().join('');

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    authMocks.status = 'unauthenticated';
    authMocks.login.mockResolvedValue({ success: true });
    authMocks.register.mockResolvedValue({ success: true });
    authMocks.sendEmailVerification.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('removes a legacy stored password while restoring the remembered username', () => {
    localStorage.setItem('rememberMe', 'true');
    localStorage.setItem('rememberedUsername', obfuscate('mainf'));
    localStorage.setItem('rememberedPassword', obfuscate('secret'));

    render(<LoginPage />);

    expect(screen.getByPlaceholderText('login.usernamePlaceholder')).toHaveValue('mainf');
    expect(screen.getByPlaceholderText('login.passwordPlaceholder')).toHaveValue('');
    expect(localStorage.getItem('rememberedPassword')).toBeNull();
  });

  it('sends email verification and registers with email and code', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'login.registerMode' }));

    fireEvent.change(screen.getByPlaceholderText('login.usernamePlaceholder'), {
      target: { value: 'mainf' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.passwordPlaceholder'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.emailPlaceholder'), {
      target: { value: ' user@example.com ' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.verificationCodePlaceholder'), {
      target: { value: ' 123456 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'login.sendCode' }));
    fireEvent.submit(document.querySelector('.login-page__form'));

    expect(authMocks.sendEmailVerification).toHaveBeenCalledWith('user@example.com');
    expect(authMocks.register).toHaveBeenCalledWith({
      username: 'mainf',
      password: 'password123',
      email: 'user@example.com',
      verificationCode: '123456',
    });
    expect(localStorage.getItem('rememberedPassword')).toBeNull();
  });

  it('explains the active session limit error', async () => {
    authMocks.login.mockResolvedValue({
      success: false,
      code: 'sessionLimit',
      message: 'Conflict',
    });

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('login.usernamePlaceholder'), {
      target: { value: 'mainf' },
    });
    fireEvent.change(screen.getByPlaceholderText('login.passwordPlaceholder'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(document.querySelector('.login-page__form'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('login.errors.sessionLimit'));
  });
});
