import { useThemeContext } from '@/renderer/context/ThemeContext';

export const useInputFocusRing = () => {
  const { theme } = useThemeContext();
  const isDarkTheme = theme === 'dark';

  return {
    activeBorderColor: isDarkTheme ? '#4D4B87' : '#E1E0FF',
    inactiveBorderColor: 'var(--border-base, #e5e6eb)',
    activeShadow: isDarkTheme ? '0px 2px 20px rgba(77, 75, 135, 0.45)' : '0px 2px 20px rgba(225, 224, 255, 0.6)',
  };
};
