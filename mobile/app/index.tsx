import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useConnection } from '../src/context/ConnectionContext';

export default function IndexScreen() {
  const { isConfigured, connectionState, isRestoring } = useConnection();

  useEffect(() => {
    if (!isRestoring) {
      SplashScreen.hideAsync();
    }
  }, [isRestoring]);

  // Keep splash screen visible while restoring saved connection
  if (isRestoring) {
    return null;
  }

  if (!isConfigured || connectionState === 'auth_failed') {
    return <Redirect href='/connect' />;
  }

  return <Redirect href='/(tabs)/chat' />;
}
