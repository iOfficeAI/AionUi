import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { ThemedText } from '../src/components/ui/ThemedText';
import { useConnection } from '../src/context/ConnectionContext';
import { useThemeColor } from '../src/hooks/useThemeColor';
import { wsService } from '../src/services/websocket';

function parseQrLoginUrl(data: string): { host: string; port: string; qrToken: string } | null {
  try {
    const url = new URL(data);
    if (url.pathname !== '/qr-login') return null;
    const qrToken = url.searchParams.get('token');
    if (!qrToken) return null;
    return {
      host: url.hostname,
      port: url.port || '25808',
      qrToken,
    };
  } catch {
    return null;
  }
}

export default function ConnectScreen() {
  const { t } = useTranslation();
  const { connect } = useConnection();
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  const [permission, requestPermission] = useCameraPermissions();
  const [isVerifying, setIsVerifying] = useState(false);
  const [mode, setMode] = useState<'scan' | 'paste'>('scan');
  const [pasteUrl, setPasteUrl] = useState('');
  const scannedRef = useRef(false);

  const connectWithUrl = async (url: string, onInvalid: () => void) => {
    const parsed = parseQrLoginUrl(url);
    if (!parsed) {
      Alert.alert(t('common.error'), t('connect.invalidURL'), [{ text: t('common.ok'), onPress: onInvalid }]);
      return;
    }

    setIsVerifying(true);
    try {
      const { host, port, qrToken } = parsed;
      const response = await axios.post(`http://${host}:${port}/api/auth/qr-login`, {
        qrToken,
      });
      const jwt: string = response.data.token;

      await connect(host, port, jwt);

      // Wait for WebSocket connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsub();
          reject(new Error('timeout'));
        }, 5000);

        const unsub = wsService.onStateChange((state) => {
          if (state === 'connected') {
            clearTimeout(timeout);
            unsub();
            resolve();
          }
          if (state === 'auth_failed') {
            clearTimeout(timeout);
            unsub();
            reject(new Error('auth_failed'));
          }
        });
      });

      router.replace('/(tabs)/chat');
    } catch (e: any) {
      const msg = e.message === 'auth_failed' ? t('connect.invalidToken') : t('connect.connectionFailed');
      Alert.alert(t('common.error'), msg, [{ text: t('common.ok'), onPress: onInvalid }]);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    await connectWithUrl(result.data, () => (scannedRef.current = false));
  };

  const handlePasteConnect = () => {
    connectWithUrl(pasteUrl.trim(), () => {});
  };

  // Still loading permission status
  if (!permission) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: background }]}>
        <ActivityIndicator size='large' color={tint} />
      </View>
    );
  }

  // Permission not granted — show request UI
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: background }]}>
        <ThemedText type='title' style={styles.permissionTitle}>
          {t('connect.cameraPermissionTitle')}
        </ThemedText>
        <ThemedText style={styles.permissionMessage}>{t('connect.cameraPermissionMessage')}</ThemedText>
        <TouchableOpacity style={[styles.permissionButton, { backgroundColor: tint }]} onPress={requestPermission}>
          <ThemedText style={styles.permissionButtonText}>{t('connect.requestPermission')}</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  // Paste link mode
  if (mode === 'paste') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.container, styles.center]}>
          <ThemedText type='title' style={styles.permissionTitle}>
            {t('connect.pasteLink')}
          </ThemedText>
          <ThemedText style={styles.permissionMessage}>{t('connect.pasteLinkHint')}</ThemedText>

          <TextInput
            style={[styles.urlInput, { color: textColor, borderColor: tint }]}
            placeholder={t('connect.urlPlaceholder')}
            placeholderTextColor='#999'
            value={pasteUrl}
            onChangeText={setPasteUrl}
            autoCapitalize='none'
            autoCorrect={false}
            selectTextOnFocus
          />

          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: tint, opacity: pasteUrl.trim() ? 1 : 0.5 }]}
            onPress={handlePasteConnect}
            disabled={!pasteUrl.trim() || isVerifying}
          >
            {isVerifying ? (
              <ActivityIndicator color='#fff' />
            ) : (
              <ThemedText style={styles.permissionButtonText}>{t('connect.connect')}</ThemedText>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.switchModeButton} onPress={() => setMode('scan')}>
            <ThemedText style={{ color: tint }}>{t('connect.scanTitle')}</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Permission granted — show scanner
  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <CameraView
        style={styles.camera}
        facing='back'
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={isVerifying ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay} pointerEvents='none'>
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.scanFrame} />
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <ThemedText style={styles.scanTitle}>{t('connect.scanTitle')}</ThemedText>
          <ThemedText style={styles.scanHint}>{t('connect.scanHint')}</ThemedText>
        </View>
      </View>

      {/* Switch to paste mode */}
      <View style={styles.pasteLinkContainer}>
        <TouchableOpacity style={[styles.pasteLinkButton, { backgroundColor: 'rgba(255,255,255,0.9)' }]} onPress={() => setMode('paste')}>
          <ThemedText style={[styles.pasteLinkText, { color: '#333' }]}>{t('connect.pasteLink')}</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Verifying indicator */}
      {isVerifying && (
        <View style={styles.verifyingOverlay}>
          <ActivityIndicator size='large' color='#fff' />
          <ThemedText style={styles.verifyingText}>{t('connect.verifying')}</ThemedText>
        </View>
      )}
    </View>
  );
}

const SCAN_FRAME_SIZE = 250;
const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.6)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  scanFrame: {
    width: SCAN_FRAME_SIZE,
    height: SCAN_FRAME_SIZE,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 16,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
    alignItems: 'center',
    paddingTop: 32,
  },
  scanTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  scanHint: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  verifyingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  verifyingText: {
    color: '#fff',
    fontSize: 16,
  },
  permissionTitle: {
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionMessage: {
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  permissionButton: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  urlInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 20,
  },
  switchModeButton: {
    marginTop: 20,
    padding: 10,
  },
  pasteLinkContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pasteLinkButton: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  pasteLinkText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
