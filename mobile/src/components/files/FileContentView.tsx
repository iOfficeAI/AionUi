import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../ui/ThemedText';
import { MarkdownContent } from '../chat/MarkdownContent';
import { bridge } from '../../services/bridge';
import { useThemeColor } from '../../hooks/useThemeColor';

type ContentType = 'markdown' | 'code' | 'html' | 'diff' | 'image' | 'unsupported';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'avif']);

const UNSUPPORTED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'zip',
  'tar',
  'gz',
  'rar',
  '7z',
  'exe',
  'dmg',
  'bin',
  'iso',
  'mp3',
  'mp4',
  'avi',
  'mov',
  'mkv',
]);

function getContentType(fileName: string): { type: ContentType; language: string } {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (ext === 'md' || ext === 'markdown') return { type: 'markdown', language: 'markdown' };
  if (ext === 'html' || ext === 'htm') return { type: 'html', language: 'html' };
  if (ext === 'diff' || ext === 'patch') return { type: 'diff', language: 'diff' };
  if (IMAGE_EXTENSIONS.has(ext)) return { type: 'image', language: 'image' };
  if (UNSUPPORTED_EXTENSIONS.has(ext)) return { type: 'unsupported', language: ext };
  return { type: 'code', language: ext || 'text' };
}

type FileContentViewProps = {
  path: string;
};

export function FileContentView({ path }: FileContentViewProps) {
  const { t } = useTranslation();
  const tint = useThemeColor({}, 'tint');
  const bg = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const { width: screenWidth } = useWindowDimensions();

  const [content, setContent] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileName = path.split('/').pop() || '';
  const { type: contentType, language } = getContentType(fileName);

  const loadContent = useCallback(async () => {
    if (contentType === 'unsupported') {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (contentType === 'image') {
        const base64 = await bridge.request<string>('get-image-base64', { path });
        setImageUri(base64);
      } else {
        const text = await bridge.request<string>('read-file', { path });
        setContent(text);
      }
    } catch {
      setError(t('filePreview.errorLoading'));
    } finally {
      setIsLoading(false);
    }
  }, [path, contentType, t]);

  useEffect(() => {
    setContent(null);
    setImageUri(null);
    void loadContent();
  }, [loadContent]);

  if (contentType === 'unsupported') {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Ionicons name='document-outline' size={48} color={textColor} style={{ opacity: 0.4 }} />
        <ThemedText style={styles.message}>{t('filePreview.unsupportedType')}</ThemedText>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator size='large' color={tint} />
        <ThemedText style={styles.message}>{t('filePreview.loading')}</ThemedText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Ionicons name='warning-outline' size={48} color={textColor} style={{ opacity: 0.4 }} />
        <ThemedText style={styles.message}>{error}</ThemedText>
        <TouchableOpacity style={[styles.retryButton, { borderColor: tint }]} onPress={loadContent}>
          <ThemedText style={{ color: tint }}>{t('filePreview.retry')}</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  if (contentType === 'image' && imageUri) {
    return (
      <ScrollView
        style={{ backgroundColor: bg }}
        contentContainerStyle={styles.imageContainer}
        maximumZoomScale={3}
        minimumZoomScale={1}
      >
        <Image source={{ uri: imageUri }} style={{ width: screenWidth, height: screenWidth }} resizeMode='contain' />
      </ScrollView>
    );
  }

  const renderedContent = contentType === 'markdown' ? content! : `\`\`\`${language}\n${content}\n\`\`\``;

  return (
    <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={styles.textContainer}>
      <MarkdownContent content={renderedContent} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.6,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  textContainer: {
    padding: 16,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
