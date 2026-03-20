import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColor } from '../../hooks/useThemeColor';

type ChatInputBarProps = {
  onSend: (text: string, files?: string[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
};

export function ChatInputBar({ onSend, onStop, isStreaming, disabled }: ChatInputBarProps) {
  const { t } = useTranslation();
  const tint = useThemeColor({}, 'tint');
  const background = useThemeColor({}, 'background');
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const error = useThemeColor({}, 'error');
  const textColor = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const showSend = text.trim().length > 0;

  return (
    <View style={[styles.container, { borderTopColor: border, backgroundColor: background }]}>
      <View style={[styles.inputRow, { backgroundColor: surface }]}>
        <TextInput
          style={[styles.input, { color: textColor }]}
          value={text}
          onChangeText={setText}
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor={textSecondary}
          multiline
          maxLength={10000}
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        {isStreaming ? (
          <TouchableOpacity style={styles.stopButton} onPress={onStop} activeOpacity={0.7}>
            <Ionicons name='stop-circle' size={28} color={error} />
          </TouchableOpacity>
        ) : showSend ? (
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} activeOpacity={0.7}>
            <Ionicons name='arrow-up-circle' size={32} color={tint} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 40,
    maxHeight: 120,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 6,
    maxHeight: 100,
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 2,
  },
  stopButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 2,
  },
});
