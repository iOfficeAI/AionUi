/**
 * Clears transient history state without rewriting the current browser URL.
 *
 * HashRouter keeps the real browser pathname at `/` and stores the app route
 * in `window.location.hash`. Passing a React Router pathname into
 * `history.replaceState()` would leak the virtual route into the real
 * pathname, breaking refresh/deep-link behavior.
 */
export function clearHistoryStatePreservingUrl(history: History = window.history): void {
  history.replaceState(null, '');
}
