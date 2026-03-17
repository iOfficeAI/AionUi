import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { ConnectionProvider, useConnection } from '../src/context/ConnectionContext';
import { WebSocketProvider } from '../src/context/WebSocketContext';
import { ConversationProvider } from '../src/context/ConversationContext';
import { initI18n } from '../src/i18n';

// Initialize i18n early
initI18n();

function RootNavigator() {
  const { isConfigured, connectionState } = useConnection();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {!isConfigured || connectionState === 'auth_failed' ? (
        <Stack.Screen name="connect" />
      ) : (
        <>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="conversation/[id]"
            options={{
              headerShown: true,
              headerTitle: '',
              headerBackTitle: 'Back',
              animation: 'slide_from_right',
            }}
          />
        </>
      )}
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConnectionProvider>
        <WebSocketProvider>
          <ConversationProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <RootNavigator />
              <StatusBar style="auto" />
            </ThemeProvider>
          </ConversationProvider>
        </WebSocketProvider>
      </ConnectionProvider>
    </GestureHandlerRootView>
  );
}
