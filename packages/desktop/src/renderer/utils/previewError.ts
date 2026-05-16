import { isBackendHttpError } from '@/common/adapter/httpBridge';

export type PreviewErrorKind = 'sandbox' | 'not_found' | 'timeout' | 'too_large' | 'unknown';

const BACKEND_ERROR_KIND_MAP: Record<string, PreviewErrorKind> = {
  PATH_OUTSIDE_SANDBOX: 'sandbox',
  FILE_NOT_FOUND: 'not_found',
  NOT_FOUND: 'not_found',
  TIMEOUT: 'timeout',
  OFFICECLI_PORT_TIMEOUT: 'timeout',
};

const PREVIEW_ERROR_I18N_KEY_MAP: Record<PreviewErrorKind, string> = {
  sandbox: 'conversation.workspace.preview.errors.outsideSandbox',
  not_found: 'conversation.workspace.preview.errors.notFound',
  timeout: 'conversation.workspace.preview.errors.timeout',
  too_large: 'conversation.workspace.contextMenu.previewFailed',
  unknown: 'conversation.workspace.contextMenu.previewFailed',
};

export function classifyPreviewError(error: unknown): PreviewErrorKind {
  if (error == null) {
    return 'not_found';
  }

  if (isBackendHttpError(error)) {
    if (error.code && BACKEND_ERROR_KIND_MAP[error.code]) {
      return BACKEND_ERROR_KIND_MAP[error.code];
    }
    if (error.status === 404) {
      return 'not_found';
    }
  }

  const message =
    typeof error === 'string' ? error : error instanceof Error ? error.message : JSON.stringify(error ?? '');

  if (/timeout/i.test(message)) {
    return 'timeout';
  }

  if (/too large|exceeds|payload too large/i.test(message)) {
    return 'too_large';
  }

  return 'unknown';
}

export function previewErrorToI18nKey(kind: PreviewErrorKind): string {
  return PREVIEW_ERROR_I18N_KEY_MAP[kind];
}
