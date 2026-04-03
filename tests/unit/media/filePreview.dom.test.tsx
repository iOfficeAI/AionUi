import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FilePreview from '@/renderer/components/media/FilePreview';

const { mockGetFileMetadataInvoke } = vi.hoisted(() => ({
  mockGetFileMetadataInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: {
        invoke: mockGetFileMetadataInvoke,
      },
      getImageBase64: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    onClick,
  }: {
    children?: React.ReactNode;
    icon?: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  }) =>
    React.createElement(
      'button',
      {
        'aria-label': 'Remove file',
        onClick,
        type: 'button',
      },
      children ?? icon
    ),
  Image: ({ alt }: { alt?: string }) => React.createElement('img', { alt }),
}));

describe('FilePreview mention variant', () => {
  it('renders a compact blue mention label without loading metadata and supports removal', () => {
    const onRemove = vi.fn();

    render(
      <FilePreview
        displayLabel='examples/DESIGN.md'
        onRemove={onRemove}
        path='/workspace/examples/DESIGN.md'
        variant='mention'
      />
    );

    expect(screen.getByText('examples/DESIGN.md')).toBeInTheDocument();
    expect(mockGetFileMetadataInvoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
