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
    <!-- 背景装饰 / Background decoration -->
    <div class="login-background">
      <div class="bg-circle bg-circle-1"></div>
      <div class="bg-circle bg-circle-2"></div>
      <div class="bg-circle bg-circle-3"></div>
    </div>

    <!-- 登录卡片 / Login card -->
    <div class="login-card">
      <!-- 语言切换按钮 / Language toggle -->
      <button type="button" class="lang-toggle" id="langToggle" aria-label="切换语言">
        <span class="lang-text" data-lang="zh">中文</span>
        <span class="lang-divider">/</span>
        <span class="lang-text" data-lang="en">EN</span>
      </button>

      <div class="login-header">
        <div class="login-logo">
          <svg class="logo-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AionUi Logo">
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
        <p class="login-subtitle" data-i18n="subtitle">欢迎回来，请登录您的账户</p>
      </div>

      <form class="login-form" id="loginForm">
        <div class="form-item">
          <label class="form-label" for="username" data-i18n="username">用户名</label>
          <div class="input-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
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
              autocomplete="username"
              aria-label="用户名"
              aria-required="true"
              aria-invalid="false"
              data-i18n-placeholder="usernamePlaceholder"
            />
          </div>
        </div>

        <div class="form-item">
          <label class="form-label" for="password" data-i18n="password">密码</label>
          <div class="input-wrapper">
            <svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
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
              autocomplete="current-password"
              aria-label="密码"
              aria-required="true"
              aria-invalid="false"
              data-i18n-placeholder="passwordPlaceholder"
            />
            <button type="button" class="toggle-password" id="togglePassword" aria-label="显示密码">
              <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path class="eye-open" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle class="eye-open" cx="12" cy="12" r="3"></circle>
                <path class="eye-closed" d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" style="display:none;"></path>
                <line class="eye-closed" x1="1" y1="1" x2="23" y2="23" style="display:none;"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="form-checkbox">
          <input type="checkbox" id="rememberMe" />
          <label for="rememberMe" data-i18n="rememberMe">记住用户名</label>
        </div>

        <button type="submit" class="login-button" id="loginBtn" aria-busy="false">
          <span class="btn-text" data-i18n="loginButton">登录</span>
          <span class="btn-spinner" hidden>
            <svg class="spinner" viewBox="0 0 24 24" fill="none">
              <circle class="spinner-circle" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
            </svg>
          </span>
        </button>

        <div id="message" class="message-box" role="alert" aria-live="polite"></div>
      </form>

      <div class="login-footer">
        <div class="footer-content">
          <span class="footer-text" data-i18n="footer1">命令行 AI 的现代化体验</span>
          <span class="footer-divider">•</span>
          <span class="footer-text" data-i18n="footer2">高效且优雅</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    // 国际化文本 / Internationalization texts
    const i18n = {
      zh: {
        subtitle: '欢迎回来，请登录您的账户',
        username: '用户名',
        usernamePlaceholder: '请输入用户名',
        password: '密码',
        passwordPlaceholder: '请输入密码',
        rememberMe: '记住用户名',
        loginButton: '登录',
        loggingIn: '登录中...',
        showPassword: '显示密码',
        hidePassword: '隐藏密码',
        footer1: '命令行 AI 的现代化体验',
        footer2: '高效且优雅',
        // 错误消息 / Error messages
        emptyFields: '请输入用户名和密码',
        invalidCredentials: '用户名或密码错误',
        tooManyAttempts: '登录尝试过多，请稍后再试',
        connectionError: '连接失败，请稍后重试',
        loginSuccess: '登录成功！正在跳转...',
      },
      en: {
        subtitle: 'Welcome back, please sign in to your account',
        username: 'Username',
        usernamePlaceholder: 'Enter your username',
        password: 'Password',
        passwordPlaceholder: 'Enter your password',
        rememberMe: 'Remember username',
        loginButton: 'Sign In',
        loggingIn: 'Signing in...',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        footer1: 'Transform your command-line AI',
        footer2: 'Modern & Efficient',
        // Error messages
        emptyFields: 'Please enter username and password',
        invalidCredentials: 'Invalid username or password',
        tooManyAttempts: 'Too many attempts, please try again later',
        connectionError: 'Connection failed, please try again',
        loginSuccess: 'Login successful! Redirecting...',
      }
    };

    // 当前语言 / Current language
    let currentLang = localStorage.getItem('lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');

    // DOM 元素 / DOM elements
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const btnText = loginBtn.querySelector('.btn-text');
    const btnSpinner = loginBtn.querySelector('.btn-spinner');
    const messageBox = document.getElementById('message');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const langToggle = document.getElementById('langToggle');
    const togglePasswordBtn = document.getElementById('togglePassword');

    // 应用国际化 / Apply internationalization
    function applyI18n() {
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[currentLang][key]) {
          el.textContent = i18n[currentLang][key];
        }
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (i18n[currentLang][key]) {
          el.placeholder = i18n[currentLang][key];
        }
      });

      // 更新语言按钮样式 / Update language toggle style
      document.querySelectorAll('.lang-text').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-lang') === currentLang);
      });

      // 更新密码切换按钮 aria-label
      togglePasswordBtn.setAttribute('aria-label', i18n[currentLang].showPassword);

      document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
    }

    // 切换语言 / Toggle language
    langToggle.addEventListener('click', () => {
      currentLang = currentLang === 'zh' ? 'en' : 'zh';
      localStorage.setItem('lang', currentLang);
      applyI18n();
    });

    // 切换密码可见性 / Toggle password visibility
    let passwordVisible = false;
    togglePasswordBtn.addEventListener('click', () => {
      passwordVisible = !passwordVisible;
      passwordInput.type = passwordVisible ? 'text' : 'password';

      // 切换图标 / Toggle icon
      togglePasswordBtn.querySelectorAll('.eye-open').forEach(el => {
        el.style.display = passwordVisible ? 'none' : 'block';
      });
      togglePasswordBtn.querySelectorAll('.eye-closed').forEach(el => {
        el.style.display = passwordVisible ? 'block' : 'none';
      });

      // 更新 aria-label
      togglePasswordBtn.setAttribute('aria-label',
        i18n[currentLang][passwordVisible ? 'hidePassword' : 'showPassword']
      );
    });

    // 加载记住的用户名 / Load remembered username
    const rememberedUsername = localStorage.getItem('rememberedUsername');
    if (rememberedUsername) {
      usernameInput.value = rememberedUsername;
      rememberMeCheckbox.checked = true;
      passwordInput.focus();
    } else {
      usernameInput.focus();
    }

    // 显示消息 / Show message
    function showMessage(text, type) {
      messageBox.textContent = text;
      messageBox.className = 'message-box show message-' + type;
      setTimeout(() => {
        if (type !== 'success') {
          messageBox.classList.remove('show');
        }
      }, 5000);
    }

    // 处理登录 / Handle login
    async function handleLogin(e) {
      e.preventDefault();

      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (!username || !password) {
        showMessage(i18n[currentLang].emptyFields, 'error');
        usernameInput.setAttribute('aria-invalid', !username);
        passwordInput.setAttribute('aria-invalid', !password);
        return;
      }

      // 重置验证状态 / Reset validation state
      usernameInput.setAttribute('aria-invalid', 'false');
      passwordInput.setAttribute('aria-invalid', 'false');

      // 设置加载状态 / Set loading state
      loginBtn.disabled = true;
      loginBtn.setAttribute('aria-busy', 'true');
      btnText.textContent = i18n[currentLang].loggingIn;
      btnSpinner.hidden = false;
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
          // 处理记住用户名 / Handle remember username
          if (rememberMeCheckbox.checked) {
            localStorage.setItem('rememberedUsername', username);
          } else {
            localStorage.removeItem('rememberedUsername');
          }

          showMessage(i18n[currentLang].loginSuccess, 'success');
          setTimeout(() => {
            window.location.href = '/';
          }, 800);
        } else {
          // 统一错误消息，防止用户名枚举攻击 / Unified error message to prevent username enumeration
          let errorMessage = i18n[currentLang].invalidCredentials;

          if (result.error === 'TOO_MANY_ATTEMPTS') {
            errorMessage = i18n[currentLang].tooManyAttempts;
          }

          showMessage(errorMessage, 'error');
          loginBtn.disabled = false;
          loginBtn.setAttribute('aria-busy', 'false');
          btnText.textContent = i18n[currentLang].loginButton;
          btnSpinner.hidden = true;
        }
      } catch (error) {
        console.error('Login error:', error);
        showMessage(i18n[currentLang].connectionError, 'error');
        loginBtn.disabled = false;
        loginBtn.setAttribute('aria-busy', 'false');
        btnText.textContent = i18n[currentLang].loginButton;
        btnSpinner.hidden = true;
      }
    }

    loginForm.addEventListener('submit', handleLogin);

    // 初始化国际化 / Initialize i18n
    applyI18n();
  </script>
</body>
</html>
    `.trim();
  }
}

export default LoginPage;
