import React, { useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemedText } from '../ui/ThemedText';
import { useThemeColor } from '../../hooks/useThemeColor';

type MarkdownContentProps = {
  content: string;
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  const { t } = useTranslation();
  const text = useThemeColor({}, 'text');
  const codeBackground = useThemeColor({}, 'codeBackground');
  const codeForeground = useThemeColor({}, 'codeForeground');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');
  const textSecondary = useThemeColor({}, 'textSecondary');

  const handleCopy = useCallback(
    async (code: string) => {
      try {
        await Clipboard.setStringAsync(code);
        Alert.alert(t('common.copied'));
      } catch {
        // Silently fail
      }
    },
    [t]
  );

  const markdownStyles = useMemo(
    () =>
      StyleSheet.create({
        body: {
          fontSize: 15,
          lineHeight: 22,
          color: text,
        },
        heading1: {
          fontSize: 22,
          fontWeight: 'bold',
          marginVertical: 8,
          color: text,
        },
        heading2: {
          fontSize: 19,
          fontWeight: 'bold',
          marginVertical: 6,
          color: text,
        },
        heading3: {
          fontSize: 17,
          fontWeight: '600',
          marginVertical: 4,
          color: text,
        },
        code_inline: {
          backgroundColor: codeBackground,
          borderRadius: 4,
          paddingHorizontal: 5,
          paddingVertical: 1,
          fontFamily: 'ui-monospace',
          fontSize: 14,
          color: codeForeground,
        },
        fence: {
          backgroundColor: codeBackground,
          borderRadius: 8,
          padding: 12,
          marginVertical: 8,
          fontFamily: 'ui-monospace',
          fontSize: 13,
          lineHeight: 20,
          color: text,
        },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: border,
          paddingLeft: 12,
          marginVertical: 4,
          opacity: 0.85,
        },
        list_item: {
          flexDirection: 'row',
          marginVertical: 2,
        },
        link: {
          color: tint,
          textDecorationLine: 'underline',
        },
        paragraph: {
          marginVertical: 4,
        },
        table: {
          borderWidth: 1,
          borderColor: border,
          borderRadius: 4,
        },
        tr: {
          borderBottomWidth: 1,
          borderBottomColor: border,
        },
        th: {
          padding: 6,
          fontWeight: '600',
          color: text,
        },
        td: {
          padding: 6,
          color: text,
        },
      }),
    [text, codeBackground, codeForeground, border, tint]
  );

  const rules = useMemo(
    () => ({
      fence: (node: any, _children: any, _parent: any, styles: any) => {
        const code = node.content || '';
        const language = node.sourceInfo || '';
        return (
          <View key={node.key} style={fenceStyles.wrapper}>
            <View style={[fenceStyles.header, { backgroundColor: codeBackground }]}>
              <ThemedText style={[fenceStyles.lang, { color: textSecondary }]}>{language}</ThemedText>
              <TouchableOpacity onPress={() => handleCopy(code)} hitSlop={8}>
                <Ionicons name='copy-outline' size={16} color={textSecondary} />
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.fence}>{code}</ThemedText>
          </View>
        );
      },
    }),
    [codeBackground, textSecondary, handleCopy]
  );

  return (
    <Markdown style={markdownStyles} rules={rules}>
      {content}
    </Markdown>
  );
}

const fenceStyles = StyleSheet.create({
  wrapper: {
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  lang: {
    fontSize: 12,
    fontWeight: '500',
  },
});
