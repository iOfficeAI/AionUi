import { copyText } from '@/renderer/utils/ui/clipboard';
import { sendMessageWithPromptCopy } from '@/renderer/components/chat/SendBox/copyPromptOnSend';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn(),
}));

describe('sendMessageWithPromptCopy', () => {
  beforeEach(() => {
    vi.mocked(copyText).mockReset();
  });

  it('sends without touching the clipboard when the preference is disabled', async () => {
    const onSend = vi.fn();

    await sendMessageWithPromptCopy({
      prompt: 'keep this prompt',
      message: 'keep this prompt',
      copyEnabled: false,
      onCopyError: vi.fn(),
      onSend,
    });

    expect(copyText).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledWith('keep this prompt');
  });

  it('does not clear the clipboard when a send has no user-authored prompt', async () => {
    const onSend = vi.fn();

    await sendMessageWithPromptCopy({
      prompt: '',
      message: 'DOM Snippet (main):\n```html\n<main />\n```',
      copyEnabled: true,
      onCopyError: vi.fn(),
      onSend,
    });

    expect(copyText).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('copies the exact user-authored prompt before sending the final message', async () => {
    const order: string[] = [];
    vi.mocked(copyText).mockImplementation(async () => {
      order.push('copy');
    });
    const prompt = 'first line\n  indented second line  ';

    await sendMessageWithPromptCopy({
      prompt,
      message: `> quoted\n\n${prompt}`,
      copyEnabled: true,
      onCopyError: vi.fn(),
      onSend: async () => {
        order.push('send');
      },
    });

    expect(copyText).toHaveBeenCalledExactlyOnceWith(prompt);
    expect(order).toEqual(['copy', 'send']);
  });

  it('reports clipboard failures and still sends the message', async () => {
    const onCopyError = vi.fn();
    const onSend = vi.fn();
    vi.mocked(copyText).mockRejectedValue(new Error('clipboard denied'));

    await sendMessageWithPromptCopy({
      prompt: 'still send this',
      message: 'still send this',
      copyEnabled: true,
      onCopyError,
      onSend,
    });

    expect(onCopyError).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith('still send this');
  });
});
