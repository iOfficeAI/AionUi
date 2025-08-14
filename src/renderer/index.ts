/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import "../adapter/browser";
import type { PropsWithChildren } from "react";
import React from "react";
import { createRoot } from "react-dom/client";
import Main from "./main";

import "uno.css";
import "./index.css";
import "@arco-design/web-react/dist/css/arco.css";
import "./i18n";
import enUS from "@arco-design/web-react/es/locale/en-US"; // 英文
import zhCN from "@arco-design/web-react/es/locale/zh-CN"; // 中文（简体）
import zhTW from "@arco-design/web-react/es/locale/zh-TW"; // 中文（繁体）
import jaJP from "@arco-design/web-react/es/locale/ja-JP"; // 日文
import { ConfigProvider } from "@arco-design/web-react";
import HOC from "./utils/HOC";
import { useTranslation } from "react-i18next";
const root = createRoot(document.getElementById("root"));

const Config: React.FC<PropsWithChildren> = (props) => {
  const {
    i18n: { language },
  } = useTranslation();
  return React.createElement(
    ConfigProvider,
    {
      theme: {
        primaryColor: "#4E5969",
      },
      locale:
        language === "zh-CN"
          ? zhCN
          : language === "zh-TW"
          ? zhTW
          : language === "ja-JP"
          ? jaJP
          : enUS,
    },
    props.children
  );
};

root.render(React.createElement(HOC(Config)(Main)));
