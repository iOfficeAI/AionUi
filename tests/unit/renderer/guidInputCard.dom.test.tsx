import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/components/media/FilePreview', () => ({
  __esModule: true,
  default: () => React.createElement('div', {}, 'FilePreview'),
}));

vi.mock('@/renderer/components/media/UploadProgressBar', () => ({
  __esModule: true,
  default: () => React.createElement('div', {}, 'UploadProgressBar'),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/chat/useCompositionInput', () => ({
  useCompositionInput: () => ({
    compositionHandlers: {},
    isComposing: { current: false },
  }),
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    secondary: '#999999',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Input: {
    TextArea: ({
      onChange,
      value,
      autoSize: _autoSize,
      ...props
    }: React.ComponentProps<'textarea'> & {
      autoSize?: unknown;
      value?: string;
    }) =>
      React.createElement('textarea', {
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(event.target.value),
        value,
        ...props,
      }),
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, {}, children),
}));

vi.mock('@arco-design/web-react/icon', () => ({
  IconClose: () => React.createElement('span', {}, 'IconClose'),
}));

vi.mock('@icon-park/react', () => ({
  FolderOpen: () => React.createElement('span', {}, 'FolderOpen'),
}));

vi.mock('@/renderer/pages/guid/index.module.css', () => ({
  default: {
    guidInputCard: 'guidInputCard',
    lightPlaceholder: 'lightPlaceholder',
  },
}));

import GuidInputCard from '@/renderer/pages/guid/components/GuidInputCard';

describe('GuidInputCard spellcheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables native spellcheck for the welcome-page input', () => {
    render(
      <GuidInputCard
        actionRow={React.createElement('div', {}, 'actions')}
        activeBorderColor='#000'
        dir=''
        dragHandlers={{}}
        inactiveBorderColor='#ccc'
        input=''
        isFileDragging={false}
        isInputActive={false}
        mentionDropdown={null}
        mentionOpen={false}
        mentionSelectorBadge={null}
        onBlur={vi.fn()}
        onClearDir={vi.fn()}
        onFocus={vi.fn()}
        onInputChange={vi.fn()}
        onKeyDown={vi.fn()}
        onPaste={vi.fn()}
        onRemoveFile={vi.fn()}
        activeShadow='none'
        files={[]}
        placeholder='Type here'
      />
    );

    expect(screen.getByRole('textbox')).toHaveAttribute('spellcheck', 'false');
  });
});
