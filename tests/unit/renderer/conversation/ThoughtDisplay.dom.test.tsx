import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@arco-design/web-react', () => ({
  Spin: () => <span data-testid='spinner' />,
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';

describe('ThoughtDisplay status text', () => {
  it('renders custom status text with a spinner while running', () => {
    render(<ThoughtDisplay running statusText='Processing… 2 queued' />);

    expect(screen.getByText('Processing… 2 queued')).toBeInTheDocument();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders custom status text without a spinner while waiting', () => {
    render(<ThoughtDisplay statusText='Waiting for this assistant to start…' />);

    expect(screen.getByText('Waiting for this assistant to start…')).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });
});
