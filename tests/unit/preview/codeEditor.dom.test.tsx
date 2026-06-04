import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import CodeEditor from '@/renderer/pages/conversation/Preview/components/editors/CodeEditor';

afterEach(() => vi.clearAllMocks());

describe('CodeEditor', () => {
  it('renders a CodeMirror editor with the given value', () => {
    const { container } = render(<CodeEditor value={'const a = 1;'} onChange={() => {}} language='javascript' />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    expect(container.textContent).toContain('const a = 1;');
  });

  it('renders read-only editor without crashing', () => {
    const { container } = render(<CodeEditor value={'x'} onChange={() => {}} readOnly />);
    expect(container.querySelector('.cm-editor')).not.toBeNull();
  });
});
