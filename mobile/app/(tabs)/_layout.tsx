import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '../../src/hooks/useThemeColor';

export default function TabLayout() {
  const { t } = useTranslation();
  const tint = useThemeColor({}, 'tint');
  const tabIconDefault = useThemeColor({}, 'tabIconDefault');

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: tabIconDefault,
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="conversations"
        options={{
          title: t('tabs.conversations'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: t('tabs.files'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
