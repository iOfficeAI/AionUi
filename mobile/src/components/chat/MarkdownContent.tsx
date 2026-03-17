import React from 'react';
import { StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

type MarkdownContentProps = {
  content: string;
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  return <Markdown style={markdownStyles}>{content}</Markdown>;
}

const markdownStyles = StyleSheet.create({
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1a1a1a',
  },
  heading1: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  heading2: {
    fontSize: 19,
    fontWeight: 'bold',
    marginVertical: 6,
  },
  heading3: {
    fontSize: 17,
    fontWeight: '600',
    marginVertical: 4,
  },
  code_inline: {
    backgroundColor: '#F2F3F5',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontFamily: 'ui-monospace',
    fontSize: 14,
    color: '#D4380D',
  },
  fence: {
    backgroundColor: '#F2F3F5',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    fontFamily: 'ui-monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#C9CDD4',
    paddingLeft: 12,
    marginVertical: 4,
    opacity: 0.85,
  },
  list_item: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  link: {
    color: '#165DFF',
    textDecorationLine: 'underline',
  },
  paragraph: {
    marginVertical: 4,
  },
  table: {
    borderWidth: 1,
    borderColor: '#E5E8EB',
    borderRadius: 4,
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E8EB',
  },
  th: {
    padding: 6,
    fontWeight: '600',
  },
  td: {
    padding: 6,
  },
});
