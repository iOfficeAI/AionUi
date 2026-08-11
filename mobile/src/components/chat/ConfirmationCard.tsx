import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useChat } from '../../context/ChatContext';
import { useThemeColor } from '../../hooks/useThemeColor';

type ConfirmationCardProps = {
  content: any;
  msgId?: string;
};

export function ConfirmationCard({ content }: ConfirmationCardProps) {
  const { t } = useTranslation();
  const { confirmAction } = useChat();
  const confirmBg = useThemeColor({}, 'confirmBg');
  const confirmBorder = useThemeColor({}, 'confirmBorder');
  const success = useThemeColor({}, 'success');
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const textSecondary = useThemeColor({}, 'textSecondary');

  // ACP permission format: { confirmation: { id, action, description, callId, options } }
  const confirmation = content.confirmation || content;
  const confirmationId = confirmation.id || '';
  const title = confirmation.title || confirmation.action || t('chat.permissionRequest');
  const description = confirmation.description || '';
  const options = confirmation.options || [];
  const callId = confirmation.callId || '';

  const handleConfirm = (optionValue: string) => {
    if (confirmationId && callId) {
      confirmAction(confirmationId, callId, optionValue);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: confirmBg, borderColor: confirmBorder }]}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      {description ? (
        <ThemedText type='caption' style={styles.description} numberOfLines={6}>
          {description}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        {options.map((opt: any, i: number) => {
          const isApprove =
            opt.value === 'allow' ||
            opt.value === 'approve' ||
            opt.value === 'yes' ||
            opt.label?.toLowerCase().includes('allow') ||
            opt.label?.toLowerCase().includes('approve');

          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.button,
                isApprove
                  ? { backgroundColor: success }
                  : { backgroundColor: surface, borderWidth: 1, borderColor: border },
              ]}
              onPress={() => handleConfirm(opt.value)}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.buttonText, isApprove ? styles.approveText : { color: textSecondary }]}>
                {opt.label || (isApprove ? t('chat.approve') : t('chat.deny'))}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    gap: 8,
    marginVertical: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  button: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  approveText: {
    color: '#fff',
  },
});
