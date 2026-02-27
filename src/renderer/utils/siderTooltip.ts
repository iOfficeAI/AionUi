/**
 * 侧边栏内 Tooltip 的挂载容器：将 popup 挂到左侧边栏根节点，
 * 这样在收起/关闭侧边栏时 tooltip 会随侧边栏一起隐藏，避免残留在屏幕遮挡内容。
 * See: https://github.com/iOfficeAI/AionUi/issues/987
 */
export const getSiderPopupContainer = (_node: HTMLElement): Element => document.querySelector('.layout-sider') || document.body;

const isNoHoverDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
};

const SIDER_TOOLTIP_CLASS = 'sider-tooltip-popup';

export const cleanupSiderTooltips = () => {
  if (typeof document === 'undefined') return;
  // Arco Tooltip occasionally leaves detached popup nodes; remove both scoped and global tooltip popups.
  document.querySelectorAll(`.${SIDER_TOOLTIP_CLASS}, .arco-tooltip-popup`).forEach((node) => node.remove());
};

export const getSiderTooltipProps = (enabled = false) => {
  const disabled = !enabled || isNoHoverDevice();
  return {
    className: SIDER_TOOLTIP_CLASS,
    trigger: disabled ? [] : 'hover',
    disabled,
    unmountOnExit: true,
    popupHoverStay: false,
    popupVisible: disabled ? false : undefined,
    getPopupContainer: getSiderPopupContainer,
  };
};
