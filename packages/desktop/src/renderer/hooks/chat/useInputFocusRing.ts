export const useInputFocusRing = () => {
  return {
    activeBorderColor: 'var(--brand)',
    inactiveBorderColor: 'var(--border-light)',
    activeShadow: `0px 2px 20px color-mix(in srgb, var(--brand) 12%, transparent)`,
  };
};
