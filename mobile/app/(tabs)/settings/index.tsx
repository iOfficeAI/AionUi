import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../../../src/components/ui/ThemedText';
import { useConnection } from '../../../src/context/ConnectionContext';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { config, connectionState, disconnect } = useConnection();

  const handleDisconnect = () => {
    Alert.alert(t('common.disconnect'), t('connect.disconnected'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: disconnect,
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Connection Section */}
      <View style={styles.section}>
        <ThemedText type="caption" style={styles.sectionTitle}>
          {t('settings.connection').toUpperCase()}
        </ThemedText>
        <View style={styles.card}>
          <View style={styles.row}>
            <ThemedText>{t('settings.connectionStatus')}</ThemedText>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      connectionState === 'connected' ? '#00B42A' : '#F53F3F',
                  },
                ]}
              />
              <ThemedText type="caption">
                {connectionState === 'connected'
                  ? t('settings.connected')
                  : t('settings.disconnected')}
              </ThemedText>
            </View>
          </View>
          {config && (
            <View style={styles.row}>
              <ThemedText>{t('settings.serverAddress')}</ThemedText>
              <ThemedText type="caption">
                {config.host}:{config.port}
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.actionButton} onPress={handleDisconnect}>
          <Ionicons name="log-out-outline" size={20} color="#F53F3F" />
          <ThemedText style={styles.dangerText}>{t('settings.changeServer')}</ThemedText>
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.section}>
        <ThemedText type="caption" style={styles.sectionTitle}>
          {t('settings.about').toUpperCase()}
        </ThemedText>
        <View style={styles.card}>
          <View style={styles.row}>
            <ThemedText>{t('settings.version')}</ThemedText>
            <ThemedText type="caption">0.1.0</ThemedText>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 24 },
  section: { gap: 8 },
  sectionTitle: {
    paddingHorizontal: 4,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  dangerText: {
    color: '#F53F3F',
    fontWeight: '500',
  },
});
