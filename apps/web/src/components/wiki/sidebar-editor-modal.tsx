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
import { sitesApi, pagesApi } from '@/lib/api';

// ドラッグ中の要素
// - section: セクション全体
// - item: secIdx 内のツリーパス path (例: [0], [0, 2], [0, 2, 1]) にある項目
type DragState =
  | { type: 'section'; secIdx: number }
  | { type: 'item'; secIdx: number; path: number[]; isFolder: boolean };

// ドロップ先（挿入位置）
// - section: セクション一覧の index の位置に挿入
// - item: secIdx のセクション内、parentPath (ルートは []、フォルダ内は [0, 1] など) の子リスト内の index の位置に挿入
type DropTarget =
  | { type: 'section'; index: number }
  | { type: 'item'; secIdx: number; parentPath: number[]; index: number };

function isSamePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// targetPath が ancestorPath 自身またはその子孫かどうか判定（自分自身の中へのドロップ防止用）
function isPathInsideOrEqual(ancestorPath: number[], targetPath: number[]): boolean {
  if (targetPath.length < ancestorPath.length) return false;
  return ancestorPath.every((v, i) => targetPath[i] === v);
}

// 指定した親パス (ルートは []) のリンク配列を取得
function getListAtPath(
  sections: SidebarSection[],
  secIdx: number,
  parentPath: number[]
): SidebarLink[] | undefined {
  let list = sections[secIdx]?.links;
  if (!list) return undefined;
  for (const idx of parentPath) {
    const item = list[idx];
    if (!item) return undefined;
    if (!item.children) {
      item.children = [];
    }
    list = item.children;
  }
  return list;
}

