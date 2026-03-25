import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';

const DISCONNECT_TAP_DELAY = 10_000;

export function ConnectionBanner() {
  const { t } = useTranslation();
  const { connectionState, tryReconnect } = useConnection();
  const [canTap, setCanTap] = useState(false);
  const disconnectedAt = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  const visible = connectionState !== 'connected';

  useEffect(() => {
    height.value = withTiming(visible ? 44 : 0, { duration: 250 });
    opacity.value = withTiming(visible ? 1 : 0, { duration: 250 });
  }, [visible, height, opacity]);

  // Track how long we've been disconnected
  useEffect(() => {
    if (connectionState === 'disconnected') {
      disconnectedAt.current = Date.now();
      setCanTap(false);
      timerRef.current = setTimeout(() => setCanTap(true), DISCONNECT_TAP_DELAY);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
    if (connectionState === 'auth_failed') {
      setCanTap(true);
    } else {
      disconnectedAt.current = null;
      setCanTap(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [connectionState]);

  const handlePress = useCallback(() => {
    if (!canTap) return;
    tryReconnect();
    // Reset the tap delay timer on press
    setCanTap(false);
    disconnectedAt.current = Date.now();
    timerRef.current = setTimeout(() => setCanTap(true), DISCONNECT_TAP_DELAY);
  }, [canTap, tryReconnect]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  let label: string;
  let showSpinner = false;
  let tappable = false;

  if (connectionState === 'connecting') {
    label = t('connection.connecting');
    showSpinner = true;
  } else if (connectionState === 'auth_failed') {
    label = `${t('connection.sessionExpired')} — ${t('connection.tapToReconnect')}`;
    tappable = true;
  } else if (connectionState === 'disconnected' && !canTap) {
    label = t('connection.reconnecting');
    showSpinner = true;
  } else {
    label = `${t('connection.connectionLost')} — ${t('connection.tapToRetry')}`;
    tappable = true;
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Pressable
        style={styles.inner}
        onPress={tappable ? handlePress : undefined}
        disabled={!tappable}
      >
        {showSpinner && <ActivityIndicator size='small' color='#fff' style={styles.spinner} />}
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#e8453c',
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  spinner: {
    marginRight: 8,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
