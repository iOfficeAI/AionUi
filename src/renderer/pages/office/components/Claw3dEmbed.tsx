/**
 * NovaMaster Claw3D Embed — live iframe integration
 * Embeds Claw3D Office (:9120) directly into AionUI with full interactivity
 */

import React, { useCallback, useState, useRef, useEffect } from 'react';

interface Claw3dEmbedProps {
  port?: number;
  autoConnect?: boolean;
  height?: number;
}

const CLAW3D_DEFAULT_PORT = 9120;
const CLAW3D_FLOOR = 'openclaw-ground';
const GATEWAY_URL = 'ws://localhost:18793';

const Claw3dEmbed: React.FC<Claw3dEmbedProps> = ({
  port = CLAW3D_DEFAULT_PORT,
  autoConnect = true,
  height = 600,
}) => {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const checkInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const claw3dUrl = `http://localhost:${port}/office?floor=${CLAW3D_FLOOR}&gateway=${encodeURIComponent(GATEWAY_URL)}`;

  // Health check polling
  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch(`http://localhost:${port}/api/studio`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        setConnected(true);
        setError('');
        setLoading(false);
        if (checkInterval.current) {
          clearInterval(checkInterval.current);
          checkInterval.current = undefined;
        }
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
    checkInterval.current = setInterval(checkHealth, 3000);

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
    };
  }, [checkHealth]);

  const handleRetry = () => {
    setLoading(true);
    setError('');
    checkHealth();
    if (iframeRef.current) {
      iframeRef.current.src = claw3dUrl;
    }
  };

  const handleIframeError = () => {
    setError('Claw3D server unreachable. Is the dev server running on port ' + port + '?');
    setConnected(false);
    setLoading(false);
  };

  const styles: Record<string, React.CSSProperties> = {
    wrapper: {
      position: 'relative',
      width: '100%',
      borderRadius: 16,
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
      height,
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
    spinner: {
      width: 32,
      height: 32,
      border: '3px solid rgba(212,175,55,0.2)',
      borderTopColor: '#d4af37',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    },
    loadingText: {
      color: '#888',
      fontSize: 13,
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
          Claw3D Office
        </div>
        <div style={styles.actions}>
          {connected && (
            <button
              onClick={() => window.open(claw3dUrl, '_blank')}
              style={{
                background: 'rgba(212,175,55,0.1)',
                border: '1px solid rgba(212,175,55,0.2)',
                color: '#d4af37',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Pop out ↗
            </button>
          )}
          <button
            onClick={handleRetry}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#aaa',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src={claw3dUrl}
        style={styles.iframe}
        title="Claw3D Office"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onError={handleIframeError}
      />

      {(!connected || loading) && (
        <div style={styles.overlay}>
          {loading && !error && (
            <>
              <div style={styles.spinner} />
              <div style={styles.loadingText}>Connecting to Claw3D on port {port}...</div>
            </>
          )}
          {error && (
            <>
              <div style={styles.errorText}>{error}</div>
              <button
                onClick={handleRetry}
                style={{
                  background: 'rgba(212,175,55,0.15)',
                  border: '1px solid rgba(212,175,55,0.3)',
                  color: '#d4af37',
                  borderRadius: 8,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Retry Connection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Claw3dEmbed;
