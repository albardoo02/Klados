'use client';

import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {commentsApi, mediaApi, pagesApi, PageVersion, sitesApi, categoriesApi, CategorySummary} from '@/lib/api';
import {useParams, useRouter} from 'next/navigation';
import {useEffect, useMemo, useRef, useState} from 'react';
import {basicSetup, EditorView} from 'codemirror';
import {markdown} from '@codemirror/lang-markdown';
import { Annotation, Compartment, EditorState, RangeSetBuilder } from '@codemirror/state';
import { vim } from '@replit/codemirror-vim';
import { Decoration, DecorationSet, keymap, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { MarkdownRenderer, getPageCategories, getPageCategoryNames } from '@/components/markdown-renderer';
import { CategoryBox } from '@/components/wiki/category-box';
import { DiffViewer } from '@/components/diff-viewer';
import { MediaLibraryModal } from '@/components/media-library-modal';
import { CommentsDrawer } from '@/components/comments-drawer';
import { InternalLinkModal } from '@/components/wiki/internal-link-modal';
import {
  TableMakerModal,
  detectMarkdownTableAtCursor,
  ParsedMarkdownTable,
} from '@/components/wiki/table-maker-modal';
import { useAuthStore } from '@/store/auth';
import {
  buildMediaMarkdown,
  formatMediaRef,
  MediaImageAlign,
  MediaImageFrame,
  parseExistingImageMarkdown,
  resolveMediaUrl,
} from '@/lib/media';
import { parseMarkdownFrontmatter } from '@/lib/markdown-import';
import { getSitePublicUrl } from '@/lib/site-url';
import Link from 'next/link';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  CheckSquare,
  Clock,
  Code,
  Columns,
  ExternalLink,
  Eye,
  FileClock,
  FileEdit,
  FolderTree,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  History as HistoryIcon,
  Image as ImageIcon,
  Images,
  Info,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Palette,
  Plus,
  Quote,
  RotateCcw,
  Save,
  Send,
  Settings2,
  Sigma,
  Sparkles,
  Strikethrough,
  Table as TableIcon,
  Tag,
  Terminal,
  Underline,
  UploadCloud,
  X,
} from 'lucide-react';

// --- HSV / RGB / HEX カラー変換ユーティリティ ---
function clampNum(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const sn = clampNum(s, 0, 100) / 100;
  const vn = clampNum(v, 0, 100) / 100;
  const c = vn * sn;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = vn - c;
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh >= 0 && hh < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (hh >= 1 && hh < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hh >= 2 && hh < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hh >= 3 && hh < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hh >= 4 && hh < 5) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clampNum(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return null;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = clampNum(r, 0, 255) / 255;
  const gn = clampNum(g, 0, 255) / 255;
  const bn = clampNum(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : Math.round((d / max) * 100);
  const v = Math.round(max * 100);
  return { h, s, v };
}

interface Collaborator {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  lastActive: number;
}

const COLLAB_COLORS = [
  'bg-blue-500 text-white border-blue-600',
  'bg-purple-500 text-white border-purple-600',
  'bg-emerald-500 text-white border-emerald-600',
  'bg-amber-500 text-white border-amber-600',
  'bg-rose-500 text-white border-rose-600',
  'bg-cyan-500 text-white border-cyan-600',
];

// リモート同期による dispatch を識別するための CodeMirror アノテーション
const remoteSyncAnnotation = Annotation.define<boolean>();

function buildColorDecorations(view: EditorView): DecorationSet {
  const specs: Array<{ from: number; to: number; deco: Decoration }> = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);

    // 1. [text]{color:#hex} or [text]{bg:#hex}
    const bracketColorRe = /\[([^\]\n]+)\]\{([^\}\n]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = bracketColorRe.exec(text)) !== null) {
      const innerText = m[1];
      const attrs = m[2];
      const innerStart = from + m.index + 1;
      const innerEnd = innerStart + innerText.length;

      let color = '';
      let bg = '';
      const directHex = /^\s*#([0-9a-fA-F]{3,8})\s*$/.exec(attrs);
      if (directHex) {
        color = '#' + directHex[1];
      } else {
        const cm = /(?:^|[\s;])color\s*:\s*([^;\}]+)/i.exec(attrs);
        if (cm) color = cm[1].trim();
        const bm = /(?:^|[\s;])bg(?:-color)?\s*:\s*([^;\}]+)/i.exec(attrs);
        if (bm) bg = bm[1].trim();
      }

      const styles: string[] = [];
      if (color) styles.push(`color: ${color}; font-weight: 600`);
      if (bg) styles.push(`background-color: ${bg}; color: #0f172a; border-radius: 3px; padding: 0 3px`);
      if (styles.length > 0 && innerStart < innerEnd) {
        specs.push({
          from: innerStart,
          to: innerEnd,
          deco: Decoration.mark({ attributes: { style: styles.join('; ') } }),
        });
      }
    }

    // 2. ==highlight==
    const markRe = /==([^=\n]+)==/g;
    while ((m = markRe.exec(text)) !== null) {
      const innerStart = from + m.index + 2;
      const innerEnd = innerStart + m[1].length;
      if (innerStart < innerEnd) {
        specs.push({
          from: innerStart,
          to: innerEnd,
          deco: Decoration.mark({
            attributes: {
              style: 'background-color: #fef08a; color: #0f172a; border-radius: 3px; padding: 0 3px',
            },
          }),
        });
      }
    }

    // 3. <u>underline</u>
    const underlineRe = /<u>([^\n<]+)<\/u>/gi;
    while ((m = underlineRe.exec(text)) !== null) {
      const innerStart = from + m.index + 3;
      const innerEnd = innerStart + m[1].length;
      if (innerStart < innerEnd) {
        specs.push({
          from: innerStart,
          to: innerEnd,
          deco: Decoration.mark({
            attributes: { style: 'text-decoration: underline; text-underline-offset: 3px' },
          }),
        });
      }
    }
  }

  specs.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const s of specs) {
    builder.add(s.from, s.to, s.deco);
  }
  return builder.finish();
}

const inlineColorDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildColorDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildColorDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  icon: any;
  action: (replaceRange?: { from: number; to: number }) => void;
}

