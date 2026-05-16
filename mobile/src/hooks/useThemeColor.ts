import { useColorScheme } from 'react-native';
import { Colors } from '../constants/theme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colorFromProps = props[scheme];

  if (colorFromProps) {
    return colorFromProps;
  }
  return Colors[scheme][colorName];
}
