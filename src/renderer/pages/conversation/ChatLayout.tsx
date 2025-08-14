import React, { useState } from "react";
import { Layout as ArcoLayout } from "@arco-design/web-react";
import { ExpandLeft, ExpandRight } from "@icon-park/react";
import FlexFullContainer from "@/renderer/components/FlexFullContainer";
const ChatLayout: React.FC<{
  children: React.ReactNode;
  title?: React.ReactNode;
  sider: React.ReactNode;
}> = (props) => {
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(false);

  return (
    <ArcoLayout className={"size-full"}>
      <ArcoLayout.Content>
        <ArcoLayout.Header
          className={
            "flex items-center justify-between p-16px gap-16px h-56px !bg-#F7F8FA"
          }
        >
          <FlexFullContainer className="h-full">
            <span className=" ml-16px font-bold text-16px inline-block overflow-hidden text-ellipsis whitespace-nowrap w-full max-w-60%">
              {props.title}
            </span>
          </FlexFullContainer>
          {rightSiderCollapsed && (
            <div className="flex items-center gap-16px">
              <ExpandRight
                onClick={() => setRightSiderCollapsed(false)}
                className="cursor-pointer flex"
                theme="outline"
                size="24"
                fill="#86909C"
                strokeWidth={3}
              />
            </div>
          )}
        </ArcoLayout.Header>
        <ArcoLayout.Content className={"h-[calc(100%-66px)] bg-#F9FAFB"}>
          {props.children}
        </ArcoLayout.Content>
      </ArcoLayout.Content>
      <ArcoLayout.Sider
        width={266}
        collapsedWidth={0}
        collapsed={rightSiderCollapsed}
        className={"!bg-#F7F8FA"}
      >
        <ArcoLayout.Header
          className={"flex items-center justify-start p-16px gap-16px h-56px"}
        >
          <div className="flex-1">{props.title}</div>
          <ExpandLeft
            theme="outline"
            size="24"
            fill="#86909C"
            className="cursor-pointer"
            strokeWidth={3}
            onClick={() => setRightSiderCollapsed(true)}
          />
        </ArcoLayout.Header>
        <ArcoLayout.Content className={"h-[calc(100%-66px)] bg-#F9FAFB"}>
          {props.sider}
        </ArcoLayout.Content>
      </ArcoLayout.Sider>
    </ArcoLayout>
  );
};

export default ChatLayout;
