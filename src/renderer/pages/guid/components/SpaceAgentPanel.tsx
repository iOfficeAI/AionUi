/**
 * NovaMaster Space Agent Panel — browser automation control embedded in AionUI
 * Connects to Space Agent (:3003) for live web automation & visual feedback
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface SpaceAgentPanelProps {
  port?: number;
  height?: number;
}

const SPACE_AGENT_DEFAULT_PORT = 3003;

const SpaceAgentPanel: React.FC<SpaceAgentPanelProps> = ({
  port = SPACE_AGENT_DEFAULT_PORT,
  height = 520,
}) => {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionActive, setSessionActive] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const checkInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const spaceUrl = `http://localhost:${port}`;

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch(`${spaceUrl}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        const data = await r.json();
        setConnected(true);
        setSessionActive(data?.user?.isAuthenticated || false);
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
  }, [spaceUrl]);

  useEffect(() => {
    setLoading(true);
    setError('');
    setConnected(false);

    checkHealth();
    checkInterval.current = setInterval(checkHealth, 5000);

    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
    };
  }, [checkHealth]);

  const handleRetry = () => {
    setLoading(true);
    setError('');
    checkHealth();
    if (iframeRef.current) {
      iframeRef.current.src = spaceUrl;
    }
  };

  const handleIframeError = () => {
    setError('Space Agent unreachable on port ' + port);
    setConnected(false);
    setLoading(false);
  };

  const styles: Record<string, React.CSSProperties> = {
    wrapper: {
      position: 'relative',
      width: '100%',
      borderRadius: 16,
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #0c0c1e 0%, #101035 50%, #0c0c18 100%)',
      border: '1px solid rgba(0,204,255,0.15)',
      boxShadow: '0 0 60px rgba(0,204,255,0.06), 0 8px 32px rgba(0,0,0,0.4)',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px',
      background: 'rgba(12,12,30,0.95)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(0,204,255,0.1)',
    },
    title: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      fontWeight: 600,
      color: '#00ccff',
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      display: 'inline-block',
    },
    badge: {
      fontSize: 10,
      padding: '2px 8px',
      borderRadius: 10,
      fontWeight: 500,
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
      background: 'rgba(12,12,30,0.88)',
      backdropFilter: 'blur(8px)',
    },
    spinner: {
      width: 32,
      height: 32,
      border: '3px solid rgba(0,204,255,0.15)',
      borderTopColor: '#00ccff',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    },
    loadingText: {
      color: '#778',
      fontSize: 13,
    },
    errorText: {
      color: '#e74c3c',
      fontSize: 12,
      maxWidth: 280,
      textAlign: 'center' as const,
    },
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.title}>
          <span style={{
            ...styles.statusDot,
            background: connected ? '#00ccff' : loading ? '#f39c12' : '#e74c3c',
            boxShadow: connected
              ? '0 0 10px #00ccff'
              : loading ? '0 0 10px #f39c12' : '0 0 10px #e74c3c',
          }} />
          Space Agent · Browser Control
          {connected && (
            <span style={{
              ...styles.badge,
              background: 'rgba(0,204,255,0.1)',
              color: '#00ccff',
              border: '1px solid rgba(0,204,255,0.2)',
            }}>
              {sessionActive ? 'LIVE' : 'IDLE'}
            </span>
          )}
        </div>
        <div style={styles.actions}>
          {connected && (
            <button
              onClick={() => window.open(spaceUrl, '_blank')}
              style={{
                background: 'rgba(0,204,255,0.1)',
                border: '1px solid rgba(0,204,255,0.2)',
                color: '#00ccff',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Open ↗
            </button>
          )}
          <button
            onClick={handleRetry}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#888',
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
        src={spaceUrl}
        style={styles.iframe}
        title="Space Agent Browser Control"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onError={handleIframeError}
      />

      {(!connected || loading) && (
        <div style={styles.overlay}>
          {loading && !error && (
            <>
              <div style={styles.spinner} />
              <div style={styles.loadingText}>Connecting to Space Agent on port {port}...</div>
            </>
          )}
          {error && (
            <>
              <div style={styles.errorText}>{error}</div>
              <button
                onClick={handleRetry}
                style={{
                  background: 'rgba(0,204,255,0.12)',
                  border: '1px solid rgba(0,204,255,0.25)',
                  color: '#00ccff',
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

export default SpaceAgentPanel;
