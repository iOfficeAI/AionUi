import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StreamingMarkdownView, { hasClosedFencedCodeBlocks } from '@/renderer/components/Markdown/StreamingMarkdownView';

const streamdownMock = vi.hoisted(() =>
  vi.fn(({ children }: { children?: React.ReactNode }) => <div data-testid='streamdown'>{children}</div>)
);

vi.mock('streamdown', () => ({
  Streamdown: (props: { children?: React.ReactNode }) => streamdownMock(props),
}));

vi.mock('@/renderer/components/Markdown/ShadowView', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/hooks/file/useMarkdownLinkHandler', () => ({
  useMarkdownLinkHandler: () => vi.fn(),
}));

vi.mock('@renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe('StreamingMarkdownView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects closed fenced code blocks correctly', () => {
    expect(hasClosedFencedCodeBlocks('hello\n```ts\nconst a = 1;\n```')).toBe(true);
    expect(hasClosedFencedCodeBlocks('hello\n~~~js\nconst a = 1;\n~~~')).toBe(true);
    expect(hasClosedFencedCodeBlocks('hello\n```ts\nconst a = 1;')).toBe(false);
    expect(hasClosedFencedCodeBlocks('hello\n~~~js\nconst a = 1;')).toBe(false);
  });

  it('falls back to raw text while a fenced code block is still open', () => {
    const { container } = render(<StreamingMarkdownView>{'before\n```ts\nconst a = 1;'}</StreamingMarkdownView>);

    expect(screen.queryByTestId('streamdown')).not.toBeInTheDocument();
    expect(container.textContent).toContain('before\n```ts\nconst a = 1;');
  });

  it('renders with streamdown after the fenced code block closes', () => {
    render(<StreamingMarkdownView>{'before\n```ts\nconst a = 1;\n```'}</StreamingMarkdownView>);

    expect(screen.getByTestId('streamdown')).toBeInTheDocument();
    expect(streamdownMock).toHaveBeenCalledOnce();
  });

  it('falls back to raw text while an inline code span is still open', () => {
    const text = '运行链路里应该真的有一个 `process_data 或类似';
    const { container } = render(<StreamingMarkdownView>{text}</StreamingMarkdownView>);

    expect(screen.queryByTestId('streamdown')).not.toBeInTheDocument();
    expect(container.textContent).toContain(text);
  });

  it('renders with streamdown after the inline code span closes', () => {
    render(<StreamingMarkdownView>{'运行链路里应该真的有一个 `process_data` 或类似'}</StreamingMarkdownView>);

    expect(screen.getByTestId('streamdown')).toBeInTheDocument();
    expect(streamdownMock).toHaveBeenCalledOnce();
  });
});
