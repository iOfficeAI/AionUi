import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError } from '../../src/common/adapter/httpBridge';

const startInvokeMock = vi.fn();
const stopInvokeMock = vi.fn();
const statusOnMock = vi.fn();
const statusUnsubMock = vi.fn();
const openExternalUrlMock = vi.fn();
const translate = (key: string) => key;

vi.mock('../../src/common', () => ({
  ipcBridge: {
    wordPreview: {
      start: { invoke: (...args: unknown[]) => startInvokeMock(...args) },
      stop: { invoke: (...args: unknown[]) => stopInvokeMock(...args) },
      status: { on: (...args: unknown[]) => statusOnMock(...args) },
    },
  },
}));

vi.mock('../../src/common/adapter/httpBridge', async () => {
  const actual = await vi.importActual<typeof import('../../src/common/adapter/httpBridge')>(
    '../../src/common/adapter/httpBridge'
  );
  return {
    ...actual,
    getBaseUrl: () => 'http://127.0.0.1:13400',
  };
});

vi.mock('../../src/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: (...args: unknown[]) => openExternalUrlMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Spin: () => <div data-testid='spin'>loading</div>,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('../../src/renderer/components/media/WebviewHost', () => ({
  default: ({ url }: { url: string }) => <div data-testid='webview-host' data-url={url} />,
}));

import OfficeWatchViewer from '../../src/renderer/pages/conversation/Preview/components/viewers/OfficeWatchViewer';

describe('OfficeWatchViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusOnMock.mockReturnValue(statusUnsubMock);
    stopInvokeMock.mockResolvedValue(undefined);
  });

  it('forwards workspace and uses direct officecli URL on Electron', async () => {
    startInvokeMock.mockResolvedValue({ url: '/api/office-watch-proxy/12345' });

    render(<OfficeWatchViewer docType='word' file_path='/tmp/report.docx' workspace='/tmp/ws' />);

    await waitFor(() => {
      expect(screen.getByTestId('webview-host')).toBeInTheDocument();
    });

    expect(startInvokeMock).toHaveBeenCalledWith({
      file_path: '/tmp/report.docx',
      workspace: '/tmp/ws',
    });
    expect(screen.getByTestId('webview-host')).toHaveAttribute('data-url', 'http://127.0.0.1:12345/');
  });

  it('renders install guide action for OFFICECLI_NOT_FOUND', async () => {
    startInvokeMock.mockResolvedValue({ url: '', error: 'OFFICECLI_NOT_FOUND' });

    render(<OfficeWatchViewer docType='word' file_path='/tmp/report.docx' />);

    expect(await screen.findByText('preview.office.errors.officecliNotFound')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'preview.office.installLinkText' }));
    expect(openExternalUrlMock).toHaveBeenCalled();
  });

  it('renders retry for OFFICECLI_PORT_TIMEOUT', async () => {
    startInvokeMock.mockResolvedValue({ url: '', error: 'OFFICECLI_PORT_TIMEOUT' });

    render(<OfficeWatchViewer docType='word' file_path='/tmp/report.docx' />);

    const retryButton = await screen.findByRole('button', { name: 'common.retry' });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(startInvokeMock).toHaveBeenCalledTimes(2);
    });
  });

  it('renders sandbox message for backend 403 errors', async () => {
    startInvokeMock.mockRejectedValue(
      new BackendHttpError({
        method: 'POST',
        path: '/api/word-preview/start',
        status: 403,
        body: { code: 'PATH_OUTSIDE_SANDBOX', error: 'outside sandbox' },
      })
    );

    render(<OfficeWatchViewer docType='word' file_path='/tmp/report.docx' />);

    expect(await screen.findByText('preview.office.errors.outsideSandbox')).toBeInTheDocument();
  });
});
