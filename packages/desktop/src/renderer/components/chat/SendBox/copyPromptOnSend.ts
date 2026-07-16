import { copyText } from '@/renderer/utils/ui/clipboard';

type SendMessageWithPromptCopyOptions = {
  prompt: string;
  message: string;
  copyEnabled: boolean;
  onCopyError: () => void;
  onSend: (message: string) => void | Promise<void>;
};

export async function sendMessageWithPromptCopy({
  prompt,
  message,
  copyEnabled,
  onCopyError,
  onSend,
}: SendMessageWithPromptCopyOptions): Promise<void> {
  if (copyEnabled && prompt.length > 0) {
    try {
      await copyText(prompt);
    } catch {
      onCopyError();
    }
  }

  await onSend(message);
}
