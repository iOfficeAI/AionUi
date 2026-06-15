/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Button, Message, Modal, Input } from '@arco-design/web-react';
import {
  Lock,
  Picture,
  EmotionHappy,
  ListBottom,
} from '@icon-park/react';
import { BlockNoteView } from '@blocknote/mantine';
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react';
import { ipcBridge } from '@/common';
import type { ILibraryItem } from '@/common/types/library';

// CSS imports for BlockNote
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

interface NotionEditorProps {
  item: ILibraryItem;
  onBack: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onCreateSubpage?: (parentId: string) => Promise<ILibraryItem | null>;
  onOpenSubpage?: (subItem: ILibraryItem) => void;
}

interface SubpageCardProps {
  subpage: ILibraryItem;
  breadcrumbs: string;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  style?: React.CSSProperties;
}

const SubpageCard: React.FC<SubpageCardProps> = ({
  subpage,
  breadcrumbs,
  onClick,
  onMouseEnter,
  onMouseLeave,
  style,
}) => {
  const pageIcon = localStorage.getItem(`note_icon_${subpage.id}`) || '📄';
  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
      className="subpage-preview-card"
    >
      <div className="subpage-card-icon-wrapper">
        <span className="subpage-card-icon">{pageIcon}</span>
      </div>
      {breadcrumbs && <div className="subpage-card-breadcrumbs">{breadcrumbs}</div>}
      <div className="subpage-card-title">{subpage.name}</div>
    </div>
  );
}

// Beautiful dark gradient presets for cover images
const COVER_PRESETS = [
  'linear-gradient(135deg, #1f1c2c 0%, #928dab 100%)',
  'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(135deg, #130cb7 0%, #52e5e7 100%)',
  'linear-gradient(135deg, #e65c00 0%, #f9d423 100%)',
  'linear-gradient(135deg, #8a2387 0%, #e94057 50%, #f27121 100%)',
  'linear-gradient(135deg, #40e0d0 0%, #ff8c00 50%, #ff0080 100%)',
];

const emojis = [
  '📝','🚀','💡','📅','🎯','🔒','📦','🌟','🍀','🍕',
  '⚙️','📂','🗒️','📚','📎','✏️','💻','🔥','🎨','🎬',
  '🎧','👾','🏡','🗺️','☕','💼','📌','🔍','🌙','⚡',
];

// --- TOC Heading type ---
interface TocHeading {
  id: string;
  text: string;
  level: number;
}

