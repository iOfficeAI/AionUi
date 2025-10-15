/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { loginStyles } from './styles';

/**
 * 登录页面渲染器
 * Login Page Renderer
 */
export class LoginPage {
  /**
   * 渲染登录页面 HTML
   * Render login page HTML
   */
  static render(): string {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AionUi - Login</title>
  <style>${loginStyles}</style>
</head>
<body>
  <div class="login-wrapper">
    <!-- 背景装饰 -->
    <div class="login-background">
      <div class="bg-circle bg-circle-1"></div>
      <div class="bg-circle bg-circle-2"></div>
      <div class="bg-circle bg-circle-3"></div>
    </div>

    <!-- 登录卡片 -->
    <div class="login-card">
      <div class="login-header">
        <div class="login-logo">
          <svg class="logo-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="45" fill="url(#logoGradient)" />
            <path d="M 30 50 L 45 35 L 60 50 L 45 65 Z" fill="white" opacity="0.9" />
            <circle cx="70" cy="35" r="8" fill="white" opacity="0.8" />
          </svg>
        </div>
        <h1 class="login-title">AionUi</h1>
        <p class="login-subtitle">欢迎回来，请登录您的账户</p>
      </div>

      <form class="login-form" id="loginForm">
        <div class="form-item">
          <label class="form-label" for="username">用户名</label>
          <div class="input-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <input
              type="text"
              id="username"
              name="username"
              class="form-input"
              placeholder="请输入用户名"
              required
              autocomplete="off"
            />
          </div>
        </div>

        <div class="form-item">
          <label class="form-label" for="password">密码</label>
          <div class="input-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <input
              type="password"
              id="password"
              name="password"
              class="form-input"
              placeholder="请输入密码"
              required
              autocomplete="off"
            />
          </div>
        </div>

        <button type="submit" class="login-button" id="loginBtn">
          登录
        </button>

        <div id="message" class="message-box"></div>
      </form>

      <div class="login-footer">
        <div class="footer-content">
          <span class="footer-text">Transform your command-line AI</span>
          <span class="footer-divider">•</span>
          <span class="footer-text">Modern & Efficient</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const messageBox = document.getElementById('message');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // 显示消息
    function showMessage(text, type) {
      messageBox.textContent = text;
      messageBox.className = 'message-box show message-' + type;
      setTimeout(() => {
        if (type !== 'success') {
          messageBox.classList.remove('show');
        }
      }, 5000);
    }

    // 处理登录
    async function handleLogin(e) {
      e.preventDefault();

      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (!username || !password) {
        showMessage('请输入用户名和密码', 'error');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = '登录中...';
      messageBox.classList.remove('show');

      try {
        const response = await fetch('/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password }),
        });

        const result = await response.json();

        if (result.success) {
          showMessage('登录成功！正在跳转...', 'success');
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } else {
          showMessage(result.error || '登录失败，请检查用户名和密码', 'error');
          loginBtn.disabled = false;
          loginBtn.textContent = '登录';
        }
      } catch (error) {
        console.error('Login error:', error);
        showMessage('连接失败，请稍后重试', 'error');
        loginBtn.disabled = false;
        loginBtn.textContent = '登录';
      }
    }

    loginForm.addEventListener('submit', handleLogin);

    // 自动聚焦到用户名输入框
    usernameInput.focus();
  </script>
</body>
</html>
    `.trim();
  }
}

export default LoginPage;
