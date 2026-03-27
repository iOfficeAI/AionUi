import { describe, expect, it, afterEach } from 'vitest';
import {
  PANEL_MARGIN,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
} from '@/renderer/pages/conversation/components/ConversationTitleMinimap/minimapTypes';
import { getPanelWidth } from '@/renderer/pages/conversation/components/ConversationTitleMinimap/minimapUtils';

describe('getPanelWidth', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true, configurable: true });
  });

  it('returns full available width (minus margins) on narrow viewports (< 768px)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true, configurable: true });
    const width = getPanelWidth();
    expect(width).toBe(400 - PANEL_MARGIN * 2);
  });

  it('returns at least 240px on very narrow viewports', () => {
    Object.defineProperty(window, 'innerWidth', { value: 250, writable: true, configurable: true });
    const width = getPanelWidth();
    expect(width).toBe(240);
  });

  it('respects PANEL_MIN_WIDTH on desktop viewports when it fits', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true, configurable: true });
    const width = getPanelWidth();
    expect(width).toBeGreaterThanOrEqual(PANEL_MIN_WIDTH);
  });

  it('does not exceed PANEL_MAX_WIDTH on very wide viewports', () => {
    Object.defineProperty(window, 'innerWidth', { value: 3000, writable: true, configurable: true });
    const width = getPanelWidth();
    expect(width).toBeLessThanOrEqual(PANEL_MAX_WIDTH);
  });

  it('returns a width that fits within the viewport with margins', () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true, configurable: true });
    const width = getPanelWidth();
    expect(width).toBeLessThanOrEqual(600 - PANEL_MARGIN * 2);
  });
});
