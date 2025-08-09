import React from "react";
import GeminiSettings from "./geminsettings";
import { Divider, Form } from "@arco-design/web-react";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { ipcBridge } from "@/common";

const Settings: React.FC<{
  onBack: () => void;
}> = (props) => {
  const { t } = useTranslation();
  return (
    <div className=" px-20px size-full box-border flex flex-col justify-between">
      <div>
        <Form
          labelCol={{
            flex: "200px",
          }}
          wrapperCol={{
            flex: "1",
          }}
          className={"[&_.arco-row]:flex-nowrap pl-20px"}
        >
          <Form.Item label={t("settings.language")} field={"language"}>
            <LanguageSwitcher></LanguageSwitcher>
          </Form.Item>
        </Form>
        <Divider orientation="left" className="!my-0px">
          {t("settings.geminiSettings")}
        </Divider>
        <GeminiSettings onBack={props.onBack}></GeminiSettings>
      </div>
      <Form
        labelCol={{
          flex: "200px",
        }}
        wrapperCol={{
          flex: "1",
        }}
        className={"[&_.arco-row]:flex-nowrap pl-20px"}
      >
        <Form.Item label={t("common.about")} field={"about"}>
          <a
            href="https://www.aionui.com"
            target="_blank"
            onClick={(e) => {
              e.preventDefault();
              ipcBridge.openExternal.invoke("https://www.aionui.com");
            }}
          >
            https://www.aionui.com
          </a>
        </Form.Item>
      </Form>
    </div>
  );
};

export default Settings;
