import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createConversationComposerControlSlots } from '@/renderer/components/chat/SendBox/composerControls';
import React from 'react';

describe('conversation composer control layout', () => {
  it('keeps runtime controls in the same global positions', () => {
    const slots = createConversationComposerControlSlots({
      attachment: <span>attachment</span>,
      permission: <span>permission</span>,
      usage: <span>usage</span>,
      model: <span>model</span>,
    });

    render(
      <>
        <div data-testid='leading-controls'>{slots.tools}</div>
        <div data-testid='trailing-controls'>{slots.rightTools}</div>
      </>
    );

    expect(screen.getByTestId('leading-controls')).toHaveTextContent('attachmentpermission');
    expect(screen.getByTestId('trailing-controls')).toHaveTextContent('usagemodel');
  });
});
