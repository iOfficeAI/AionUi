import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useConnection } from '../src/context/ConnectionContext';

export default function IndexScreen() {
  const { isConfigured, connectionState, isRestoring } = useConnection();
  const [authFailedExpired, setAuthFailedExpired] = useState(false);

  // Give auto-recovery 5 seconds before redirecting to connect screen
  useEffect(() => {
    if (connectionState === 'auth_failed') {
      const timer = setTimeout(() => setAuthFailedExpired(true), 5000);
      return () => clearTimeout(timer);
    }
    setAuthFailedExpired(false);
  }, [connectionState]);

  useEffect(() => {
    if (!isRestoring) {
      SplashScreen.hideAsync();
    }
  }, [isRestoring]);

  // Keep splash screen visible while restoring saved connection
  if (isRestoring) {
    return null;
  }

  if (!isConfigured || (connectionState === 'auth_failed' && authFailedExpired)) {
    return <Redirect href='/connect' />;
  }

  return <Redirect href='/(tabs)/chat' />;
}
