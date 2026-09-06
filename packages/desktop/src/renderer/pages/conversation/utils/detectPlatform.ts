import { isElectronDesktop } from '@/renderer/utils/platform';

/**
 * Whether the pointer cannot hover — a touch screen, a pen, a TV remote.
 *
 * Asked directly, because viewport width does not answer it: a touch-capable
 * desktop is not "mobile", and a hover-reveal control on one is a control
 * nobody can see. An environment that cannot say is treated as able to hover,
 * which keeps the reveal behaviour rather than pinning controls open.
 */
export const isNoHoverPointer = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
};

/**
 * Detect whether the current viewport is mobile-sized or touch-capable.
 * Returns `true` for narrow viewports or small touch-first screens.
 */
export const detectMobileViewportOrTouch = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isElectronDesktop()) {
    return window.innerWidth < 768;
  }
  const width = window.innerWidth;
  const byWidth = width < 768;
  const smallScreen = width < 1024;
  const byMedia = isNoHoverPointer();
  const byTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return byWidth || (smallScreen && (byMedia || byTouchPoints));
};

/** Check if the current user-agent indicates macOS. */
export const isMacEnvironment = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /mac/i.test(navigator.userAgent);
};

/** Check if the current user-agent indicates Windows. */
export const isWindowsEnvironment = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /win/i.test(navigator.userAgent);
};
