import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: { secondary: '#999999' },
}));

vi.mock('@/renderer/utils/file/diffUtils', () => ({
  extractContentFromDiff: vi.fn(() => ''),
  parseFilePathFromDiff: vi.fn(() => ''),
}));

vi.mock('@/renderer/utils/file/fileType', () => ({
  getFileTypeInfo: vi.fn(() => ({ contentType: 'text', editable: true, language: 'diff' })),
}));

vi.mock('@renderer/hooks/file/usePreviewLauncher', () => ({
  usePreviewLauncher: () => ({ launchPreview: vi.fn(), loading: false }),
}));

vi.mock('@renderer/components/chat/CollapsibleContent', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  Checkbox: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  ExpandDownOne: () => <span>expand</span>,
  FoldUpOne: () => <span>fold</span>,
  PreviewOpen: () => <span>preview</span>,
}));

vi.mock('diff2html', () => ({
  html: vi.fn(
    () =>
      '<div class="d2h-file-header"><div class="d2h-file-name">safe</div></div><div class="d2h-file-wrapper">diff</div>'
  ),
}));

import Diff2Html from '@/renderer/components/media/Diff2Html';

describe('Diff2Html', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('writes header titles as text instead of HTML', () => {
    render(<Diff2Html diff={'--- a\n+++ b'} title={'<img src=x onerror=alert(1)>unsafe'} />);

    const headerTitle = document.querySelector('.d2h-file-name');
    expect(headerTitle?.textContent).toBe('<img src=x onerror=alert(1)>unsafe');
    expect(headerTitle?.querySelector('img')).toBeNull();
  });
});
