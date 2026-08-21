/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 侧栏宽度可调：useResizableSplit 的 collapse 扩展测试。
 *
 * 覆盖 useResizableSplit 的 collapse 扩展：200 吸附阈值无死区交互矩阵
 * （199/200/201 + 双击 + 展开恢复最后合法宽度），以及「不传 collapseThreshold
 * 时退化为纯 clamp」的向后兼容护栏（保护另外 4 个消费方）。
 */

import { act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';

const STORAGE_KEY = 'sider-width-px';
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 800;

type HarnessProps = {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** 省略 → 关闭 collapse 语义（向后兼容护栏） */
  withCollapse?: boolean;
};

// 渲染一个使用 hook 的组件：暴露 splitRatio 文本 + 拖拽句柄。
const Harness: React.FC<HarnessProps> = ({ collapsed = false, onCollapsedChange, withCollapse = true }) => {
  const { splitRatio, createDragHandle } = useResizableSplit({
    unit: 'px',
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    storageKey: STORAGE_KEY,
    ...(withCollapse ? { collapseThreshold: MIN_WIDTH, collapsedWidth: 0, collapsed, onCollapsedChange } : {}),
  });
  return (
    <div>
      <span data-testid='width'>{splitRatio}</span>
      {createDragHandle({})}
    </div>
  );
};

const getHandle = (container: HTMLElement): HTMLElement => {
  const handle = container.querySelector<HTMLElement>('.cursor-col-resize');
  if (!handle) throw new Error('drag handle not found');
  return handle;
};

const getWidth = (container: HTMLElement): number =>
  Number(container.querySelector('[data-testid="width"]')?.textContent);

// 从默认起点（260）拖到目标像素宽后松手。startX=0 → clientX = target-260。
const dragTo = (container: HTMLElement, targetWidth: number) => {
  const handle = getHandle(container);
  const clientX = targetWidth - DEFAULT_WIDTH;
  act(() => {
    fireEvent.pointerDown(handle, { clientX: 0, button: 0, pointerType: 'mouse', pointerId: 1 });
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX, buttons: 1 }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup', { clientX }));
  });
};

describe('useResizableSplit collapse extension', () => {
  beforeEach(() => {
    localStorage.clear();
    // rAF 同步执行，让拖拽中的实时应用可断言。
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('201 → 展开跟手、松手持久化到 localStorage', () => {
    const onCollapsedChange = vi.fn();
    const { container } = render(<Harness onCollapsedChange={onCollapsedChange} />);
    dragTo(container, 201);
    expect(getWidth(container)).toBe(201);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('201');
    // 松手时展开态确认 false（且从未误报收起）。
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    expect(onCollapsedChange).not.toHaveBeenCalledWith(true);
  });

  it('200 → 边界 = 阈值即展开合法，写盘 200', () => {
    const onCollapsedChange = vi.fn();
    const { container } = render(<Harness onCollapsedChange={onCollapsedChange} />);
    dragTo(container, 200);
    expect(getWidth(container)).toBe(200);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('200');
    expect(onCollapsedChange).not.toHaveBeenCalledWith(true);
  });

  it('199 → 拖拽中进收起预览、松手提交收起，且 localStorage 不写盘', () => {
    const onCollapsedChange = vi.fn();
    const { container } = render(<Harness onCollapsedChange={onCollapsedChange} />);
    dragTo(container, 199);
    // 收起态回调 true；展开宽度保留最后合法值（默认 260），不落到预览/199。
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
    expect(getWidth(container)).toBe(DEFAULT_WIDTH);
    // <200 不写盘：键保持为空（保留上次合法值，此处无上次故为 null）。
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('双击分隔线 → 重置 260 且展开', () => {
    const onCollapsedChange = vi.fn();
    const { container } = render(<Harness collapsed onCollapsedChange={onCollapsedChange} />);
    const handle = getHandle(container);
    act(() => {
      fireEvent.doubleClick(handle);
    });
    expect(getWidth(container)).toBe(DEFAULT_WIDTH);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(String(DEFAULT_WIDTH));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  it('先拖宽到 300 持久化，再拖 <200 收起 → 展开宽度恢复最后合法值而非 0/预览', () => {
    const onCollapsedChange = vi.fn();
    const { container } = render(<Harness onCollapsedChange={onCollapsedChange} />);
    dragTo(container, 300);
    expect(getWidth(container)).toBe(300);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('300');
    // 拖到 150 收起：不覆盖记忆宽度。
    dragTo(container, 150);
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
    expect(getWidth(container)).toBe(300);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('300');
  });

  it('向后兼容：不传 collapseThreshold → 低侧仍 clamp 到 minWidth，不触发收起', () => {
    const onCollapsedChange = vi.fn();
    const { container } = render(<Harness withCollapse={false} onCollapsedChange={onCollapsedChange} />);
    dragTo(container, 150);
    // 纯 clamp：落到下限 200，写盘 200，从不调收起回调。
    expect(getWidth(container)).toBe(MIN_WIDTH);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(String(MIN_WIDTH));
    expect(onCollapsedChange).not.toHaveBeenCalled();
  });
});
