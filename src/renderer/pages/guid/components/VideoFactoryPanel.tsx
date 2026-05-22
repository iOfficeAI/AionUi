/**
 * Video Factory Panel — Live video/music clip pipeline
 * Embeds Video Factory dashboard for clip generation
 */
import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@arco-design/web-react';

interface VideoFactoryPanelProps {
  port?: number;
  autoConnect?: boolean;
}

const VIDEO_FACTORY_DEFAULT_PORT = 8080;

const VideoFactoryPanel: React.FC<VideoFactoryPanelProps> = ({
  port = VIDEO_FACTORY_DEFAULT_PORT,
  autoConnect = true,
}) => {
  const { t } = useTranslation();
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const videoFactoryUrl = `http://localhost:${port}/`;

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        setConnected(true);
        setError('');
        setLoading(false);
      }
    } catch {
      setConnected(false);
    }
  }, [port]);

  useEffect(() => {
    setLoading(true);
    setError('');
    setConnected(false);

    checkHealth();
    const timer = setInterval(checkHealth, 5000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  const handleRetry = () => {
    setLoading(true);
    setError('');
    checkHealth();
    if (iframeRef.current) {
      iframeRef.current.src = videoFactoryUrl;
    }
  };

  const handleIframeError = () => {
    setError(t('guid.videoFactory.unreachable', { port }));
    setConnected(false);
    setLoading(false);
  };

  const styles: Record<string, React.CSSProperties> = {
    wrapper: {
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: 12,
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #0a0a14 0%, #0d0d20 50%, #0a0a18 100%)',
      border: '1px solid rgba(212,175,55,0.15)',
      boxShadow: '0 0 60px rgba(212,175,55,0.08), 0 8px 32px rgba(0,0,0,0.4)',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px',
      background: 'rgba(10,10,20,0.9)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(212,175,55,0.1)',
    },
    title: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      fontWeight: 600,
      color: '#d4af37',
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      display: 'inline-block',
    },
    actions: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    },
    iframe: {
      width: '100%',
      height: 'calc(100% - 40px)',
      border: 'none',
      display: connected ? 'block' : 'none',
    },
    overlay: {
      position: 'absolute',
      inset: '40px 0 0 0',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      background: 'rgba(10,10,20,0.85)',
      backdropFilter: 'blur(8px)',
    },
    errorText: {
      color: '#c0392b',
      fontSize: 12,
      maxWidth: 300,
      textAlign: 'center' as const,
    },
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.title}>
          <span style={{
            ...styles.statusDot,
            background: connected ? '#27ae60' : loading ? '#f39c12' : '#c0392b',
            boxShadow: connected
              ? '0 0 8px #27ae60'
              : loading ? '0 0 8px #f39c12' : '0 0 8px #c0392b',
          }} />
          {t('guid.videoFactory.title')}
        </div>
        <div style={styles.actions}>
          {connected && (
            <Button
              size="mini"
              type="outline"
              onClick={() => window.open(videoFactoryUrl, '_blank')}
              style={{
                borderColor: 'rgba(212,175,55,0.2)',
                color: '#d4af37',
                background: 'rgba(212,175,55,0.1)',
              }}
            >
              {t('guid.videoFactory.popout')}
            </Button>
          )}
          <Button
            size="mini"
            type="outline"
            onClick={handleRetry}
            style={{
              borderColor: 'rgba(255,255,255,0.1)',
              color: '#aaa',
              background: 'rgba(255,255,255,0.05)',
            }}
          >
            {t('guid.videoFactory.refresh')}
          </Button>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src={videoFactoryUrl}
        style={styles.iframe}
        title="Video Factory"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onError={handleIframeError}
      />

      {(!connected || loading) && error && (
        <div style={styles.overlay}>
          <div style={styles.errorText}>{error}</div>
          <Button
            type="primary"
            onClick={handleRetry}
            style={{
              background: 'rgba(212,175,55,0.15)',
              border: '1px solid rgba(212,175,55,0.3)',
              color: '#d4af37',
            }}
          >
            {t('guid.videoFactory.retry')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default VideoFactoryPanel;
