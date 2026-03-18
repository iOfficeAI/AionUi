import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useThemeColor } from '../../hooks/useThemeColor';

type MarkdownContentProps = {
  content: string;
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  const text = useThemeColor({}, 'text');
  const codeBackground = useThemeColor({}, 'codeBackground');
  const codeForeground = useThemeColor({}, 'codeForeground');
  const border = useThemeColor({}, 'border');
  const tint = useThemeColor({}, 'tint');

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

  return <Markdown style={markdownStyles}>{content}</Markdown>;
}
