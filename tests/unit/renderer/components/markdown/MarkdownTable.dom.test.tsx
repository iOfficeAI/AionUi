import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import MarkdownView from '@/renderer/components/Markdown/index';

vi.mock('@/renderer/components/Markdown/MermaidBlock', () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <div data-testid='mermaid-block'>{code}</div>,
}));

vi.mock('@/renderer/components/Markdown/CodeBlock', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <pre data-testid='code-block'>{children}</pre>,
}));

vi.mock('@/renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img data-testid='local-image' src={src} alt={alt} />,
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue(''),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('MarkdownView table rendering', () => {
  it('renders markdown table with rows and cells via shadow DOM', async () => {
    const markdown = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1  | Cell 2  |
| Cell 3  | Cell 4  |`;

    const { container } = render(<MarkdownView>{markdown}</MarkdownView>);

    const host = container.querySelector('.markdown-shadow') as HTMLDivElement;
    await waitFor(() => expect(host).toBeTruthy());
    await waitFor(() => expect(host.shadowRoot).toBeTruthy());

    const shadow = host.shadowRoot!;
    const table = shadow.querySelector('table');
    expect(table).toBeTruthy();

    const headers = shadow.querySelectorAll('th');
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent('Header 1');
    expect(headers[1]).toHaveTextContent('Header 2');

    const cells = shadow.querySelectorAll('td');
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent('Cell 1');
    expect(cells[1]).toHaveTextContent('Cell 2');
    expect(cells[2]).toHaveTextContent('Cell 3');
    expect(cells[3]).toHaveTextContent('Cell 4');
  });

  it('wraps table in scrollable div', async () => {
    const markdown = `| A | B |
|---|---|
| 1 | 2 |`;

    const { container } = render(<MarkdownView>{markdown}</MarkdownView>);

    const host = container.querySelector('.markdown-shadow') as HTMLDivElement;
    await waitFor(() => expect(host).toBeTruthy());
    await waitFor(() => expect(host.shadowRoot).toBeTruthy());

    const shadow = host.shadowRoot!;
    const table = shadow.querySelector('table');
    expect(table).toBeTruthy();
    const parentDiv = table!.parentElement;
    expect(parentDiv).toBeTruthy();
    expect(parentDiv!.tagName.toLowerCase()).toBe('div');
    expect(parentDiv!.style.overflowX).toBe('auto');
  });

  it('applies border and padding styles to cells', async () => {
    const markdown = `| H |
|---|
| C |`;

    const { container } = render(<MarkdownView>{markdown}</MarkdownView>);

    const host = container.querySelector('.markdown-shadow') as HTMLDivElement;
    await waitFor(() => expect(host).toBeTruthy());
    await waitFor(() => expect(host.shadowRoot).toBeTruthy());

    const shadow = host.shadowRoot!;
    const td = shadow.querySelector('td');
    expect(td).toBeTruthy();
    expect(td!.style.border).toBe('1px solid var(--bg-3)');
    expect(td!.style.padding).toBe('8px');

    const th = shadow.querySelector('th');
    expect(th).toBeTruthy();
    expect(th!.style.border).toBe('1px solid var(--bg-3)');
    expect(th!.style.backgroundColor).toBe('var(--bg-2)');
    expect(th!.style.fontWeight).toBe('600');
  });
});