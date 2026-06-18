/**
 * Build a valid src for the PDF <webview>.
 *
 * On Windows, file paths use backslashes (e.g. `C:\Users\me\a.pdf`). Feeding such a
 * path straight into `file://${encodeURI(path)}` yields `file://C:%5CUsers%5C...`,
 * a malformed URL that fails to load (ERR_FAILED) and renders a blank preview.
 *
 * Normalize backslashes to forward slashes, guarantee the leading slash so the result
 * is a proper `file:///` URL on every platform, and encode segments (spaces / CJK) via
 * encodeURI (which preserves `/` and `:`).
 */
export const buildPdfSrc = (file_path?: string, content?: string): string => {
  if (file_path) {
    const normalized = file_path.replace(/\\/g, '/');
    const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `file://${encodeURI(withLeadingSlash)}`;
  }
  return content || '';
};
