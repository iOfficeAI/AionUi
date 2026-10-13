import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { BrowserAutomationEngine, resolveLocatorString } from '@process/services/browser/BrowserAutomationEngine';

describe('BrowserAutomationEngine', () => {
  describe('resolveLocatorString', () => {
    it('resolves string selectors verbatim', () => {
      expect(resolveLocatorString('#my-button')).toBe('#my-button');
      expect(resolveLocatorString('div.content')).toBe('div.content');
    });

    it('resolves role and name to aria / text query', () => {
      const selector = resolveLocatorString({ role: 'button', name: 'Submit Order' });
      expect(selector).toContain('Submit Order');
      expect(selector).toContain('role="button"');
    });

    it('resolves role only', () => {
      expect(resolveLocatorString({ role: 'checkbox' })).toBe('[role="checkbox"]');
    });

    it('resolves label and placeholder', () => {
      expect(resolveLocatorString({ label: 'Username' })).toContain('Username');
      expect(resolveLocatorString({ placeholder: 'Enter email...' })).toBe('[placeholder="Enter email..."]');
    });

    it('resolves testId', () => {
      expect(resolveLocatorString({ testId: 'submit-action' })).toBe('[data-testid="submit-action"]');
    });

    it('resolves visible text', () => {
      expect(resolveLocatorString({ text: 'Click Here' })).toBe(':has-text("Click Here")');
    });
  });

  describe('execute and actions', () => {
    let mockWc: WebContents;
    let engine: BrowserAutomationEngine;

    beforeEach(() => {
      mockWc = {
        getURL: vi.fn().mockReturnValue('https://example.com/app'),
        getTitle: vi.fn().mockReturnValue('Test App'),
        loadURL: vi.fn().mockResolvedValue(undefined),
        executeJavaScript: vi.fn().mockResolvedValue({ success: true }),
        capturePage: vi.fn().mockResolvedValue({
          toDataURL: () => 'data:image/png;base64,mockScreenshotData',
        }),
        isDestroyed: () => false,
        getType: () => 'webview',
      } as unknown as WebContents;

      engine = new BrowserAutomationEngine({
        webContentsResolver: () => mockWc,
      });
    });

    it('executes navigate action successfully', async () => {
      const res = await engine.execute({
        action: 'navigate',
        params: { navigate: { url: 'example.com/dashboard' } },
      });

      expect(res.success).toBe(true);
      expect(res.action).toBe('navigate');
      expect(mockWc.loadURL).toHaveBeenCalledWith('https://example.com/dashboard');
      expect(res.data).toEqual({ url: 'https://example.com/app' });
    });

    it('executes click action with locator', async () => {
      const res = await engine.execute({
        action: 'click',
        params: { click: { locator: { role: 'button', name: 'Proceed' } } },
      });

      expect(res.success).toBe(true);
      expect(mockWc.executeJavaScript).toHaveBeenCalled();
    });

    it('executes type action with text', async () => {
      const res = await engine.execute({
        action: 'type',
        params: {
          type: { locator: { placeholder: 'Search...' }, text: 'Automated prompt' },
        },
      });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ typed: true, textLength: 16 });
    });

    it('executes scroll action', async () => {
      vi.mocked(mockWc.executeJavaScript).mockResolvedValueOnce({ scrollX: 0, scrollY: 350 });

      const res = await engine.execute({
        action: 'scroll',
        params: { scroll: { y: 350 } },
      });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ scrollX: 0, scrollY: 350 });
    });

    it('executes getSnapshot returning accessibility tree', async () => {
      const mockTree = {
        role: 'main',
        children: [{ role: 'button', name: 'Submit' }],
      };
      vi.mocked(mockWc.executeJavaScript).mockResolvedValueOnce(mockTree);

      const res = await engine.execute({
        action: 'getSnapshot',
        params: {},
      });

      expect(res.success).toBe(true);
      expect(res.data).toEqual({
        url: 'https://example.com/app',
        title: 'Test App',
        tree: [mockTree],
      });
    });

    it('captures screenshot on action failure and attaches to result', async () => {
      vi.mocked(mockWc.executeJavaScript).mockRejectedValue(new Error('Element not found'));

      const res = await engine.execute({
        action: 'click',
        params: { click: { locator: '#non-existent-button' } },
        retries: 0,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Element not found');
      expect(res.failureScreenshot).toBe('data:image/png;base64,mockScreenshotData');
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('retries failing operation up to specified retries count', async () => {
      let attempts = 0;
      vi.mocked(mockWc.executeJavaScript).mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Temporary DOM detachment');
        }
        return { success: true };
      });

      const res = await engine.execute({
        action: 'click',
        params: { click: { locator: '#retry-button' } },
        retries: 1,
      });

      expect(attempts).toBe(2);
      expect(res.success).toBe(true);
    });
  });
});
