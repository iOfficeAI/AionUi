/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import MobileActionSheet from '@/renderer/components/chat/MobileActionSheet';
import type { MobileActionSheetEntry } from '@/renderer/components/chat/MobileActionSheet/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Left: () => <span aria-hidden='true'>‹</span>,
  Right: () => <span aria-hidden='true'>›</span>,
}));

describe('MobileActionSheet', () => {
  it('does not render when closed', () => {
    render(<MobileActionSheet open={false} onClose={vi.fn()} entries={[]} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a submenu and, for a single-select entry, slides back on select without closing', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const entries: MobileActionSheetEntry[] = [
      {
        key: 'model',
        label: 'Model',
        meta: 'gpt-5.5',
        submenu: {
          title: 'Model',
          options: [
            { key: 'a', label: 'gpt-5.5', active: true },
            { key: 'b', label: 'gpt-5.4' },
          ],
          onSelect,
        },
      },
    ];
    render(<MobileActionSheet open onClose={onClose} entries={entries} />);

    fireEvent.click(screen.getByTestId('mobile-action-sheet-model'));
    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-b'));

    expect(onSelect).toHaveBeenCalledWith('b');
    // Single-select keeps the sheet open (slides back to the main pane).
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a multi-select submenu open across several toggles', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const entries: MobileActionSheetEntry[] = [
      {
        key: 'skills',
        label: 'Skills',
        submenu: {
          title: 'Skills',
          multiSelect: true,
          options: [
            { key: 's1', label: 'Code review', active: true },
            { key: 's2', label: 'PPT' },
            { key: 's3', label: 'Research' },
          ],
          onSelect,
        },
      },
    ];
    render(<MobileActionSheet open onClose={onClose} entries={entries} />);

    fireEvent.click(screen.getByTestId('mobile-action-sheet-skills'));
    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-s2'));
    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-s3'));

    // Multi-select toggles fire onSelect and never close the sheet.
    expect(onSelect).toHaveBeenNthCalledWith(1, 's2');
    expect(onSelect).toHaveBeenNthCalledWith(2, 's3');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('runs an action entry and closes the sheet', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const entries: MobileActionSheetEntry[] = [{ key: 'attach', label: 'Add files', onClick }];
    render(<MobileActionSheet open onClose={onClose} entries={entries} />);

    fireEvent.click(screen.getByTestId('mobile-action-sheet-attach'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
