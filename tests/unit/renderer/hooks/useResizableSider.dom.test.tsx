import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useResizableSider } from '@/renderer/hooks/ui/useResizableSider';

HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);

const renderResizableSider = () =>
  renderHook(() =>
    useResizableSider({
      defaultWidth: 250,
      minWidth: 200,
      maxWidth: 420,
      collapsedWidth: 64,
      snapThreshold: 157,
      snapHysteresis: 6,
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
});
