import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock window.matchMedia for Arco Design responsive observer
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
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
  };
});

vi.mock('@icon-park/react', () => ({}));

// Mock CodeMirror to a simple textarea for testability
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange, placeholder }: any) => (
    <textarea
      data-testid='json-input'
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock('@codemirror/lang-json', () => ({
  json: () => [],
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ visible, children, onOk, onCancel, okButtonProps, header }: any) =>
    visible ? (
      <div data-testid='aion-modal'>
        <div data-testid='modal-title'>{header?.title}</div>
        <div>{children}</div>
        <button data-testid='ok-button' disabled={okButtonProps?.disabled} onClick={onOk}>
          OK
        </button>
        <button data-testid='cancel-button' onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

import JsonImportModal from '@/renderer/pages/settings/components/JsonImportModal';

describe('JsonImportModal', () => {
  const defaultProps = {
    visible: true,
    onCancel: vi.fn(),
    onSubmit: vi.fn(),
    onBatchImport: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleSubmit with invalid JSON (Fixes ELECTRON-9G)', () => {
    it('does not throw when submitting malformed JSON', async () => {
      render(<JsonImportModal {...defaultProps} />);

      const textarea = screen.getByTestId('json-input');
      fireEvent.change(textarea, { target: { value: '{ invalid json }' } });

      // Submit should not throw — the fix catches the SyntaxError
      const okButton = screen.getByTestId('ok-button');
      expect(() => fireEvent.click(okButton)).not.toThrow();

      // onSubmit should NOT have been called since JSON is invalid
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('does not throw when submitting truncated JSON', async () => {
      render(<JsonImportModal {...defaultProps} />);

      const textarea = screen.getByTestId('json-input');
      // Truncated JSON that would cause "Unexpected end of JSON input"
      fireEvent.change(textarea, { target: { value: '{"mcpServers":' } });

      const okButton = screen.getByTestId('ok-button');
      expect(() => fireEvent.click(okButton)).not.toThrow();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });

    it('submits successfully with valid JSON', async () => {
      render(<JsonImportModal {...defaultProps} />);

      const textarea = screen.getByTestId('json-input');
      const validJson = JSON.stringify({
        mcpServers: {
          weather: { command: 'uv', args: ['run', 'weather.py'] },
        },
      });
      fireEvent.change(textarea, { target: { value: validJson } });

      const okButton = screen.getByTestId('ok-button');
      fireEvent.click(okButton);

      expect(defaultProps.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'weather',
          transport: expect.objectContaining({ type: 'stdio', command: 'uv' }),
        })
      );
    });
  });
});
