import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

describe('EmojiPicker', () => {
  it('renders the builtin avatar tab first with iconized labels and returns the selected builtin avatar route', async () => {
    const onChange = vi.fn();

    render(
      <ConfigProvider>
        <EmojiPicker
          builtinAvatars={[
            {
              id: 'dashboard-creator',
              label: 'Dashboard Creator',
              src: '/api/assistants/dashboard-creator/avatar',
            },
          ]}
          onChange={onChange}
        >
          <button type='button'>Open picker</button>
        </EmojiPicker>
      </ConfigProvider>
    );

    fireEvent.click(screen.getByText('Open picker'));
    const tabs = screen.getAllByRole('tab');
    const tabTitles = tabs.map((tab) => tab.textContent);
    expect(tabTitles).toEqual(['👤 Built-in', '🙂 Emoji']);

    fireEvent.click(tabs[0]!);
    fireEvent.click(screen.getByAltText('Dashboard Creator'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('/api/assistants/dashboard-creator/avatar');
    });
  });

  it('renders the picker content directly (no popover trigger) in inline mode and fires onChange on emoji select', async () => {
    const onChange = vi.fn();

    const { container } = render(
      <ConfigProvider>
        <EmojiPicker inline onChange={onChange} />
      </ConfigProvider>
    );

    // Inline mode skips the Popover: the emoji grid must be present immediately
    // without any trigger to click.
    const emojiButtons = Array.from(container.querySelectorAll('.grid button')).filter(
      (btn) => (btn.textContent ?? '').trim().length > 0
    );
    expect(emojiButtons.length).toBeGreaterThan(0);

    const firstEmoji = (emojiButtons[0].textContent ?? '').trim();
    fireEvent.click(emojiButtons[0]);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(firstEmoji);
    });
  });
});
