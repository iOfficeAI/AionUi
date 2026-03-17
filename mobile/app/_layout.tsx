import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { ConnectionProvider } from '../src/context/ConnectionContext';
import { WebSocketProvider } from '../src/context/WebSocketContext';
import { ConversationProvider } from '../src/context/ConversationContext';
import { initI18n } from '../src/i18n';

// Prevent splash screen from auto-hiding until routing is ready
SplashScreen.preventAutoHideAsync();

// Initialize i18n early
initI18n();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConnectionProvider>
        <WebSocketProvider>
          <ConversationProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name='index' />
                <Stack.Screen name='connect' />
                <Stack.Screen name='(tabs)' />
                <Stack.Screen
                  name='conversation/[id]'
                  options={{
                    headerShown: true,
                    headerTitle: '',
                    headerBackTitle: 'Back',
                    animation: 'slide_from_right',
                  }}
                />
                <Stack.Screen
                  name='file-preview'
                  options={{
                    headerShown: true,
                    headerTitle: '',
                    headerBackTitle: '',
                    animation: 'slide_from_right',
                  }}
                />
              </Stack>
              <StatusBar style='auto' />
            </ThemeProvider>
          </ConversationProvider>
        </WebSocketProvider>
      </ConnectionProvider>
    </GestureHandlerRootView>
  );
}