// 指定したパスのリンク項目を取得
function getItemAtPath(
  sections: SidebarSection[],
  secIdx: number,
  path: number[]
): SidebarLink | undefined {
  if (path.length === 0) return undefined;
  const parentList = getListAtPath(sections, secIdx, path.slice(0, -1));
  return parentList?.[path[path.length - 1]];
}

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
  availablePages: Array<{ id: string; slug: string; title: string; status?: string }>;
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
  const [wasOpen, setWasOpen] = useState(false);
  const [fetchedPages, setFetchedPages] = useState<
    Array<{ id: string; slug: string; title: string; status?: string }>
  >([]);

  // サイトIDがある場合、最新の全ページ一覧をバックグラウンド取得して補完
  useEffect(() => {
    if (isOpen && siteId && siteId !== 'demo-site') {
      pagesApi
        .list(siteId)
        .then((res) => {
          const list = res.data?.data;
          if (Array.isArray(list)) {
            setFetchedPages(list);
          }
        })
        .catch(() => {
          // ignore
        });
    }
  }, [isOpen, siteId]);

  // ゴミ箱以外の有効なページ一覧（availablePages と fetchedPages を重複なく統合）
  const selectablePages = (() => {
    const merged: Array<{ id: string; slug: string; title: string; status?: string }> = [];
    const seen = new Set<string>();
    for (const p of [...availablePages, ...fetchedPages]) {
      if (!p || p.status === 'trashed') continue;
      const key = p.id || p.slug;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(p);
    }
    return merged;
  })();

  // モーダルが開かれた瞬間のみ初期値をセット（編集中に親の再レンダーで上書きされるのを防ぐ）
  useEffect(() => {
    if (isOpen && !wasOpen) {
      const initial =
        currentSections && currentSections.length > 0
          ? JSON.parse(JSON.stringify(currentSections))
          : generateDefaultSidebar(selectablePages);
      setSections(initial);
      setShowTools(showToolsSection ?? true);
      setWikitext(stringifyMediaWikiSidebar(initial));
      setWasOpen(true);
    } else if (!isOpen && wasOpen) {
      setWasOpen(false);
    }
  }, [isOpen, wasOpen, currentSections, showToolsSection, selectablePages]);

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
      id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: '新しいセクション',
      links: [],
    };
    setSections((prev) => [...prev, newSection]);
  };

  const handleDeleteSection = (index: number) => {
    setSections((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const handleSectionTitleChange = (index: number, title: string) => {
    setSections((prev) =>
      prev.map((sec, i) => (i === index ? { ...sec, title } : sec))
    );
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === sections.length - 1)
    )
      return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    setSections((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  // ===== ドラッグ＆ドロップ並び替え（無限階層対応） =====
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

  // ドラッグ中のアイテムが targetParentPath 内にドロップ可能か（自分自身やその子孫の中へはドロップ不可）
  const canDropIntoParent = (secIdx: number, targetParentPath: number[]) => {
    if (drag?.type !== 'item') return false;
    if (drag.secIdx === secIdx && isPathInsideOrEqual(drag.path, targetParentPath)) {
      return false;
    }
    return true;
  };

  // セクションカード上: セクションの並び替え / リンクをセクション末尾へ
  const handleSectionDragOver = (e: DragEvent<HTMLElement>, secIdx: number) => {
    if (!drag) return;
    acceptDrop(e);
    if (drag.type === 'section') {
      updateDropTarget({ type: 'section', index: isUpperHalf(e) ? secIdx : secIdx + 1 });
    } else {
      updateDropTarget({
        type: 'item',
        secIdx,
        parentPath: [],
        index: sections[secIdx].links.length,
      });
    }
  };

  // 任意の階層にあるアイテム（リンク/フォルダ）行の上
  const handleItemDragOver = (
    e: DragEvent<HTMLElement>,
    secIdx: number,
    path: number[]
  ) => {
    const parentPath = path.slice(0, -1);
    const itemIdx = path[path.length - 1];
    if (!canDropIntoParent(secIdx, parentPath)) return;
    acceptDrop(e);
    // フォルダの場合は子リストを除いたヘッダー行を基準に判定する
    const header = e.currentTarget.querySelector(':scope > [data-dnd-header]');
    updateDropTarget({
      type: 'item',
      secIdx,
      parentPath,
      index: isUpperHalf(e, header) ? itemIdx : itemIdx + 1,
    });
  };

  // フォルダの子リスト領域（末尾への追加）
  const handleChildListDragOver = (
    e: DragEvent<HTMLElement>,
    secIdx: number,
    folderPath: number[]
  ) => {
    if (!canDropIntoParent(secIdx, folderPath)) return;
    acceptDrop(e);
    const folder = getItemAtPath(sections, secIdx, folderPath);
    updateDropTarget({
      type: 'item',
      secIdx,
      parentPath: folderPath,
      index: folder?.children?.length ?? 0,
    });
  };

  const moveSectionTo = (from: number, toIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(from < toIndex ? toIndex - 1 : toIndex, 0, moved);
      return next;
    });
  };

  const moveItemTo = (
    from: { secIdx: number; path: number[] },
    to: { secIdx: number; parentPath: number[]; index: number }
  ) => {
    if (from.secIdx === to.secIdx && isPathInsideOrEqual(from.path, to.parentPath)) {
      return;
    }
    setSections((prev) => {
      const next: SidebarSection[] = JSON.parse(JSON.stringify(prev));
      const fromParentPath = from.path.slice(0, -1);
      const fromIndex = from.path[from.path.length - 1];

      const srcList = getListAtPath(next, from.secIdx, fromParentPath);
      const dstList = getListAtPath(next, to.secIdx, to.parentPath);
      if (!srcList || !dstList) return prev;

      const dstIndex =
        srcList === dstList && fromIndex < to.index ? to.index - 1 : to.index;
      if (srcList === dstList && dstIndex === fromIndex) return prev;

      const [moved] = srcList.splice(fromIndex, 1);
      if (!moved) return prev;
      dstList.splice(dstIndex, 0, moved);
      return next;
    });
  };

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (drag && dropTarget) {
      if (drag.type === 'section' && dropTarget.type === 'section') {
        moveSectionTo(drag.secIdx, dropTarget.index);
      } else if (drag.type === 'item' && dropTarget.type === 'item') {
        moveItemTo(drag, dropTarget);
      }
    }
    resetDrag();
  };

  const isItemDrop = (secIdx: number, parentPath: number[], index: number) =>
    dropTarget?.type === 'item' &&
    dropTarget.secIdx === secIdx &&
    isSamePath(dropTarget.parentPath, parentPath) &&
    dropTarget.index === index;

  const isDraggingItem = (secIdx: number, path: number[]) =>
    drag?.type === 'item' &&
    drag.secIdx === secIdx &&
    isSamePath(drag.path, path);

  // ===== リンク & フォルダ操作（任意の親パス parentPath または項目パス path に対応） =====

  // リンク追加（parentPath が [] ならセクション直下、それ以外は該当フォルダの子要素として追加）
  const handleAddLink = (secIndex: number, parentPath: number[] = []) => {
    setSections((prev) => {
      const next: SidebarSection[] = JSON.parse(JSON.stringify(prev));
      const list = getListAtPath(next, secIndex, parentPath);
      if (!list) return prev;
      list.push({
        id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: parentPath.length > 0 ? 'サブ項目' : '新規リンク',
        url: '',
        isExternal: false,
      });
      return next;
    });
  };

  // 開閉グループ（フォルダ）の追加（セクション直下・子フォルダ内どちらでも無限に追加可能）
  const handleAddFolder = (secIndex: number, parentPath: number[] = []) => {
    setSections((prev) => {
      const next: SidebarSection[] = JSON.parse(JSON.stringify(prev));
      const list = getListAtPath(next, secIndex, parentPath);
      if (!list) return prev;
      list.push({
        id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: '新規グループ',
        url: '',
        isExternal: false,
        children: [],
        defaultOpen: false, // 初期状態: [+] 閉じる
      });
      return next;
    });
  };

  // リンクをフォルダに変換、またはフォルダをリンクに変換（どの階層でも可能）
  const handleToggleFolderType = (secIndex: number, path: number[]) => {
    setSections((prev) => {
      const next: SidebarSection[] = JSON.parse(JSON.stringify(prev));
      const target = getItemAtPath(next, secIndex, path);
      if (!target) return prev;
      if (target.children !== undefined) {
        delete target.children;
        delete target.defaultOpen;
      } else {
        target.children = [];
        target.defaultOpen = false;
      }
      return next;
    });
  };

  // 初期開閉状態のトグル
  const handleToggleDefaultOpen = (secIndex: number, path: number[]) => {
    setSections((prev) => {
      const next: SidebarSection[] = JSON.parse(JSON.stringify(prev));
      const target = getItemAtPath(next, secIndex, path);
      if (target && target.children !== undefined) {
        target.defaultOpen = !target.defaultOpen;
      }
      return next;
    });
  };

  // アイテム削除
  const handleDeleteItem = (secIndex: number, path: number[]) => {
    if (path.length === 0) return;
    setSections((prev) => {
      const next: SidebarSection[] = JSON.parse(JSON.stringify(prev));
      const parentList = getListAtPath(next, secIndex, path.slice(0, -1));
      if (!parentList) return prev;
      parentList.splice(path[path.length - 1], 1);
      return next;
    });
  };

  // アイテムのタイトル・URL変更
  const handleItemChange = (
    secIndex: number,
    path: number[],
    field: 'title' | 'url',
    val: string
  ) => {
    setSections((prev) => {
      const next: SidebarSection[] = JSON.parse(JSON.stringify(prev));
      const target = getItemAtPath(next, secIndex, path);
      if (!target) return prev;
      target[field] = val;
      if (field === 'url') {
        target.isExternal = /^(?:https?:|\/\/|www\.|mailto:)/i.test(val);
      }
      return next;
    });
  };

  // 既存ページから選択して追加（どのセクション・どの入れ子グループにも追加可能）
  const handleSelectExistingPage = (
    secIndex: number,
    pageIndexStr: string,
    parentPath: number[] = []
  ) => {
    const pageIdx = Number(pageIndexStr);
    const page = !Number.isNaN(pageIdx)
      ? selectablePages[pageIdx]
      : selectablePages.find((p) => p.slug === pageIndexStr || p.id === pageIndexStr);
    if (!page) return;

    setSections((prev) => {
      const next: SidebarSection[] = JSON.parse(JSON.stringify(prev));
      const list = getListAtPath(next, secIndex, parentPath);
      if (!list) return prev;
      list.push({
        id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: page.title,
        url:
          page.slug === 'index' || page.slug === 'home' || page.slug === ''
            ? ''
            : page.slug,
        isExternal: false,
      });
      return next;
    });
  };

  // 既存ページ追加セレクトボックスの共通レンダリング
  const renderExistingPageSelect = (
    secIdx: number,
    parentPath: number[] = [],
    compact: boolean = false
  ) => (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value !== '') {
          handleSelectExistingPage(secIdx, e.target.value, parentPath);
        }
      }}
      className={`bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg border border-transparent hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <option value="" disabled>
        + 既存のページから追加...
      </option>
      {selectablePages.map((p, idx) => (
        <option key={p.id || `${p.slug}-${idx}`} value={String(idx)}>
          {p.title} ({p.slug || 'index'})
        </option>
      ))}
    </select>
  );

  // ツリー項目の再帰レンダリング（無限ネスト対応）
  const renderTreeItem = (
    secIdx: number,
    item: SidebarLink,
    path: number[],
    siblingsCount: number
  ) => {
    const isFolder = item.children !== undefined;
    const isDragging = isDraggingItem(secIdx, path);
    const parentPath = path.slice(0, -1);
    const itemIdx = path[path.length - 1];
    const depth = path.length - 1;

    return (
      <div
        key={item.id || path.join('-')}
        data-dnd-row
        onDragOver={(e) => handleItemDragOver(e, secIdx, path)}
        className={`relative rounded-xl border transition-all ${
          isDragging ? 'opacity-40' : ''
        } ${
          isFolder
            ? 'bg-slate-50/90 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 p-2.5 space-y-2'
            : 'border-transparent hover:border-slate-200 dark:hover:border-slate-800 p-1.5'
        }`}
      >
        {isItemDrop(secIdx, parentPath, itemIdx) && <DropLine className="-top-1" />}
        {isItemDrop(secIdx, parentPath, siblingsCount) &&
          itemIdx === siblingsCount - 1 && <DropLine className="-bottom-1" />}

        {/* アイテムヘッダー行 */}
        <div data-dnd-header className="flex items-center gap-2 text-xs">
          <DragHandle
            size={depth > 0 ? 'size-3.5' : 'size-4'}
            onDragStart={(e) =>
              startDrag(e, {
                type: 'item',
                secIdx,
                path,
                isFolder,
              })
            }
            onDragEnd={resetDrag}
          />
          {isFolder ? (
            <button
              type="button"
              onClick={() => handleToggleDefaultOpen(secIdx, path)}
              className="size-5 shrink-0 border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center rounded-xs font-mono font-bold text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer shadow-2xs"
              title={
                item.defaultOpen
                  ? '初期状態: 開く [-] (クリックで閉じる [+] に変更)'
                  : '初期状態: 閉じる [+] (クリックで開く [-] に変更)'
              }
            >
              {item.defaultOpen ? '−' : '+'}
            </button>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 font-bold ml-1 mr-0.5">
              •
            </span>
          )}

          <input
            type="text"
            value={item.title}
            onChange={(e) =>
              handleItemChange(secIdx, path, 'title', e.target.value)
            }
            placeholder={
              isFolder
                ? 'グループ名 (例: サーバー一覧)'
                : depth > 0
                ? 'サブリンク名'
                : 'リンク名 (例: 利用規約)'
            }
            className={`bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 ${
              isFolder
                ? 'w-48 font-semibold'
                : depth > 0
                ? 'w-44'
                : 'w-48'
            }`}
          />

          <input
            type="text"
            value={item.url}
            onChange={(e) =>
              handleItemChange(secIdx, path, 'url', e.target.value)
            }
            placeholder={
              isFolder
                ? 'URL（任意・空欄でも可）'
                : 'URL または スラグ (例: terms)'
            }
            className="flex-1 min-w-[120px] font-mono text-[11px] bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
          />

          {item.isExternal && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-medium shrink-0 flex items-center gap-1">
              <Globe className="size-2.5" /> 外部
            </span>
          )}

          {/* フォルダ化 / リンク化 切り替え（全階層で利用可能） */}
          <button
            type="button"
            onClick={() => handleToggleFolderType(secIdx, path)}
            className="px-2 py-1 rounded-md text-[11px] font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0"
            title={
              isFolder
                ? '通常のリンクに戻す'
                : '折りたたみフォルダ（開閉グループ）に変換'
            }
          >
            {isFolder ? 'リンク化' : '📁 フォルダ化'}
          </button>

          {/* 削除ボタン */}
          <button
            type="button"
            onClick={() => handleDeleteItem(secIdx, path)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            title="削除"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        {/* フォルダの場合: サブ項目（子リンク・子フォルダ）のリストを再帰表示 */}
        {isFolder && (
          <div
            onDragOver={(e) => handleChildListDragOver(e, secIdx, path)}
            onDrop={handleDrop}
            className="ml-5 pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-2 pt-1"
          >
            {item.children && item.children.length > 0 ? (
              item.children.map((child, childIdx) =>
                renderTreeItem(
                  secIdx,
                  child,
                  [...path, childIdx],
                  item.children!.length
                )
              )
            ) : (
              <div
                onDragOver={(e) => handleChildListDragOver(e, secIdx, path)}
                className={`relative text-[11px] py-1 italic rounded px-2 ${
                  isItemDrop(secIdx, path, 0)
                    ? 'bg-blue-50/50 dark:bg-blue-950/30 text-blue-600'
                    : 'text-slate-400'
                }`}
              >
                サブ項目がまだありません
              </div>
            )}

            {/* フォルダ内の項目追加バー（既存ページから追加 / サブ項目追加 / 入れ子グループ追加） */}
            <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {renderExistingPageSelect(secIdx, path, true)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddLink(secIdx, path)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                >
                  <Plus className="size-3" />
                  <span>サブ項目を追加</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddFolder(secIdx, path)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer"
                >
                  <Plus className="size-3" />
                  <span>📁 入れ子グループを追加</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // デフォルトにリセット
  const handleReset = () => {
    if (confirm('サイドバー構成をデフォルトのページ一覧に戻しますか？')) {
      const def = generateDefaultSidebar(selectablePages);
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
      if (siteId && siteId !== 'demo-site') {
        // サイト設定をAPIで保存
        let baseSettings = {};
        try {
          const res = await sitesApi.get(siteId);
          if (res.data?.data?.settings) {
            baseSettings = res.data.data.settings;
          }
        } catch {
          // getが失敗してもバックエンド側でディープマージされるため続行
        }

        await sitesApi.update(siteId, {
          settings: {
            ...baseSettings,
            sidebar_sections: finalSections,
            sidebar_show_tools: showTools,
          },
        });
      }

      // LocalStorageにもキャッシュ保存
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            `klados_sidebar_${siteSlug}`,
            JSON.stringify({ sections: finalSections, showTools })
          );
        } catch {}
      }

      onSaved(finalSections, showTools);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 800);
    } catch (err: any) {
      console.error('Failed to update sidebar on server:', err);
      // LocalStorageだけでも保存
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            `klados_sidebar_${siteSlug}`,
            JSON.stringify({ sections: finalSections, showTools })
          );
        } catch {}
      }
      onSaved(finalSections, showTools);
      alert('サーバーへの保存に失敗しました（ローカルに一時保存されました）: ' + (err?.response?.data?.error || err?.message || '不明なエラー'));
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

                    {/* リンク & フォルダ一覧（無限ネスト対応） */}
                    <div className="space-y-2.5 pl-1" onDrop={handleDrop}>
                      {sec.links.map((link, linkIdx) =>
                        renderTreeItem(secIdx, link, [linkIdx], sec.links.length)
                      )}

                      {sec.links.length === 0 && (
                        <div
                          onDragOver={(e) => {
                            if (drag?.type === 'item') {
                              acceptDrop(e);
                              updateDropTarget({
                                type: 'item',
                                secIdx,
                                parentPath: [],
                                index: 0,
                              });
                            }
                          }}
                          className={`relative text-center py-4 text-xs rounded-xl border border-dashed ${
                            isItemDrop(secIdx, [], 0)
                              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                              : 'border-slate-200 dark:border-slate-800 text-slate-400'
                          }`}
                        >
                          項目がまだありません。「リンクを追加」または「開閉グループを追加」してください
                        </div>
                      )}
                    </div>

                    {/* セクション直下の項目追加バー */}
                    <div className="pt-2 flex items-center justify-between gap-3 text-xs border-t border-slate-100 dark:border-slate-800/60 flex-wrap">
                      <div className="flex items-center gap-2">
                        {renderExistingPageSelect(secIdx, [], false)}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddLink(secIdx, [])}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                        >
                          <Plus className="size-3.5" />
                          <span>リンクを追加</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddFolder(secIdx, [])}
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
