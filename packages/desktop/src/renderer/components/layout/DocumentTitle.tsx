/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Single owner of `document.title`.
 *
 * The title used to be set once by the login page and never again, so after
 * logging in the window/tab kept saying "AionUi - Login" — in whatever language
 * the login page happened to render in — for the rest of the session. Deriving
 * it here from the route and the app language keeps it correct across both
 * navigation and language switches.
 */
export function titleForPath(pathname: string, t: (key: string) => string): string {
  return pathname.startsWith('/login') ? t('login.pageTitle') : 'AionUi';
}

const DocumentTitle: React.FC = () => {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = titleForPath(pathname, t);
  }, [pathname, t, i18n.language]);

  return null;
};

export default DocumentTitle;
