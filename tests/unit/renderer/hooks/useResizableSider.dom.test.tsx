import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useResizableSider } from '@/renderer/hooks/ui/useResizableSider';

HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);

const renderResizableSider = (overrides: Partial<Parameters<typeof useResizableSider>[0]> = {}) =>
  renderHook(() =>
    useResizableSider({
      defaultWidth: 250,
      minWidth: 200,
      maxWidth: 420,
      collapsedWidth: 64,
      snapThreshold: 157,
      snapHysteresis: 6,
      ...overrides,
    })
  );

const createHandle = () => {
  const sider = document.createElement('aside');
  sider.className = 'layout-sider';
  const handle = document.createElement('div');
  sider.appendChild(handle);
  document.body.appendChild(sider);
  return { sider, handle };
};

const dispatchPointerEvent = (
  target: EventTarget,
  type: string,
  init: { clientX?: number; pointerId?: number } = {}
) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX ?? 0 });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId ?? 1 },
    pointerType: { value: 'mouse' },
    button: { value: 0 },
    buttons: { value: type === 'pointerup' ? 0 : 1 },
  });
  target.dispatchEvent(event);
};

afterEach(() => {
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
});

describe('useResizableSider', () => {
  it('updates width during mouse drag and commits it on release', () => {
    const { result } = renderResizableSider();
    const { sider, handle } = createHandle();

    expect(result.current.width).toBe(250);

    act(() => {
      result.current.beginMouseResizeDrag({
        button: 0,
        clientX: 250,
        currentTarget: handle,
        preventDefault: vi.fn(),
      } as unknown as ReactMouseEvent<HTMLDivElement>);
    });

    expect(result.current.isDragging).toBe(true);
    expect(sider).toHaveClass('layout-sider--dragging');

    act(() => {
      fireEvent.mouseMove(window, { clientX: 340, button: 0, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 340, button: 0, buttons: 0 });
    });

    expect(result.current.isDragging).toBe(false);
    expect(result.current.collapsed).toBe(false);
    expect(result.current.width).toBe(340);
    expect(sider).not.toHaveClass('layout-sider--dragging');
  });

  it('snaps to collapsed when drag ends below the snap threshold', () => {
    const { result } = renderResizableSider();
    const { handle } = createHandle();

    act(() => {
      result.current.beginMouseResizeDrag({
        button: 0,
        clientX: 250,
        currentTarget: handle,
        preventDefault: vi.fn(),
      } as unknown as ReactMouseEvent<HTMLDivElement>);
    });

    act(() => {
      fireEvent.mouseMove(window, { clientX: 100, button: 0, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 100, button: 0, buttons: 0 });
    });

    expect(result.current.collapsed).toBe(true);
  });

  it('expands from collapsed when drag finishes above threshold+hysteresis', () => {
    const { result } = renderResizableSider();
    const { handle } = createHandle();

    act(() => {
      result.current.setCollapsed(true);
    });
    expect(result.current.collapsed).toBe(true);

    act(() => {
      result.current.beginMouseResizeDrag({
        button: 0,
        clientX: 64,
        currentTarget: handle,
        preventDefault: vi.fn(),
      } as unknown as ReactMouseEvent<HTMLDivElement>);
    });

    act(() => {
      fireEvent.mouseMove(window, { clientX: 320, button: 0, buttons: 1 });
      fireEvent.mouseUp(window, { clientX: 320, button: 0, buttons: 0 });
    });

    expect(result.current.collapsed).toBe(false);
    expect(result.current.width).toBeGreaterThan(157);
  });

  it('rejects drag start when the disabled option is true', () => {
    const { result } = renderResizableSider({ disabled: true });
    const { handle } = createHandle();

    act(() => {
      result.current.beginMouseResizeDrag({
        button: 0,
        clientX: 250,
        currentTarget: handle,
        preventDefault: vi.fn(),
      } as unknown as ReactMouseEvent<HTMLDivElement>);
    });

    expect(result.current.isDragging).toBe(false);
  });

  it('drives pointer-based drag through window pointermove/pointerup', () => {
    const { result } = renderResizableSider();
    const { sider, handle } = createHandle();

    act(() => {
      result.current.beginResizeDrag({
        button: 0,
        clientX: 250,
        currentTarget: handle,
        pointerId: 7,
        pointerType: 'mouse',
        preventDefault: vi.fn(),
      } as unknown as ReactPointerEvent<HTMLDivElement>);
    });

    expect(result.current.isDragging).toBe(true);
    expect(sider).toHaveClass('layout-sider--dragging');

    act(() => {
      dispatchPointerEvent(window, 'pointermove', { clientX: 360, pointerId: 7 });
      dispatchPointerEvent(window, 'pointerup', { clientX: 360, pointerId: 7 });
    });

    expect(result.current.isDragging).toBe(false);
    expect(result.current.width).toBe(360);
  });

  it('aborts an active drag when the window loses focus', () => {
    const { result } = renderResizableSider();
    const { sider, handle } = createHandle();

    act(() => {
      result.current.beginMouseResizeDrag({
        button: 0,
        clientX: 250,
        currentTarget: handle,
        preventDefault: vi.fn(),
      } as unknown as ReactMouseEvent<HTMLDivElement>);
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      fireEvent.blur(window);
    });

    expect(result.current.isDragging).toBe(false);
    expect(sider).not.toHaveClass('layout-sider--dragging');
  });
});
