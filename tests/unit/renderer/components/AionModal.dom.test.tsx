import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ fontScale: 1 }),
}));

vi.mock('@icon-park/react', () => ({
  Close: ({ size = 20 }: { size?: number }) => <span data-testid='aion-modal-close' data-size={size} />,
}));

vi.mock('@arco-design/web-react', () => ({
  Modal: ({
    children,
    visible,
    className,
    style,
  }: {
    children?: React.ReactNode;
    visible?: boolean;
    className?: string;
    style?: React.CSSProperties;
  }) =>
    visible ? (
      <div data-testid='mock-arco-modal' className={className} style={style}>
        {children}
      </div>
    ) : null,
  Button: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => <button onClick={onClick}>{children}</button>,
}));

import AionModal from '@/renderer/components/base/AionModal';

const arcoOverrideCss = readFileSync(resolve(process.cwd(), 'src/renderer/styles/arco-override.css'), 'utf8');

describe('AionModal', () => {
  it('uses dialog fill as the default content background', () => {
    const { container } = render(
      <AionModal visible onCancel={vi.fn()} header='Modal title'>
        content
      </AionModal>
    );

    const body = container.querySelector('.aionui-modal-body-content');

    expect(body).toBeTruthy();
    expect(body).toHaveStyle({ background: 'var(--dialog-fill-0)' });
  });

  it('preserves an explicit content background override', () => {
    const { container } = render(
      <AionModal visible onCancel={vi.fn()} header='Modal title' contentStyle={{ background: 'rgb(var(--primary-1))' }}>
        content
      </AionModal>
    );

    const body = container.querySelector('.aionui-modal-body-content');

    expect(body).toBeTruthy();
    expect(body).toHaveStyle({ background: 'rgb(var(--primary-1))' });
  });
});

describe('arco modal form controls', () => {
  it('keeps idle modal inputs, textareas, and selects on a visible border token', () => {
    expect(arcoOverrideCss).toMatch(/\.arco-modal\s+\.arco-input:not\(\.arco-input-disabled\)/);
    expect(arcoOverrideCss).toMatch(/\.arco-modal\s+\.arco-textarea:not\(\.arco-textarea-disabled\)/);
    expect(arcoOverrideCss).toMatch(/\.arco-modal\s+\.arco-select:not\(\.arco-select-disabled\)/);
    expect(arcoOverrideCss).toContain('border-color: var(--border-base) !important;');
  });

  it('darkens modal field borders on hover without touching focus styles', () => {
    expect(arcoOverrideCss).toMatch(
      /\.arco-modal\s+\.arco-input:not\(\.arco-input-disabled\):not\(\.arco-input-error\):not\(\.arco-input-warning\):not\(\.arco-input-focus\):hover/
    );
    expect(arcoOverrideCss).toContain('border-color: var(--bg-4) !important;');
  });
});
