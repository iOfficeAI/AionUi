/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from "@/common";
import { IDirOrFile } from "@/common/ipcBridge";
import FlexFullContainer from "@/renderer/components/FlexFullContainer";
import { emitter, useAddEventListener } from "@/renderer/utils/emitter";
import { Empty, Tree, Input } from "@arco-design/web-react";
import { Refresh } from "@icon-park/react";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

const GeminiWorkspace: React.FC<{
  workspace: string;
  customWorkspace?: boolean;
}> = ({ workspace }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<IDirOrFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  useAddEventListener("gemini.selected.file.clear", () => {
    setSelected([]);
  });

  useAddEventListener("gemini.selected.file", (files) => {
    setSelected(files);
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearchText(value);
  }, []);

  const searchFiles = useCallback((fileList: IDirOrFile[], searchTerm: string): IDirOrFile[] => {
    if (!searchTerm.trim()) return fileList;

    const lowerSearchTerm = searchTerm.toLowerCase();
    const results: IDirOrFile[] = [];

    const searchInNode = (node: IDirOrFile): IDirOrFile | null => {
      const isCurrentMatch = node.name.toLowerCase().includes(lowerSearchTerm);
      
      if (node.children?.length > 0) {
        const matchingChildren = node.children
          .map(child => searchInNode(child))
          .filter((child): child is IDirOrFile => child !== null);
        
        if (isCurrentMatch || matchingChildren.length > 0) {
          return { ...node, children: matchingChildren };
        }
      } else if (isCurrentMatch) {
        return node;
      }
      
      return null;
    };

    fileList.forEach(node => {
      const result = searchInNode(node);
      if (result) results.push(result);
    });

    return results;
  }, []);

  const filteredFiles = useMemo(() => {
    if (!searchText.trim()) return files;
    return searchFiles(files, searchText);
  }, [files, searchText, searchFiles]);

  const clearSearch = useCallback(() => {
    setSearchText("");
  }, []);

  const refreshWorkspace = () => {
    setLoading(true);
    const startTime = Date.now();
    
    ipcBridge.geminiConversation.getWorkspace
      .invoke({ workspace })
      .then((res) => {
        if (Array.isArray(res)) {
          setFiles(res);
        } else {
          setFiles([]);
        }
        clearSearch();
      })
      .catch(() => {
        setFiles([]);
      })
      .finally(() => {
        if (Date.now() - startTime > 1000) {
          setLoading(false);
        } else {
          setTimeout(() => setLoading(false), 1000);
        }
      });
  };

  useEffect(() => {
    setFiles([]);
    setSearchText("");
    refreshWorkspace();
    emitter.emit("gemini.selected.file", []);
  }, [workspace]);

  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on((data) => {
      if (data.type === "tool_group" || data.type === "tool_call") {
        refreshWorkspace();
      }
    });
  }, [workspace]);

  useAddEventListener("gemini.workspace.refresh", () => refreshWorkspace(), [workspace]);

  const hasFile = files.length > 0 && files[0]?.children?.length > 0;
  const hasSearchResults = useMemo(() => {
    if (!searchText.trim()) return true;
    return filteredFiles.length > 0;
  }, [searchText, filteredFiles]);

  return (
    <div className="size-full flex flex-col">
      <div className="px-16px pb-0px flex items-center justify-start gap-4px">
        <span className="font-bold text-14px">{t("common.file")}</span>
        <Refresh
          className={loading ? "loading lh-[1] flex" : "flex"}
          theme="outline"
          fill="#333"
          onClick={refreshWorkspace}
        />
      </div>
      
      {hasFile && (
        <div className="px-16px py-8px">
          <Input.Search
            placeholder={t("conversation.workspace.searchPlaceholder")}
            value={searchText}
            onChange={handleSearchChange}
            onClear={clearSearch}
            allowClear
            searchButton
            className="w-full"
          />
        </div>
      )}

      <FlexFullContainer containerClassName="overflow-y-auto">
        {!hasFile ? (
          <div className="flex-1 size-full flex items-center justify-center px-16px box-border">
            <Empty
              description={
                <div>
                  <span className="color-#6b7280 font-bold text-14px">
                    {t("conversation.workspace.empty")}
                  </span>
                  <div>{t("conversation.workspace.emptyDescription")}</div>
                </div>
              }
            />
          </div>
        ) : !hasSearchResults && searchText.trim() ? (
          <div className="flex-1 size-full flex items-center justify-center px-16px box-border">
            <Empty
              description={
                <div>
                  <span className="color-#6b7280 font-bold text-14px">
                    {t("conversation.workspace.searchNoResults")}
                  </span>
                  <div>{t("conversation.workspace.searchNoResultsDescription")}</div>
                </div>
              }
            />
          </div>
        ) : (
          <Tree
            className="!px-16px"
            showLine
            selectedKeys={selected}
            treeData={filteredFiles}
            autoExpandParent
            fieldNames={{
              children: "children",
              title: "name",
              key: "path",
            }}
            multiple
            renderTitle={(node) => {
              let timer: any;
              const path = node.dataRef.path;
              let time = Date.now();
              return (
                <span
                  className="flex items-center gap-4px group"
                  onClick={() => {
                    return;
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                      setSelected((list) => {
                        let newList = [...list];
                        if (list.some((key) => key === path))
                          newList = list.filter((key) => key !== path);
                        else newList = [...list, path];
                        emitter.emit("gemini.selected.file", newList);
                        return newList;
                      });
                    }, 100);
                    console.log("----click", timer, Date.now() - time);
                    time = Date.now();
                  }}
                  onDoubleClick={() => {
                    if (path === workspace) {
                      return ipcBridge.openFile.invoke(path);
                    }
                    ipcBridge.openFile.invoke(workspace + "/" + path);
                  }}
                >
                  {node.title}
                </span>
              );
            }}
            onSelect={(keys) => {
              setSelected(keys);
              emitter.emit("gemini.selected.file", keys);
            }}
          />
        )}
      </FlexFullContainer>
    </div>
  );
};

export default GeminiWorkspace;
