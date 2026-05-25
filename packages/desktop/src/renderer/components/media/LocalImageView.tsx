import { ipcBridge } from '@/common';
import { joinPath } from '@/common/chat/chatLib';
import { LoadingTwo } from '@icon-park/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createContext } from '@renderer/utils/ui/createContext';
import { iconColors } from '@/renderer/styles/colors';
import { fetchFileAsBlob, revokeFileBlob } from '@/renderer/utils/file/staticFile';

const [useLocalImage, LocalImageProvider, useUpdateLocalImage] = createContext({
  root: '',
  conversationId: '',
});

const LocalImageView: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> & {
  Provider: typeof LocalImageProvider;
  useUpdateLocalImage: typeof useUpdateLocalImage;
} = ({ src, alt, className }) => {
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(src);
  const { root, conversationId } = useLocalImage();
  const blobRef = useRef<{ conversationId: string; relativePath: string } | null>(null);

  // "external" 的语义是：完全跳过 conversation 静态接口和 workspace 拼接，
  // 比如 http(s)、data:、blob:、file:、Windows 盘符、Windows UNC 路径。
  // 前导 `/` 不算 external —— agent 的 markdown 里 `/tmp/x.png` 这种写法表示
  // "workspace 根相对"，应当去掉前导 `/` 后走 conversation 静态接口。
  const isAbsoluteOrExternal = useMemo(
    () =>
      src.startsWith('http') ||
      src.startsWith('data:') ||
      src.startsWith('blob:') ||
      src.startsWith('file:') ||
      src.startsWith('\\') ||
      /^[A-Za-z]:/.test(src),
    [src]
  );

  const relativePath = useMemo(() => {
    if (isAbsoluteOrExternal) return src;
    // workspace 根相对：`/tmp/x.png` -> `tmp/x.png`
    return src.startsWith('/') ? src.slice(1) : src;
  }, [src, isAbsoluteOrExternal]);

  const absolutePath = useMemo(() => {
    if (!root || isAbsoluteOrExternal) return src;
    return joinPath(root, src);
  }, [src, root, isAbsoluteOrExternal]);

  useEffect(() => {
    if (isAbsoluteOrExternal && (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:'))) {
      setUrl(src);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();

    const loadViaIpc = () => {
      ipcBridge.fs.getImageBase64
        .invoke({ path: absolutePath, workspace: root || undefined })
        .then((base64) => {
          if (controller.signal.aborted) return;
          if (base64) {
            setUrl(base64);
          }
          setLoading(false);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.error('[LocalImageView] Failed to load image:', { path: absolutePath, error });
          setLoading(false);
        });
    };

    if (conversationId && !isAbsoluteOrExternal) {
      fetchFileAsBlob(conversationId, relativePath, controller.signal)
        .then((blobUrl) => {
          if (controller.signal.aborted) return;
          blobRef.current = { conversationId, relativePath };
          setUrl(blobUrl);
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          loadViaIpc();
        });
    } else {
      loadViaIpc();
    }

    return () => {
      controller.abort();
      if (blobRef.current) {
        revokeFileBlob(blobRef.current.conversationId, blobRef.current.relativePath);
        blobRef.current = null;
      }
    };
  }, [absolutePath, conversationId, relativePath, isAbsoluteOrExternal, root, src]);

  if (loading)
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <LoadingTwo
          className='loading'
          style={{ display: 'flex' }}
          theme='outline'
          size='14'
          fill={iconColors.primary}
          strokeWidth={2}
        />
        <span>{alt}</span>
      </span>
    );
  return <img src={url} alt={alt} className={className} />;
};

LocalImageView.Provider = LocalImageProvider;
LocalImageView.useUpdateLocalImage = useUpdateLocalImage;

export default LocalImageView;
