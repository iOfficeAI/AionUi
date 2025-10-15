/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 登录页面样式
 * Login page styles
 */
export const loginStyles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
    overflow: hidden;
  }

  /* 登录页面容器 */
  .login-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }

  /* 背景装饰 */
  .login-background {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    z-index: 0;
  }

  .bg-circle {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    animation: float 20s infinite ease-in-out;
  }

  .bg-circle-1 {
    width: 500px;
    height: 500px;
    top: -250px;
    left: -250px;
    animation-delay: 0s;
  }

  .bg-circle-2 {
    width: 350px;
    height: 350px;
    bottom: -175px;
    right: -175px;
    animation-delay: 5s;
  }

  .bg-circle-3 {
    width: 250px;
    height: 250px;
    top: 50%;
    right: 10%;
    animation-delay: 10s;
  }

  @keyframes float {
    0%, 100% {
      transform: translateY(0) translateX(0) scale(1);
    }
    25% {
      transform: translateY(-20px) translateX(10px) scale(1.05);
    }
    50% {
      transform: translateY(-10px) translateX(-10px) scale(0.95);
    }
    75% {
      transform: translateY(10px) translateX(5px) scale(1.02);
    }
  }

  /* 登录卡片 */
  .login-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 440px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(20px);
    border-radius: 24px;
    box-shadow: 0 20px 80px rgba(0, 0, 0, 0.2);
    padding: 48px 40px;
    animation: slideUp 0.6s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 登录头部 */
  .login-header {
    text-align: center;
    margin-bottom: 40px;
  }

  .login-logo {
    display: flex;
    justify-content: center;
    margin-bottom: 24px;
  }

  .logo-icon {
    width: 80px;
    height: 80px;
    animation: pulse 3s infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  .login-title {
    font-size: 32px;
    font-weight: 700;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0 0 8px 0;
    letter-spacing: -0.5px;
  }

  .login-subtitle {
    font-size: 15px;
    color: #666;
    margin: 0;
    font-weight: 400;
  }

  /* 表单样式 */
  .login-form {
    margin-bottom: 32px;
  }

  .form-item {
    margin-bottom: 24px;
  }

  .form-label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    color: #333;
    font-size: 14px;
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-icon {
    position: absolute;
    left: 16px;
    width: 18px;
    height: 18px;
    color: #999;
    pointer-events: none;
  }

  .form-input {
    width: 100%;
    height: 48px;
    padding: 12px 16px 12px 48px;
    border: 1px solid #ddd;
    border-radius: 12px;
    font-size: 15px;
    transition: all 0.3s;
    background: white;
  }

  .form-input:hover {
    border-color: #667eea;
  }

  .form-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .login-button {
    width: 100%;
    height: 48px;
    margin-top: 8px;
    font-size: 16px;
    font-weight: 600;
    border-radius: 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    color: white;
    cursor: pointer;
    transition: all 0.3s;
  }

  .login-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
  }

  .login-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .login-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 语言切换按钮 / Language toggle button */
  .lang-toggle {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.3s;
    z-index: 10;
  }

  .lang-toggle:hover {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
  }

  .lang-text {
    color: #999;
    font-weight: 500;
    transition: color 0.3s;
  }

  .lang-text.active {
    color: #667eea;
    font-weight: 600;
  }

  .lang-divider {
    color: #ddd;
  }

  /* 密码可见性切换按钮 / Password visibility toggle */
  .toggle-password {
    position: absolute;
    right: 16px;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #999;
    transition: color 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toggle-password:hover {
    color: #667eea;
  }

  .eye-icon {
    width: 20px;
    height: 20px;
  }

  /* 记住用户名复选框 / Remember username checkbox */
  .form-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 24px;
    margin-top: -8px;
  }

  .form-checkbox input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #667eea;
  }

  .form-checkbox label {
    font-size: 14px;
    color: #666;
    cursor: pointer;
    user-select: none;
  }

  /* 登录按钮加载状态 / Login button loading state */
  .login-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .btn-spinner {
    display: inline-flex;
    align-items: center;
  }

  .spinner {
    width: 16px;
    height: 16px;
    animation: spin 1s linear infinite;
  }

  .spinner-circle {
    stroke-dasharray: 50;
    stroke-dashoffset: 25;
    stroke-linecap: round;
    fill: none;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* 消息提示 / Message box */
  .message-box {
    margin-top: 16px;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    display: none;
    font-weight: 500;
  }

  .message-box.show {
    display: block;
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .message-error {
    background-color: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  .message-success {
    background-color: #f0fdf4;
    color: #16a34a;
    border: 1px solid #bbf7d0;
  }

  /* 底部信息 */
  .login-footer {
    text-align: center;
    padding-top: 24px;
    border-top: 1px solid #eee;
  }

  .footer-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .footer-text {
    font-size: 13px;
    color: #999;
  }

  .footer-divider {
    color: #ddd;
  }

  /* 响应式设计 */
  @media (max-width: 600px) {
    .login-card {
      margin: 20px;
      padding: 32px 24px;
      border-radius: 16px;
    }

    .login-title {
      font-size: 28px;
    }

    .login-subtitle {
      font-size: 14px;
    }

    .logo-icon {
      width: 60px;
      height: 60px;
    }

    .bg-circle-1,
    .bg-circle-2,
    .bg-circle-3 {
      display: none;
    }
  }
`;
