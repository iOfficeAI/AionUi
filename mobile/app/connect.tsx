import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../src/components/ui/ThemedText';
import { useConnection } from '../src/context/ConnectionContext';
import { useThemeColor } from '../src/hooks/useThemeColor';
import { wsService } from '../src/services/websocket';

export default function ConnectScreen() {
  const { t } = useTranslation();
  const { connect } = useConnection();
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');

  const [host, setHost] = useState('');
  const [port, setPort] = useState('25808');
  const [token, setToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!host.trim() || !port.trim() || !token.trim()) {
      Alert.alert(t('common.error'), t('connect.fillAllFields'));
      return;
    }

    setIsConnecting(true);
    try {
      await connect(host.trim(), port.trim(), token.trim());

      // Wait for WS state change via listener (avoids stale closure)
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

      router.replace('/(tabs)/conversations');
    } catch (e: any) {
      const msg =
        e.message === 'auth_failed' ? t('connect.invalidToken') : t('connect.connectionFailed');
      Alert.alert(t('common.error'), msg);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <ThemedText type="title">{t('connect.title')}</ThemedText>
        </View>

        <View style={styles.form}>
          <View style={styles.row}>
            <View style={styles.hostField}>
              <ThemedText style={styles.label}>{t('connect.host')}</ThemedText>
              <TextInput
                style={[styles.input, { borderColor: border, backgroundColor: surface }]}
                value={host}
                onChangeText={setHost}
                placeholder={t('connect.hostPlaceholder')}
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            <View style={styles.portField}>
              <ThemedText style={styles.label}>{t('connect.port')}</ThemedText>
              <TextInput
                style={[styles.input, { borderColor: border, backgroundColor: surface }]}
                value={port}
                onChangeText={setPort}
                placeholder={t('connect.portPlaceholder')}
                placeholderTextColor="#999"
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('connect.token')}</ThemedText>
            <TextInput
              style={[styles.input, styles.tokenInput, { borderColor: border, backgroundColor: surface }]}
              value={token}
              onChangeText={setToken}
              placeholder={t('connect.tokenPlaceholder')}
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <ThemedText type="caption" style={styles.hint}>
              {t('connect.tokenHint')}
            </ThemedText>
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: tint }, isConnecting && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.buttonText}>{t('connect.connectButton')}</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  form: {
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  hostField: {
    flex: 2,
  },
  portField: {
    flex: 1,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  tokenInput: {
    height: 80,
    paddingTop: 12,
  },
  hint: {
    marginTop: 4,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
