/**
 * Decide whether Electron may attach the Local-mode backend capability to a
 * Chromium-owned request. Only the trusted main renderer is eligible;
 * previews, extension views, guest WebViews, and unrelated local services are
 * intentionally excluded even when they share Electron's default session.
 */
export function shouldAttachLocalBackendSecret(
  request: { url: string; webContentsId?: number },
  trustedWebContentsId: number | undefined,
  backendPort: number
): boolean {
  if (!isTrustedLocalBackendRequester(request.webContentsId, trustedWebContentsId)) return false;

  try {
    const url = new URL(request.url);
    return (
      (url.protocol === 'http:' || url.protocol === 'ws:') &&
      url.hostname === '127.0.0.1' &&
      Number(url.port) === backendPort
    );
  } catch {
    return false;
  }
}

/** Only the main renderer may receive the capability through preload IPC. */
export function isTrustedLocalBackendRequester(
  requesterWebContentsId: number | undefined,
  trustedWebContentsId: number | undefined
): boolean {
  return trustedWebContentsId !== undefined && requesterWebContentsId === trustedWebContentsId;
}
