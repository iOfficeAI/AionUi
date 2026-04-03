import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import MarqueePillLabel from '@renderer/components/agent/MarqueePillLabel';

/**
 * Helper to mock offsetWidth / clientWidth on elements.
 * jsdom doesn't compute layout, so all dimensions default to 0.
 */
function mockDimensions(el: HTMLElement, props: { offsetWidth?: number; clientWidth?: number }) {
  if (props.offsetWidth !== undefined) {
    Object.defineProperty(el, 'offsetWidth', { value: props.offsetWidth, configurable: true });
  }
  if (props.clientWidth !== undefined) {
    Object.defineProperty(el, 'clientWidth', { value: props.clientWidth, configurable: true });
  }
}

describe('MarqueePillLabel', () => {
  const LABEL = 'gpt-5.1-codex-max';

  describe('static rendering', () => {
    it('should render the text visible in a static span', () => {
      const { container } = render(<MarqueePillLabel>{LABEL}</MarqueePillLabel>);
      const root = container.firstElementChild as HTMLSpanElement;

      const staticSpan = root.children[1] as HTMLSpanElement;
      expect(staticSpan.textContent).toBe(LABEL);
      expect(staticSpan.classList.contains('invisible')).toBe(false);
    });

    it('should render a hidden measurement span with aria-hidden', () => {
      const { container } = render(<MarqueePillLabel>{LABEL}</MarqueePillLabel>);
      const root = container.firstElementChild as HTMLSpanElement;

      const measureSpan = root.children[0] as HTMLSpanElement;
      expect(measureSpan.getAttribute('aria-hidden')).toBe('true');
      expect(measureSpan.textContent).toBe(LABEL);
    });

    it('should render marquee span hidden by default', () => {
      const { container } = render(<MarqueePillLabel>{LABEL}</MarqueePillLabel>);
      const root = container.firstElementChild as HTMLSpanElement;

      const marqueeSpan = root.children[2] as HTMLSpanElement;
      expect(marqueeSpan.classList.contains('invisible')).toBe(true);
      expect(marqueeSpan.textContent).toContain(LABEL);
    });
  });

  describe('mouseEnter without overflow', () => {
    it('should not activate marquee when text fits within container', () => {
      const { container } = render(<MarqueePillLabel>{LABEL}</MarqueePillLabel>);
      const root = container.firstElementChild as HTMLSpanElement;
      const measureSpan = root.children[0] as HTMLSpanElement;
      const staticSpan = root.children[1] as HTMLSpanElement;
      const marqueeSpan = root.children[2] as HTMLSpanElement;

      mockDimensions(measureSpan, { offsetWidth: 100 });
      mockDimensions(root, { clientWidth: 120 });

      fireEvent.mouseEnter(root);

      expect(staticSpan.classList.contains('invisible')).toBe(false);
      expect(marqueeSpan.classList.contains('invisible')).toBe(true);
      expect(marqueeSpan.classList.contains('pill-marquee-track')).toBe(false);
    });
  });

  describe('mouseEnter with overflow', () => {
    let root: HTMLSpanElement;
    let measureSpan: HTMLSpanElement;
    let staticSpan: HTMLSpanElement;
    let marqueeSpan: HTMLSpanElement;

    beforeEach(() => {
      const { container } = render(<MarqueePillLabel>{LABEL}</MarqueePillLabel>);
      root = container.firstElementChild as HTMLSpanElement;
      measureSpan = root.children[0] as HTMLSpanElement;
      staticSpan = root.children[1] as HTMLSpanElement;
      marqueeSpan = root.children[2] as HTMLSpanElement;

      mockDimensions(measureSpan, { offsetWidth: 200 });
      mockDimensions(root, { clientWidth: 80 });
      mockDimensions(marqueeSpan, { offsetWidth: 0 });
    });

    it('should hide static span and show marquee span', () => {
      fireEvent.mouseEnter(root);

      expect(staticSpan.classList.contains('invisible')).toBe(true);
      expect(marqueeSpan.classList.contains('invisible')).toBe(false);
    });

    it('should add pill-marquee-track class to marquee span', () => {
      fireEvent.mouseEnter(root);

      expect(marqueeSpan.classList.contains('pill-marquee-track')).toBe(true);
    });

    it('should set correct CSS custom property and animation duration', () => {
      fireEvent.mouseEnter(root);

      // scrollDist = textWidth(200) + MARQUEE_GAP(32) = 232
      // duration = 232 / MARQUEE_SPEED(30) ≈ 7.733s
      expect(marqueeSpan.style.getPropertyValue('--pill-marquee-scroll')).toBe('-232px');
      const duration = parseFloat(marqueeSpan.style.animationDuration);
      expect(duration).toBeCloseTo(232 / 30, 2);
    });
  });

  describe('mouseLeave after marquee activation', () => {
    it('should restore static view and unlock container width', () => {
      const { container } = render(<MarqueePillLabel>{LABEL}</MarqueePillLabel>);
      const root = container.firstElementChild as HTMLSpanElement;
      const measureSpan = root.children[0] as HTMLSpanElement;
      const staticSpan = root.children[1] as HTMLSpanElement;
      const marqueeSpan = root.children[2] as HTMLSpanElement;

      mockDimensions(measureSpan, { offsetWidth: 200 });
      mockDimensions(root, { clientWidth: 80 });
      mockDimensions(marqueeSpan, { offsetWidth: 0 });
      fireEvent.mouseEnter(root);

      fireEvent.mouseLeave(root);

      expect(staticSpan.classList.contains('invisible')).toBe(false);
      expect(marqueeSpan.classList.contains('invisible')).toBe(true);
      expect(marqueeSpan.classList.contains('pill-marquee-track')).toBe(false);
      // Residual inline styles should be cleaned up
      expect(marqueeSpan.style.getPropertyValue('--pill-marquee-scroll')).toBe('');
      expect(marqueeSpan.style.animationDuration).toBe('');
    });
  });

  describe('mouseLeave without prior activation', () => {
    it('should not throw when marquee was never activated', () => {
      const { container } = render(<MarqueePillLabel>{LABEL}</MarqueePillLabel>);
      const root = container.firstElementChild as HTMLSpanElement;

      expect(() => fireEvent.mouseLeave(root)).not.toThrow();
    });
  });
});
