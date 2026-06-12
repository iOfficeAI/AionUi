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
  it('renders a builtin avatar tab and returns the selected builtin avatar route', async () => {
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
    fireEvent.click(screen.getByText('Built-in'));
    fireEvent.click(screen.getByAltText('Dashboard Creator'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('/api/assistants/dashboard-creator/avatar');
    });
  });
});
