import path from 'node:path';
import type { IUnifiedAttachment } from '../types';

export function hasIncomingChatPayload(text: string, filePaths?: string[]): boolean {
  return text.trim().length > 0 || (filePaths?.length ?? 0) > 0;
}

export function buildIncomingAttachmentText(
  text: string,
  attachments?: IUnifiedAttachment[],
  filePaths?: string[]
): string {
  if (!filePaths || filePaths.length === 0) {
    return text;
  }

  const attachmentLines = filePaths.map((filePath, index) => {
    const attachment = attachments?.[index];
    if (attachment?.type === 'photo') {
      return `[Image: ${filePath}]`;
    }

    const fileName = attachment?.fileName || path.basename(filePath);
    return `[File "${fileName}": ${filePath}]`;
  });

  return text ? `${text}\n\n${attachmentLines.join('\n')}` : attachmentLines.join('\n');
}
