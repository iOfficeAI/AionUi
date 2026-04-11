import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FeedbackReportModal from '@renderer/components/settings/SettingsModal/contents/FeedbackReportModal';

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock Sentry
const mockCaptureEvent = vi.fn();
const mockWithScope = vi.fn((cb) =>
  cb({
    setTag: vi.fn(),
    addAttachment: vi.fn(),
  })
);

vi.mock('@sentry/electron/renderer', () => ({
  captureEvent: mockCaptureEvent,
  withScope: mockWithScope,
}));

// Mock electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: {
    collectFeedbackLogs: vi.fn().mockResolvedValue(null),
  },
  writable: true,
});

// Mock AionModal to render children directly
vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    children,
    visible,
    header,
  }: {
    children: React.ReactNode;
    visible: boolean;
    header?: React.ReactNode;
  }) => {
    if (!visible) return null;
    return (
      <div data-testid='aion-modal'>
        {header && <div data-testid='modal-header'>{header}</div>}
        {children}
      </div>
    );
  },
}));

// Mock Arco Design components
vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  Input: Object.assign(
    ({
      placeholder,
      value,
      onChange,
      maxLength,
      ...rest
    }: {
      placeholder?: string;
      value?: string;
      onChange?: (val: string) => void;
      maxLength?: number;
      [key: string]: unknown;
    }) => (
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        maxLength={maxLength}
        {...rest}
      />
    ),
    {
      TextArea: ({
        placeholder,
        value,
        onChange,
        maxLength,
      }: {
        placeholder?: string;
        value?: string;
        onChange?: (val: string) => void;
        maxLength?: number;
      }) => (
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          maxLength={maxLength}
        />
      ),
    }
  ),
  Select: Object.assign(
    ({
      children,
      placeholder,
      value,
      onChange,
    }: {
      children?: React.ReactNode;
      placeholder?: string;
      value?: string;
      onChange?: (val: string) => void;
    }) => (
      <select value={value ?? ''} onChange={(e) => onChange?.(e.target.value)}>
        <option value='' disabled>
          {placeholder}
        </option>
        {children}
      </select>
    ),
    {
      Option: ({ children, value }: { children: React.ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
    }
  ),
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Upload: ({ tip }: { tip?: string }) => <div data-testid='upload'>{tip}</div>,
}));

// Mock icon-park
vi.mock('@icon-park/react', () => ({
  Info: () => <span data-testid='info-icon' />,
}));

import React from 'react';

describe('FeedbackReportModal', () => {
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render form fields when visible', () => {
    render(<FeedbackReportModal visible={true} onCancel={onCancel} />);
    expect(screen.getByText('settings.bugReportTitleLabel')).toBeDefined();
    expect(screen.getByText('settings.bugReportModuleLabel')).toBeDefined();
    expect(screen.getByText('settings.bugReportDescriptionLabel')).toBeDefined();
  });

  it('should not render when not visible', () => {
    render(<FeedbackReportModal visible={false} onCancel={onCancel} />);
    expect(screen.queryByText('settings.bugReportTitleLabel')).toBeNull();
  });

  it('should enforce title max length of 100', () => {
    render(<FeedbackReportModal visible={true} onCancel={onCancel} />);
    const titleInput = screen.getByPlaceholderText('settings.bugReportTitlePlaceholder');
    expect(titleInput.getAttribute('maxLength') || titleInput.getAttribute('maxlength')).toBe('100');
  });

  it('should call onCancel when cancel button is clicked', () => {
    render(<FeedbackReportModal visible={true} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('settings.bugReportCancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
