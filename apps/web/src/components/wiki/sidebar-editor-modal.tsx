'use client';

import { useState, useEffect, type DragEvent } from 'react';
import {
  X,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Globe,
  FileText,
  Settings2,
  Save,
  RotateCcw,
  Check,
  Edit2,
  ExternalLink,
  Code,
  ListOrdered,
  GripVertical,
} from 'lucide-react';
import {
  SidebarSection,
  SidebarLink,
  parseMediaWikiSidebarText,
  stringifyMediaWikiSidebar,
  generateDefaultSidebar,
} from '@/types/sidebar';
import { sitesApi } from '@/lib/api';

// ドラッグ中の要素
type DragState =
  | { type: 'section'; secIdx: number }
  | { type: 'item'; secIdx: number; linkIdx: number; childIdx?: number; isFolder: boolean };

// ドロップ先（挿入位置）
// - section: セクション一覧の index の位置に挿入
// - item: secIdx のセクション内、parentIdx 指定時はそのフォルダの子リスト内の index の位置に挿入
type DropTarget =
  | { type: 'section'; index: number }
  | { type: 'item'; secIdx: number; parentIdx?: number; index: number };

function DropLine({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute left-0 right-0 m-0 h-0.5 rounded-full bg-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)] z-10 ${className}`}
    />
  );
}

function DragHandle({
  onDragStart,
  onDragEnd,
  size = 'size-4',
}: {
  onDragStart: (e: DragEvent<HTMLSpanElement>) => void;
  onDragEnd: () => void;
  size?: string;
}) {
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="shrink-0 p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing"
      title="ドラッグして並び替え"
    >
      <GripVertical className={size} />
    </span>
  );
}

interface SidebarEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId?: string;
  siteSlug: string;
  currentSections?: SidebarSection[];
  showToolsSection?: boolean;
  availablePages: Array<{ id: string; slug: string; title: string }>;
  onSaved: (sections: SidebarSection[], showTools: boolean) => void;
}

export function SidebarEditorModal({
  isOpen,
  onClose,
  siteId,
  siteSlug,
  currentSections,
  showToolsSection = true,
  availablePages,
  onSaved,
}: SidebarEditorModalProps) {
  const [mode, setMode] = useState<'gui' | 'wikitext'>('gui');
  const [sections, setSections] = useState<SidebarSection[]>([]);
  const [showTools, setShowTools] = useState(showToolsSection);
  const [wikitext, setWikitext] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // 初期値セット
  useEffect(() => {
    if (isOpen) {
      const initial =
        currentSections && currentSections.length > 0
          ? JSON.parse(JSON.stringify(currentSections))
          : generateDefaultSidebar(availablePages);
      setSections(initial);
      setShowTools(showToolsSection ?? true);
      setWikitext(stringifyMediaWikiSidebar(initial));
    }
  }, [isOpen, currentSections, showToolsSection, availablePages]);

  if (!isOpen) return null;

  // モード切替
  const handleSwitchToWikitext = () => {
    setWikitext(stringifyMediaWikiSidebar(sections));
    setMode('wikitext');
  };

  const handleSwitchToGui = () => {
    try {
      const parsed = parseMediaWikiSidebarText(wikitext);
      setSections(parsed);
    } catch {
      // ignore
    }
    setMode('gui');
  };

  // セクション操作
  const handleAddSection = () => {
    const newSection: SidebarSection = {
      id: `sec-${Date.now()}`,
      title: '新しいセクション',
      links: [],
    };
    setSections([...sections, newSection]);
  };

  const handleDeleteSection = (index: number) => {
    const next = [...sections];
    next.splice(index, 1);
    setSections(next);
  };

  const handleSectionTitleChange = (index: number, title: string) => {
    const next = [...sections];
    next[index].title = title;
    setSections(next);
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === sections.length - 1)
    )
      return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const next = [...sections];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setSections(next);
  };

  // ===== ドラッグ＆ドロップ並び替え =====
  const resetDrag = () => {
    setDrag(null);
    setDropTarget(null);
  };

  const updateDropTarget = (t: DropTarget | null) => {
    setDropTarget((prev) => (JSON.stringify(prev) === JSON.stringify(t) ? prev : t));
  };

  const startDrag = (e: DragEvent<HTMLElement>, state: DragState) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    // Firefox ではデータをセットしないとドラッグが開始されない
    e.dataTransfer.setData('text/plain', '');
    // ドラッグ画像として行全体を表示
    const row = (e.currentTarget as HTMLElement).closest('[data-dnd-row]');
    if (row instanceof HTMLElement) {
      e.dataTransfer.setDragImage(row, 16, 16);
    }
    setDrag(state);
  };

  // カーソルが要素（または指定した基準要素）の上半分にあるか
  const isUpperHalf = (e: DragEvent<HTMLElement>, base?: Element | null) => {
    const rect = (base ?? e.currentTarget).getBoundingClientRect();
    if (e.clientY > rect.bottom) return false;
    return e.clientY < rect.top + rect.height / 2;
  };

  const acceptDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  // セクションカード上: セクションの並び替え / リンクをセクション末尾へ
  const handleSectionDragOver = (e: DragEvent<HTMLElement>, secIdx: number) => {
    if (!drag) return;
    acceptDrop(e);
    if (drag.type === 'section') {
      updateDropTarget({ type: 'section', index: isUpperHalf(e) ? secIdx : secIdx + 1 });
    } else {
      updateDropTarget({ type: 'item', secIdx, index: sections[secIdx].links.length });
    }
  };

  // セクション直下のリンク/フォルダ上
  const handleLinkDragOver = (e: DragEvent<HTMLElement>, secIdx: number, linkIdx: number) => {
    if (drag?.type !== 'item') return;
    acceptDrop(e);
    // フォルダの場合は子リストを除いたヘッダー行を基準に判定する
    const header = e.currentTarget.querySelector('[data-dnd-header]');
    updateDropTarget({
      type: 'item',
      secIdx,
      index: isUpperHalf(e, header) ? linkIdx : linkIdx + 1,
    });
  };

  // フォルダの子リスト領域（フォルダはフォルダ内に入れない）
  const canDropIntoFolder = drag?.type === 'item' && !drag.isFolder;

  const handleChildListDragOver = (e: DragEvent<HTMLElement>, secIdx: number, linkIdx: number) => {
    if (!canDropIntoFolder) return;
    acceptDrop(e);
    updateDropTarget({
      type: 'item',
      secIdx,
      parentIdx: linkIdx,
      index: sections[secIdx].links[linkIdx].children?.length ?? 0,
    });
  };

  const handleChildDragOver = (
    e: DragEvent<HTMLElement>,
    secIdx: number,
    linkIdx: number,
    childIdx: number
  ) => {
    if (!canDropIntoFolder) return;
    acceptDrop(e);
    updateDropTarget({
      type: 'item',
      secIdx,
      parentIdx: linkIdx,
      index: isUpperHalf(e) ? childIdx : childIdx + 1,
    });
  };

  const moveSectionTo = (from: number, toIndex: number) => {
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(from < toIndex ? toIndex - 1 : toIndex, 0, moved);
    setSections(next);
  };

  const moveItemTo = (
    from: { secIdx: number; linkIdx: number; childIdx?: number },
    to: { secIdx: number; parentIdx?: number; index: number }
  ) => {
    const next: SidebarSection[] = JSON.parse(JSON.stringify(sections));
    const getList = (secIdx: number, parentIdx?: number): SidebarLink[] => {
      if (parentIdx === undefined) return next[secIdx].links;
      const parent = next[secIdx].links[parentIdx];
      if (!parent.children) parent.children = [];
      return parent.children;
    };
    const srcList = getList(from.secIdx, from.childIdx === undefined ? undefined : from.linkIdx);
    const srcIndex = from.childIdx ?? from.linkIdx;
    // 削除前に移動先リストの参照を取得しておく（インデックスのずれを防ぐ）
    const dstList = getList(to.secIdx, to.parentIdx);
    const dstIndex = srcList === dstList && srcIndex < to.index ? to.index - 1 : to.index;
    const [moved] = srcList.splice(srcIndex, 1);
    if (!moved) return;
    dstList.splice(dstIndex, 0, moved);
    setSections(next);
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (drag && dropTarget) {
      if (drag.type === 'section' && dropTarget.type === 'section') {
        moveSectionTo(drag.secIdx, dropTarget.index);
      } else if (drag.type === 'item' && dropTarget.type === 'item') {
        moveItemTo(drag, dropTarget);
      }
    }
    resetDrag();
  };

  const isItemDrop = (secIdx: number, parentIdx: number | undefined, index: number) =>
    dropTarget?.type === 'item' &&
    dropTarget.secIdx === secIdx &&
    dropTarget.parentIdx === parentIdx &&
    dropTarget.index === index;

  const isDraggingItem = (secIdx: number, linkIdx: number, childIdx?: number) =>
    drag?.type === 'item' &&
    drag.secIdx === secIdx &&
    drag.linkIdx === linkIdx &&
    drag.childIdx === childIdx;

  // リンク操作
  const handleAddLink = (secIndex: number) => {
    const next = [...sections];
    const newLink: SidebarLink = {
      id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: '新規リンク',
      url: '',
      isExternal: false,
    };
    next[secIndex].links.push(newLink);
    setSections(next);
  };

  // 開閉グループ（フォルダ）の追加
  const handleAddFolder = (secIndex: number) => {
    const next = [...sections];
    const newFolder: SidebarLink = {
      id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: '新規グループ',
      url: '',
      isExternal: false,
      children: [],
      defaultOpen: false, // 初期状態: [+] 閉じる
    };
    next[secIndex].links.push(newFolder);
    setSections(next);
  };

  // フォルダに子アイテムを追加
  const handleAddChildToItem = (secIndex: number, linkIndex: number) => {
    const next = [...sections];
    const target = next[secIndex].links[linkIndex];
    if (!target.children) {
      target.children = [];
    }
    target.children.push({
      id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: 'サブ項目',
      url: '',
      isExternal: false,
    });
    setSections(next);
  };

  // リンクをフォルダに変換、またはフォルダをリンクに変換
  const handleToggleFolderType = (secIndex: number, linkIndex: number) => {
    const next = [...sections];
    const target = next[secIndex].links[linkIndex];
    if (target.children !== undefined) {
      delete target.children;
      delete target.defaultOpen;
    } else {
      target.children = [];
      target.defaultOpen = false;
    }
    setSections(next);
  };

  // 初期開閉状態のトグル
  const handleToggleDefaultOpen = (secIndex: number, linkIndex: number) => {
    const next = [...sections];
    const target = next[secIndex].links[linkIndex];
    if (target.children !== undefined) {
      target.defaultOpen = !target.defaultOpen;
    }
    setSections(next);
  };

  const handleDeleteLink = (secIndex: number, linkIndex: number) => {
    const next = [...sections];
    next[secIndex].links.splice(linkIndex, 1);
    setSections(next);
  };

  const handleDeleteChild = (secIndex: number, linkIndex: number, childIndex: number) => {
    const next = [...sections];
    const target = next[secIndex].links[linkIndex];
    if (target.children) {
      target.children.splice(childIndex, 1);
    }
    setSections(next);
  };

  const handleLinkChange = (
    secIndex: number,
    linkIndex: number,
    field: 'title' | 'url',
    val: string
  ) => {
    const next = [...sections];
    next[secIndex].links[linkIndex][field] = val;
    if (field === 'url') {
      next[secIndex].links[linkIndex].isExternal =
        /^(?:https?:|\/\/|www\.|mailto:)/i.test(val);
    }
    setSections(next);
  };

  const handleChildChange = (
    secIndex: number,
    linkIndex: number,
    childIndex: number,
    field: 'title' | 'url',
    val: string
  ) => {
    const next = [...sections];
    const target = next[secIndex].links[linkIndex];
    if (target.children && target.children[childIndex]) {
      target.children[childIndex][field] = val;
      if (field === 'url') {
        target.children[childIndex].isExternal =
          /^(?:https?:|\/\/|www\.|mailto:)/i.test(val);
      }
    }
    setSections(next);
  };

  // 既存ページから選択して追加
  const handleSelectExistingPage = (secIndex: number, pageSlug: string) => {
    const page = availablePages.find((p) => p.slug === pageSlug);
    if (!page) return;
    const next = [...sections];
    next[secIndex].links.push({
      id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: page.title,
      url: page.slug === 'index' || page.slug === 'home' || page.slug === '' ? '' : page.slug,
      isExternal: false,
    });
    setSections(next);
  };

  // デフォルトにリセット
  const handleReset = () => {
    if (confirm('サイドバー構成をデフォルトのページ一覧に戻しますか？')) {
      const def = generateDefaultSidebar(availablePages);
      setSections(def);
      setWikitext(stringifyMediaWikiSidebar(def));
    }
  };

  // 保存
  const handleSave = async () => {
    setIsSaving(true);
    let finalSections = sections;
    if (mode === 'wikitext') {
      finalSections = parseMediaWikiSidebarText(wikitext);
      setSections(finalSections);
    }

    try {
      if (siteId) {
        // サイト設定をAPIで保存
        const res = await sitesApi.get(siteId);
        const currentSite = res.data?.data;
        if (currentSite) {
          await sitesApi.update(siteId, {
            settings: {
              ...(currentSite.settings || {}),
              sidebar_sections: finalSections,
              sidebar_show_tools: showTools,
            },
          });
        }
      }

      // LocalStorageにもキャッシュ保存（フォールバック用）
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          `klados_sidebar_${siteSlug}`,
          JSON.stringify({ sections: finalSections, showTools })
        );
      }

      onSaved(finalSections, showTools);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 800);
    } catch (err: any) {
      // LocalStorageだけでも保存
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          `klados_sidebar_${siteSlug}`,
          JSON.stringify({ sections: finalSections, showTools })
        );
      }
      onSaved(finalSections, showTools);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[90vh] animate-in fade-in-0 zoom-in-95 duration-150">
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Settings2 className="size-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                サイドバー編集 (MediaWiki:Sidebar)
              </h2>
              <p className="text-xs text-slate-400">
                サイドバーの見出しやリンク、外部リンクを自由にカスタマイズできます
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* モード切替タブ */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-medium mr-2">
              <button
                type="button"
                onClick={handleSwitchToGui}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  mode === 'gui'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <ListOrdered className="size-3.5" />
                <span>ビジュアル編集</span>
              </button>
              <button
                type="button"
                onClick={handleSwitchToWikitext}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  mode === 'wikitext'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Code className="size-3.5" />
                <span>Wikiテキスト</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* メインエリア */}
        <div
          className="flex-1 overflow-y-auto p-6 space-y-6"
          onDragOver={() => {
            if (dropTarget) setDropTarget(null);
          }}
        >
          {mode === 'gui' ? (
            <>
              {/* オプション: MediaWikiツールセクション */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 block">
                    MediaWiki標準「ツール」セクションを表示する
                  </span>
                  <span className="text-[11px] text-slate-400">
                    サイドバー最下部に「印刷用バージョン」「固定リンク」「ページ情報」などの便利ツール群を自動配置します
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTools}
                    onChange={(e) => setShowTools(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* セクション一覧 */}
              <div
                className="space-y-4"
                onDragOver={(e) => {
                  // セクション間の隙間では直前のドロップ位置を維持する
                  if (drag) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onDrop={handleDrop}
              >
                {sections.map((sec, secIdx) => (
                  <div
                    key={sec.id || secIdx}
                    data-dnd-row
                    onDragOver={(e) => handleSectionDragOver(e, secIdx)}
                    className={`relative border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900 shadow-2xs space-y-3 transition-opacity ${
                      drag?.type === 'section' && drag.secIdx === secIdx ? 'opacity-40' : ''
                    }`}
                  >
                    {dropTarget?.type === 'section' && dropTarget.index === secIdx && (
                      <DropLine className="-top-[9px]" />
                    )}
                    {dropTarget?.type === 'section' &&
                      dropTarget.index === sections.length &&
                      secIdx === sections.length - 1 && <DropLine className="-bottom-[9px]" />}
                    {/* セクションヘッダー */}
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 flex-1">
                        <DragHandle
                          onDragStart={(e) => startDrag(e, { type: 'section', secIdx })}
                          onDragEnd={resetDrag}
                        />
                        <span className="text-xs font-mono font-bold text-slate-400">
                          #{secIdx + 1}
                        </span>
                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => handleSectionTitleChange(secIdx, e.target.value)}
                          placeholder="セクション見出し (例: 規約, 情報, リンク)"
                          className="font-bold text-sm bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 w-64 focus:outline-blue-500 text-slate-900 dark:text-white"
                        />
                        <span className="text-xs text-slate-400">
                          ({sec.links.length} 件のリンク)
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveSection(secIdx, 'up')}
                          disabled={secIdx === 0}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                          title="上へ移動"
                        >
                          <MoveUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSection(secIdx, 'down')}
                          disabled={secIdx === sections.length - 1}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                          title="下へ移動"
                        >
                          <MoveDown className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSection(secIdx)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer ml-1"
                          title="セクションを削除"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>

                    {/* リンク & フォルダ一覧 */}
                    <div className="space-y-2.5 pl-1" onDrop={handleDrop}>
                      {sec.links.map((link, linkIdx) => {
                        const isFolder = link.children !== undefined;
                        const isDragging = isDraggingItem(secIdx, linkIdx);

                        return (
                          <div
                            key={link.id || linkIdx}
                            data-dnd-row
                            onDragOver={(e) => handleLinkDragOver(e, secIdx, linkIdx)}
                            className={`relative rounded-xl border transition-all ${
                              isDragging ? 'opacity-40' : ''
                            } ${
                              isFolder
                                ? 'bg-slate-50/90 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 p-2.5 space-y-2'
                                : 'border-transparent hover:border-slate-200 dark:hover:border-slate-800 p-1.5'
                            }`}
                          >
                            {isItemDrop(secIdx, undefined, linkIdx) && (
                              <DropLine className="-top-1" />
                            )}
                            {isItemDrop(secIdx, undefined, sec.links.length) &&
                              linkIdx === sec.links.length - 1 && (
                                <DropLine className="-bottom-1" />
                              )}

                            {/* アイテムヘッダー行 */}
                            <div data-dnd-header className="flex items-center gap-2 text-xs">
                              <DragHandle
                                onDragStart={(e) =>
                                  startDrag(e, {
                                    type: 'item',
                                    secIdx,
                                    linkIdx,
                                    isFolder,
                                  })
                                }
                                onDragEnd={resetDrag}
                              />
                              {isFolder ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleDefaultOpen(secIdx, linkIdx)}
                                  className="size-5 shrink-0 border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center rounded-xs font-mono font-bold text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer shadow-2xs"
                                  title={link.defaultOpen ? '初期状態: 開く [-] (クリックで閉じる [+] に変更)' : '初期状態: 閉じる [+] (クリックで開く [-] に変更)'}
                                >
                                  {link.defaultOpen ? '−' : '+'}
                                </button>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500 font-bold ml-1 mr-0.5">•</span>
                              )}

                              <input
                                type="text"
                                value={link.title}
                                onChange={(e) =>
                                  handleLinkChange(secIdx, linkIdx, 'title', e.target.value)
                                }
                                placeholder={isFolder ? 'グループ名 (例: サーバー一覧)' : 'リンク名 (例: 利用規約)'}
                                className={`bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 ${
                                  isFolder ? 'w-52 font-semibold' : 'w-48'
                                }`}
                              />

                              <input
                                type="text"
                                value={link.url}
                                onChange={(e) =>
                                  handleLinkChange(secIdx, linkIdx, 'url', e.target.value)
                                }
                                placeholder={isFolder ? 'URL（任意・空欄でも可）' : 'URL または スラグ (例: terms)'}
                                className="flex-1 font-mono text-[11px] bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                              />

                              {link.isExternal && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-medium shrink-0 flex items-center gap-1">
                                  <Globe className="size-2.5" /> 外部
                                </span>
                              )}

                              {/* フォルダ化 / リンク化 切り替え */}
                              <button
                                type="button"
                                onClick={() => handleToggleFolderType(secIdx, linkIdx)}
                                className="px-2 py-1 rounded-md text-[11px] font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 cursor-pointer"
                                title={isFolder ? '通常のリンクに戻す' : '折りたたみフォルダ（開閉グループ）に変換'}
                              >
                                {isFolder ? 'リンク化' : '📁 フォルダ化'}
                              </button>

                              {/* 削除ボタン */}
                              <button
                                type="button"
                                onClick={() => handleDeleteLink(secIdx, linkIdx)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                title="削除"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>

                            {/* フォルダの場合: サブ項目（子リンク）のリスト */}
                            {isFolder && (
                              <div
                                onDragOver={(e) => handleChildListDragOver(e, secIdx, linkIdx)}
                                onDrop={handleDrop}
                                className="ml-6 pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-2 pt-1"
                              >
                                {link.children && link.children.length > 0 ? (
                                  link.children.map((child, childIdx) => {
                                    const isChildDragging = isDraggingItem(secIdx, linkIdx, childIdx);

                                    return (
                                      <div
                                        key={child.id || childIdx}
                                        data-dnd-row
                                        onDragOver={(e) =>
                                          handleChildDragOver(e, secIdx, linkIdx, childIdx)
                                        }
                                        className={`relative flex items-center gap-2 text-xs transition-opacity ${
                                          isChildDragging ? 'opacity-40' : ''
                                        }`}
                                      >
                                        {isItemDrop(secIdx, linkIdx, childIdx) && (
                                          <DropLine className="-top-1" />
                                        )}
                                        {isItemDrop(secIdx, linkIdx, link.children!.length) &&
                                          childIdx === link.children!.length - 1 && (
                                            <DropLine className="-bottom-1" />
                                          )}

                                        <DragHandle
                                          size="size-3.5"
                                          onDragStart={(e) =>
                                            startDrag(e, {
                                              type: 'item',
                                              secIdx,
                                              linkIdx,
                                              childIdx,
                                              isFolder: false,
                                            })
                                          }
                                          onDragEnd={resetDrag}
                                        />
                                        <span className="text-slate-400 dark:text-slate-500">•</span>
                                        <input
                                          type="text"
                                          value={child.title}
                                          onChange={(e) =>
                                            handleChildChange(secIdx, linkIdx, childIdx, 'title', e.target.value)
                                          }
                                          placeholder="サブリンク名"
                                          className="w-44 bg-white dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                                        />
                                        <input
                                          type="text"
                                          value={child.url}
                                          onChange={(e) =>
                                            handleChildChange(secIdx, linkIdx, childIdx, 'url', e.target.value)
                                          }
                                          placeholder="スラグ または URL"
                                          className="flex-1 font-mono text-[11px] bg-white dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteChild(secIdx, linkIdx, childIdx)}
                                          className="p-1 rounded text-slate-400 hover:text-rose-500 cursor-pointer"
                                          title="サブ項目を削除"
                                        >
                                          <Trash2 className="size-3" />
                                        </button>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div
                                    onDragOver={(e) => handleChildListDragOver(e, secIdx, linkIdx)}
                                    className={`relative text-[11px] py-1 italic rounded px-2 ${
                                      isItemDrop(secIdx, linkIdx, 0)
                                        ? 'bg-blue-50/50 dark:bg-blue-950/30 text-blue-600'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    サブ項目がまだありません
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleAddChildToItem(secIdx, linkIdx)}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer pt-0.5"
                                >
                                  <Plus className="size-3" />
                                  <span>サブ項目を追加</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {sec.links.length === 0 && (
                        <div
                          onDragOver={(e) => {
                            if (drag?.type === 'item') {
                              acceptDrop(e);
                              updateDropTarget({ type: 'item', secIdx, index: 0 });
                            }
                          }}
                          className={`relative text-center py-4 text-xs rounded-xl border border-dashed ${
                            isItemDrop(secIdx, undefined, 0)
                              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                              : 'border-slate-200 dark:border-slate-800 text-slate-400'
                          }`}
                        >
                          項目がまだありません。「リンクを追加」または「開閉グループを追加」してください
                        </div>
                      )}
                    </div>

                    {/* 項目追加バー */}
                    <div className="pt-2 flex items-center justify-between gap-3 text-xs border-t border-slate-100 dark:border-slate-800/60 flex-wrap">
                      <div className="flex items-center gap-2">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleSelectExistingPage(secIdx, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                          className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg px-2.5 py-1 text-xs border border-transparent hover:border-slate-300 cursor-pointer"
                        >
                          <option value="" disabled>
                            + 既存のページから追加...
                          </option>
                          {availablePages.map((p) => (
                            <option key={p.id || p.slug} value={p.slug}>
                              {p.title} ({p.slug || 'index'})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddLink(secIdx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                        >
                          <Plus className="size-3.5" />
                          <span>リンクを追加</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddFolder(secIdx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer"
                        >
                          <Plus className="size-3.5" />
                          <span>📁 開閉グループを追加</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* セクション追加ボタン */}
              <button
                type="button"
                onClick={handleAddSection}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="size-4" />
                <span>新しいセクションを追加</span>
              </button>
            </>
          ) : (
            /* Wikiテキスト直接編集 */
            <div className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  MediaWiki & SeesaaWiki スタイル記法仕様:
                </p>
                <pre className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px] leading-relaxed">
{`* セクション見出し
** [-] 最初から開くフォルダ名
*** サブページスラグ | 表示名
*** [+] 最初から閉じるフォルダ名
**** 孫ページスラグ | 表示名
** 通常リンクスラグ | 表示名

※ SeesaaWiki記法もサポートしています:
[+] フォルダ名
** サブページ
[END]`}
                </pre>
              </div>
              <textarea
                value={wikitext}
                onChange={(e) => setWikitext(e.target.value)}
                rows={18}
                className="w-full p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed border border-slate-700 focus:outline-blue-500 resize-none selection:bg-blue-600"
                placeholder={`* サーバー一覧\n** [-] Life生活鯖\n*** ルール（Life）\n*** 補填に関して\n*** [-] 初めての方へ\n**** テクスチャの導入\n*** [+] 経済関連\n** [+] The Slow Life\n\n* 全体\n** top | トップページ\n** rules | ルール`}
              />
            </div>
          )}
        </div>

        {/* モーダルフッター */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>デフォルトに戻す</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {saveSuccess ? (
                <>
                  <Check className="size-4" />
                  <span>保存完了</span>
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  <span>{isSaving ? '保存中...' : 'サイドバーを保存'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
