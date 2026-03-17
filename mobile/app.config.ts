import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: 'AionUi Mobile',
    slug: 'aionui-mobile',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'aionui-mobile',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.aionui.mobile',
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#1a1a2e',
      },
      package: 'com.aionui.mobile',
    },
    web: {
      output: 'static',
      favicon: './assets/images/icon.png',
    },
    plugins: ['expo-router', 'expo-secure-store'],
    experiments: {
      typedRoutes: true,
    },
  };
};
