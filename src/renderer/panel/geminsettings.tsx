/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Form, Input, Select } from "@arco-design/web-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ipcBridge } from "../../common";
import { FolderOpen, Link } from "@icon-park/react";
import { systemInfo } from "../../common/ipcBridge";
import { ConfigStorage } from "@/common/storage";

const GeminiSettings: React.FC<{
  onBack: () => void;
}> = (props) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oldConfig, setOldConfig] = useState({ authType: "", proxy: "" });
  const onSubmit = (values: any) => {
    delete values.tempDir;
    setLoading(true);
    setError(null);
    ConfigStorage.set("gemini.config", values)
      .then(() => {
        ipcBridge.resetConversation
          .invoke({
            gemini: {
              clearCachedCredentialFile: oldConfig.authType !== values.authType,
            },
          })
          .finally(() => {
            window.location.reload();
          });
      })
      .catch((e) => {
        setError(e.message || e);
      })
      .finally(() => {
        setLoading(false);
      });
  };
  useEffect(() => {
    ConfigStorage.get("gemini.config").then((data) => {
      form.setFieldsValue(data);
      if (data) setOldConfig(data);
    });
    systemInfo.invoke().then((data) => {
      form.setFieldValue("tempDir", data.tempDir);
    });
  }, []);

  const authType = Form.useWatch("authType", form);

  return (
    <Form
      layout="horizontal"
      onSubmit={onSubmit}
      labelCol={{
        span: 5,
        flex: "200px",
      }}
      wrapperCol={{
        flex: "1",
      }}
      form={form}
      className={"[&_.arco-row]:flex-nowrap  max-w-800px"}
    >
      <Form.Item
        label={
          <span className="flex items-center justify-end">
            {t("settings.authMethod")}
            <Link
              size="14"
              onClick={() => {
                ipcBridge.openExternal.invoke(
                  "https://github.com/google-gemini/gemini-cli"
                );
              }}
            />
          </span>
        }
        field="authType"
      >
        <Select
          options={[
            {
              label: t("settings.geminiApiKey"),
              value: "gemini-api-key",
            },
            {
              label: t("settings.vertexApiKey"),
              value: "vertex-ai",
            },
            {
              label: t("settings.personalAuth"),
              value: "oauth-personal",
            },
          ]}
        ></Select>
      </Form.Item>
      {authType === "gemini-api-key" ? (
        <Form.Item label={t("settings.geminiApiKey")} field="GEMINI_API_KEY">
          <Input></Input>
        </Form.Item>
      ) : authType === "vertex-ai" ? (
        <Form.Item label={t("settings.vertexApiKey")} field="GOOGLE_API_KEY">
          <Input></Input>
        </Form.Item>
      ) : null}
      {authType === "gemini-api-key" && (
        <Form.Item label={t("settings.geminiBaseUrl")} field="GOOGLE_GEMINI_BASE_URL">
          <Input placeholder="https://generativelanguage.googleapis.com"></Input>
        </Form.Item>
      )}
      <Form.Item label={t("settings.proxyConfig")} field="proxy">
        <Input></Input>
      </Form.Item>
      <Form.Item label={t("settings.tempDir")} field="tempDir">
        {(props) => (
          <Input
            disabled
            value={props.tempDir}
            addAfter={
              <FolderOpen
                theme="outline"
                size="24"
                fill="#333"
                onClick={() => {
                  ipcBridge.showItemInFolder.invoke(props.tempDir);
                }}
              />
            }
          ></Input>
        )}
      </Form.Item>
      {error && (
        <Alert
          className={"m-b-10px"}
          type="error"
          content={typeof error === "string" ? error : JSON.stringify(error)}
        />
      )}
      <div className="flex justify-center gap-10px">
        <Button type="secondary" onClick={props.onBack}>
          {t("common.cancel")}
        </Button>
        <Button type="primary" htmlType="submit" loading={loading}>
          {t("common.save")}
        </Button>
      </div>
    </Form>
  );
};

export default GeminiSettings;
