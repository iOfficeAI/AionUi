import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useThemeColor } from '../../src/hooks/useThemeColor';
import { useConnection } from '../../src/context/ConnectionContext';
import { ConnectionBanner } from '../../src/components/ui/ConnectionBanner';

export default function TabLayout() {
  const { t } = useTranslation();
  const tint = useThemeColor({}, 'tint');
  const tabIconDefault = useThemeColor({}, 'tabIconDefault');
  const background = useThemeColor({}, 'background');
  const { isConfigured } = useConnection();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Redirect to index (which handles routing to connect) when disconnected
  useEffect(() => {
    if (!isConfigured) {
      router.replace('/');
    }
  }, [isConfigured, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={['top']}>
      <ConnectionBanner />
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: tint,
          tabBarInactiveTintColor: tabIconDefault,
          headerShown: true,
        }}
      >
        <Tabs.Screen
          name='chat'
          options={{
            title: t('tabs.chat'),
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name='chatbubbles-outline' size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name='files'
          options={{
            title: t('tabs.files'),
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name='folder-outline' size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name='settings'
          options={{
            title: t('tabs.settings'),
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name='settings-outline' size={size} color={color} />,
          }}
        />
      </Tabs>
      </SafeAreaInsetsContext.Provider>
    </SafeAreaView>
  );
}
