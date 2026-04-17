import React from "react";

export const PageLoader = () => (
  <>
    <style>
      {`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }

        .preloader-container {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background-color: var(--bg-1, #ffffff);
          z-index: 9999;
        }

        .loader-wrapper {
          position: relative;
          width: 64px;
          height: 64px;
        }

        .ring-outer {
          position: absolute;
          inset: 0;
          border: 4px solid rgba(78, 89, 105, 0.2);
          border-top-color: #4E5969;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .circle-inner {
          position: absolute;
          inset: 16px;
          background-color: rgba(78, 89, 105, 0.4);
          border-radius: 50%;
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .brand-section {
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .brand-name {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #4E5969;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .dots-wrapper {
          display: flex;
          gap: 4px;
        }

        .dot-item {
          width: 6px;
          height: 6px;
          background-color: rgba(78, 89, 105, 0.6);
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }

        /* Dark mode support */
        [data-theme='dark'] .preloader-container { background-color: #1d1d1f; }
        [data-theme='dark'] .brand-name { color: #ffffff; opacity: 0.9; }
      `}
    </style>

    <div className="preloader-container bg-bg-1">
      <div className="loader-wrapper">
        <div className="ring-outer" />
        <div className="circle-inner" />
      </div>

      <div className="brand-section">
        <span className="brand-name text-t-primary">AionUi</span>
        <div className="dots-wrapper">
          <div className="dot-item" style={{ animationDelay: "-0.3s" }} />
          <div className="dot-item" style={{ animationDelay: "-0.15s" }} />
          <div className="dot-item" />
        </div>
      </div>
    </div>
  </>
);