import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/components/Markdown/MermaidBlock', () => ({
  __esModule: true,
  default: ({ code }: { code: string }) => <div data-testid='mermaid-block'>{code}</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import CodeBlock from '@/renderer/components/Markdown/CodeBlock';

describe('CodeBlock', () => {
  it('routes mermaid fenced code blocks to the Mermaid renderer', () => {
    const { getByTestId } = render(<CodeBlock className='language-mermaid'>{'flowchart TD\nA-->B'}</CodeBlock>);

    expect(getByTestId('mermaid-block')).toHaveTextContent('flowchart TD');
    expect(getByTestId('mermaid-block')).toHaveTextContent('A-->B');
  });
});
