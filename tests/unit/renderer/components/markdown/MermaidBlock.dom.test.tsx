import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mermaidMock, copyTextMock, messageSuccessMock, messageErrorMock, openPreviewMock } = vi.hoisted(() => ({
  mermaidMock: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
  copyTextMock: vi.fn(),
  messageSuccessMock: vi.fn(),
  messageErrorMock: vi.fn(),
  openPreviewMock: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: mermaidMock,
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: copyTextMock,
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    success: messageSuccessMock,
    error: messageErrorMock,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: openPreviewMock,
  }),
}));

import MermaidBlock from '@/renderer/components/Markdown/MermaidBlock';

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
};

describe('MermaidBlock', () => {
  beforeEach(() => {
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    copyTextMock.mockReset();
    messageSuccessMock.mockReset();
    messageErrorMock.mockReset();
    openPreviewMock.mockReset();
  });

  it('renders the generated SVG when Mermaid parsing succeeds', async () => {
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 100 100"><text x="0" y="20">diagram</text></svg>',
    });

    const { container, getByText } = render(<MermaidBlock code={'flowchart TD\nA-->B'} />);

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });

    expect(getByText('preview.preview')).toBeInTheDocument();
    expect(getByText('preview.source')).toBeInTheDocument();
    expect(mermaidMock.initialize).toHaveBeenCalledTimes(1);
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
  });

  it('falls back to source view when Mermaid rendering fails', async () => {
    mermaidMock.render.mockRejectedValue(new Error('parse failed'));

    const { container, queryByTestId } = render(<MermaidBlock code={'flowchart TD\nA-->B'} />);

    await waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    });

    expect(queryByTestId('mermaid-diagram')).toBeNull();
    expect(container.textContent).toContain('flowchart TD');
    expect(container.textContent).toContain('A-->B');
  });

  it('copies the Mermaid source from the header action', async () => {
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 100 100"><text x="0" y="20">diagram</text></svg>',
    });
    copyTextMock.mockResolvedValue(undefined);

    const { getByTestId, container } = render(<MermaidBlock code={'flowchart TD\nA-->B'} />);

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });

    fireEvent.click(getByTestId('mermaid-copy'));

    await waitFor(() => {
      expect(copyTextMock).toHaveBeenCalledWith('flowchart TD\nA-->B');
    });
    expect(messageSuccessMock).toHaveBeenCalledWith('common.copySuccess');
  });

  it('shows a loading placeholder before the diagram is ready', async () => {
    const deferred = createDeferred<{ svg: string }>();
    mermaidMock.render.mockReturnValue(deferred.promise);

    const { getByTestId, queryByTestId } = render(<MermaidBlock code={'flowchart TD\nA-->B'} />);

    expect(getByTestId('mermaid-loading')).toHaveTextContent('preview.loading');
    expect(queryByTestId('mermaid-diagram')).toBeNull();

    deferred.resolve({
      svg: '<svg viewBox="0 0 100 100"><text x="0" y="20">diagram</text></svg>',
    });

    await waitFor(() => {
      expect(queryByTestId('mermaid-diagram')).not.toBeNull();
    });
    expect(queryByTestId('mermaid-loading')).toBeNull();
  });

  it('opens the current Mermaid source in the preview panel', async () => {
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 100 100"><text x="0" y="20">diagram</text></svg>',
    });

    const { getByTestId, container } = render(<MermaidBlock code={'flowchart TD\nA-->B'} />);

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });

    fireEvent.click(getByTestId('mermaid-open-in-panel'));

    expect(openPreviewMock).toHaveBeenCalledWith('```mermaid\nflowchart TD\nA-->B\n```', 'markdown', {
      title: 'preview.mermaidTitle: flowchart TD',
      editable: false,
    });
  });

  it('keeps the source view selected after Mermaid content updates', async () => {
    mermaidMock.render.mockResolvedValue({
      svg: '<svg viewBox="0 0 100 100"><text x="0" y="20">diagram</text></svg>',
    });

    const { getByText, rerender, queryByTestId, container } = render(<MermaidBlock code={'flowchart TD\nA-->B'} />);

    await waitFor(() => {
      expect(queryByTestId('mermaid-diagram')).not.toBeNull();
    });

    fireEvent.mouseDown(getByText('preview.source'), { button: 0 });
    expect(queryByTestId('mermaid-diagram')).toBeNull();
    expect(container.textContent).toContain('flowchart TD');

    rerender(<MermaidBlock code={'flowchart TD\nA-->B\nB-->C'} />);

    await waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
    });

    expect(queryByTestId('mermaid-diagram')).toBeNull();
    expect(container.textContent).toContain('B-->C');
  });
});