const NotionEditor: React.FC<NotionEditorProps> = ({
  item,
  onRename,
  onCreateSubpage,
  onOpenSubpage,
}) => {
  const [title, setTitle] = useState(item.name);
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  // Track inline sub-pages created in this session
  const [inlineSubpages, setInlineSubpages] = useState<Record<string, ILibraryItem>>({});

  // All library items for resolving hierarchy paths and listing subpages
  const [allItems, setAllItems] = useState<ILibraryItem[]>([]);

  // Hover preview state
  const [hoveredSubpage, setHoveredSubpage] = useState<ILibraryItem | null>(null);
  const [hoverCardPosition, setHoverCardPosition] = useState<{ x: number; y: number } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal visibilities
  const [isIconModalOpen, setIsIconModalOpen] = useState(false);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // TOC state
  const [tocHeadings, setTocHeadings] = useState<TocHeading[]>([]);
  const [isTocHovered, setIsTocHovered] = useState(false);
  const tocTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Cover image and Icon state
  const [cover, setCover] = useState<string>(() => {
    return localStorage.getItem(`note_cover_${item.id}`) || COVER_PRESETS[0];
  });
  const [pageIcon, setPageIcon] = useState<string>(() => {
    return localStorage.getItem(`note_icon_${item.id}`) || '📝';
  });

  // ── Listen for lock toggle events dispatched by the tab bar ──────────────
  useEffect(() => {
    const handler = () => {
      setIsLocked((prev) => {
        const next = !prev;
        Message.success(next ? 'Page locked for editing' : 'Page unlocked');
        return next;
      });
    };
    window.addEventListener(`notion-lock-toggle-${item.id}`, handler);
    return () => window.removeEventListener(`notion-lock-toggle-${item.id}`, handler);
  }, [item.id]);

  // ── Fetch initial content ─────────────────────────────────────────────────
  useEffect(() => {
    const loadNote = async () => {
      try {
        const blocksJson = await ipcBridge.library.getNote.invoke({ itemId: item.id });
        if (blocksJson) {
          setInitialContent(blocksJson);
        } else {
          const defaultBlocks = [
            {
              id: 'init_header_1',
              type: 'heading',
              props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left', level: 1 },
              content: [{ type: 'text', text: item.name, styles: {} }],
            },
            {
              id: 'init_paragraph_1',
              type: 'paragraph',
              props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
              content: [{ type: 'text', text: 'Start writing here or type / for commands...', styles: { italic: true } }],
            },
          ];
          setInitialContent(JSON.stringify(defaultBlocks));
        }
      } catch (err) {
        console.error('Failed to load note:', err);
      } finally {
        setLoading(false);
      }
    };
    void loadNote();
  }, [item.id, item.name]);

  // ── Create BlockNote editor ───────────────────────────────────────────────
  const editor = useCreateBlockNote(
    useMemo(() => {
      if (initialContent === null) return {};
      try {
        return { initialContent: JSON.parse(initialContent) };
      } catch {
        return {};
      }
    }, [initialContent])
  );

  // ── Load all items in NotionEditor ─────────────────────────────────────────
  const loadAllItems = useCallback(async () => {
    try {
      const results = await ipcBridge.library.listItems.invoke({ filter: 'recents' });
      setAllItems(results);
    } catch (err) {
      console.error('Failed to load all items in NotionEditor:', err);
    }
  }, []);

  useEffect(() => {
    void loadAllItems();
  }, [loadAllItems, item.id]);

  // ── Get breadcrumbs for subpage ───────────────────────────────────────────
  const getBreadcrumbs = useCallback((subItem: ILibraryItem) => {
    const path: string[] = [];
    const visited = new Set<string>();
    let curr = allItems.find(x => x.id === subItem.parentId);
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      path.unshift(curr.name);
      curr = curr.parentId ? allItems.find(x => x.id === curr.parentId) : undefined;
    }
    if (path.length === 0) return '';
    if (path.length > 2) {
      return `${path[0]} / ... / ${path[path.length - 1]}`;
    }
    return path.join(' / ');
  }, [allItems]);

  // ── Hover card events ─────────────────────────────────────────────────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      let el: HTMLElement | null = target;
      while (el && el !== container) {
        const dataId = el.getAttribute('data-id');
        if (dataId && dataId.startsWith('subpage_')) {
          const subId = dataId.replace('subpage_', '');
          const subItem = allItems.find(x => x.id === subId);
          if (subItem) {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            const rect = el.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            setHoveredSubpage(subItem);
            setHoverCardPosition({
              x: rect.left - containerRect.left,
              y: rect.bottom - containerRect.top + container.scrollTop + 6,
            });
          }
          return;
        }
        el = el.parentElement;
      }
    };

    const handleMouseOut = () => {
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredSubpage(null);
        setHoverCardPosition(null);
      }, 350);
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);
    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [allItems]);

  // ── Helper: create subpage and insert inline block ──────────────────────
  const createSubpageInline = useCallback(async () => {
    if (!onCreateSubpage || !editor) return;
    const newItem = await onCreateSubpage(item.id);
    if (!newItem) return;

    // Track the sub-page for click handling
    setInlineSubpages((prev) => ({ ...prev, [newItem.id]: newItem }));

    // Reload items so the subpages list at the bottom updates immediately
    void loadAllItems();

    // Build a visual "page link" block as a paragraph with a special marker
    const pageBlockId = `subpage_${newItem.id}`;
    const textContent = `📄 ${newItem.name}`;

    // Get the current cursor block to insert after it
    const cursorBlock = editor.getTextCursorPosition();
    const referenceBlock = cursorBlock?.block;

    const newBlock = {
      id: pageBlockId,
      type: 'paragraph' as const,
      props: {
        textColor: 'default' as const,
        backgroundColor: 'default' as const,
        textAlignment: 'left' as const,
      },
      content: [{ type: 'text' as const, text: textContent, styles: { bold: true } }],
    };

    if (referenceBlock) {
      editor.insertBlocks([newBlock], referenceBlock, 'after');
    } else {
      // Fallback: insert at end
      const lastBlock = editor.document[editor.document.length - 1];
      if (lastBlock) {
        editor.insertBlocks([newBlock], lastBlock, 'after');
      }
    }
  }, [onCreateSubpage, editor, item.id]);

  // ── Keyboard shortcut: Cmd/Ctrl+Shift+N → New subpage ────────────────────
  useEffect(() => {
    if (!onCreateSubpage) return;
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'n') {
        e.preventDefault();
        void createSubpageInline();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onCreateSubpage, createSubpageInline]);

  // ── Click handler for inline subpage blocks ───────────────────────────────
  useEffect(() => {
    if (!onOpenSubpage) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Walk up the DOM to find a block with data-id starting with "subpage_"
      let el: HTMLElement | null = target;
      while (el && el !== container) {
        const dataId = el.getAttribute('data-id');
        if (dataId && dataId.startsWith('subpage_')) {
          const subId = dataId.replace('subpage_', '');
          const subItem = inlineSubpages[subId];
          if (subItem) {
            e.preventDefault();
            e.stopPropagation();
            onOpenSubpage(subItem);
          }
          return;
        }
        el = el.parentElement;
      }
    };

    container.addEventListener('click', handleClick, true);
    return () => container.removeEventListener('click', handleClick, true);
  }, [onOpenSubpage, inlineSubpages]);

  // ── TOC extraction ────────────────────────────────────────────────────────
  const updateTocHeadings = useCallback(() => {
    if (!editor) return;
    try {
      const blocks = editor.document;
      const headings: TocHeading[] = [];
      const extractHeadings = (blockList: any[]) => {
        for (const block of blockList) {
          if (block.type === 'heading' && block.content) {
            const text = block.content.map((c: any) => c.text || '').join('').trim();
            if (text) headings.push({ id: block.id, text, level: block.props?.level || 1 });
          }
          if (block.children?.length > 0) extractHeadings(block.children);
        }
      };
      extractHeadings(blocks);
      setTocHeadings(headings);
    } catch { /* silent */ }
  }, [editor]);

  useEffect(() => {
    if (!editor || loading) return;
    updateTocHeadings();
    const interval = setInterval(updateTocHeadings, 3000);
    return () => clearInterval(interval);
  }, [editor, loading, updateTocHeadings]);

  // ── Auto-save every 2 s ───────────────────────────────────────────────────
  useEffect(() => {
    if (!editor || loading) return;
    const interval = setInterval(async () => {
      const blocksJson = JSON.stringify(editor.document);
      await ipcBridge.library.saveNote.invoke({ itemId: item.id, blocksJson });
    }, 2000);
    return () => clearInterval(interval);
  }, [editor, loading, item.id]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTitleChange = async (val: string) => {
    setTitle(val);
    onRename(val);
    try {
      await ipcBridge.library.updateItem.invoke({ id: item.id, updates: { name: val } });
    } catch (err) {
      console.error('Failed to save title:', err);
    }
  };

  const handleRandomCover = () => {
    const nextCover = COVER_PRESETS[Math.floor(Math.random() * COVER_PRESETS.length)];
    setCover(nextCover);
    localStorage.setItem(`note_cover_${item.id}`, nextCover);
  };

  const handleSelectIcon = (emoji: string) => {
    setPageIcon(emoji);
    localStorage.setItem(`note_icon_${item.id}`, emoji);
    setIsIconModalOpen(false);
  };

  const handleCustomCoverSubmit = () => {
    if (customCoverUrl.trim()) {
      const formattedUrl =
        customCoverUrl.startsWith('url(') || customCoverUrl.includes('linear-gradient')
          ? customCoverUrl
          : `url(${customCoverUrl})`;
      setCover(formattedUrl);
      localStorage.setItem(`note_cover_${item.id}`, formattedUrl);
      setIsCoverModalOpen(false);
      setCustomCoverUrl('');
    }
  };

  const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Url = reader.result as string;
        setCover(`url(${base64Url})`);
        localStorage.setItem(`note_cover_${item.id}`, `url(${base64Url})`);
        setIsCoverModalOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTocClick = (headingId: string) => {
    const blockEl = document.querySelector(`[data-id="${headingId}"]`);
    if (blockEl) blockEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleTocBarEnter = () => {
    if (tocTimeoutRef.current) clearTimeout(tocTimeoutRef.current);
    setIsTocHovered(true);
  };

  const handleTocBarLeave = () => {
    tocTimeoutRef.current = setTimeout(() => setIsTocHovered(false), 400);
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading || initialContent === null) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#191919] text-[#a0a0a0]">
        <span>Loading page...</span>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col bg-[#191919] text-[#e3e3e3] overflow-hidden select-none relative">

      {/* ── Editor scroll area ─────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col relative pb-100px"
      >
        {/* Cover banner */}
        <div
          className="w-full h-180px shrink-0 relative group/cover"
          style={{ background: cover, backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
          <div className="absolute bottom-12px right-16px opacity-0 group-hover/cover:opacity-100 transition-opacity flex gap-8px">
            <Button
              size="small"
              className="bg-[#1c1c1c]/80 text-[#e3e3e3] border-none hover:bg-[#1c1c1c] rd-4px"
              icon={<Picture theme="outline" size="14" />}
              onClick={() => setIsCoverModalOpen(true)}
            >
              Change cover
            </Button>
            <Button
              size="small"
              className="bg-[#1c1c1c]/80 text-[#e3e3e3] border-none hover:bg-[#1c1c1c] rd-4px"
              onClick={handleRandomCover}
            >
              Random
            </Button>
          </div>
        </div>

        {/* Content wrapper */}
        <div className="w-full max-w-[800px] mx-auto px-54px box-border flex flex-col mt-[-40px]">
          {/* Page icon (clickable) */}
          <div
            onClick={() => setIsIconModalOpen(true)}
            className="relative z-10 w-80px h-80px rounded-16px bg-[#191919] border border-[#2d2d2d] flex items-center justify-center text-40px shadow-lg group/icon cursor-pointer select-none"
          >
            {pageIcon}
            <div className="absolute inset-0 bg-black/60 rounded-16px opacity-0 group-hover/icon:opacity-100 flex items-center justify-center transition-opacity">
              <EmotionHappy theme="outline" size="20" className="text-[#e3e3e3]" />
            </div>
          </div>

          {/* Title */}
          <div className="mt-20px mb-10px">
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Untitled"
              className="w-full bg-transparent border-none outline-none font-bold text-36px text-[#e3e3e3] placeholder-[#3a3a3a]"
              disabled={isLocked}
            />
          </div>

          {/* Lock indicator */}
          {isLocked && (
            <div className="flex items-center gap-6px mb-12px text-12px text-[#FF6B35] opacity-80">
              <Lock theme="filled" size="12" fill="#FF6B35" />
              <span>Page is locked — editing disabled</span>
            </div>
          )}

          {/* BlockNote editor + custom slash menu */}
          <div className="w-full blocknote-container dark-theme-editor mt-10px">
            <BlockNoteView editor={editor} theme="dark" editable={!isLocked} slashMenu={false}>
              <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (query) => {
                  // Build the "New Page" custom item
                  const newPageItem = {
                    title: '📄 New Page',
                    subtext: 'Create a nested subpage here',
                    onItemClick: () => {
                      void createSubpageInline();
                    },
                    group: 'Actions',
                    icon: <span style={{ fontSize: 18 }}>📄</span>,
                    aliases: ['page', 'subpage', 'new'],
                  };
                  // Get defaults filtered by query
                  const defaults = getDefaultReactSlashMenuItems(editor).filter((i) =>
                    i.title.toLowerCase().includes(query.toLowerCase())
                  );
                  return [newPageItem, ...defaults];
                }}
              />
            </BlockNoteView>
          </div>

          {/* Subpages Section (Request 9) */}
          {useMemo(() => {
            const subpages = allItems.filter(x => x.parentId === item.id);
            if (subpages.length === 0) return null;
            return (
              <div className="mt-40px pt-24px border-t border-[#2d2d2d] mb-40px">
                <div className="text-12px font-bold text-[#8c8c8c] uppercase tracking-wider mb-16px">
                  Subpages
                </div>
                <div className="flex flex-wrap gap-16px">
                  {subpages.map((sub) => (
                    <SubpageCard
                      key={sub.id}
                      subpage={sub}
                      breadcrumbs={getBreadcrumbs(sub)}
                      onClick={() => {
                        if (onOpenSubpage) onOpenSubpage(sub);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          }, [allItems, item.id, getBreadcrumbs, onOpenSubpage])}

        </div>
      </div>

      {/* Floating Hover Card (Request 8) */}
      {hoveredSubpage && hoverCardPosition && (
        <SubpageCard
          subpage={hoveredSubpage}
          breadcrumbs={getBreadcrumbs(hoveredSubpage)}
          onClick={() => {
            if (onOpenSubpage) onOpenSubpage(hoveredSubpage);
            setHoveredSubpage(null);
            setHoverCardPosition(null);
          }}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          }}
          onMouseLeave={() => {
            hoverTimeoutRef.current = setTimeout(() => {
              setHoveredSubpage(null);
              setHoverCardPosition(null);
            }, 350);
          }}
          style={{
            position: 'absolute',
            left: `${hoverCardPosition.x}px`,
            top: `${hoverCardPosition.y}px`,
            zIndex: 1000,
            boxShadow: '0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)',
          }}
        />
      )}

      {/* ── Right-side TOC rail ────────────────────────────────────────── */}
      {tocHeadings.length > 0 && (
        <div
          className="toc-rail"
          onMouseEnter={handleTocBarEnter}
          onMouseLeave={handleTocBarLeave}
        >
          <div className="toc-rail-line" />
          <div className={`toc-panel ${isTocHovered ? 'toc-panel-visible' : ''}`}>
            <div className="toc-panel-header">
              <ListBottom theme="outline" size="13" fill="#8c8c8c" />
              <span>Table of Contents</span>
            </div>
            <div className="toc-panel-items">
              {tocHeadings.map((h) => (
                <div
                  key={h.id}
                  className="toc-item"
                  style={{ paddingLeft: `${(h.level - 1) * 14 + 12}px` }}
                  onClick={() => handleTocClick(h.id)}
                >
                  <span className="toc-item-dot" />
                  <span className="toc-item-text">{h.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Icon picker modal ─────────────────────────────────────────── */}
      <Modal
        title="Select Page Icon"
        visible={isIconModalOpen}
        onOk={() => setIsIconModalOpen(false)}
        onCancel={() => setIsIconModalOpen(false)}
        footer={null}
        className="arco-dark text-center"
      >
        <div className="grid grid-cols-6 gap-12px p-8px justify-center items-center">
          {emojis.map((emoji, idx) => (
            <div
              key={`${emoji}-${idx}`}
              onClick={() => handleSelectIcon(emoji)}
              className="w-48px h-48px flex items-center justify-center text-28px rounded-12px hover:bg-[#2d2d2d] cursor-pointer transition-all hover:scale-110"
            >
              {emoji}
            </div>
          ))}
        </div>
      </Modal>

      {/* ── Cover picker modal ────────────────────────────────────────── */}
      <Modal
        title="Change Cover Banner"
        visible={isCoverModalOpen}
        onOk={handleCustomCoverSubmit}
        onCancel={() => setIsCoverModalOpen(false)}
        className="arco-dark"
      >
        <div className="flex flex-col gap-16px">
          <div>
            <span className="text-13px text-[#8c8c8c] block mb-8px">Preset gradients</span>
            <div className="grid grid-cols-3 gap-8px">
              {COVER_PRESETS.map((preset, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setCover(preset);
                    localStorage.setItem(`note_cover_${item.id}`, preset);
                    setIsCoverModalOpen(false);
                  }}
                  className="h-48px rounded-6px cursor-pointer border border-[#2d2d2d] hover:border-[#007fff] transition-all"
                  style={{ background: preset }}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-[#2d2d2d] pt-12px">
            <span className="text-13px text-[#8c8c8c] block mb-8px">Paste image URL</span>
            <Input
              placeholder="https://example.com/image.jpg"
              value={customCoverUrl}
              onChange={setCustomCoverUrl}
              onPressEnter={handleCustomCoverSubmit}
              className="!bg-[#1c1c1c] !border-[#2d2d2d] text-[#e3e3e3]"
            />
          </div>

          <div className="border-t border-[#2d2d2d] pt-12px flex flex-col items-center">
            <span className="text-13px text-[#8c8c8c] block mb-8px self-start">Upload local image</span>
            <Button
              type="primary"
              className="!bg-[#007fff] hover:!bg-[#0066cc] w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Cover Image
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleLocalImageUpload}
            />
          </div>
        </div>
      </Modal>

      {/* ── Styles ───────────────────────────────────────────────────── */}
      <style>{`
        /* Inline sub-page block styling */
        [data-id^="subpage_"] {
          background: #232323 !important;
          border: 1px solid #333 !important;
          border-radius: 6px !important;
          padding: 8px 14px !important;
          margin: 4px 0 !important;
          cursor: pointer !important;
          transition: background 0.15s ease, border-color 0.15s ease !important;
        }
        [data-id^="subpage_"]:hover {
          background: #2a2a2a !important;
          border-color: #007fff !important;
        }
        [data-id^="subpage_"] .bn-inline-content {
          font-size: 14px !important;
          color: #e3e3e3 !important;
        }

        /* Subpage Card styling matching the user's screenshot precisely */
        .subpage-preview-card {
          background: #202020;
          border: 1px solid #2d2d2d;
          border-radius: 8px;
          padding: 16px;
          width: 210px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
          user-select: none;
        }
        .subpage-preview-card:hover {
          background: #262626;
          border-color: #007fff;
          transform: translateY(-2px);
        }
        .subpage-card-icon-wrapper {
          margin-bottom: 8px;
          font-size: 26px;
          line-height: 1;
        }
        .subpage-card-breadcrumbs {
          font-size: 10px;
          color: #8c8c8c;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
          text-align: left;
        }
        .subpage-card-title {
          font-size: 13px;
          font-weight: 700;
          color: #e3e3e3;
          line-height: 1.4;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
          text-align: left;
        }

        /* Right-side TOC Rail */
        .toc-rail {
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 24px;
          z-index: 20;
          display: flex;
          align-items: stretch;
          justify-content: flex-end;
          cursor: pointer;
        }
        .toc-rail-line {
          position: absolute;
          right: 8px;
          top: 60px;
          bottom: 60px;
          width: 3px;
          border-radius: 3px;
          background: linear-gradient(to bottom, transparent 0%, #333 15%, #444 50%, #333 85%, transparent 100%);
          opacity: 0.5;
          transition: opacity 0.3s ease, background 0.3s ease;
        }
        .toc-rail:hover .toc-rail-line {
          opacity: 0.9;
          background: linear-gradient(to bottom, transparent 0%, #007fff 15%, #007fff 50%, #007fff 85%, transparent 100%);
        }
        .toc-panel {
          position: absolute;
          right: 16px;
          top: 60px;
          width: 220px;
          max-height: calc(100% - 120px);
          background: #1e1e1e;
          border: 1px solid #2d2d2d;
          border-radius: 10px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
          opacity: 0;
          transform: translateX(12px);
          pointer-events: none;
          transition: opacity 0.25s ease, transform 0.25s ease;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .toc-panel-visible {
          opacity: 1;
          transform: translateX(0);
          pointer-events: all;
        }
        .toc-panel-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px 8px;
          font-size: 11px;
          font-weight: 600;
          color: #8c8c8c;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #2d2d2d;
        }
        .toc-panel-items { padding: 6px 0; }
        .toc-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px;
          cursor: pointer;
          border-radius: 4px;
          margin: 1px 6px;
          transition: background 0.15s ease;
        }
        .toc-item:hover { background: #2a2a2a; }
        .toc-item-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #555;
          flex-shrink: 0;
          transition: background 0.15s ease;
        }
        .toc-item:hover .toc-item-dot { background: #007fff; }
        .toc-item-text {
          font-size: 12px;
          color: #b0b0b0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.15s ease;
        }
        .toc-item:hover .toc-item-text { color: #e3e3e3; }
        .toc-panel::-webkit-scrollbar { width: 4px; }
        .toc-panel::-webkit-scrollbar-track { background: transparent; }
        .toc-panel::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default NotionEditor;
