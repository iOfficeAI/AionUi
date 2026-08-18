import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeamPresetEditorModal from '@/renderer/pages/team/components/TeamPresetEditorModal';

const { assistants, aionModalProps } = vi.hoisted(() => ({
  assistants: [{ id: 'a1', name: 'Lead', backend: 'aionrs', team_selectable: true }],
  aionModalProps: {} as Record<string, unknown>,
}));
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return { ...actual, Message: { warning: vi.fn(), error: vi.fn() } };
});
vi.mock('@/renderer/pages/team/hooks/useTeamAssistantOptions', () => ({
  useTeamAssistantOptions: () => ({ assistants }),
}));

vi.mock('@renderer/components/base/AionModal', () => ({
  default: (props: {
    children: React.ReactNode;
    footer?: { render: () => React.ReactNode };
    header?: { title?: React.ReactNode };
  }) => {
    // Capture the full prop contract so tests can assert layering props
    // (wrapStyle/maskStyle zIndex, autoFocus) that the simplified DOM drops.
    Object.assign(aionModalProps, props);
    const { children, footer, header } = props;
    return (
      <div role='dialog'>
        <h2>{header?.title}</h2>
        {children}
        {footer?.render()}
      </div>
    );
  },
}));

describe('TeamPresetEditorModal', () => {
  beforeEach(() => {
    for (const key of Object.keys(aionModalProps)) delete aionModalProps[key];
    assistants.splice(0, assistants.length, { id: 'a1', name: 'Lead', backend: 'aionrs', team_selectable: true });
  });

  it('stacks above the create modal via wrap/mask zIndex (reference e3f154559)', () => {
    render(<TeamPresetEditorModal visible onCancel={vi.fn()} onSaved={vi.fn()} />);

    // Create modal uses wrap 10000 / mask 9999; the editor must sit one level above,
    // otherwise the parent dialog covers the editor (the reported regression).
    expect(aionModalProps.wrapStyle).toEqual({ zIndex: 10001 });
    expect(aionModalProps.maskStyle).toEqual({ zIndex: 10000 });
    expect(aionModalProps.autoFocus).toBe(false);
  });

  it('aligns footer buttons and inputs to the reference sizing (e3f154559)', () => {
    render(<TeamPresetEditorModal visible onCancel={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByTestId('preset-editor-save')).toHaveClass('!h-38px', '!rounded-8px', '!text-13px');
    expect(screen.getByTestId('preset-editor-name')).toHaveClass('!h-38px', '!rounded-8px', '!text-13px');
  });

  it('centers a dashed empty placeholder when no assistants are selectable', () => {
    assistants.length = 0;
    render(<TeamPresetEditorModal visible onCancel={vi.fn()} onSaved={vi.fn()} />);

    const empty = screen.getByText('No supported assistants available');
    expect(empty).toHaveClass('flex', 'items-center', 'justify-center', 'border-dashed');
  });
  it('renders the complete editor and blocks an empty save', () => {
    const onSaved = vi.fn();
    render(<TeamPresetEditorModal visible onCancel={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByTestId('preset-editor-name')).toBeInTheDocument();
    expect(screen.getByTestId('preset-editor-tag-input')).toBeInTheDocument();
    expect(screen.getByTestId('preset-editor-example-input')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('preset-editor-save'));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('supports tags, examples, member selection and save payload', () => {
    const onSaved = vi.fn();
    render(<TeamPresetEditorModal visible onCancel={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByTestId('preset-editor-name'), { target: { value: 'Research' } });
    fireEvent.change(screen.getByTestId('preset-editor-tag-input'), { target: { value: 'analysis' } });
    fireEvent.click(screen.getAllByText('Add')[0]);
    fireEvent.change(screen.getByTestId('preset-editor-example-input'), { target: { value: 'Summarize papers' } });
    fireEvent.click(screen.getAllByText('Add')[1]);
    fireEvent.click(screen.getByTestId('preset-editor-agent-option-a1'));
    fireEvent.click(screen.getByTestId('preset-editor-save'));
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Research',
        expertise_tags: ['analysis'],
        example_prompts: ['Summarize papers'],
      }),
      undefined
    );
  });
});