export default function PageEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const keybindingCompartmentRef = useRef<Compartment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const [preview, setPreview] = useState('');
  const [tab, setTab] = useState<'edit' | 'preview' | 'split'>('split');
  const [saved, setSaved] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // モーダル開閉ステート
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [internalLinkModalOpen, setInternalLinkModalOpen] = useState(false);
  const [linkInitialText, setLinkInitialText] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<PageVersion | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertSuccessMsg, setRevertSuccessMsg] = useState<string | null>(null);

  // カテゴリ設定メニューバー (オプション) 用ステート
  const [pageCategories, setPageCategories] = useState<string[]>([]);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  // レスポンシブ「その他」ドロップダウンメニュー用ステート
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setCategoryMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    if (categoryMenuOpen || moreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [categoryMenuOpen, moreMenuOpen]);

  const handleOpenLinkModal = () => {
    let selText = '';
    if (viewRef.current) {
      const { from, to } = viewRef.current.state.selection.main;
      if (from !== to) {
        selText = viewRef.current.state.sliceDoc(from, to);
      } else if (
        lastSelectionRef.current &&
        lastSelectionRef.current.from !== lastSelectionRef.current.to
      ) {
        selText = viewRef.current.state.sliceDoc(
          lastSelectionRef.current.from,
          lastSelectionRef.current.to
        );
      }
    }
    setLinkInitialText(selText);
    setInternalLinkModalOpen(true);
  };

  // Markdownテーブルメーカー モーダル ステート
  const [tableMakerOpen, setTableMakerOpen] = useState(false);
  const [editingTableData, setEditingTableData] = useState<ParsedMarkdownTable | null>(null);

  const handleOpenTableMaker = (explicitRange?: { from: number; to: number }) => {
    if (viewRef.current) {
      // スラッシュコマンド (/table) から起動された場合は、まずスラッシュコマンド文字列を消去
      if (explicitRange) {
        viewRef.current.dispatch({
          changes: { from: explicitRange.from, to: explicitRange.to, insert: '' },
          selection: { anchor: explicitRange.from },
        });
        lastSelectionRef.current = { from: explicitRange.from, to: explicitRange.from };
      }

      const state = viewRef.current.state;
      const caretPos =
        explicitRange?.from ??
        (state.selection.main.from > 0
          ? state.selection.main.from
          : lastSelectionRef.current?.from ?? state.selection.main.from);

      const detected = detectMarkdownTableAtCursor(state.doc.toString(), caretPos);
      setEditingTableData(detected);
    } else {
      setEditingTableData(null);
    }
    setTableMakerOpen(true);
  };

  // 画像オプション編集モーダル (MediaWiki風 サイズ・位置・枠・キャプション設定) ステート
  const [imageOptionsModal, setImageOptionsModal] = useState<{
    isOpen: boolean;
    mediaRef: string;
    syntaxMode: 'mediawiki' | 'markdown';
    frame: MediaImageFrame;
    align: MediaImageAlign;
    width: string;
    height: string;
    caption: string;
    alt: string;
    replaceRange?: { from: number; to: number };
  }>({
    isOpen: false,
    mediaRef: '',
    syntaxMode: 'mediawiki',
    frame: 'thumb',
    align: 'right',
    width: '300px',
    height: '',
    caption: '',
    alt: '',
  });

  const handleOpenImageOptionsModal = (explicitRange?: { from: number; to: number }) => {
    if (viewRef.current) {
      const state = viewRef.current.state;
      const caretPos =
        explicitRange?.from ??
        (state.selection.main.from > 0
          ? state.selection.main.from
          : lastSelectionRef.current?.from ?? state.selection.main.from);
      const line = state.doc.lineAt(Math.min(Math.max(0, caretPos), state.doc.length));
      const parsed = parseExistingImageMarkdown(line.text);
      if (parsed) {
        setImageOptionsModal({
          isOpen: true,
          mediaRef: parsed.mediaRef,
          syntaxMode: parsed.syntaxMode,
          frame: parsed.options.frame || 'none',
          align: parsed.options.align || 'none',
          width: parsed.options.width || '',
          height: parsed.options.height || '',
          caption: parsed.options.caption || '',
          alt: parsed.options.alt || '',
          replaceRange: {
            from: line.from + parsed.matchFromOffset,
            to: line.from + parsed.matchToOffset,
          },
        });
        return;
      }
    }

    // カーソル行に画像がない場合は新規設定モードで開く
    setImageOptionsModal({
      isOpen: true,
      mediaRef: '',
      syntaxMode: 'mediawiki',
      frame: 'thumb',
      align: 'right',
      width: '300px',
      height: '',
      caption: '',
      alt: '',
      replaceRange: explicitRange,
    });
  };

  const handleApplyImageOptions = () => {
    const targetRef = imageOptionsModal.mediaRef.trim() || 'media:サンプル画像ID';
    const generated = buildMediaMarkdown(targetRef, {
      syntaxMode: imageOptionsModal.syntaxMode,
      frame: imageOptionsModal.frame,
      align: imageOptionsModal.align,
      width: imageOptionsModal.width.trim() || undefined,
      height: imageOptionsModal.height.trim() || undefined,
      caption: imageOptionsModal.caption.trim() || undefined,
      alt: imageOptionsModal.alt.trim() || undefined,
    });

    if (imageOptionsModal.replaceRange) {
      insertText(generated, undefined, imageOptionsModal.replaceRange);
    } else {
      insertText(`\n${generated}\n`);
    }
    setImageOptionsModal((prev) => ({ ...prev, isOpen: false }));
  };

  // Markdownファイル読み込み & カテゴリ指定モーダル ステート
  const [mdUploadModal, setMdUploadModal] = useState<{
    isOpen: boolean;
    fileName: string;
    parsedTitle: string;
    content: string;
    categories: string[];
    catInput: string;
    insertMode: 'replace' | 'append';
    updateTitle: boolean;
  }>({
    isOpen: false,
    fileName: '',
    parsedTitle: '',
    content: '',
    categories: [],
    catInput: '',
    insertMode: 'replace',
    updateTitle: false,
  });

  // エディタ設定: Vim / Standard / nano
  const [keybinding, setKeybinding] = useState<'standard' | 'vim' | 'nano'>('standard');

  // nano エディタ用ステート & Ref
  const [nanoStatusMessage, setNanoStatusMessage] = useState<string>(
    'GNU nano 7.2 へようこそ - ^G でヘルプを表示'
  );
  const [nanoPrompt, setNanoPrompt] = useState<{
    type: 'search' | 'goto' | 'replace' | 'exit';
    value: string;
    replaceValue?: string;
  } | null>(null);
  const [nanoHelpOpen, setNanoHelpOpen] = useState(false);
  const nanoCutBufferRef = useRef<string>('');

  // スラッシュコマンド メニューステート
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // カラーピッカー (2D HSVポインタ + RGB/HEX指定) ステート
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorMode, setColorMode] = useState<'text' | 'bg'>('text');
  const [customColor, setCustomColor] = useState('#ef4444');
  const [hsv, setHsv] = useState<{ h: number; s: number; v: number }>({ h: 0, s: 72, v: 94 });
  const hsvRef = useRef<{ h: number; s: number; v: number }>({ h: 0, s: 72, v: 94 });
  const [rgbInput, setRgbInput] = useState<{ r: number; g: number; b: number }>({
    r: 239,
    g: 68,
    b: 68,
  });
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const svBoxRef = useRef<HTMLDivElement>(null);
  const hueBarRef = useRef<HTMLDivElement>(null);

  const updateColorFromHsv = (nextH: number, nextS: number, nextV: number) => {
    const h = clampNum(Math.round(nextH), 0, 360);
    const s = clampNum(Math.round(nextS), 0, 100);
    const v = clampNum(Math.round(nextV), 0, 100);
    hsvRef.current = { h, s, v };
    setHsv({ h, s, v });
    const rgb = hsvToRgb(h, s, v);
    setRgbInput(rgb);
    setCustomColor(rgbToHex(rgb.r, rgb.g, rgb.b));
  };

  const updateColorFromRgb = (nextR: number, nextG: number, nextB: number) => {
    const r = clampNum(Math.round(nextR || 0), 0, 255);
    const g = clampNum(Math.round(nextG || 0), 0, 255);
    const b = clampNum(Math.round(nextB || 0), 0, 255);
    setRgbInput({ r, g, b });
    const nextHsv = rgbToHsv(r, g, b);
    hsvRef.current = nextHsv;
    setHsv(nextHsv);
    setCustomColor(rgbToHex(r, g, b));
  };

  const updateColorFromHex = (hexStr: string) => {
    setCustomColor(hexStr);
    const parsed = hexToRgb(hexStr);
    if (parsed) {
      setRgbInput(parsed);
      const nextHsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
      hsvRef.current = nextHsv;
      setHsv(nextHsv);
    }
  };

  // 2Dカラーボックス (彩度・明度) ドラッグ操作
  const handleSvPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const updateFromClientPos = (clientX: number, clientY: number) => {
      if (!svBoxRef.current) return;
      const rect = svBoxRef.current.getBoundingClientRect();
      const nextS = clampNum(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const nextV = clampNum(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100);
      updateColorFromHsv(hsvRef.current.h, nextS, nextV);
    };
    updateFromClientPos(e.clientX, e.clientY);

    const onMove = (ev: MouseEvent) => updateFromClientPos(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // 色相 (Hue) バー ドラッグ操作
  const handleHuePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const updateFromClientX = (clientX: number) => {
      if (!hueBarRef.current) return;
      const rect = hueBarRef.current.getBoundingClientRect();
      const nextH = clampNum(((clientX - rect.left) / rect.width) * 360, 0, 360);
      updateColorFromHsv(nextH, hsvRef.current.s, hsvRef.current.v);
    };
    updateFromClientX(e.clientX);

    const onMove = (ev: MouseEvent) => updateFromClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // カラーピッカー外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(false);
      }
    };
    if (colorPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [colorPickerOpen]);

  // リアルタイム協調編集 & Presence ステート
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const myClientIdRef = useRef<string>('');

  // ユーザー情報設定
  const currentUser = useMemo(() => {
    return {
      name: user?.display_name || user?.username || 'あなた',
      avatar: user?.avatar_url || '',
      id: user?.id || 'guest',
    };
  }, [user]);

  // 初回マウント時にキーバインド設定読み込み
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('klados_editor_keybinding');
      if (stored === 'vim' || stored === 'standard' || stored === 'nano') {
        setKeybinding(stored);
      }
    }
  }, []);

  const { data: page } = useQuery({
    queryKey: ['page', id],
    queryFn: () => pagesApi.get(id).then((r) => r.data.data),
  });

  const { data: site } = useQuery({
    queryKey: ['site', page?.site_id],
    queryFn: () => sitesApi.get(page.site_id).then((r) => r.data.data),
    enabled: Boolean(page?.site_id),
  });

  const { data: versions, isLoading: isVersionsLoading } = useQuery<PageVersion[]>({
    queryKey: ['page-versions', id],
    queryFn: () => pagesApi.versions(id).then((r) => r.data?.data || []),
    enabled: historyOpen,
  });

  const { data: commentList = [] } = useQuery({
    queryKey: ['comments', id],
    queryFn: () => commentsApi.list(id).then((r) => r.data?.data ?? []),
  });

  // 履歴モーダルが開いたとき、最新の旧バージョンを自動選択
  useEffect(() => {
    if (historyOpen && versions && versions.length > 0 && !selectedVersion) {
      setSelectedVersion(versions[0]);
    }
  }, [historyOpen, versions, selectedVersion]);

  // ページデータ取得時にカテゴリ配列を同期
  useEffect(() => {
    if (page) {
      setPageCategories(getPageCategoryNames(page));
    }
  }, [page]);

  const updateMutation = useMutation({
    mutationFn: (content: string) =>
      pagesApi.update(id, { content, categories: pageCategories }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['page', id] });
      queryClient.invalidateQueries({ queryKey: ['page-versions', id] });
      if (page?.site_id) {
        queryClient.invalidateQueries({ queryKey: ['site-categories', page.site_id] });
      }
    },
  });

  const saveCategoriesImmediately = (nextCats: string[]) => {
    setPageCategories(nextCats);
    pagesApi.update(id, { categories: nextCats }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['page', id] });
      if (page?.site_id) {
        queryClient.invalidateQueries({ queryKey: ['site-categories', page.site_id] });
      }
    });
  };

  const handleAddPageCategory = (catName?: string) => {
    const target = (catName ?? categoryInput).trim().replace(/^(?:category|カテゴリ)\s*:\s*/i, '');
    if (!target) return;
    if (!pageCategories.some((c) => c.toLowerCase() === target.toLowerCase())) {
      const next = [...pageCategories, target];
      saveCategoriesImmediately(next);
    }
    if (catName === undefined) {
      setCategoryInput('');
    }
  };

  const handleRemovePageCategory = (catName: string) => {
    const next = pageCategories.filter((c) => c !== catName);
    saveCategoriesImmediately(next);
  };

  const publishMutation = useMutation({
    mutationFn: (status: 'published' | 'draft') => pagesApi.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['page', id] }),
  });

  // サイト内既存カテゴリの取得
  const { data: siteCategoriesData } = useQuery<CategorySummary[]>({
    queryKey: ['site-categories', page?.site_id],
    queryFn: () => categoriesApi.listForSite(page!.site_id).then((r) => r.data?.data ?? []),
    enabled: Boolean(page?.site_id),
  });
  const siteCategories = siteCategoriesData ?? [];

  // Markdown ファイル読み込み処理
  const handleMdFileSelect = async (file: File) => {
    try {
      const raw = await file.text();
      // 改行コード正規化 (CRLF / CR -> LF) で CodeMirror エラーを防止
      const normalized = (raw ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const parsed = parseMarkdownFrontmatter(normalized, file.name);

      setMdUploadModal({
        isOpen: true,
        fileName: file.name,
        parsedTitle: parsed.title,
        content: parsed.content,
        categories: parsed.categories || [],
        catInput: '',
        insertMode: 'replace',
        updateTitle: Boolean(parsed.title && parsed.title !== page?.title),
      });
    } catch (err: any) {
      alert('ファイルの読み込みに失敗しました: ' + (err?.message || '不明なエラー'));
    }
  };

  // Markdown ファイル読み込みの確定反映 (カテゴリは本文ではなくページオプションとして保存)
  const handleApplyMdUpload = () => {
    if (!viewRef.current) return;

    const cleanContent = mdUploadModal.content;

    if (mdUploadModal.insertMode === 'replace') {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: cleanContent,
        },
      });
      setPreview(cleanContent);
      setSaved(false);
      broadcastDocChange(cleanContent);
    } else {
      // 現在のカーソル位置、または末尾に挿入
      const insertPos = lastSelectionRef.current?.to ?? viewRef.current.state.doc.length;
      viewRef.current.dispatch({
        changes: {
          from: insertPos,
          to: insertPos,
          insert: '\n\n' + cleanContent,
        },
      });
      const newContent = viewRef.current.state.doc.toString();
      setPreview(newContent);
      setSaved(false);
      broadcastDocChange(newContent);
    }

    // カテゴリのマージ保存 & タイトル更新
    const mergedCats = [...pageCategories];
    for (const c of mdUploadModal.categories) {
      const trimmed = c.trim();
      if (trimmed && !mergedCats.some((ex) => ex.toLowerCase() === trimmed.toLowerCase())) {
        mergedCats.push(trimmed);
      }
    }
    setPageCategories(mergedCats);

    const patchPayload: { title?: string; categories?: string[] } = {
      categories: mergedCats,
    };
    if (mdUploadModal.updateTitle && mdUploadModal.parsedTitle) {
      patchPayload.title = mdUploadModal.parsedTitle;
    }
    pagesApi.update(id, patchPayload).then(() => {
      queryClient.invalidateQueries({ queryKey: ['page', id] });
      if (page?.site_id) {
        queryClient.invalidateQueries({ queryKey: ['site-categories', page.site_id] });
      }
    });

    setMdUploadModal((prev) => ({ ...prev, isOpen: false }));
  };

  // --- テキスト挿入ユーティリティ ---
  const insertText = (
    textToInsert: string,
    explicitPos?: number,
    replaceRange?: { from: number; to: number }
  ) => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state, dispatch } = view;

    let from = state.doc.length;
    let to = state.doc.length;

    if (replaceRange) {
      from = Math.min(Math.max(0, replaceRange.from), state.doc.length);
      to = Math.min(Math.max(from, replaceRange.to), state.doc.length);
    } else if (typeof explicitPos === 'number' && explicitPos >= 0 && explicitPos <= state.doc.length) {
      from = explicitPos;
      to = explicitPos;
    } else if (state.selection.main.from > 0 || state.selection.main.to > 0) {
      from = state.selection.main.from;
      to = state.selection.main.to;
    } else if (lastSelectionRef.current) {
      from = Math.min(lastSelectionRef.current.from, state.doc.length);
      to = Math.min(lastSelectionRef.current.to, state.doc.length);
    }

    dispatch({
      changes: { from, to, insert: textToInsert },
      selection: { anchor: from + textToInsert.length },
      scrollIntoView: true,
    });
    lastSelectionRef.current = {
      from: from + textToInsert.length,
      to: from + textToInsert.length,
    };
    view.focus();
  };

  const wrapText = (
    before: string,
    after: string,
    defaultText = '',
    replaceRange?: { from: number; to: number }
  ) => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state, dispatch } = view;

    let from = state.selection.main.from;
    let to = state.selection.main.to;

    if (replaceRange) {
      from = Math.min(Math.max(0, replaceRange.from), state.doc.length);
      to = Math.min(Math.max(from, replaceRange.to), state.doc.length);
    } else if (
      from === to &&
      lastSelectionRef.current &&
      lastSelectionRef.current.from !== lastSelectionRef.current.to
    ) {
      // ツールバー等クリックでフォーカスが外れていた場合、直前の選択範囲を復元
      from = Math.min(lastSelectionRef.current.from, state.doc.length);
      to = Math.min(lastSelectionRef.current.to, state.doc.length);
    }

    // --- 1. 行頭プレフィックス装飾（見出し, リスト, 引用など after === '' の場合） ---
    if (after === '') {
      const line = state.doc.lineAt(from);
      const lineText = line.text;

      // すでに同じプレフィックスが付いている場合は除去（トグル解除）
      if (lineText.startsWith(before)) {
        dispatch({
          changes: { from: line.from, to: line.from + before.length, insert: '' },
          selection: { anchor: Math.max(line.from, from - before.length) },
          scrollIntoView: true,
        });
        lastSelectionRef.current = {
          from: Math.max(line.from, from - before.length),
          to: Math.max(line.from, from - before.length),
        };
        view.focus();
        return;
      }

      // 他の見出し(# , ## など)やリスト記号(- , 1. など)が付いている場合は置換
      const prefixRegex = /^(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)/;
      const match = prefixRegex.exec(lineText);
      if (match) {
        dispatch({
          changes: { from: line.from, to: line.from + match[0].length, insert: before },
          selection: { anchor: from - match[0].length + before.length },
          scrollIntoView: true,
        });
        lastSelectionRef.current = {
          from: from - match[0].length + before.length,
          to: from - match[0].length + before.length,
        };
      } else {
        dispatch({
          changes: { from: line.from, to: line.from, insert: before },
          selection: { anchor: from + before.length },
          scrollIntoView: true,
        });
        lastSelectionRef.current = {
          from: from + before.length,
          to: from + before.length,
        };
      }
      view.focus();
      return;
    }

    // --- 2. インライン装飾（before と after の両方がある場合） ---
    const hasUserSelection = from !== to && !replaceRange;
    let selectedText = hasUserSelection ? state.sliceDoc(from, to) : '';

    // リスト記号（"- ", "* ", "+ ", "1. "など）が含まれている場合、マーカーの外側に書式をかけないよう分離
    let prefix = '';
    const listMatch = /^([ \t]*[-*+]\s+|[ \t]*\d+\.\s+)/.exec(selectedText);
    if (listMatch) {
      prefix = listMatch[1];
      selectedText = selectedText.slice(prefix.length);
      from += prefix.length;
    }

    // 2-1. 選択範囲そのものが装飾記号で囲まれている場合 (例: ユーザーが **太字** を選択中) -> トグル解除
    const matchesEnclosing = (text: string, b: string, a: string) => {
      if (text.length < b.length + a.length) return false;
      if (!text.startsWith(b) || !text.endsWith(a)) return false;
      // 斜体 '*' の場合、太字 '**' を誤って斜体解除と見なさない
      if (b === '*' && text.startsWith('**')) return false;
      if (a === '*' && text.endsWith('**')) return false;
      return true;
    };

    if (hasUserSelection && matchesEnclosing(selectedText, before, after)) {
      const unwrapped = selectedText.slice(before.length, selectedText.length - after.length);
      dispatch({
        changes: { from, to, insert: unwrapped },
        selection: { anchor: from, head: from + unwrapped.length },
        scrollIntoView: true,
      });
      lastSelectionRef.current = { from, to: from + unwrapped.length };
      view.focus();
      return;
    }

    // 2-2. 選択範囲の直前・直後が装飾記号である場合 (例: 装飾直後に中身が選択されている場合) -> トグル解除
    if (hasUserSelection) {
      const docBefore = from >= before.length ? state.sliceDoc(from - before.length, from) : '';
      const docAfter = to + after.length <= state.doc.length ? state.sliceDoc(to, to + after.length) : '';

      let isOuterMatch = docBefore === before && docAfter === after;
      if (isOuterMatch && before === '*') {
        const outerBefore = from >= 2 ? state.sliceDoc(from - 2, from - 1) : '';
        const outerAfter = to + 2 <= state.doc.length ? state.sliceDoc(to + 1, to + 2) : '';
        if (outerBefore === '*' || outerAfter === '*') isOuterMatch = false;
      }

      if (isOuterMatch) {
        const targetFrom = from - before.length;
        const targetTo = to + after.length;
        dispatch({
          changes: { from: targetFrom, to: targetTo, insert: selectedText },
          selection: { anchor: targetFrom, head: targetFrom + selectedText.length },
          scrollIntoView: true,
        });
        lastSelectionRef.current = { from: targetFrom, to: targetFrom + selectedText.length };
        view.focus();
        return;
      }
    }

    // 2-3. 選択範囲がない（キャレットのみ）場合
    if (!hasUserSelection) {
      const line = state.doc.lineAt(from);
      const lineText = line.text;
      const offsetInLine = from - line.from;

      // 2-3-1. すでに該当装飾の内側にキャレットがあるか調べる (例: **太|字**) -> トグル解除
      const bIdx = lineText.lastIndexOf(before, offsetInLine);
      if (bIdx !== -1) {
        const aIdx = lineText.indexOf(after, offsetInLine);
        if (aIdx !== -1 && aIdx >= bIdx + before.length) {
          let validMatch = true;
          if (before === '*') {
            if (
              lineText[bIdx - 1] === '*' ||
              lineText[bIdx + 1] === '*' ||
              lineText[aIdx - 1] === '*' ||
              lineText[aIdx + 1] === '*'
            ) {
              validMatch = false;
            }
          }
          if (validMatch) {
            const innerText = lineText.slice(bIdx + before.length, aIdx);
            const targetFrom = line.from + bIdx;
            const targetTo = line.from + aIdx + after.length;
            dispatch({
              changes: { from: targetFrom, to: targetTo, insert: innerText },
              selection: { anchor: Math.max(targetFrom, from - before.length) },
              scrollIntoView: true,
            });
            lastSelectionRef.current = {
              from: Math.max(targetFrom, from - before.length),
              to: Math.max(targetFrom, from - before.length),
            };
            view.focus();
            return;
          }
        }
      }

      // 2-3-2. キャレット位置の単語を自動検出して選択装飾
      const beforeCaret = lineText.slice(0, offsetInLine);
      const afterCaret = lineText.slice(offsetInLine);
      const wordBeforeMatch = /[\p{L}\p{N}_]+$/u.exec(beforeCaret);
      const wordAfterMatch = /^[\p{L}\p{N}_]+/u.exec(afterCaret);

      if (wordBeforeMatch || wordAfterMatch) {
        const wordStart = wordBeforeMatch ? offsetInLine - wordBeforeMatch[0].length : offsetInLine;
        const wordEnd = wordAfterMatch ? offsetInLine + wordAfterMatch[0].length : offsetInLine;
        from = line.from + wordStart;
        to = line.from + wordEnd;
        selectedText = state.sliceDoc(from, to);
      } else {
        selectedText = defaultText;
      }
    }

    // 2-4. 太字デリミタ連続 (例: **A****B**) による行全体太字化を防ぐためのスペース補完
    let leadSpace = '';
    let trailSpace = '';
    if (before === '**') {
      const prevTwo = from >= 2 ? state.sliceDoc(from - 2, from) : '';
      if (prevTwo === '**') {
        leadSpace = ' ';
      }
      const nextTwo = to + 2 <= state.doc.length ? state.sliceDoc(to, to + 2) : '';
      if (nextTwo === '**') {
        trailSpace = ' ';
      }
    }

    const replacement = `${prefix}${leadSpace}${before}${selectedText}${after}${trailSpace}`;

    // カーソル位置の決定：中身のテキストを選択状態にして確認・再トグルを可能にする
    const contentStart = from + prefix.length + leadSpace.length + before.length;
    const contentEnd = contentStart + selectedText.length;
    const selection =
      selectedText.length > 0 && selectedText !== defaultText
        ? { anchor: contentStart, head: contentEnd }
        : { anchor: contentStart, head: contentEnd };

    dispatch({
      changes: { from, to, insert: replacement },
      selection,
      scrollIntoView: true,
    });
    lastSelectionRef.current = {
      from: selection.anchor,
      to: selection.head,
    };
    view.focus();
  };

  const applyColorSyntax = (attrKey: 'color' | 'bg', colorVal: string) => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state, dispatch } = view;

    let from = state.selection.main.from;
    let to = state.selection.main.to;
    if (
      from === to &&
      lastSelectionRef.current &&
      lastSelectionRef.current.from !== lastSelectionRef.current.to
    ) {
      from = Math.min(lastSelectionRef.current.from, state.doc.length);
      to = Math.min(lastSelectionRef.current.to, state.doc.length);
    }

    if (from !== to) {
      const selText = state.sliceDoc(from, to);
      // 1) 選択テキスト全体が [text]{color:...} または [text]{bg:...} の場合
      const fullMatch = /^\[([^\]\n]+)\]\{([^\}\n]+)\}$/.exec(selText);
      if (fullMatch) {
        const inner = fullMatch[1];
        const replacement = `[${inner}]{${attrKey}:${colorVal}}`;
        dispatch({
          changes: { from, to, insert: replacement },
          selection: { anchor: from + 1, head: from + 1 + inner.length },
          scrollIntoView: true,
        });
        lastSelectionRef.current = { from: from + 1, to: from + 1 + inner.length };
        view.focus();
        return;
      }

      // 2) 選択範囲の直前が `[` で直後が `]{...}` の場合 (中身だけ選択されている状態)
      const beforeChar = from >= 1 ? state.sliceDoc(from - 1, from) : '';
      const afterSlice = state.sliceDoc(to, Math.min(state.doc.length, to + 40));
      const afterAttrMatch = /^\]\{([^\}\n]+)\}/.exec(afterSlice);
      if (beforeChar === '[' && afterAttrMatch) {
        const targetFrom = from - 1;
        const targetTo = to + afterAttrMatch[0].length;
        const replacement = `[${selText}]{${attrKey}:${colorVal}}`;
        dispatch({
          changes: { from: targetFrom, to: targetTo, insert: replacement },
          selection: { anchor: targetFrom + 1, head: targetFrom + 1 + selText.length },
          scrollIntoView: true,
        });
        lastSelectionRef.current = {
          from: targetFrom + 1,
          to: targetFrom + 1 + selText.length,
        };
        view.focus();
        return;
      }
    }

    wrapText(
      '[',
      `]{${attrKey}:${colorVal}}`,
      attrKey === 'color' ? '色付きテキスト' : 'ハイライトテキスト'
    );
  };

  const clearColorSyntax = () => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state, dispatch } = view;
    let from = state.selection.main.from;
    let to = state.selection.main.to;
    if (
      from === to &&
      lastSelectionRef.current &&
      lastSelectionRef.current.from !== lastSelectionRef.current.to
    ) {
      from = Math.min(lastSelectionRef.current.from, state.doc.length);
      to = Math.min(lastSelectionRef.current.to, state.doc.length);
    }
    if (from !== to) {
      const selText = state.sliceDoc(from, to);
      const fullMatch = /^\[([^\]\n]+)\]\{([^\}\n]+)\}$/.exec(selText);
      if (fullMatch) {
        const inner = fullMatch[1];
        dispatch({
          changes: { from, to, insert: inner },
          selection: { anchor: from, head: from + inner.length },
          scrollIntoView: true,
        });
        lastSelectionRef.current = { from, to: from + inner.length };
        view.focus();
        setColorPickerOpen(false);
        return;
      }
      const beforeChar = from >= 1 ? state.sliceDoc(from - 1, from) : '';
      const afterSlice = state.sliceDoc(to, Math.min(state.doc.length, to + 40));
      const afterAttrMatch = /^\]\{([^\}\n]+)\}/.exec(afterSlice);
      if (beforeChar === '[' && afterAttrMatch) {
        const targetFrom = from - 1;
        const targetTo = to + afterAttrMatch[0].length;
        dispatch({
          changes: { from: targetFrom, to: targetTo, insert: selText },
          selection: { anchor: targetFrom, head: targetFrom + selText.length },
          scrollIntoView: true,
        });
        lastSelectionRef.current = { from: targetFrom, to: targetFrom + selText.length };
        view.focus();
        setColorPickerOpen(false);
        return;
      }
    }
    setColorPickerOpen(false);
  };

  const applyTextColor = (color: string) => {
    updateColorFromHex(color);
    applyColorSyntax('color', color);
    setColorPickerOpen(false);
  };

  const applyBgHighlight = (bg: string) => {
    updateColorFromHex(bg);
    if (bg === '#fef08a') {
      wrapText('==', '==', 'ハイライトテキスト');
    } else {
      applyColorSyntax('bg', bg);
    }
    setColorPickerOpen(false);
  };

  // スラッシュコマンド定義一覧
  const slashCommands: SlashCommandItem[] = useMemo(
    () => [
      {
        id: 'h1',
        label: '大見出し (H1)',
        description: '主要セクションのタイトル',
        icon: Heading1,
        action: (range) => insertText('# ', undefined, range),
      },
      {
        id: 'h2',
        label: '中見出し (H2)',
        description: 'サブセクションのタイトル',
        icon: Heading2,
        action: (range) => insertText('## ', undefined, range),
      },
      {
        id: 'h3',
        label: '小見出し (H3)',
        description: '詳細な小項目タイトル',
        icon: Heading3,
        action: (range) => insertText('### ', undefined, range),
      },
      {
        id: 'bold',
        label: '太字 (Bold)',
        description: 'テキストを太字にする (**テキスト**)',
        icon: Bold,
        action: (range) => wrapText('**', '**', '太字テキスト', range),
      },
      {
        id: 'italic',
        label: '斜体 (Italic)',
        description: 'テキストを斜体にする (*テキスト*)',
        icon: Italic,
        action: (range) => wrapText('*', '*', '斜体テキスト', range),
      },
      {
        id: 'underline',
        label: '下線 (Underline)',
        description: 'テキストに下線を引く (<u>テキスト</u>)',
        icon: Underline,
        action: (range) => wrapText('<u>', '</u>', '下線テキスト', range),
      },
      {
        id: 'strike',
        label: '取り消し線',
        description: 'テキストに取り消し線を引く (~~テキスト~~)',
        icon: Strikethrough,
        action: (range) => wrapText('~~', '~~', '打ち消しテキスト', range),
      },
      {
        id: 'highlight',
        label: 'ハイライトマーカー',
        description: 'テキストを黄色マーカーで強調 (==テキスト==)',
        icon: Highlighter,
        action: (range) => wrapText('==', '==', 'ハイライトテキスト', range),
      },
      {
        id: 'red',
        label: '赤文字 (Red)',
        description: '選択テキストまたは赤色文字を挿入',
        icon: Palette,
        action: (range) => wrapText('[', ']{color:#ef4444}', '赤色テキスト', range),
      },
      {
        id: 'blue',
        label: '青文字 (Blue)',
        description: '選択テキストまたは青色文字を挿入',
        icon: Palette,
        action: (range) => wrapText('[', ']{color:#3b82f6}', '青色テキスト', range),
      },
      {
        id: 'green',
        label: '緑文字 (Green)',
        description: '選択テキストまたは緑色文字を挿入',
        icon: Palette,
        action: (range) => wrapText('[', ']{color:#10b981}', '緑色テキスト', range),
      },
      {
        id: 'yellow',
        label: '黄文字 (Yellow)',
        description: '選択テキストまたは黄色文字を挿入',
        icon: Palette,
        action: (range) => wrapText('[', ']{color:#f59e0b}', '黄色テキスト', range),
      },
      {
        id: 'purple',
        label: '紫文字 (Purple)',
        description: '選択テキストまたは紫色文字を挿入',
        icon: Palette,
        action: (range) => wrapText('[', ']{color:#8b5cf6}', '紫色テキスト', range),
      },
      {
        id: 'table',
        label: 'テーブルメーカー (表の作成・編集)',
        description: '行数・列数・文字揃え・内容を自由に設定して表を挿入/編集',
        icon: TableIcon,
        action: (range) => handleOpenTableMaker(range),
      },
      {
        id: 'link',
        label: '外部リンク (External Link)',
        description: '外部URLへのリンクを挿入 ([表示名](https://...))',
        icon: ExternalLink,
        action: (range) => wrapText('[', '](https://example.com)', 'リンクテキスト', range),
      },
      {
        id: 'wikilink',
        label: 'Wiki内部リンク (Wiki Link)',
        description: 'サイト内別ページを一覧から検索して挿入 ([[ページ名]])',
        icon: LinkIcon,
        action: (range) => {
          if (range && viewRef.current) {
            viewRef.current.dispatch({
              changes: { from: range.from, to: range.to, insert: '' },
              selection: { anchor: range.from },
            });
            lastSelectionRef.current = { from: range.from, to: range.from };
          }
          handleOpenLinkModal();
        },
      },
      {
        id: 'code',
        label: 'コードブロック',
        description: 'シンタックスハイライト付きコードブロック',
        icon: Code,
        action: (range) =>
          insertText(
            '```typescript\n// ここにコードを記述\nconst greeting = "Hello, Klados!";\nconsole.log(greeting);\n```\n',
            undefined,
            range
          ),
      },
      {
        id: 'quote',
        label: '引用 (Quote)',
        description: '引用テキストブロックを挿入',
        icon: Quote,
        action: (range) => insertText('> 引用文をここに記述します。\n', undefined, range),
      },
      {
        id: 'katex',
        label: 'KaTeX 数式',
        description: '数式ブロックフォーミュラ ($$ 数式 $$)',
        icon: Sigma,
        action: (range) =>
          insertText(
            '$$\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n$$\n',
            undefined,
            range
          ),
      },
      {
        id: 'divider',
        label: '区切り線 (Divider)',
        description: '水平罫線 (---) を挿入',
        icon: Minus,
        action: (range) => insertText('\n---\n\n', undefined, range),
      },
      {
        id: 'checklist',
        label: 'タスクリスト',
        description: 'チェック可能なToDo項目',
        icon: CheckSquare,
        action: (range) => insertText('- [ ] 新しいタスク\n', undefined, range),
      },
      {
        id: 'callout',
        label: 'コールアウト / 注意書き',
        description: '強調表示用のメッセージボックス',
        icon: Info,
        action: (range) =>
          insertText(':::info\nここに注意書きや追加情報を記述します。\n:::\n', undefined, range),
      },
      {
        id: 'category',
        label: 'カテゴリ (Category)',
        description: 'MediaWiki風のカテゴリタグを挿入 ([[Category:カテゴリ名]])',
        icon: FolderTree,
        action: (range) => wrapText('[[Category:', ']]', 'カテゴリ名', range),
      },
      {
        id: 'image',
        label: '画像挿入 (メディア一覧・詳細設定)',
        description: 'サイズ・挿入位置・サムネイル枠・キャプションを指定して挿入',
        icon: ImageIcon,
        action: (range) => {
          if (viewRef.current) {
            if (range) {
              viewRef.current.dispatch({
                changes: { from: range.from, to: range.to, insert: '' },
                selection: { anchor: range.from },
              });
              lastSelectionRef.current = { from: range.from, to: range.from };
            } else {
              lastSelectionRef.current = {
                from: viewRef.current.state.selection.main.from,
                to: viewRef.current.state.selection.main.to,
              };
            }
          }
          setMediaLibraryOpen(true);
        },
      },
      {
        id: 'thumb',
        label: 'MediaWiki風 サムネイル画像 ([[File:...]])',
        description: '右回り込み・サイズ・キャプション付き画像記法を挿入',
        icon: Settings2,
        action: (range) => {
          if (viewRef.current && range) {
            viewRef.current.dispatch({
              changes: { from: range.from, to: range.to, insert: '' },
              selection: { anchor: range.from },
            });
            lastSelectionRef.current = { from: range.from, to: range.from };
          }
          handleOpenImageOptionsModal(range ? { from: range.from, to: range.from } : undefined);
        },
      },
    ],
    []
  );

  // フィルタリングされたスラッシュコマンド
  const filteredCommands = useMemo(() => {
    if (!slashFilter) return slashCommands;
    const f = slashFilter.toLowerCase();
    return slashCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(f) ||
        c.description.toLowerCase().includes(f) ||
        c.id.includes(f)
    );
  }, [slashCommands, slashFilter]);

  // スラッシュコマンド実行 (アトミックにスラッシュ削除とコンテンツ挿入を実行)
  const executeSlashCommand = (cmd: SlashCommandItem) => {
    setSlashMenuOpen(false);
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state } = view;
    const pos = state.selection.main.from;
    const line = state.doc.lineAt(pos);
    const lineText = line.text;

    // スラッシュ文字を探して置換対象範囲 (slashFrom -> pos) を算出
    const lastSlashIdx = lineText.lastIndexOf('/');
    let replaceRange: { from: number; to: number } | undefined;
    if (lastSlashIdx !== -1) {
      replaceRange = {
        from: line.from + lastSlashIdx,
        to: pos,
      };
    }

    cmd.action(replaceRange);
  };

  // --- WebSocket & BroadcastChannel リアルタイム同期 ---
  useEffect(() => {
    if (!id) return;

    // クライアントID
    if (!myClientIdRef.current) {
      myClientIdRef.current = `client_${Math.random().toString(36).substring(2, 9)}`;
    }
    const myClientId = myClientIdRef.current;
    const myColor = COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];

    // 自アバターを初期追加
    const me: Collaborator = {
      id: myClientId,
      name: `${currentUser.name} (あなた)`,
      avatar: currentUser.avatar,
      color: myColor,
      lastActive: Date.now(),
    };
    setCollaborators([me]);

    // 1. BroadcastChannel (同一ブラウザの複数タブ間で即座に同期)
    const bc = new BroadcastChannel(`klados_collab_page_${id}`);
    broadcastChannelRef.current = bc;

    bc.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.sender === myClientId) return;

      if (msg.type === 'doc_change' && msg.content !== undefined) {
        if (viewRef.current && viewRef.current.state.doc.toString() !== msg.content) {
          const prevPos = viewRef.current.state.selection.main.from;
          viewRef.current.dispatch({
            changes: {
              from: 0,
              to: viewRef.current.state.doc.length,
              insert: msg.content,
            },
            selection: { anchor: Math.min(prevPos, msg.content.length) },
            annotations: [remoteSyncAnnotation.of(true)],
          });
          setPreview(msg.content);
          setSaved(false);
        }
      } else if (msg.type === 'presence' && msg.user) {
        setCollaborators((prev) => {
          const filtered = prev.filter((c) => c.id !== msg.user.id);
          return [...filtered, { ...msg.user, lastActive: Date.now() }];
        });
      }
    };

    // 初期プレゼンス通知
    bc.postMessage({
      type: 'presence',
      sender: myClientId,
      user: {
        id: myClientId,
        name: currentUser.name,
        avatar: currentUser.avatar,
        color: myColor,
      },
    });

    // 2. WebSocket (バックエンド ws://localhost:8080/v1/ws/pages/:id)
    const isBrowser = typeof window !== 'undefined';
    const isSecure = isBrowser && window.location.protocol === 'https:';
    const wsProto = isSecure ? 'wss:' : 'ws:';
    const wsHost = isBrowser ? window.location.hostname : 'localhost';
    
    let wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl) {
      if (isBrowser && (wsHost === 'localhost' || wsHost === '127.0.0.1')) {
        wsUrl = `ws://${wsHost}:8080/v1/ws/pages/${id}`;
      } else if (isBrowser) {
        // Cloudflare Tunnel 等の外部ホスト時 (同一ポート/プロキシを試行)
        wsUrl = `${wsProto}//${window.location.host}/v1/ws/pages/${id}`;
      } else {
        wsUrl = `ws://localhost:8080/v1/ws/pages/${id}`;
      }
    }

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsWsConnected(true);
        ws?.send(
          JSON.stringify({
            type: 'join',
            page_id: id,
            sender_id: myClientId,
            user: {
              id: myClientId,
              name: currentUser.name,
              color: myColor,
            },
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.sender_id === myClientId) return;

          if (msg.type === 'doc_change' || msg.type === 'content_update') {
            const newContent = msg.content;
            if (viewRef.current && viewRef.current.state.doc.toString() !== newContent) {
              const prevPos = viewRef.current.state.selection.main.from;
              viewRef.current.dispatch({
                changes: {
                  from: 0,
                  to: viewRef.current.state.doc.length,
                  insert: newContent,
                },
                selection: { anchor: Math.min(prevPos, newContent.length) },
                annotations: [remoteSyncAnnotation.of(true)],
              });
              setPreview(newContent);
            }
          } else if (msg.type === 'presence' || msg.type === 'collaborator_joined') {
            if (msg.user) {
              setCollaborators((prev) => {
                const filtered = prev.filter((c) => c.id !== msg.user.id);
                return [...filtered, { ...msg.user, lastActive: Date.now() }];
              });
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onerror = () => {
        setIsWsConnected(false);
      };

      ws.onclose = () => {
        setIsWsConnected(false);
      };
    } catch {
      // WebSocket server offline
      setIsWsConnected(false);
    }

    // 定期的なPresenceハートビート
    const presenceTimer = setInterval(() => {
      bc.postMessage({
        type: 'presence',
        sender: myClientId,
        user: {
          id: myClientId,
          name: currentUser.name,
          color: myColor,
        },
      });
      // 30秒以上更新のないコラボレーターを消去 (自身を除く)
      setCollaborators((prev) =>
        prev.filter((c) => c.id === myClientId || Date.now() - c.lastActive < 35000)
      );
    }, 10000);

    return () => {
      clearInterval(presenceTimer);
      bc.close();
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [id, currentUser]);

  // ドキュメント更新時のブロードキャスト送信
  const broadcastDocChange = (content: string) => {
    // BroadcastChannel
    broadcastChannelRef.current?.postMessage({
      type: 'doc_change',
      sender: myClientIdRef.current,
      content,
    });

    // WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'doc_change',
          page_id: id,
          sender_id: myClientIdRef.current,
          content,
        })
      );
    }
  };

  // 手動保存処理
  const handleManualSave = () => {
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      if (saved && currentDoc === (page?.content ?? '')) {
        return;
      }
      updateMutation.mutate(currentDoc);
    }
  };

  // --- nano コマンド実装 ---
  const executeNanoWriteOut = () => {
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      const lines = viewRef.current.state.doc.lines;
      if (!saved || currentDoc !== (page?.content ?? '')) {
        updateMutation.mutate(currentDoc);
        setNanoStatusMessage(`[ ${lines} 行を書き込みました ]`);
      } else {
        setNanoStatusMessage(`[ 変更はありません (${lines} 行) ]`);
      }
    }
  };

  const executeNanoExit = () => {
    if (!saved && viewRef.current && viewRef.current.state.doc.toString() !== (page?.content ?? '')) {
      setNanoPrompt({ type: 'exit', value: '' });
    } else {
      const siteId = page?.site_id || page?.siteId;
      if (siteId) {
        router.push(`/dashboard/sites/${siteId}`);
      }
    }
  };

  const executeNanoCut = (view: EditorView) => {
    const selection = view.state.selection.main;
    if (selection.from !== selection.to) {
      const text = view.state.sliceDoc(selection.from, selection.to);
      nanoCutBufferRef.current = text;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: '' },
        selection: { anchor: selection.from },
      });
      setNanoStatusMessage(`[ 選択範囲 (${text.length} 文字) をカットバッファに切り取りました ]`);
    } else {
      const line = view.state.doc.lineAt(selection.from);
      let from = line.from;
      let to = line.to;
      if (to < view.state.doc.length) {
        to += 1;
      } else if (from > 0) {
        from -= 1;
      }
      nanoCutBufferRef.current = view.state.sliceDoc(from, to);
      view.dispatch({
        changes: { from, to, insert: '' },
        selection: { anchor: from },
      });
      setNanoStatusMessage(`[ 1 行をカットバッファに切り取りました ]`);
    }
  };

  const executeNanoPaste = (view: EditorView) => {
    if (!nanoCutBufferRef.current) {
      setNanoStatusMessage('[ カットバッファは空です ]');
      return;
    }
    const text = nanoCutBufferRef.current;
    const pos = view.state.selection.main.from;
    view.dispatch({
      changes: { from: pos, to: pos, insert: text },
      selection: { anchor: pos + text.length },
      scrollIntoView: true,
    });
    setNanoStatusMessage(`[ カットバッファから ${text.length} 文字を貼り付けました ]`);
  };

  const executeNanoCurPos = (view: EditorView) => {
    const pos = view.state.selection.main.from;
    const line = view.state.doc.lineAt(pos);
    const lineNo = line.number;
    const totalLines = view.state.doc.lines;
    const col = pos - line.from + 1;
    const totalChars = view.state.doc.length;
    const pct = totalLines > 0 ? Math.round((lineNo / totalLines) * 100) : 100;
    setNanoStatusMessage(
      `行 ${lineNo}/${totalLines} (${pct}%), 列 ${col}/${line.length + 1}, 文字 ${pos}/${totalChars}`
    );
  };

  const openNanoSearch = () => {
    setNanoPrompt({ type: 'search', value: '' });
  };

  const executeNanoSearchNext = (query: string) => {
    if (!viewRef.current || !query) return;
    const view = viewRef.current;
    const doc = view.state.doc.toString();
    const currentPos = view.state.selection.main.to;
    let idx = doc.toLowerCase().indexOf(query.toLowerCase(), currentPos);
    if (idx === -1) {
      idx = doc.toLowerCase().indexOf(query.toLowerCase(), 0);
    }
    if (idx !== -1) {
      view.dispatch({
        selection: { anchor: idx, head: idx + query.length },
        scrollIntoView: true,
      });
      setNanoStatusMessage(`[ "${query}" の一致箇所へ移動しました ]`);
    } else {
      setNanoStatusMessage(`[ "${query}" は見つかりませんでした ]`);
    }
  };

  const openNanoReplace = () => {
    setNanoPrompt({ type: 'replace', value: '', replaceValue: '' });
  };

  const executeNanoReplaceOne = (query: string, replaceWith: string) => {
    if (!viewRef.current || !query) return;
    const view = viewRef.current;
    const doc = view.state.doc.toString();
    const currentPos = view.state.selection.main.from;
    let idx = doc.indexOf(query, currentPos);
    if (idx === -1) {
      idx = doc.indexOf(query, 0);
    }
    if (idx !== -1) {
      view.dispatch({
        changes: { from: idx, to: idx + query.length, insert: replaceWith },
        selection: { anchor: idx + replaceWith.length },
        scrollIntoView: true,
      });
      setNanoStatusMessage(`[ "${query}" を "${replaceWith}" に置換しました ]`);
    } else {
      setNanoStatusMessage(`[ "${query}" は見つかりませんでした ]`);
    }
  };

  const executeNanoReplaceAll = (query: string, replaceWith: string) => {
    if (!viewRef.current || !query) return;
    const view = viewRef.current;
    const doc = view.state.doc.toString();
    const count = doc.split(query).length - 1;
    if (count > 0) {
      const newDoc = doc.split(query).join(replaceWith);
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: newDoc },
        scrollIntoView: true,
      });
      setNanoStatusMessage(`[ ${count} 箇所を一括置換しました ]`);
      setNanoPrompt(null);
    } else {
      setNanoStatusMessage(`[ "${query}" は見つかりませんでした ]`);
    }
  };

  const openNanoGoto = () => {
    setNanoPrompt({ type: 'goto', value: '' });
  };

  const executeNanoGoToLine = (lineNum: number) => {
    if (!viewRef.current || isNaN(lineNum)) return;
    const view = viewRef.current;
    const totalLines = view.state.doc.lines;
    const clamped = Math.max(1, Math.min(lineNum, totalLines));
    const targetLine = view.state.doc.line(clamped);
    view.dispatch({
      selection: { anchor: targetLine.from },
      scrollIntoView: true,
    });
    setNanoStatusMessage(`[ 行 ${clamped} に移動しました ]`);
    setNanoPrompt(null);
    view.focus();
  };

  const executeNanoPrevPage = (view: EditorView) => {
    const pos = view.state.selection.main.from;
    const currentLine = view.state.doc.lineAt(pos);
    const targetLineNum = Math.max(1, currentLine.number - 20);
    const target = view.state.doc.line(targetLineNum);
    view.dispatch({
      selection: { anchor: target.from },
      scrollIntoView: true,
    });
    setNanoStatusMessage(`[ 前ページへスクロール (行 ${targetLineNum}) ]`);
  };

  const executeNanoNextPage = (view: EditorView) => {
    const pos = view.state.selection.main.from;
    const currentLine = view.state.doc.lineAt(pos);
    const targetLineNum = Math.min(view.state.doc.lines, currentLine.number + 20);
    const target = view.state.doc.line(targetLineNum);
    view.dispatch({
      selection: { anchor: target.from },
      scrollIntoView: true,
    });
    setNanoStatusMessage(`[ 次ページへスクロール (行 ${targetLineNum}) ]`);
  };

  const executeNanoJustify = (view: EditorView) => {
    const pos = view.state.selection.main.from;
    const line = view.state.doc.lineAt(pos);
    const trimmed = line.text.trimEnd();
    if (trimmed !== line.text) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: trimmed },
      });
    }
    setNanoStatusMessage('[ 行末の余白を整形しました ]');
  };

  const nanoActionsRef = useRef({
    executeNanoWriteOut,
    executeNanoExit,
    executeNanoCut,
    executeNanoPaste,
    executeNanoCurPos,
    openNanoSearch,
    openNanoReplace,
    openNanoGoto,
    executeNanoPrevPage,
    executeNanoNextPage,
    executeNanoJustify,
  });

  useEffect(() => {
    nanoActionsRef.current = {
      executeNanoWriteOut,
      executeNanoExit,
      executeNanoCut,
      executeNanoPaste,
      executeNanoCurPos,
      openNanoSearch,
      openNanoReplace,
      openNanoGoto,
      executeNanoPrevPage,
      executeNanoNextPage,
      executeNanoJustify,
    };
  });

  const getNanoKeymapExtension = () => {
    return keymap.of([
      {
        key: 'Mod-o',
        run: () => {
          nanoActionsRef.current.executeNanoWriteOut();
          return true;
        },
      },
      {
        key: 'Mod-s',
        run: () => {
          nanoActionsRef.current.executeNanoWriteOut();
          return true;
        },
      },
      {
        key: 'Mod-k',
        run: (view) => {
          nanoActionsRef.current.executeNanoCut(view);
          return true;
        },
      },
      {
        key: 'Mod-u',
        run: (view) => {
          nanoActionsRef.current.executeNanoPaste(view);
          return true;
        },
      },
      {
        key: 'Mod-w',
        run: () => {
          nanoActionsRef.current.openNanoSearch();
          return true;
        },
      },
      {
        key: 'Mod-\\',
        run: () => {
          nanoActionsRef.current.openNanoReplace();
          return true;
        },
      },
      {
        key: 'Mod-g',
        run: () => {
          setNanoHelpOpen(true);
          return true;
        },
      },
      {
        key: 'Mod-c',
        run: (view) => {
          if (view.state.selection.main.from !== view.state.selection.main.to) {
            return false;
          }
          nanoActionsRef.current.executeNanoCurPos(view);
          return true;
        },
      },
      {
        key: 'Mod-x',
        run: (view) => {
          if (view.state.selection.main.from !== view.state.selection.main.to) {
            return false;
          }
          nanoActionsRef.current.executeNanoExit();
          return true;
        },
      },
      {
        key: 'Mod-_',
        run: () => {
          nanoActionsRef.current.openNanoGoto();
          return true;
        },
      },
      {
        key: 'Alt-g',
        run: () => {
          nanoActionsRef.current.openNanoGoto();
          return true;
        },
      },
      {
        key: 'Mod-y',
        run: (view) => {
          nanoActionsRef.current.executeNanoPrevPage(view);
          return true;
        },
      },
      {
        key: 'Mod-j',
        run: (view) => {
          nanoActionsRef.current.executeNanoJustify(view);
          return true;
        },
      },
    ]);
  };

  const getStandardKeymapExtension = () => {
    return keymap.of([
      {
        key: 'Mod-b',
        run: () => {
          wrapText('**', '**', '太字テキスト');
          return true;
        },
      },
      {
        key: 'Mod-i',
        run: () => {
          wrapText('*', '*', '斜体テキスト');
          return true;
        },
      },
      {
        key: 'Mod-u',
        run: () => {
          wrapText('<u>', '</u>', '下線テキスト');
          return true;
        },
      },
    ]);
  };

  const getKeybindingExtension = (mode: 'standard' | 'vim' | 'nano') => {
    if (mode === 'vim') return vim();
    if (mode === 'nano') return getNanoKeymapExtension();
    return getStandardKeymapExtension();
  };

  // CodeMirror エディタ初期化
  useEffect(() => {
    if (!editorRef.current || !page || viewRef.current) return;

    const initialContent = (page.content ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const keybindingCompartment = new Compartment();
    keybindingCompartmentRef.current = keybindingCompartment;

    const startState = EditorState.create({
      doc: initialContent,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        inlineColorDecorationPlugin,
        keybindingCompartment.of(getKeybindingExtension(keybinding)),
        EditorView.updateListener.of((update) => {
          lastSelectionRef.current = {
            from: update.state.selection.main.from,
            to: update.state.selection.main.to,
          };
          if (update.docChanged) {
            const content = update.state.doc.toString();
            setPreview(content);
            setSaved(false);

            const isRemote = update.transactions.some(
              (tr) => tr.annotation(remoteSyncAnnotation) === true
            );
            if (!isRemote) {
              broadcastDocChange(content);

              // スラッシュコマンド検知 (ローカル入力時のみ)
              const pos = update.state.selection.main.from;
              const line = update.state.doc.lineAt(pos);
              const textBefore = line.text.slice(0, pos - line.from);

              // 行頭のスラッシュ、または空白直後のスラッシュをトリガー
              const match = /(?:^|\s)\/([a-zA-Z0-9_-]*)$/.exec(textBefore);
              if (match) {
                setSlashFilter(match[1] || '');
                setSlashSelectedIndex(0);
                setSlashMenuOpen(true);
              } else {
                setSlashMenuOpen(false);
              }
            }
          }
        }),
      ],
    });

    const view = new EditorView({ state: startState, parent: editorRef.current });
    viewRef.current = view;

    // 初期カーソル位置を安全に末尾に設定
    const docLength = view.state.doc.length;
    view.dispatch({
      selection: { anchor: docLength, head: docLength },
    });
    setPreview(initialContent);
    lastSelectionRef.current = { from: docLength, to: docLength };

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [id, Boolean(page)]);

  // キーバインドの動的切り替え
  const handleToggleKeybinding = (newMode: 'standard' | 'vim' | 'nano') => {
    setKeybinding(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('klados_editor_keybinding', newMode);
    }

    if (viewRef.current && keybindingCompartmentRef.current) {
      viewRef.current.dispatch({
        effects: keybindingCompartmentRef.current.reconfigure(
          getKeybindingExtension(newMode)
        ),
      });
    }
  };

  // 自動保存 (5秒ごと)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!saved && viewRef.current) {
        const currentDoc = viewRef.current.state.doc.toString();
        if (currentDoc !== (page?.content ?? '')) {
          updateMutation.mutate(currentDoc);
        } else {
          setSaved(true);
        }
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [saved, page?.content, updateMutation]);


  // バージョン復元処理
  const handleRestoreVersion = async (targetVer: PageVersion) => {
    if (
      !confirm(
        `バージョン v${targetVer.version} に復元しますか？\n現在のドキュメントは新バージョンとして保存された上でロールバックされます。`
      )
    ) {
      return;
    }

    try {
      setIsReverting(true);
      try {
        await pagesApi.revert(id, targetVer.version);
      } catch (err) {
        console.warn('Direct revert API fallback to update:', err);
        await pagesApi.update(id, { content: targetVer.content });
      }

      if (viewRef.current) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: viewRef.current.state.doc.length,
            insert: targetVer.content,
          },
        });
      }

      setPreview(targetVer.content);
      setSaved(true);
      broadcastDocChange(targetVer.content);
      queryClient.invalidateQueries({ queryKey: ['page', id] });
      queryClient.invalidateQueries({ queryKey: ['page-versions', id] });

      setRevertSuccessMsg(`バージョン v${targetVer.version} を復元しました`);
      setTimeout(() => setRevertSuccessMsg(null), 4000);
      setHistoryOpen(false);
    } catch (err: any) {
      console.error('Revert error:', err);
      alert('バージョンの復元に失敗しました: ' + (err?.response?.data?.error || err.message));
    } finally {
      setIsReverting(false);
    }
  };

  // 画像アップロード処理
  const handleUploadFile = async (file: File, targetPos?: number) => {
    const siteId = page?.site_id || page?.siteId || site?.id;
    if (!siteId) {
      alert('サイトIDが見つかりません');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('画像ファイル (PNG, JPEG, GIF, WebP, SVG) を選択してください');
      return;
    }

    try {
      setIsUploading(true);
      const res = await mediaApi.upload(siteId, file);
      const data = res.data?.data || res.data;
      const mediaId = data?.id;
      const cdnUrl = data?.cdn_url || data?.CDNURL || data?.url;

      const altText = file.name.replace(/\.[^/.]+$/, '');
      const mediaRef = formatMediaRef(mediaId, cdnUrl);

      if (!mediaRef) {
        throw new Error('メディアURLの取得に失敗しました');
      }

      const markdownImage = `\n![${altText}](${mediaRef})\n`;
      insertText(markdownImage, targetPos);
    } catch (err: any) {
      console.error('画像アップロード失敗:', err);
      const msg = err.response?.data?.error || err.message || '画像のアップロードに失敗しました';
      alert(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const targetPos =
        lastSelectionRef.current && lastSelectionRef.current.from > 0
          ? lastSelectionRef.current.from
          : viewRef.current?.state.selection.main.from && viewRef.current.state.selection.main.from > 0
          ? viewRef.current.state.selection.main.from
          : lastSelectionRef.current?.from ?? viewRef.current?.state.doc.length;
      handleUploadFile(files[0], targetPos);
    }
  };

  // ドラッグ＆ドロップ
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // ドロップされた正確な座標位置を取得 (precise = false で余白や行末へのドロップもカバー)
    let dropPos: number | undefined;
    if (viewRef.current) {
      const pos = viewRef.current.posAtCoords({ x: e.clientX, y: e.clientY }, false);
      if (typeof pos === 'number' && !isNaN(pos)) {
        dropPos = pos;
        lastSelectionRef.current = { from: pos, to: pos };
      } else if (lastSelectionRef.current) {
        dropPos = lastSelectionRef.current.from;
      } else {
        dropPos = viewRef.current.state.doc.length;
      }
    }

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          await handleUploadFile(file, dropPos);
        }
      }
    }
  };

  // クリップボードからの画像ペースト
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const targetPos =
            lastSelectionRef.current && lastSelectionRef.current.from > 0
              ? lastSelectionRef.current.from
              : viewRef.current?.state.selection.main.from && viewRef.current.state.selection.main.from > 0
              ? viewRef.current.state.selection.main.from
              : lastSelectionRef.current?.from ?? viewRef.current?.state.doc.length;
          await handleUploadFile(file, targetPos);
          break;
        }
      }
    }
  };

  // スラッシュコマンド メニューのキーボードナビゲーション
  const handleEditorKeyDown = (e: React.KeyboardEvent) => {
    if (!slashMenuOpen || filteredCommands.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSlashSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSlashSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[slashSelectedIndex];
      if (selected) executeSlashCommand(selected);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSlashMenuOpen(false);
    }
  };

  const currentDocContent = viewRef.current
    ? viewRef.current.state.doc.toString()
    : page?.content || '';

  const publicUrl = site?.slug
    ? page?.slug === 'index' || page?.slug === 'home' || !page?.slug
      ? getSitePublicUrl(site)
      : `${getSitePublicUrl(site)}/${page.slug}`
    : null;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* 復元成功メッセージトースト */}
      {revertSuccessMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold animate-in fade-in-0 slide-in-from-top-2">
          <Check className="size-4" />
          <span>{revertSuccessMsg}</span>
        </div>
      )}

      {/* 固定上部メニューバー (画面サイズに応じたフレキシブルなレスポンシブ配置) */}
      <div className="sticky top-0 z-30 shrink-0 bg-background/95 backdrop-blur-sm shadow-xs">
        <header className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border bg-card/80 backdrop-blur-sm gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-initial mr-1">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-1.5 sm:px-2 py-1 rounded hover:bg-muted shrink-0"
              title="戻る"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">戻る</span>
            </button>
            <div className="h-4 w-px bg-border hidden sm:block shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-xs sm:text-sm leading-tight truncate max-w-[120px] xs:max-w-[180px] sm:max-w-[240px] md:max-w-[320px] lg:max-w-[420px]">
                {page?.title ?? '読み込み中...'}
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-muted-foreground truncate">
                {site && <span className="truncate hidden sm:inline">{site.title}</span>}
                {page?.slug && <span className="shrink-0 hidden xs:inline">/{page.slug}</span>}
                {(page?.updated_by || page?.created_by) && (
                  <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                    <span>•</span>
                    <span>
                      更新:{' '}
                      {(page.updated_by || page.created_by)?.display_name ||
                        (page.updated_by || page.created_by)?.username}
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 shrink-0">
                  {saved ? (
                    <>
                      <Check className="size-3 text-emerald-500" />
                      <span className="hidden xs:inline">保存済み</span>
                    </>
                  ) : (
                    <>
                      <span className="size-2 rounded-full bg-amber-500 animate-pulse xs:hidden" />
                      <span className="text-amber-500 font-medium hidden xs:inline">編集中...</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* 右側操作・ツール群 */}
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">
            {/* [xl以上] コラボレーター アバター一覧 */}
            <div className="hidden xl:flex items-center gap-1.5 pl-1 shrink-0">
              <div className="flex -space-x-2 overflow-hidden items-center">
                {collaborators.map((c) => {
                  const initial = c.name.charAt(0).toUpperCase() || 'U';
                  return (
                    <div
                      key={c.id}
                      title={`${c.name} (編集中)`}
                      className={`size-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ring-1 ring-background shadow-xs transition-transform hover:scale-110 cursor-default shrink-0 ${c.color}`}
                    >
                      {initial}
                    </div>
                  );
                })}
              </div>
              {collaborators.length > 1 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 whitespace-nowrap shrink-0">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{collaborators.length}人が編集</span>
                </span>
              )}
            </div>

            {/* [xl以上] キーバインド切り替え (標準 / Vim / nano) */}
            <div className="hidden xl:flex border border-border rounded-lg overflow-hidden text-xs bg-muted/20 p-0.5 whitespace-nowrap shrink-0">
              <button
                type="button"
                onClick={() => handleToggleKeybinding('standard')}
                className={`px-2 py-1 rounded transition-colors cursor-pointer text-[11px] font-medium whitespace-nowrap shrink-0 ${
                  keybinding === 'standard'
                    ? 'bg-background shadow-xs text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="標準エディタ操作"
              >
                標準
              </button>
              <button
                type="button"
                onClick={() => handleToggleKeybinding('vim')}
                className={`px-2 py-1 rounded transition-colors cursor-pointer text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  keybinding === 'vim'
                    ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Vim キーバインド (Normal, Insert, Visualモード対応)"
              >
                <Terminal className="size-3 shrink-0" />
                <span>Vim</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleKeybinding('nano')}
                className={`px-2 py-1 rounded transition-colors cursor-pointer text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  keybinding === 'nano'
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="GNU nano キーバインド (^O: 保存, ^K: 切り取り, ^U: 貼り付け, ^W: 検索, ^X: 終了)"
              >
                <Terminal className="size-3 shrink-0" />
                <span>nano</span>
              </button>
            </div>

            {/* [md以上] カテゴリ設定 (メニューバー・オプション) */}
            <div className="relative hidden md:block" ref={categoryMenuRef}>
              <button
                type="button"
                onClick={() => setCategoryMenuOpen(!categoryMenuOpen)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-lg transition-colors cursor-pointer relative whitespace-nowrap shrink-0 ${
                  categoryMenuOpen || pageCategories.length > 0
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-semibold'
                    : 'text-muted-foreground hover:text-foreground border-border hover:bg-muted'
                }`}
                title="ページのカテゴリを設定"
              >
                <FolderTree className="size-3.5 text-amber-500 shrink-0" />
                <span className="hidden lg:inline">カテゴリ</span>
                {pageCategories.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                    {pageCategories.length}
                  </span>
                )}
              </button>

              {categoryMenuOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-2rem)] p-4 bg-card text-card-foreground border border-border rounded-2xl shadow-2xl space-y-3 animate-in fade-in-0 zoom-in-95 duration-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <FolderTree className="size-4 text-amber-500" />
                      <h4 className="font-bold text-xs">ページのカテゴリ設定</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCategoryMenuOpen(false)}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    コンテンツ内に <code className="font-mono text-[10px]">[[Category:...]]</code> を書かなくても、ここで安全にカテゴリを割り当て・保持できます。
                  </p>

                  {/* 現在のカテゴリチップ */}
                  {pageCategories.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {pageCategories.map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70"
                        >
                          <FolderTree className="size-3 text-amber-500" />
                          {cat}
                          <button
                            type="button"
                            onClick={() => handleRemovePageCategory(cat)}
                            className="ml-0.5 hover:text-rose-500 cursor-pointer"
                            title="カテゴリを解除"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground italic py-1">
                      カテゴリはまだ割り当てられていません
                    </div>
                  )}

                  {/* 新規追加 */}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={categoryInput}
                      onChange={(e) => setCategoryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddPageCategory();
                        }
                      }}
                      placeholder="カテゴリ名を入力してEnter..."
                      className="flex-1 text-xs px-2.5 py-1.5 bg-muted/50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddPageCategory()}
                      disabled={!categoryInput.trim()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      追加
                    </button>
                  </div>

                  {/* 既存カテゴリ候補 */}
                  {siteCategories.length > 0 && (
                    <div className="pt-2 border-t border-border space-y-1.5">
                      <span className="text-[10px] font-semibold text-muted-foreground block">
                        サイト内の既存カテゴリから選択:
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                        {siteCategories.map((c) => {
                          const catName = String(c?.name || c?.category_name || '').trim();
                          if (!catName) return null;
                          const isAssigned = pageCategories.some(
                            (item) => item.toLowerCase() === catName.toLowerCase()
                          );
                          return (
                            <button
                              key={catName}
                              type="button"
                              onClick={() =>
                                isAssigned
                                  ? handleRemovePageCategory(catName)
                                  : handleAddPageCategory(catName)
                              }
                              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                                isAssigned
                                  ? 'bg-amber-500 text-white border-amber-500 font-semibold'
                                  : 'bg-muted/40 text-muted-foreground border-border hover:border-amber-400 hover:text-foreground'
                              }`}
                            >
                              {isAssigned ? '✓ ' : '+ '}
                              {catName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* [md以上] コメント ドロワー開閉ボタン */}
            <button
              type="button"
              onClick={() => setCommentsOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors cursor-pointer relative whitespace-nowrap shrink-0"
              title="コメント & フィードバックを開く"
            >
              <MessageSquare className="size-3.5 shrink-0" />
              <span className="hidden lg:inline">コメント</span>
              {commentList.length > 0 && (
                <span className="size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center -mr-1">
                  {commentList.length}
                </span>
              )}
            </button>

            {/* [md以上] 履歴 (History) ボタン */}
            <button
              type="button"
              onClick={() => {
                setSelectedVersion(null);
                setHistoryOpen(true);
              }}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="変更履歴と差分を表示"
            >
              <HistoryIcon className="size-3.5 shrink-0" />
              <span className="hidden lg:inline">履歴</span>
            </button>

            {/* [xl以上] メディア一覧ボタン */}
            <button
              type="button"
              onClick={() => setMediaLibraryOpen(true)}
              className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="サイトのメディア一覧を開く"
            >
              <Images className="size-3.5 shrink-0" />
              <span>メディア</span>
            </button>

            {/* [xl以上] MDファイル読み込みボタン */}
            <label
              className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="手元の .md ファイルを読み込んでエディタに反映"
            >
              <UploadCloud className="size-3.5 shrink-0" />
              <span>MD読込</span>
              <input
                type="file"
                accept=".md,.markdown,.txt"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    await handleMdFileSelect(file);
                  }
                  e.target.value = '';
                }}
              />
            </label>

            {/* [xl以上] 公開プレビューリンク */}
            {publicUrl && (
              <Link
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors whitespace-nowrap shrink-0"
                title="公開ページを別タブで確認"
              >
                <ExternalLink className="size-3.5 shrink-0" />
                <span>公開サイト</span>
              </Link>
            )}

            {/* ビュー切り替えタブ (中〜大画面用: 3分割対応) */}
            <div className="hidden sm:flex border border-border rounded-lg overflow-hidden text-xs bg-muted/30 p-0.5 whitespace-nowrap shrink-0">
              <button
                onClick={() => setTab('edit')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  tab === 'edit'
                    ? 'bg-background shadow-xs text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="編集のみ"
              >
                <FileEdit className="size-3.5 shrink-0" />
                <span className="hidden md:inline">編集</span>
              </button>
              <button
                onClick={() => setTab('split')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  tab === 'split'
                    ? 'bg-background shadow-xs text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="分割プレビュー (小画面では上下分割、大画面では左右分割)"
              >
                <Columns className="size-3.5 shrink-0" />
                <span className="hidden md:inline">分割</span>
              </button>
              <button
                onClick={() => setTab('preview')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  tab === 'preview'
                    ? 'bg-background shadow-xs text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="プレビューのみ"
              >
                <Eye className="size-3.5 shrink-0" />
                <span className="hidden md:inline">プレビュー</span>
              </button>
            </div>

            {/* ビュー切り替えタブ (スマホ小画面用: 超コンパクト2択) */}
            <div className="sm:hidden flex border border-border rounded-lg overflow-hidden text-xs bg-muted/30 p-0.5 whitespace-nowrap shrink-0">
              <button
                onClick={() => setTab('edit')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  tab === 'edit'
                    ? 'bg-background shadow-xs text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="編集モード"
              >
                <FileEdit className="size-3.5 shrink-0" />
                <span>編集</span>
              </button>
              <button
                onClick={() => setTab('preview')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  tab === 'preview'
                    ? 'bg-background shadow-xs text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="プレビューモード"
              >
                <Eye className="size-3.5 shrink-0" />
                <span>表示</span>
              </button>
            </div>

            {/* 保存ボタン */}
            <button
              onClick={handleManualSave}
              disabled={saved || updateMutation.isPending}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg disabled:opacity-40 transition-colors font-medium cursor-pointer whitespace-nowrap shrink-0"
              title="ページを保存 (Ctrl+S / Cmd+S)"
            >
              {updateMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin shrink-0" />
              ) : (
                <Save className="size-3.5 shrink-0" />
              )}
              <span className="hidden xs:inline">保存</span>
            </button>

            {/* 公開ボタン */}
            <button
              onClick={() =>
                publishMutation.mutate(page?.status === 'published' ? 'draft' : 'published')
              }
              disabled={publishMutation.isPending}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                page?.status === 'published'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground'
              }`}
              title={page?.status === 'published' ? '下書きに戻す' : '一般に公開する'}
            >
              {publishMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin shrink-0" />
              ) : page?.status === 'published' ? (
                <>
                  <Check className="size-3.5 shrink-0" />
                  <span className="hidden xs:inline">公開中</span>
                </>
              ) : (
                <>
                  <Send className="size-3.5 shrink-0" />
                  <span className="hidden xs:inline">公開</span>
                </>
              )}
            </button>

            {/* [xl未満] レスポンシブ「その他」ドロップダウンメニュー */}
            <div className="relative xl:hidden" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className={`p-1.5 sm:p-2 rounded-lg border transition-colors cursor-pointer relative shrink-0 ${
                  moreMenuOpen
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title="その他の編集メニュー & 設定"
                aria-label="その他メニュー"
              >
                <MoreHorizontal className="size-4" />
                {(pageCategories.length > 0 || commentList.length > 0) && (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500 ring-2 ring-background" />
                )}
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-72 max-w-[calc(100vw-2rem)] bg-card text-card-foreground border border-border rounded-2xl shadow-2xl py-2 animate-in fade-in-0 zoom-in-95 duration-100 text-xs divide-y divide-border">
                  {/* 分割プレビュー切り替え (スマホで分割を見たい場合) */}
                  <div className="px-3 py-1.5 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      表示レイアウト
                    </p>
                    <div className="grid grid-cols-3 gap-1 bg-muted/40 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setTab('edit');
                          setMoreMenuOpen(false);
                        }}
                        className={`py-1 rounded-lg text-center font-medium transition-colors cursor-pointer ${
                          tab === 'edit'
                            ? 'bg-background shadow-xs text-foreground font-bold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        編集のみ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTab('split');
                          setMoreMenuOpen(false);
                        }}
                        className={`py-1 rounded-lg text-center font-medium transition-colors cursor-pointer ${
                          tab === 'split'
                            ? 'bg-background shadow-xs text-foreground font-bold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        分割
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTab('preview');
                          setMoreMenuOpen(false);
                        }}
                        className={`py-1 rounded-lg text-center font-medium transition-colors cursor-pointer ${
                          tab === 'preview'
                            ? 'bg-background shadow-xs text-foreground font-bold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        プレビュー
                      </button>
                    </div>
                  </div>

                  {/* ツールメニュー項目 */}
                  <div className="py-1">
                    {/* カテゴリ設定 */}
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setCategoryMenuOpen(true);
                      }}
                      className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <FolderTree className="size-4 text-amber-500" />
                        <span>カテゴリ設定</span>
                      </div>
                      {pageCategories.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
                          {pageCategories.length}個設定済み
                        </span>
                      )}
                    </button>

                    {/* コメント */}
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setCommentsOpen(true);
                      }}
                      className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <MessageSquare className="size-4 text-blue-500" />
                        <span>コメント & フィードバック</span>
                      </div>
                      {commentList.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[10px]">
                          {commentList.length}件
                        </span>
                      )}
                    </button>

                    {/* 変更履歴 */}
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setSelectedVersion(null);
                        setHistoryOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                    >
                      <HistoryIcon className="size-4 text-indigo-500" />
                      <span>変更履歴と差分</span>
                    </button>

                    {/* メディア一覧 */}
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setMediaLibraryOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                    >
                      <Images className="size-4 text-emerald-500" />
                      <span>メディアライブラリ</span>
                    </button>

                    {/* Markdownファイル読み込み */}
                    <label className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-muted text-foreground transition-colors text-left cursor-pointer">
                      <UploadCloud className="size-4 text-sky-500" />
                      <span>MDファイルを読み込む</span>
                      <input
                        type="file"
                        accept=".md,.markdown,.txt"
                        className="hidden"
                        onChange={async (e) => {
                          setMoreMenuOpen(false);
                          const file = e.target.files?.[0];
                          if (file) {
                            await handleMdFileSelect(file);
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  {/* キーバインド設定 */}
                  <div className="px-3.5 py-2 space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal className="size-3" />
                      <span>エディタ操作モード</span>
                    </p>
                    <div className="grid grid-cols-3 gap-1 bg-muted/40 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => handleToggleKeybinding('standard')}
                        className={`py-1 rounded-lg text-center font-medium transition-colors cursor-pointer ${
                          keybinding === 'standard'
                            ? 'bg-background shadow-xs text-foreground font-bold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        標準
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleKeybinding('vim')}
                        className={`py-1 rounded-lg text-center font-medium transition-colors cursor-pointer ${
                          keybinding === 'vim'
                            ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Vim
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleKeybinding('nano')}
                        className={`py-1 rounded-lg text-center font-medium transition-colors cursor-pointer ${
                          keybinding === 'nano'
                            ? 'bg-emerald-600 text-white shadow-xs font-bold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        nano
                      </button>
                    </div>
                  </div>

                  {/* 公開リンク & コラボレーター情報 */}
                  <div className="py-1">
                    {publicUrl && (
                      <Link
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMoreMenuOpen(false)}
                        className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-muted text-foreground transition-colors text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          <ExternalLink className="size-4 text-slate-400" />
                          <span>公開ページを確認</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">別タブ</span>
                      </Link>
                    )}

                    {collaborators.length > 1 && (
                      <div className="px-3.5 py-2 flex items-center justify-between text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>同時編集中</span>
                        </div>
                        <span className="font-semibold text-foreground">
                          {collaborators.length} 人
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Markdown 書式ツールバー (水平スワイプ・スクロール対応で画面圧迫とレイアウト崩れを完全に防止) */}
        {(tab === 'edit' || tab === 'split') && (
          <div className="relative z-20 flex items-center gap-1 px-2.5 sm:px-4 py-1.5 border-b border-border bg-muted/20 text-xs overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden whitespace-nowrap scroll-smooth">
            {/* スラッシュコマンド トリガーヒント */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                insertText('/');
                setSlashFilter('');
                setSlashMenuOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium cursor-pointer shrink-0"
              title="スラッシュコマンド (/ を入力)"
            >
              <Sparkles className="size-3.5 shrink-0" />
              <span>/ コマンド</span>
            </button>

            <div className="h-4 w-px bg-border mx-1 shrink-0" />

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('**', '**', '太字テキスト')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="太字 (Bold)"
              >
                <Bold className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('*', '*', '斜体テキスト')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="斜体 (Italic)"
              >
                <Italic className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('<u>', '</u>', '下線テキスト')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="下線 (Underline)"
              >
                <Underline className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('~~', '~~', '打ち消しテキスト')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="取り消し線"
              >
                <Strikethrough className="size-4 shrink-0" />
              </button>
            </div>

            {/* テキストカラー & ハイライト (2D HSVポインタ + RGB/HEX カラーピッカー) */}
            <div className="relative shrink-0" ref={colorPickerRef}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (viewRef.current) {
                    lastSelectionRef.current = {
                      from: viewRef.current.state.selection.main.from,
                      to: viewRef.current.state.selection.main.to,
                    };
                  }
                }}
                onClick={() => setColorPickerOpen(!colorPickerOpen)}
                className={`px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  colorPickerOpen ? 'bg-muted text-foreground ring-1 ring-border' : ''
                }`}
                title="選択箇所の文字色・背景色を自由に設定"
              >
                <Palette className="size-4 text-primary shrink-0" />
                <span
                  className="size-3 rounded-full border border-border shadow-2xs shrink-0"
                  style={{ backgroundColor: customColor }}
                />
              </button>

              {colorPickerOpen && (
                <div className="absolute left-0 sm:left-auto top-full mt-2 z-50 w-72 max-w-[calc(100vw-2rem)] p-3.5 bg-card text-card-foreground border border-border rounded-2xl shadow-2xl space-y-3 animate-in fade-in-0 zoom-in-95 duration-100 select-none">
                  {/* モード切替 (文字色 / 背景ハイライト) & リセット */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-1 bg-muted/60 p-0.5 rounded-xl border border-border text-[11px] font-semibold">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setColorMode('text')}
                        className={`flex-1 py-1 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          colorMode === 'text'
                            ? 'bg-background text-foreground shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Palette className="size-3 text-primary" />
                        <span>文字色</span>
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setColorMode('bg')}
                        className={`flex-1 py-1 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                          colorMode === 'bg'
                            ? 'bg-background text-foreground shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Highlighter className="size-3 text-amber-500" />
                        <span>背景</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={clearColorSyntax}
                      className="text-[10px] text-muted-foreground hover:text-rose-500 underline px-1 cursor-pointer shrink-0"
                      title="選択箇所の色指定を解除"
                    >
                      色解除
                    </button>
                  </div>

                  {/* 2D Saturation / Value ポインタ移動カラーピッカー */}
                  <div className="space-y-2">
                    <div
                      ref={svBoxRef}
                      onMouseDown={handleSvPointerDown}
                      className="relative w-full h-36 rounded-xl overflow-hidden cursor-crosshair border border-border shadow-inner"
                      style={{
                        backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                        backgroundImage:
                          'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
                      }}
                    >
                      {/* ポインタ */}
                      <div
                        className="absolute size-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow-md ring-1 ring-black/40 pointer-events-none transition-transform duration-75"
                        style={{
                          left: `${hsv.s}%`,
                          top: `${100 - hsv.v}%`,
                          backgroundColor: customColor,
                        }}
                      />
                    </div>

                    {/* 色相 (Hue) スライダーバー */}
                    <div
                      ref={hueBarRef}
                      onMouseDown={handleHuePointerDown}
                      className="relative w-full h-3.5 rounded-full cursor-pointer border border-border/60 shadow-inner"
                      style={{
                        background:
                          'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                      }}
                    >
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -ml-2 size-4 rounded-full bg-white border-2 border-slate-700 shadow pointer-events-none"
                        style={{ left: `${(hsv.h / 360) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* RGB & HEX 数値入力 + プレビュー */}
                  <div className="space-y-2 pt-1 border-t border-border">
                    <div className="grid grid-cols-4 gap-1.5 items-end">
                      <div>
                        <label className="block text-[9px] font-mono text-muted-foreground mb-0.5 text-center">
                          R
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={255}
                          value={rgbInput.r}
                          onChange={(e) =>
                            updateColorFromRgb(Number(e.target.value), rgbInput.g, rgbInput.b)
                          }
                          className="w-full h-6 px-1 text-[11px] font-mono text-center bg-muted/50 border border-border rounded text-foreground"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-muted-foreground mb-0.5 text-center">
                          G
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={255}
                          value={rgbInput.g}
                          onChange={(e) =>
                            updateColorFromRgb(rgbInput.r, Number(e.target.value), rgbInput.b)
                          }
                          className="w-full h-6 px-1 text-[11px] font-mono text-center bg-muted/50 border border-border rounded text-foreground"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-muted-foreground mb-0.5 text-center">
                          B
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={255}
                          value={rgbInput.b}
                          onChange={(e) =>
                            updateColorFromRgb(rgbInput.r, rgbInput.g, Number(e.target.value))
                          }
                          className="w-full h-6 px-1 text-[11px] font-mono text-center bg-muted/50 border border-border rounded text-foreground"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-muted-foreground mb-0.5 text-center">
                          HEX
                        </label>
                        <input
                          type="text"
                          value={customColor}
                          onChange={(e) => updateColorFromHex(e.target.value)}
                          className="w-full h-6 px-1 text-[10px] font-mono text-center bg-muted/50 border border-border rounded text-foreground"
                        />
                      </div>
                    </div>

                    {/* プレビュー & 適用ボタン */}
                    <div className="flex items-center gap-2 pt-1">
                      <div
                        className="px-2.5 py-1 rounded-lg border border-border text-xs font-bold shrink-0"
                        style={
                          colorMode === 'text'
                            ? { color: customColor }
                            : { backgroundColor: customColor, color: '#0f172a' }
                        }
                      >
                        Aa
                      </div>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          colorMode === 'text'
                            ? applyTextColor(customColor)
                            : applyBgHighlight(customColor)
                        }
                        className="flex-1 py-1.5 px-3 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 shadow-xs transition-colors cursor-pointer"
                      >
                        {colorMode === 'text' ? '文字色を適用' : '背景色を適用'}
                      </button>
                    </div>
                  </div>

                  {/* クイックプリセットスウォッチ */}
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
                      <span>プリセット</span>
                      {colorMode === 'bg' && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            wrapText('==', '==', 'ハイライトテキスト');
                            setColorPickerOpen(false);
                          }}
                          className="text-[10px] text-primary hover:underline cursor-pointer font-medium"
                        >
                          == 標準マーカー ==
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-8 gap-1.5">
                      {(colorMode === 'text'
                        ? [
                            { name: '赤', color: '#ef4444' },
                            { name: 'オレンジ', color: '#f97316' },
                            { name: 'アンバー', color: '#f59e0b' },
                            { name: 'エメラルド', color: '#10b981' },
                            { name: 'シアン', color: '#06b6d4' },
                            { name: 'ブルー', color: '#3b82f6' },
                            { name: 'インディゴ', color: '#6366f1' },
                            { name: 'バイオレット', color: '#8b5cf6' },
                            { name: 'ピンク', color: '#ec4899' },
                            { name: 'ローズ', color: '#f43f5e' },
                            { name: 'ライム', color: '#84cc16' },
                            { name: 'ティール', color: '#14b8a6' },
                            { name: 'スカイ', color: '#0ea5e9' },
                            { name: 'スレート', color: '#64748b' },
                            { name: 'ダーク', color: '#1e293b' },
                            { name: 'ホワイト', color: '#ffffff' },
                          ]
                        : [
                            { name: 'イエロー', color: '#fef08a' },
                            { name: 'グリーン', color: '#bbf7d0' },
                            { name: 'ブルー', color: '#bfdbfe' },
                            { name: 'ピンク', color: '#fbcfe8' },
                            { name: 'オレンジ', color: '#fed7aa' },
                            { name: 'パープル', color: '#e9d5ff' },
                            { name: 'シアン', color: '#a5f3fc' },
                            { name: 'ローズ', color: '#fecdd3' },
                          ]
                      ).map((c) => (
                        <button
                          key={c.color}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            colorMode === 'text'
                              ? applyTextColor(c.color)
                              : applyBgHighlight(c.color)
                          }
                          className="size-5 rounded-full border border-border/60 transition-transform hover:scale-110 cursor-pointer shadow-2xs"
                          style={{ backgroundColor: c.color }}
                          title={`${c.name} (${c.color})`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-border mx-1 shrink-0" />

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('# ', '', '見出し1')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="大見出し (H1)"
              >
                <Heading1 className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('## ', '', '見出し2')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="中見出し (H2)"
              >
                <Heading2 className="size-4 shrink-0" />
              </button>
            </div>

            <div className="h-4 w-px bg-border mx-1 shrink-0" />

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('- ', '', 'リスト項目')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="箇条書きリスト"
              >
                <List className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('1. ', '', '番号付きリスト')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="番号付きリスト"
              >
                <ListOrdered className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('> ', '', '引用テキスト')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="引用"
              >
                <Quote className="size-4 shrink-0" />
              </button>
            </div>

            <div className="h-4 w-px bg-border mx-1 shrink-0" />

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('```ts\n', '\n```', 'console.log("Hello, Klados!");')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="コードブロック"
              >
                <Code className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleOpenTableMaker();
                }}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="テーブルメーカー"
              >
                <TableIcon className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('[', '](https://example.com)', 'リンクテキスト')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="外部リンク"
              >
                <ExternalLink className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleOpenLinkModal();
                }}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="内部リンク挿入 ([[ページ名]])"
              >
                <LinkIcon className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapText('$$ ', ' $$', 'E = mc^2')}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                title="KaTeX数式"
              >
                <Sigma className="size-4 shrink-0" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCategoryMenuOpen(true)}
                className="p-1.5 rounded hover:bg-muted text-amber-500 hover:text-amber-600 cursor-pointer shrink-0"
                title="カテゴリ設定を開く"
              >
                <FolderTree className="size-4 shrink-0" />
              </button>
            </div>

            <div className="h-4 w-px bg-border mx-1 shrink-0" />

            {/* 画像アップロード & メディア挿入グループ */}
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (viewRef.current) {
                    lastSelectionRef.current = {
                      from: viewRef.current.state.selection.main.from,
                      to: viewRef.current.state.selection.main.to,
                    };
                  }
                }}
                onClick={() => {
                  if (viewRef.current) {
                    lastSelectionRef.current = {
                      from: viewRef.current.state.selection.main.from,
                      to: viewRef.current.state.selection.main.to,
                    };
                  }
                  fileInputRef.current?.click();
                }}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer font-medium disabled:opacity-50 shrink-0"
                title="画像を直接アップロードして挿入"
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin text-blue-500 shrink-0" />
                ) : (
                  <ImageIcon className="size-4 shrink-0" />
                )}
                <span className="hidden sm:inline">{isUploading ? 'アップロード中...' : '画像アップロード'}</span>
                <span className="sm:hidden">{isUploading ? '...' : '画像'}</span>
              </button>

              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (viewRef.current) {
                    lastSelectionRef.current = {
                      from: viewRef.current.state.selection.main.from,
                      to: viewRef.current.state.selection.main.to,
                    };
                  }
                }}
                onClick={() => {
                  if (viewRef.current) {
                    lastSelectionRef.current = {
                      from: viewRef.current.state.selection.main.from,
                      to: viewRef.current.state.selection.main.to,
                    };
                  }
                  setMediaLibraryOpen(true);
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors cursor-pointer font-medium shrink-0"
                title="アップロード済みメディアから選択して挿入"
              >
                <Images className="size-3.5 shrink-0" />
                <span className="hidden sm:inline">メディアから挿入</span>
                <span className="sm:hidden">メディア</span>
              </button>

              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (viewRef.current) {
                    lastSelectionRef.current = {
                      from: viewRef.current.state.selection.main.from,
                      to: viewRef.current.state.selection.main.to,
                    };
                  }
                }}
                onClick={() => handleOpenImageOptionsModal()}
                className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-medium shrink-0"
                title="画像のサイズ・配置・キャプションを設定"
              >
                <Settings2 className="size-3.5 text-primary shrink-0" />
                <span className="hidden sm:inline">画像サイズ・配置</span>
                <span className="sm:hidden">配置設定</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* エディタ & プレビュー本体 (画面サイズに応じた縦/横分割のフレキシブル配置) */}
      <div
        className={`flex-1 flex ${
          tab === 'split' ? 'flex-col md:flex-row' : 'flex-col'
        } overflow-hidden relative`}
        onKeyDown={handleEditorKeyDown}
      >
        {/* エディタ領域 */}
        {(tab === 'edit' || tab === 'split') && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={handlePaste}
            className={`${
              tab === 'split'
                ? 'w-full md:w-1/2 h-1/2 md:h-full border-b md:border-b-0 md:border-r border-border'
                : 'w-full h-full'
            } flex flex-col overflow-hidden relative`}
          >
            {isDragging && (
              <div className="absolute inset-0 z-20 bg-blue-500/10 border-2 border-dashed border-blue-500 flex flex-col items-center justify-center pointer-events-none backdrop-blur-[1px]">
                <ImageIcon className="size-10 text-blue-500 animate-bounce mb-2" />
                <p className="font-semibold text-blue-600 dark:text-blue-400">
                  ここに画像をドロップしてアップロード
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPEG, GIF, WebP, SVG に対応
                </p>
              </div>
            )}

            {/* スラッシュコマンド ポップアップ メニュー */}
            {slashMenuOpen && filteredCommands.length > 0 && (
              <div
                ref={slashMenuRef}
                className="absolute top-12 left-10 z-30 w-72 bg-card text-card-foreground border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
              >
                <div className="p-2 border-b border-border bg-muted/20 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                  <span>スラッシュコマンド (/ を入力)</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[9px] font-mono">
                    ESCで閉じる
                  </kbd>
                </div>
                <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
                  {filteredCommands.map((cmd, idx) => {
                    const Icon = cmd.icon;
                    const isSelected = idx === slashSelectedIndex;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        onClick={() => executeSlashCommand(cmd)}
                        onMouseEnter={() => setSlashSelectedIndex(idx)}
                        className={`w-full text-left p-2 rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer ${
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <div
                          className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          <Icon className="size-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs leading-tight">{cmd.label}</p>
                          <p
                            className={`text-[10px] truncate leading-tight ${
                              isSelected ? 'text-white/80' : 'text-muted-foreground'
                            }`}
                          >
                            {cmd.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Nano ヘッダー */}
            {keybinding === 'nano' && (
              <div className="px-4 py-1.5 bg-slate-900 text-slate-200 dark:bg-black border-b border-slate-800 font-mono text-xs flex items-center justify-between select-none">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Terminal className="size-3.5" />
                  <span>GNU nano 7.2</span>
                </span>
                <span className="font-medium text-slate-300 truncate max-w-[200px] sm:max-w-xs">
                  {page?.slug ? `${page.slug}.md` : '新規ページ.md'}
                </span>
                <span className="text-[11px]">
                  {saved ? (
                    <span className="text-slate-400">未変更</span>
                  ) : (
                    <span className="text-amber-400 font-bold">[ 変更あり ]</span>
                  )}
                </span>
              </div>
            )}

            <div
              ref={editorRef}
              className="flex-1 overflow-auto focus:outline-none [&_.cm-editor]:h-full [&_.cm-editor]:text-base [&_.cm-scroller]:font-mono [&_.cm-scroller]:min-h-full [&_.cm-content]:min-h-full [&_.cm-content]:p-6"
            />

            {/* Vim モード インジケーター */}
            {keybinding === 'vim' && (
              <div className="px-4 py-1 border-t border-border bg-muted/40 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-bold text-[10px]">
                    VIM ON
                  </span>
                  <span>Esc: Normal | i: Insert | :w: 保存</span>
                </div>
                <span>Vim エミュレーション有効</span>
              </div>
            )}

            {/* nano コマンドバー & ショートカット */}
            {keybinding === 'nano' && (
              <div className="bg-slate-900 text-slate-100 dark:bg-black border-t border-slate-800 font-mono select-none">
                {/* ステータス / プロンプト行 */}
                <div className="px-3 py-1 bg-slate-950 border-b border-slate-800 text-xs flex items-center justify-between min-h-[30px]">
                  {nanoPrompt?.type === 'search' ? (
                    <div className="flex items-center gap-2 w-full text-slate-200">
                      <span className="text-emerald-400 font-semibold shrink-0">検索 (Where Is):</span>
                      <input
                        type="text"
                        autoFocus
                        value={nanoPrompt.value}
                        onChange={(e) => setNanoPrompt({ ...nanoPrompt, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            executeNanoSearchNext(nanoPrompt.value);
                          } else if (e.key === 'Escape') {
                            setNanoPrompt(null);
                            viewRef.current?.focus();
                          }
                        }}
                        placeholder="検索文字列..."
                        className="bg-slate-800 text-white text-xs px-2 py-0.5 rounded border border-slate-700 outline-none flex-1 max-w-sm"
                      />
                      <button
                        type="button"
                        onClick={() => executeNanoSearchNext(nanoPrompt.value)}
                        className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] cursor-pointer"
                      >
                        次へ (Enter)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNanoPrompt(null);
                          viewRef.current?.focus();
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                      >
                        取消 (Esc)
                      </button>
                    </div>
                  ) : nanoPrompt?.type === 'goto' ? (
                    <div className="flex items-center gap-2 w-full text-slate-200">
                      <span className="text-emerald-400 font-semibold shrink-0">行番号を入力:</span>
                      <input
                        type="number"
                        autoFocus
                        value={nanoPrompt.value}
                        onChange={(e) => setNanoPrompt({ ...nanoPrompt, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            executeNanoGoToLine(parseInt(nanoPrompt.value, 10));
                          } else if (e.key === 'Escape') {
                            setNanoPrompt(null);
                            viewRef.current?.focus();
                          }
                        }}
                        placeholder="1"
                        className="bg-slate-800 text-white text-xs px-2 py-0.5 rounded border border-slate-700 outline-none w-24"
                      />
                      <button
                        type="button"
                        onClick={() => executeNanoGoToLine(parseInt(nanoPrompt.value, 10))}
                        className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] cursor-pointer"
                      >
                        移動 (Enter)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNanoPrompt(null);
                          viewRef.current?.focus();
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                      >
                        取消 (Esc)
                      </button>
                    </div>
                  ) : nanoPrompt?.type === 'replace' ? (
                    <div className="flex items-center gap-2 w-full text-slate-200 flex-wrap">
                      <span className="text-emerald-400 font-semibold shrink-0">置換元:</span>
                      <input
                        type="text"
                        autoFocus
                        value={nanoPrompt.value}
                        onChange={(e) => setNanoPrompt({ ...nanoPrompt, value: e.target.value })}
                        placeholder="検索..."
                        className="bg-slate-800 text-white text-xs px-2 py-0.5 rounded border border-slate-700 outline-none w-32"
                      />
                      <span className="text-emerald-400 font-semibold shrink-0">置換先:</span>
                      <input
                        type="text"
                        value={nanoPrompt.replaceValue || ''}
                        onChange={(e) => setNanoPrompt({ ...nanoPrompt, replaceValue: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            executeNanoReplaceOne(nanoPrompt.value, nanoPrompt.replaceValue || '');
                          } else if (e.key === 'Escape') {
                            setNanoPrompt(null);
                            viewRef.current?.focus();
                          }
                        }}
                        placeholder="置換後..."
                        className="bg-slate-800 text-white text-xs px-2 py-0.5 rounded border border-slate-700 outline-none w-32"
                      />
                      <button
                        type="button"
                        onClick={() => executeNanoReplaceOne(nanoPrompt.value, nanoPrompt.replaceValue || '')}
                        className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] cursor-pointer"
                      >
                        1件置換
                      </button>
                      <button
                        type="button"
                        onClick={() => executeNanoReplaceAll(nanoPrompt.value, nanoPrompt.replaceValue || '')}
                        className="px-2 py-0.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded text-[11px] cursor-pointer"
                      >
                        全て置換
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNanoPrompt(null);
                          viewRef.current?.focus();
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                  ) : nanoPrompt?.type === 'exit' ? (
                    <div className="flex items-center gap-2 w-full text-slate-200">
                      <span className="text-amber-400 font-semibold shrink-0">
                        変更を保存して終了しますか？
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          handleManualSave();
                          const siteId = page?.site_id || page?.siteId;
                          if (siteId) router.push(`/dashboard/sites/${siteId}`);
                        }}
                        className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] font-bold cursor-pointer"
                      >
                        保存して終了 (Y)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const siteId = page?.site_id || page?.siteId;
                          if (siteId) router.push(`/dashboard/sites/${siteId}`);
                        }}
                        className="px-2 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded text-[11px] cursor-pointer"
                      >
                        破棄して終了 (N)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNanoPrompt(null);
                          viewRef.current?.focus();
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                      >
                        キャンセル (Esc)
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-emerald-400 font-medium truncate">
                        {nanoStatusMessage}
                      </span>
                      <span className="text-[10px] text-slate-400 hidden sm:inline">
                        ^G: ヘルプ | ^O: 保存 | ^X: 終了
                      </span>
                    </>
                  )}
                </div>

                {/* 2行ショートカットキーバー */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-2 gap-y-1 p-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setNanoHelpOpen(true)}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^G</span>
                    <span className="text-slate-300 text-[11px] truncate">ヘルプ</span>
                  </button>
                  <button
                    type="button"
                    onClick={executeNanoWriteOut}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^O</span>
                    <span className="text-slate-300 text-[11px] truncate">保存</span>
                  </button>
                  <button
                    type="button"
                    onClick={openNanoSearch}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^W</span>
                    <span className="text-slate-300 text-[11px] truncate">検索</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (viewRef.current) executeNanoCut(viewRef.current);
                    }}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^K</span>
                    <span className="text-slate-300 text-[11px] truncate">行切取</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (viewRef.current) executeNanoJustify(viewRef.current);
                    }}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^J</span>
                    <span className="text-slate-300 text-[11px] truncate">段落整形</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (viewRef.current) executeNanoCurPos(viewRef.current);
                    }}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^C</span>
                    <span className="text-slate-300 text-[11px] truncate">位置表示</span>
                  </button>

                  <button
                    type="button"
                    onClick={executeNanoExit}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^X</span>
                    <span className="text-slate-300 text-[11px] truncate">終了</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaLibraryOpen(true)}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^R</span>
                    <span className="text-slate-300 text-[11px] truncate">メディア</span>
                  </button>
                  <button
                    type="button"
                    onClick={openNanoReplace}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^\</span>
                    <span className="text-slate-300 text-[11px] truncate">置換</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (viewRef.current) executeNanoPaste(viewRef.current);
                    }}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^U</span>
                    <span className="text-slate-300 text-[11px] truncate">貼付け</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (viewRef.current) executeNanoPrevPage(viewRef.current);
                    }}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^Y</span>
                    <span className="text-slate-300 text-[11px] truncate">前頁</span>
                  </button>
                  <button
                    type="button"
                    onClick={openNanoGoto}
                    className="flex items-center text-left py-0.5 px-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span className="bg-slate-100 text-slate-900 font-bold px-1 rounded text-[10px] mr-1.5 shrink-0">^_</span>
                    <span className="text-slate-300 text-[11px] truncate">指定行</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* プレビュー領域 (小画面では上下分割の下半分、大画面では左右分割の右半分) */}
        {(tab === 'preview' || tab === 'split') && (
          <div
            className={`${
              tab === 'split'
                ? 'w-full md:w-1/2 h-1/2 md:h-full'
                : 'w-full h-full'
            } overflow-auto p-4 sm:p-6 md:p-8 bg-card/40`}
          >
            <div className="max-w-3xl mx-auto">
              {preview || pageCategories.length > 0 ? (
                <>
                  {preview && <MarkdownRenderer content={preview} siteSlug={site?.slug} />}
                  <CategoryBox
                    categories={getPageCategories({
                      title: page?.title,
                      slug: page?.slug,
                      content: preview,
                      categories: pageCategories,
                    })}
                    siteSlug={site?.slug || ''}
                    primaryColor={site?.primary_color || '#3b82f6'}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                  <FileEdit className="size-12 stroke-[1.2] mb-3 text-muted-foreground/50" />
                  <p className="font-medium text-sm">プレビューするコンテンツがありません</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    左側のエディタにMarkdownを入力するか、画像を挿入してください
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* コメント ドロワー */}
      <CommentsDrawer
        pageId={id}
        pageTitle={page?.title}
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        currentUser={{
          name: currentUser.name,
          avatar: currentUser.avatar,
        }}
      />

      {/* 内部リンク挿入モーダル */}
      <InternalLinkModal
        isOpen={internalLinkModalOpen}
        onClose={() => setInternalLinkModalOpen(false)}
        siteId={page?.site_id}
        currentPageId={id}
        initialSelectedText={linkInitialText}
        onInsertLink={(syntax) => insertText(syntax)}
      />

      {/* Markdownテーブルメーカー モーダル */}
      <TableMakerModal
        isOpen={tableMakerOpen}
        onClose={() => setTableMakerOpen(false)}
        initialTable={editingTableData}
        onInsertTable={(markdownTable, replaceRange) => {
          if (replaceRange) {
            insertText(markdownTable, undefined, replaceRange);
          } else {
            insertText(`\n${markdownTable}\n`);
          }
        }}
      />

      {/* バージョン履歴 & 差分表示モーダル */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="bg-card text-card-foreground w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <FileClock className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-none">バージョン履歴 & 差分比較</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    過去の自動保存・編集履歴を確認し、現在のドキュメントとの差分を比較・復元できます
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* モーダルコンテンツ */}
            <div className="flex-1 flex overflow-hidden">
              {/* バージョンリスト サイドバー */}
              <div className="w-72 sm:w-80 border-r border-border flex flex-col bg-muted/10 shrink-0">
                <div className="p-3 border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground flex items-center justify-between">
                  <span>保存履歴一覧 ({versions?.length || 0})</span>
                  <span className="text-[10px] text-muted-foreground/70">最大50件</span>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-border/60">
                  {isVersionsLoading ? (
                    <div className="p-8 flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <Loader2 className="size-5 animate-spin text-primary" />
                      <span className="text-xs">履歴を読み込み中...</span>
                    </div>
                  ) : !versions || versions.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-xs">
                      まだ過去のバージョン履歴がありません。
                      <br />
                      エディタで保存を行うと自動的に履歴が作成されます。
                    </div>
                  ) : (
                    versions.map((ver) => {
                      const isSelected = selectedVersion?.id === ver.id;
                      const date = new Date(ver.created_at);
                      const formattedTime = date.toLocaleString('ja-JP', {
                        year: 'numeric',
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <button
                          key={ver.id}
                          type="button"
                          onClick={() => setSelectedVersion(ver)}
                          className={`w-full text-left p-3.5 transition-all flex flex-col gap-1 cursor-pointer ${
                            isSelected
                              ? 'bg-primary/10 border-l-4 border-l-primary text-foreground'
                              : 'hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-mono">
                                v{ver.version}
                              </span>
                              <span>バージョン {ver.version}</span>
                            </span>
                            {isSelected && (
                              <span className="size-2 rounded-full bg-primary animate-pulse" />
                            )}
                          </div>
                          {ver.user && (
                            <div className="flex items-center gap-1 text-[11px] font-medium text-foreground/80">
                              <span>編集者: {ver.user.display_name || ver.user.username}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="size-3" />
                            <span>{formattedTime}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground/80 truncate mt-0.5">
                            {ver.content ? `${ver.content.slice(0, 50)}...` : '(空のドキュメント)'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 差分ビュー / プレビュー本体 */}
              <div className="flex-1 flex flex-col overflow-hidden p-4 bg-background">
                {selectedVersion ? (
                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                    {/* 操作バー */}
                    <div className="flex items-center justify-between pb-3 mb-2 border-b border-border">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">
                            バージョン v{selectedVersion.version} と現在の最新ドキュメントの差分
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>
                            作成日時: {new Date(selectedVersion.created_at).toLocaleString('ja-JP')}
                          </span>
                          {selectedVersion.user && (
                            <>
                              <span>•</span>
                              <span className="font-medium text-foreground/80">
                                編集者: {selectedVersion.user.display_name || selectedVersion.user.username}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestoreVersion(selectedVersion)}
                        disabled={isReverting}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        {isReverting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        <span>このバージョンに戻す</span>
                      </button>
                    </div>

                    {/* DiffViewer */}
                    <div className="flex-1 min-h-0">
                      <DiffViewer
                        oldText={selectedVersion.content ?? ''}
                        newText={currentDocContent}
                        oldTitle={`v${selectedVersion.version} (${new Date(
                          selectedVersion.created_at
                        ).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})`}
                        newTitle="現在のドキュメント (最新)"
                        initialMode="side-by-side"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                    <HistoryIcon className="size-12 stroke-[1.2] mb-3 text-muted-foreground/40" />
                    <p className="font-semibold text-sm">
                      左側のリストからバージョンを選択してください
                    </p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      選択したバージョンと現在の内容の差分を比較できます
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* メディアライブラリモーダル */}
      {page?.site_id && (
        <MediaLibraryModal
          isOpen={mediaLibraryOpen}
          onClose={() => setMediaLibraryOpen(false)}
          siteId={page.site_id}
          onSelectImage={(targetRef, filename, item, formattedMarkdown) => {
            const alt = filename.replace(/\.[^/.]+$/, '');
            const targetPos =
              lastSelectionRef.current && lastSelectionRef.current.from > 0
                ? lastSelectionRef.current.from
                : viewRef.current?.state.selection.main.from && viewRef.current.state.selection.main.from > 0
                ? viewRef.current.state.selection.main.from
                : lastSelectionRef.current?.from ?? viewRef.current?.state.doc.length;
            const ref = item?.id ? formatMediaRef(item.id, targetRef) : targetRef;
            const toInsert = formattedMarkdown || `![${alt}](${ref})`;
            insertText(`\n${toInsert}\n`, targetPos);
          }}
        />
      )}

      {/* MediaWiki風 画像サイズ・挿入位置・キャプション設定モーダル */}
      {imageOptionsModal.isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setImageOptionsModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Settings2 className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {imageOptionsModal.replaceRange
                      ? '画像のサイズ・配置・キャプション編集'
                      : 'MediaWiki風 画像オプション挿入'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    MediaWiki互換のサムネイル枠・回り込み配置・サイズ・キャプションを設定します
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImageOptionsModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* 本文 */}
            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              {/* 画像参照元 / メディア選択 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-foreground">
                    画像ID / ファイル名 / URL
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setImageOptionsModal((prev) => ({ ...prev, isOpen: false }));
                      setMediaLibraryOpen(true);
                    }}
                    className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Images className="size-3" />
                    <span>メディア一覧から選択</span>
                  </button>
                </div>
                <div className="flex items-center gap-2.5">
                  {imageOptionsModal.mediaRef && (
                    <img
                      src={resolveMediaUrl(imageOptionsModal.mediaRef)}
                      alt="preview"
                      className="size-10 rounded-lg object-cover border border-border bg-muted shrink-0"
                    />
                  )}
                  <input
                    type="text"
                    value={imageOptionsModal.mediaRef}
                    onChange={(e) =>
                      setImageOptionsModal((prev) => ({ ...prev, mediaRef: e.target.value }))
                    }
                    placeholder="media:UUID または https://..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* キャプション */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground block">
                  キャプション (画像下部の説明文)
                </label>
                <input
                  type="text"
                  value={imageOptionsModal.caption}
                  onChange={(e) =>
                    setImageOptionsModal((prev) => ({ ...prev, caption: e.target.value }))
                  }
                  placeholder="例: 図1: システム全体構成図"
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* 挿入位置・配置 */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground block">
                  挿入位置・テキスト回り込み (Alignment)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'right', label: '右寄せ', sub: '左に文章回り込み', icon: AlignRight },
                      { id: 'center', label: '中央揃え', sub: 'ブロック中央', icon: AlignCenter },
                      { id: 'left', label: '左寄せ', sub: '右に文章回り込み', icon: AlignLeft },
                      { id: 'none', label: '標準', sub: '回り込みなし', icon: Maximize2 },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = imageOptionsModal.align === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setImageOptionsModal((prev) => ({ ...prev, align: opt.id }))
                        }
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          active
                            ? 'border-primary bg-primary/10 text-primary font-semibold'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Icon className="size-4 mb-1" />
                        <span className="text-[11px]">{opt.label}</span>
                        <span className="text-[9px] opacity-75 mt-0.5">{opt.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 表示枠スタイル */}
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground block">
                  表示スタイル (枠)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'thumb',
                        label: 'サムネイル枠 (thumb)',
                        desc: 'MediaWiki標準枠＋キャプション＋拡大アイコン',
                      },
                      {
                        id: 'none',
                        label: '標準カード',
                        desc: '角丸シャドウ＋中央イタリックキャプション',
                      },
                      {
                        id: 'frameless',
                        label: '枠なし (frameless)',
                        desc: 'キャプション非表示・シンプル画像',
                      },
                      {
                        id: 'border',
                        label: '境界線のみ (border)',
                        desc: '細い境界線付き',
                      },
                    ] as const
                  ).map((f) => {
                    const active = imageOptionsModal.frame === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          setImageOptionsModal((prev) => ({ ...prev, frame: f.id }))
                        }
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'border-primary bg-primary/10 text-primary font-semibold'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="text-[11px] font-semibold">{f.label}</div>
                        <div className="text-[10px] opacity-75 mt-0.5">{f.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* サイズ指定 */}
              <div className="space-y-2">
                <label className="font-semibold text-foreground block">サイズ指定</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '自動', value: '' },
                    { label: '小 (200px)', value: '200px' },
                    { label: '標準 (300px)', value: '300px' },
                    { label: '中 (450px)', value: '450px' },
                    { label: '大 (650px)', value: '650px' },
                    { label: '最大 (100%)', value: '100%' },
                  ].map((p) => {
                    const active =
                      imageOptionsModal.width === p.value && !imageOptionsModal.height;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() =>
                          setImageOptionsModal((prev) => ({
                            ...prev,
                            width: p.value,
                            height: '',
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors cursor-pointer ${
                          active
                            ? 'border-primary bg-primary text-primary-foreground font-semibold'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-1">
                      幅 (例: 300px, 50%)
                    </span>
                    <input
                      type="text"
                      value={imageOptionsModal.width}
                      onChange={(e) =>
                        setImageOptionsModal((prev) => ({ ...prev, width: e.target.value }))
                      }
                      placeholder="300px"
                      className="w-full px-2.5 py-1 rounded-lg border border-border bg-background font-mono text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-1">
                      最大高さ (オプション, 例: 200px)
                    </span>
                    <input
                      type="text"
                      value={imageOptionsModal.height}
                      onChange={(e) =>
                        setImageOptionsModal((prev) => ({ ...prev, height: e.target.value }))
                      }
                      placeholder="未指定"
                      className="w-full px-2.5 py-1 rounded-lg border border-border bg-background font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 記法モード & プレビュー */}
              <div className="space-y-1.5 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">出力フォーマット</span>
                  <div className="flex rounded-lg border border-border bg-background p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        setImageOptionsModal((prev) => ({ ...prev, syntaxMode: 'mediawiki' }))
                      }
                      className={`px-2.5 py-0.5 rounded-md cursor-pointer ${
                        imageOptionsModal.syntaxMode === 'mediawiki'
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      MediaWiki [[File:...]]
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setImageOptionsModal((prev) => ({ ...prev, syntaxMode: 'markdown' }))
                      }
                      className={`px-2.5 py-0.5 rounded-md cursor-pointer ${
                        imageOptionsModal.syntaxMode === 'markdown'
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Markdown ![...]
                    </button>
                  </div>
                </div>
                <pre className="p-2.5 rounded-xl bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all border border-slate-800">
                  {buildMediaMarkdown(imageOptionsModal.mediaRef || 'media:サンプル画像ID', {
                    syntaxMode: imageOptionsModal.syntaxMode,
                    frame: imageOptionsModal.frame,
                    align: imageOptionsModal.align,
                    width: imageOptionsModal.width.trim() || undefined,
                    height: imageOptionsModal.height.trim() || undefined,
                    caption: imageOptionsModal.caption.trim() || undefined,
                    alt: imageOptionsModal.alt.trim() || undefined,
                  })}
                </pre>
              </div>
            </div>

            {/* フッター */}
            <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setImageOptionsModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleApplyImageOptions}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
              >
                <Check className="size-3.5" />
                <span>
                  {imageOptionsModal.replaceRange ? '画像設定を更新' : 'エディタに挿入'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GNU nano ヘルプモーダル */}
      {nanoHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden font-mono">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-emerald-400">GNU nano 7.2 ヘルプガイド</h3>
              </div>
              <button
                type="button"
                onClick={() => setNanoHelpOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4 text-xs">
              <p className="text-slate-300">
                nanoモードでは、ターミナル標準の GNU nano / Pico エディタと同様のキーボード操作が可能です。各キー、または下部ショートカットバーのクリックで実行できます。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^O (Ctrl+O)</span>
                  <p className="text-slate-300 mt-0.5">WriteOut: 現在の内容を保存</p>
                </div>
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^X (Ctrl+X)</span>
                  <p className="text-slate-300 mt-0.5">Exit: ページ編集を終了して戻る</p>
                </div>
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^K (Ctrl+K)</span>
                  <p className="text-slate-300 mt-0.5">Cut: 現在行または選択範囲を切り取り</p>
                </div>
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^U (Ctrl+U)</span>
                  <p className="text-slate-300 mt-0.5">Uncut: カットバッファを貼り付け</p>
                </div>
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^W (Ctrl+W)</span>
                  <p className="text-slate-300 mt-0.5">Where Is: ドキュメント内をキーワード検索</p>
                </div>
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^\ (Ctrl+\)</span>
                  <p className="text-slate-300 mt-0.5">Replace: 文字列の置換 (単一または全件)</p>
                </div>
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^C (Ctrl+C)</span>
                  <p className="text-slate-300 mt-0.5">Cur Pos: 現在の行・列・文字位置を表示</p>
                </div>
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^_ (Ctrl+_) / Alt+G</span>
                  <p className="text-slate-300 mt-0.5">Go To Line: 指定した行番号へ直接移動</p>
                </div>
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^Y / ^V</span>
                  <p className="text-slate-300 mt-0.5">Prev/Next Page: 前または次のページへスクロール</p>
                </div>
                <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/50">
                  <span className="font-bold text-emerald-400">^J (Ctrl+J)</span>
                  <p className="text-slate-300 mt-0.5">Justify: 行末の余白を整形</p>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                type="button"
                onClick={() => setNanoHelpOpen(false)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
              >
                閉じる (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Markdownファイル読込 & カテゴリ指定モーダル */}
      {mdUploadModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-0 zoom-in-95 duration-150">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <UploadCloud className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Markdownの読み込み & カテゴリ指定</h3>
                  <p className="text-xs text-muted-foreground truncate max-w-xs">
                    {mdUploadModal.fileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMdUploadModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* 本文 */}
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* タイトル更新オプション */}
              {mdUploadModal.parsedTitle && (
                <div className="p-3 bg-muted/40 border border-border rounded-xl">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs">
                    <input
                      type="checkbox"
                      checked={mdUploadModal.updateTitle}
                      onChange={(e) =>
                        setMdUploadModal((prev) => ({ ...prev, updateTitle: e.target.checked }))
                      }
                      className="rounded border-border text-primary focus:ring-primary size-4"
                    />
                    <div>
                      <span className="font-medium text-foreground">
                        ページタイトルをファイルから更新する
                      </span>
                      <p className="text-muted-foreground text-[11px] mt-0.5 font-semibold">
                        「{mdUploadModal.parsedTitle}」
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* カテゴリ指定エリア */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    <FolderTree className="size-3.5 text-primary" />
                    <span>付与するカテゴリ</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    [[Category:xxx]] を自動挿入
                  </span>
                </div>

                {/* カテゴリバッジ */}
                <div className="flex flex-wrap items-center gap-1.5 min-h-7 p-2 rounded-xl bg-muted/30 border border-border">
                  {mdUploadModal.categories.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      カテゴリは未指定です
                    </span>
                  )}
                  {mdUploadModal.categories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20"
                    >
                      <Tag className="size-2.5" />
                      <span>{cat}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setMdUploadModal((prev) => ({
                            ...prev,
                            categories: prev.categories.filter((c) => c !== cat),
                          }))
                        }
                        className="hover:text-rose-500 ml-0.5 cursor-pointer"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* カテゴリ追加入力 */}
                <div className="flex items-center gap-1.5 pt-1">
                  <input
                    type="text"
                    value={mdUploadModal.catInput}
                    onChange={(e) =>
                      setMdUploadModal((prev) => ({ ...prev, catInput: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = mdUploadModal.catInput.trim();
                        if (val && !mdUploadModal.categories.includes(val)) {
                          setMdUploadModal((prev) => ({
                            ...prev,
                            categories: [...prev.categories, val],
                            catInput: '',
                          }));
                        }
                      }
                    }}
                    placeholder="新しいカテゴリ名を入力..."
                    className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = mdUploadModal.catInput.trim();
                      if (val && !mdUploadModal.categories.includes(val)) {
                        setMdUploadModal((prev) => ({
                          ...prev,
                          categories: [...prev.categories, val],
                          catInput: '',
                        }));
                      }
                    }}
                    disabled={!mdUploadModal.catInput.trim()}
                    className="px-3 py-1 bg-muted hover:bg-primary hover:text-primary-foreground text-xs rounded-lg font-medium transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    追加
                  </button>
                </div>

                {/* 既存サイトカテゴリの候補 */}
                {siteCategories.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] text-muted-foreground block mb-1">
                      サイト内の既存カテゴリから追加:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {siteCategories.map((sc) => {
                        const catName = String(sc?.name || sc?.category_name || '').trim();
                        if (!catName) return null;
                        const isAdded = mdUploadModal.categories.includes(catName);
                        return (
                          <button
                            key={catName}
                            type="button"
                            onClick={() => {
                              if (isAdded) {
                                setMdUploadModal((prev) => ({
                                  ...prev,
                                  categories: prev.categories.filter((c) => c !== catName),
                                }));
                              } else {
                                setMdUploadModal((prev) => ({
                                  ...prev,
                                  categories: [...prev.categories, catName],
                                }));
                              }
                            }}
                            className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                              isAdded
                                ? 'bg-primary/15 text-primary border-primary/30 font-medium'
                                : 'bg-muted/40 text-muted-foreground hover:text-foreground border-border'
                            }`}
                          >
                            <Plus className={`size-2.5 ${isAdded ? 'rotate-45' : ''}`} />
                            <span>{catName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 挿入モード選択 */}
              <div className="space-y-1.5 pt-2 border-t border-border text-xs">
                <span className="font-semibold text-foreground">挿入方法</span>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      mdUploadModal.insertMode === 'replace'
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="insertMode"
                      value="replace"
                      checked={mdUploadModal.insertMode === 'replace'}
                      onChange={() =>
                        setMdUploadModal((prev) => ({ ...prev, insertMode: 'replace' }))
                      }
                      className="text-primary"
                    />
                    <span>全体を上書き</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      mdUploadModal.insertMode === 'append'
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="insertMode"
                      value="append"
                      checked={mdUploadModal.insertMode === 'append'}
                      onChange={() =>
                        setMdUploadModal((prev) => ({ ...prev, insertMode: 'append' }))
                      }
                      className="text-primary"
                    />
                    <span>カーソル位置に挿入</span>
                  </label>
                </div>
              </div>
            </div>

            {/* フッター */}
            <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setMdUploadModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleApplyMdUpload}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
              >
                <UploadCloud className="size-3.5" />
                <span>エディタに反映</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
