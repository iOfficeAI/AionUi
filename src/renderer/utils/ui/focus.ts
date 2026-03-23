/**
 * 主动清理当前焦点，避免移动端在路由切换后保持输入态并持续唤起软键盘。
 */
export const blurActiveElement = (): void => {
  if (typeof document === 'undefined') return;
  const active = document.activeElement as HTMLElement | null;
  if (!active) return;
  if (typeof active.blur === 'function') {
    active.blur();
  }
};

let mobileFocusBlockedUntil = 0;

export const blockMobileInputFocus = (durationMs = 700): void => {
  mobileFocusBlockedUntil = Date.now() + Math.max(0, durationMs);
};

export const shouldBlockMobileInputFocus = (): boolean => Date.now() < mobileFocusBlockedUntil;
