import { describe, expect, it } from 'vitest';
import { BackendHttpError } from '../../src/common/adapter/httpBridge';
import { classifyPreviewError, previewErrorToI18nKey } from '../../src/renderer/utils/previewError';

describe('previewError', () => {
  it('maps backend codes to preview error kinds', () => {
    expect(
      classifyPreviewError(
        new BackendHttpError({
          method: 'POST',
          path: '/api/fs/read',
          status: 403,
          body: { code: 'PATH_OUTSIDE_SANDBOX', error: 'outside sandbox' },
        })
      )
    ).toBe('sandbox');

    expect(
      classifyPreviewError(
        new BackendHttpError({
          method: 'POST',
          path: '/api/fs/read',
          status: 404,
          body: { code: 'FILE_NOT_FOUND', error: 'missing' },
        })
      )
    ).toBe('not_found');

    expect(
      classifyPreviewError(
        new BackendHttpError({
          method: 'POST',
          path: '/api/word-preview/start',
          status: 504,
          body: { code: 'OFFICECLI_PORT_TIMEOUT', error: 'timeout' },
        })
      )
    ).toBe('timeout');
  });

  it('maps preview error kinds to i18n keys', () => {
    expect(previewErrorToI18nKey('sandbox')).toBe('conversation.workspace.preview.errors.outsideSandbox');
    expect(previewErrorToI18nKey('not_found')).toBe('conversation.workspace.preview.errors.notFound');
    expect(previewErrorToI18nKey('timeout')).toBe('conversation.workspace.preview.errors.timeout');
    expect(previewErrorToI18nKey('unknown')).toBe('conversation.workspace.contextMenu.previewFailed');
  });
});
