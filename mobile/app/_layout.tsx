import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { ConnectionProvider } from '../src/context/ConnectionContext';
import { WebSocketProvider } from '../src/context/WebSocketContext';
import { ConversationProvider } from '../src/context/ConversationContext';
import { WorkspaceProvider } from '../src/context/WorkspaceContext';
import { FilesTabProvider } from '../src/context/FilesTabContext';
import { initI18n } from '../src/i18n';

// Prevent splash screen from auto-hiding until routing is ready
SplashScreen.preventAutoHideAsync();

// Initialize i18n early
initI18n();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <ConnectionProvider>
        <WebSocketProvider>
          <ConversationProvider>
            <WorkspaceProvider>
              <FilesTabProvider>
                <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name='index' />
                    <Stack.Screen name='connect' />
                    <Stack.Screen name='(tabs)' />
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
              </FilesTabProvider>
            </WorkspaceProvider>
          </ConversationProvider>
        </WebSocketProvider>
      </ConnectionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
