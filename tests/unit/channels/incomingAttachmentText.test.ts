import { describe, expect, it } from 'vitest';
import { buildIncomingAttachmentText, hasIncomingChatPayload } from '@process/channels/utils/incomingAttachmentText';

describe('incomingAttachmentText', () => {
  it('appends image and file markers after the original text', () => {
    const result = buildIncomingAttachmentText(
      'Please inspect these uploads.',
      [
        { type: 'photo', fileId: 'img-1' },
        { type: 'document', fileId: 'file-1', fileName: 'report.pdf' },
      ],
      ['/tmp/image.png', '/tmp/report.pdf']
    );

    expect(result).toBe(
      'Please inspect these uploads.\n\n[Image: /tmp/image.png]\n[File "report.pdf": /tmp/report.pdf]'
    );
  });

  it('uses attachment markers as the whole message when no text is present', () => {
    const result = buildIncomingAttachmentText('', [{ type: 'photo', fileId: 'img-1' }], ['/tmp/image.png']);

    expect(result).toBe('[Image: /tmp/image.png]');
  });

  it('treats files-only payloads as valid chat input', () => {
    expect(hasIncomingChatPayload('', ['/tmp/image.png'])).toBe(true);
    expect(hasIncomingChatPayload('   ', undefined)).toBe(false);
  });
});
