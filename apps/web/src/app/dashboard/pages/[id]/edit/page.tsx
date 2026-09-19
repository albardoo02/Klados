'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pagesApi, sitesApi, mediaApi, commentsApi, PageVersion } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useMemo } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState, Compartment } from '@codemirror/state';
import { vim } from '@replit/codemirror-vim';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { DiffViewer } from '@/components/diff-viewer';
import { MediaLibraryModal } from '@/components/media-library-modal';
import { CommentsDrawer } from '@/components/comments-drawer';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';
import {
  ArrowLeft,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Quote,
  Table as TableIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  Loader2,
  ExternalLink,
  Save,
  Check,
  Columns,
  Eye,
  FileEdit,
  Sigma,
  History as HistoryIcon,
  RotateCcw,
  X,
  Clock,
  FileClock,
  Images,
  MessageSquare,
  Users,
  Terminal,
  Minus,
  CheckSquare,
  Sparkles,
  Info,
  Palette,
  Highlighter,
  UploadCloud,
} from 'lucide-react';

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

interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  icon: any;
  action: () => void;
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

  const [preview, setPreview] = useState('');
  const [tab, setTab] = useState<'edit' | 'preview' | 'split'>('split');
  const [saved, setSaved] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // モーダル開閉ステート
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<PageVersion | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertSuccessMsg, setRevertSuccessMsg] = useState<string | null>(null);

  // エディタ設定: Vim / Standard
  const [keybinding, setKeybinding] = useState<'standard' | 'vim'>('standard');

  // スラッシュコマンド メニューステート
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // カラーピッカー ステート
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [customColor, setCustomColor] = useState('#ef4444');
  const colorPickerRef = useRef<HTMLDivElement>(null);

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
      if (stored === 'vim' || stored === 'standard') {
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

  const updateMutation = useMutation({
    mutationFn: (content: string) => pagesApi.update(id, { content }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['page', id] });
      queryClient.invalidateQueries({ queryKey: ['page-versions', id] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (status: 'published' | 'draft') => pagesApi.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['page', id] }),
  });

  // --- テキスト挿入ユーティリティ ---
  const insertText = (textToInsert: string) => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state, dispatch } = view;
    const selection = state.selection.main;
    const from = selection.from;
    const to = selection.to;

    dispatch({
      changes: { from, to, insert: textToInsert },
      selection: { anchor: from + textToInsert.length },
      scrollIntoView: true,
    });
    view.focus();
  };

  const wrapText = (before: string, after: string, defaultText = '') => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state, dispatch } = view;
    const selection = state.selection.main;
    const from = selection.from;
    const to = selection.to;
    let selectedText = state.sliceDoc(from, to) || defaultText;

    // リスト記号（"- ", "* ", "+ ", "1. "など）が含まれている場合、マーカーの外側に書式をかけないよう分離
    let prefix = '';
    const listMatch = /^([ \t]*[-*+]\s+|[ \t]*\d+\.\s+)/.exec(selectedText);
    if (listMatch && after !== '') {
      prefix = listMatch[1];
      selectedText = selectedText.slice(prefix.length);
    }

    const replacement = `${prefix}${before}${selectedText}${after}`;

    dispatch({
      changes: { from, to, insert: replacement },
      selection: {
        anchor: from + prefix.length + before.length,
        head: from + prefix.length + before.length + selectedText.length,
      },
      scrollIntoView: true,
    });
    view.focus();
  };

  const applyTextColor = (color: string) => {
    wrapText('[', `]{color:${color}}`, '色付きテキスト');
    setColorPickerOpen(false);
  };

  const applyBgHighlight = (bg: string) => {
    if (bg === '#fef08a') {
      wrapText('==', '==', 'ハイライトテキスト');
    } else {
      wrapText('[', `]{bg:${bg}}`, 'ハイライトテキスト');
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
        action: () => insertText('# '),
      },
      {
        id: 'h2',
        label: '中見出し (H2)',
        description: 'サブセクションのタイトル',
        icon: Heading2,
        action: () => insertText('## '),
      },
      {
        id: 'h3',
        label: '小見出し (H3)',
        description: '詳細な小項目タイトル',
        icon: Heading3,
        action: () => insertText('### '),
      },
      {
        id: 'highlight',
        label: 'ハイライトマーカー',
        description: 'テキストを黄色マーカーで強調 (==テキスト==)',
        icon: Highlighter,
        action: () => wrapText('==', '==', 'ハイライトテキスト'),
      },
      {
        id: 'red',
        label: '赤文字 (Red)',
        description: '選択テキストまたは赤色文字を挿入',
        icon: Palette,
        action: () => wrapText('[', ']{color:#ef4444}', '赤色テキスト'),
      },
      {
        id: 'blue',
        label: '青文字 (Blue)',
        description: '選択テキストまたは青色文字を挿入',
        icon: Palette,
        action: () => wrapText('[', ']{color:#3b82f6}', '青色テキスト'),
      },
      {
        id: 'green',
        label: '緑文字 (Green)',
        description: '選択テキストまたは緑色文字を挿入',
        icon: Palette,
        action: () => wrapText('[', ']{color:#10b981}', '緑色テキスト'),
      },
      {
        id: 'yellow',
        label: '黄文字 (Yellow)',
        description: '選択テキストまたは黄色文字を挿入',
        icon: Palette,
        action: () => wrapText('[', ']{color:#f59e0b}', '黄色テキスト'),
      },
      {
        id: 'purple',
        label: '紫文字 (Purple)',
        description: '選択テキストまたは紫色文字を挿入',
        icon: Palette,
        action: () => wrapText('[', ']{color:#8b5cf6}', '紫色テキスト'),
      },
      {
        id: 'table',
        label: 'テーブル (表)',
        description: 'GFM構文のMarkdownテーブルを挿入',
        icon: TableIcon,
        action: () =>
          insertText(
            '\n| 項目名 | 説明 | 状態 |\n| :--- | :--- | :---: |\n| サンプル1 | 詳細テキスト | ✅ 完了 |\n| サンプル2 | 詳細テキスト | ⏳ 進行中 |\n'
          ),
      },
      {
        id: 'code',
        label: 'コードブロック',
        description: 'シンタックスハイライト付きコードブロック',
        icon: Code,
        action: () => insertText('```typescript\n// ここにコードを記述\nconst greeting = "Hello, Klados!";\nconsole.log(greeting);\n```\n'),
      },
      {
        id: 'quote',
        label: '引用 (Quote)',
        description: '引用テキストブロックを挿入',
        icon: Quote,
        action: () => insertText('> 引用文をここに記述します。\n'),
      },
      {
        id: 'katex',
        label: 'KaTeX 数式',
        description: '数式ブロックフォーミュラ ($$ 数式 $$)',
        icon: Sigma,
        action: () =>
          insertText('$$\n\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}\n$$\n'),
      },
      {
        id: 'divider',
        label: '区切り線 (Divider)',
        description: '水平罫線 (---) を挿入',
        icon: Minus,
        action: () => insertText('\n---\n\n'),
      },
      {
        id: 'checklist',
        label: 'タスクリスト',
        description: 'チェック可能なToDo項目',
        icon: CheckSquare,
        action: () => insertText('- [ ] 新しいタスク\n'),
      },
      {
        id: 'callout',
        label: 'コールアウト / 注意書き',
        description: '強調表示用のメッセージボックス',
        icon: Info,
        action: () => insertText(':::info\nここに注意書きや追加情報を記述します。\n:::\n'),
      },
      {
        id: 'image',
        label: '画像挿入',
        description: 'メディアライブラリまたは画像ファイルを選択',
        icon: ImageIcon,
        action: () => setMediaLibraryOpen(true),
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

  // スラッシュコマンド実行
  const executeSlashCommand = (cmd: SlashCommandItem) => {
    setSlashMenuOpen(false);
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state, dispatch } = view;
    const pos = state.selection.main.from;
    const line = state.doc.lineAt(pos);
    const lineText = line.text;

    // スラッシュ文字を探して削除
    const lastSlashIdx = lineText.lastIndexOf('/');
    if (lastSlashIdx !== -1) {
      const slashFrom = line.from + lastSlashIdx;
      dispatch({
        changes: { from: slashFrom, to: pos, insert: '' },
      });
    }

    cmd.action();
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
    const wsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const wsUrl =
      process.env.NEXT_PUBLIC_WS_URL || `ws://${wsHost}:8080/v1/ws/pages/${id}`;

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
              viewRef.current.dispatch({
                changes: {
                  from: 0,
                  to: viewRef.current.state.doc.length,
                  insert: newContent,
                },
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

  // CodeMirror エディタ初期化
  useEffect(() => {
    if (!editorRef.current || !page || viewRef.current) return;

    const keybindingCompartment = new Compartment();
    keybindingCompartmentRef.current = keybindingCompartment;

    const startState = EditorState.create({
      doc: page.content ?? '',
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        keybindingCompartment.of(keybinding === 'vim' ? vim() : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            setPreview(content);
            setSaved(false);
            broadcastDocChange(content);

            // スラッシュコマンド検知
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
        }),
      ],
    });

    const view = new EditorView({ state: startState, parent: editorRef.current });
    viewRef.current = view;
    setPreview(page.content ?? '');

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [page]);

  // キーバインドの動的切り替え
  const handleToggleKeybinding = (newMode: 'standard' | 'vim') => {
    setKeybinding(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('klados_editor_keybinding', newMode);
    }

    if (viewRef.current && keybindingCompartmentRef.current) {
      viewRef.current.dispatch({
        effects: keybindingCompartmentRef.current.reconfigure(
          newMode === 'vim' ? vim() : []
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

  const handleManualSave = () => {
    if (viewRef.current) {
      const currentDoc = viewRef.current.state.doc.toString();
      if (saved && currentDoc === (page?.content ?? '')) {
        return;
      }
      updateMutation.mutate(currentDoc);
    }
  };

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
  const handleUploadFile = async (file: File) => {
    const siteId = page?.site_id || page?.siteId;
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
      const cdnUrl = data?.cdn_url || data?.CDNURL || data?.url;

      if (!cdnUrl) {
        throw new Error('CDN URLが取得できませんでした');
      }

      const altText = file.name.replace(/\.[^/.]+$/, '');
      const markdownImage = `\n![${altText}](${cdnUrl})\n`;
      insertText(markdownImage);
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
      handleUploadFile(files[0]);
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

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          await handleUploadFile(file);
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
          await handleUploadFile(file);
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
      ? `/sites/${site.slug}`
      : `/sites/${site.slug}/${page.slug}`
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

      {/* ツールバー */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1 rounded hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">戻る</span>
          </button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex flex-col">
            <span className="font-semibold text-sm leading-tight">
              {page?.title ?? '読み込み中...'}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {site && <span>{site.title}</span>}
              {page?.slug && <span>/{page.slug}</span>}
              <span className="inline-flex items-center gap-1">
                {saved ? (
                  <>
                    <Check className="size-3 text-emerald-500" />
                    <span>保存済み</span>
                  </>
                ) : (
                  <span className="text-amber-500 font-medium">編集中...</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* コラボレーター アバター表示 & ツール群 */}
        <div className="flex items-center gap-2.5">
          {/* コラボレーター アバター一覧 */}
          <div className="flex items-center gap-1.5 pl-2">
            <div className="flex -space-x-2 overflow-hidden items-center">
              {collaborators.map((c) => {
                const initial = c.name.charAt(0).toUpperCase() || 'U';
                return (
                  <div
                    key={c.id}
                    title={`${c.name} (編集中)`}
                    className={`size-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ring-1 ring-background shadow-xs transition-transform hover:scale-110 cursor-default ${c.color}`}
                  >
                    {initial}
                  </div>
                );
              })}
            </div>
            {collaborators.length > 1 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden md:inline">{collaborators.length}人が編集</span>
              </span>
            )}
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* キーバインド切り替え (通常 / Vim) */}
          <div className="flex border border-border rounded-lg overflow-hidden text-xs bg-muted/20 p-0.5">
            <button
              type="button"
              onClick={() => handleToggleKeybinding('standard')}
              className={`px-2 py-1 rounded transition-colors cursor-pointer text-[11px] font-medium ${
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
              className={`px-2 py-1 rounded transition-colors cursor-pointer text-[11px] font-medium flex items-center gap-1 ${
                keybinding === 'vim'
                  ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Vim キーバインド (Normal, Insert, Visualモード対応)"
            >
              <Terminal className="size-3" />
              <span>Vim</span>
            </button>
          </div>

          {/* コメント ドロワー開閉ボタン */}
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors cursor-pointer relative"
            title="コメント & フィードバックを開く"
          >
            <MessageSquare className="size-3.5" />
            <span className="hidden md:inline">コメント</span>
            {commentList.length > 0 && (
              <span className="size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center -mr-1">
                {commentList.length}
              </span>
            )}
          </button>

          {/* 履歴 (History) ボタン */}
          <button
            type="button"
            onClick={() => {
              setSelectedVersion(null);
              setHistoryOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors cursor-pointer"
            title="変更履歴と差分を表示"
          >
            <HistoryIcon className="size-3.5" />
            <span className="hidden md:inline">履歴</span>
          </button>

          {/* メディア一覧ボタン */}
          <button
            type="button"
            onClick={() => setMediaLibraryOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors cursor-pointer"
            title="サイトのメディア一覧を開く"
          >
            <Images className="size-3.5" />
            <span className="hidden md:inline">メディア</span>
          </button>

          {/* MDファイル読み込みボタン */}
          <label
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors cursor-pointer"
            title="手元の .md ファイルを読み込んでエディタに反映"
          >
            <UploadCloud className="size-3.5" />
            <span className="hidden md:inline">MD読込</span>
            <input
              type="file"
              accept=".md,.markdown,.txt"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const text = await file.text();
                  if (!preview || confirm('エディタの内容を読み込んだファイルで上書きしますか？')) {
                    if (viewRef.current) {
                      viewRef.current.dispatch({
                        changes: {
                          from: 0,
                          to: viewRef.current.state.doc.length,
                          insert: text,
                        },
                      });
                    }
                    setPreview(text);
                    setSaved(false);
                    broadcastDocChange(text);
                  }
                }
                e.target.value = '';
              }}
            />
          </label>

          {/* 公開プレビューリンク */}
          {publicUrl && (
            <Link
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
              title="公開ページを別タブで確認"
            >
              <ExternalLink className="size-3.5" />
              <span className="hidden lg:inline">公開サイト</span>
            </Link>
          )}

          {/* ビュー切り替えタブ */}
          <div className="flex border border-border rounded-lg overflow-hidden text-xs bg-muted/30 p-0.5">
            <button
              onClick={() => setTab('edit')}
              className={`flex items-center gap-1 px-3 py-1 rounded-md transition-all cursor-pointer ${
                tab === 'edit'
                  ? 'bg-background shadow-xs text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="編集のみ"
            >
              <FileEdit className="size-3.5" />
              <span className="hidden sm:inline">編集</span>
            </button>
            <button
              onClick={() => setTab('split')}
              className={`flex items-center gap-1 px-3 py-1 rounded-md transition-all cursor-pointer ${
                tab === 'split'
                  ? 'bg-background shadow-xs text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="分割プレビュー"
            >
              <Columns className="size-3.5" />
              <span className="hidden sm:inline">分割</span>
            </button>
            <button
              onClick={() => setTab('preview')}
              className={`flex items-center gap-1 px-3 py-1 rounded-md transition-all cursor-pointer ${
                tab === 'preview'
                  ? 'bg-background shadow-xs text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="プレビューのみ"
            >
              <Eye className="size-3.5" />
              <span className="hidden sm:inline">プレビュー</span>
            </button>
          </div>

          <button
            onClick={handleManualSave}
            disabled={saved || updateMutation.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg disabled:opacity-40 transition-colors font-medium cursor-pointer"
          >
            {updateMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            <span>保存</span>
          </button>

          <button
            onClick={() =>
              publishMutation.mutate(page?.status === 'published' ? 'draft' : 'published')
            }
            disabled={publishMutation.isPending}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              page?.status === 'published'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            {publishMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : page?.status === 'published' ? (
              <>
                <Check className="size-3.5" />
                <span>公開中</span>
              </>
            ) : (
              <span>公開する</span>
            )}
          </button>
        </div>
      </header>

      {/* Markdown 書式ツールバー */}
      {(tab === 'edit' || tab === 'split') && (
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-muted/20 text-xs overflow-x-auto">
          {/* スラッシュコマンド トリガーヒント */}
          <button
            type="button"
            onClick={() => {
              insertText('/');
              setSlashFilter('');
              setSlashMenuOpen(true);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium cursor-pointer"
            title="スラッシュコマンド (/ を入力)"
          >
            <Sparkles className="size-3.5" />
            <span>/ コマンド</span>
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          <button
            type="button"
            onClick={() => wrapText('**', '**', '太字テキスト')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="太字 (Bold)"
          >
            <Bold className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => wrapText('*', '*', '斜体テキスト')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="斜体 (Italic)"
          >
            <Italic className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => wrapText('~~', '~~', '打ち消しテキスト')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="取り消し線"
          >
            <Strikethrough className="size-4" />
          </button>

          {/* テキストカラー & ハイライト ドロップダウン */}
          <div className="relative" ref={colorPickerRef}>
            <button
              type="button"
              onClick={() => setColorPickerOpen(!colorPickerOpen)}
              className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 ${
                colorPickerOpen ? 'bg-muted text-foreground ring-1 ring-border' : ''
              }`}
              title="文字色・ハイライト"
            >
              <Palette className="size-4 text-primary" />
            </button>

            {colorPickerOpen && (
              <div className="absolute left-0 top-full mt-2 z-50 w-64 p-3 bg-card text-card-foreground border border-border rounded-2xl shadow-2xl space-y-3 animate-in fade-in-0 zoom-in-95 duration-100">
                {/* 文字色セクション */}
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Palette className="size-3 text-primary" />
                      文字色
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        wrapText('[', ']{color:currentColor}', 'テキスト');
                        setColorPickerOpen(false);
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                    >
                      リセット
                    </button>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[
                      { name: '赤', color: '#ef4444', bg: 'bg-red-500' },
                      { name: 'オレンジ', color: '#f97316', bg: 'bg-orange-500' },
                      { name: '黄', color: '#f59e0b', bg: 'bg-amber-500' },
                      { name: '緑', color: '#10b981', bg: 'bg-emerald-500' },
                      { name: '青', color: '#3b82f6', bg: 'bg-blue-500' },
                      { name: '紫', color: '#8b5cf6', bg: 'bg-purple-500' },
                      { name: 'ピンク', color: '#ec4899', bg: 'bg-pink-500' },
                      { name: 'シアン', color: '#06b6d4', bg: 'bg-cyan-500' },
                      { name: 'インディゴ', color: '#6366f1', bg: 'bg-indigo-500' },
                      { name: 'グレー', color: '#64748b', bg: 'bg-slate-500' },
                      { name: 'ダーク', color: '#1e293b', bg: 'bg-slate-800' },
                      { name: '白', color: '#ffffff', bg: 'bg-white border border-slate-300 dark:border-slate-600' },
                    ].map((c) => (
                      <button
                        key={c.color}
                        type="button"
                        onClick={() => applyTextColor(c.color)}
                        className={`size-6 rounded-full ${c.bg} transition-transform hover:scale-110 cursor-pointer shadow-xs`}
                        title={c.name}
                      />
                    ))}
                  </div>

                  {/* カスタムカラー指定 */}
                  <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-border">
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      className="size-6 p-0 rounded cursor-pointer border-0 bg-transparent"
                      title="カラーピッカー"
                    />
                    <input
                      type="text"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value)}
                      placeholder="#hex"
                      className="flex-1 h-6 px-1.5 text-xs font-mono bg-muted/50 border border-border rounded text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => applyTextColor(customColor)}
                      className="h-6 px-2 text-[11px] font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 cursor-pointer"
                    >
                      適用
                    </button>
                  </div>
                </div>

                {/* ハイライト / 背景色セクション */}
                <div className="pt-2 border-t border-border">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Highlighter className="size-3 text-amber-500" />
                      ハイライト (マーカー)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        wrapText('==', '==', 'ハイライトテキスト');
                        setColorPickerOpen(false);
                      }}
                      className="text-[10px] text-primary hover:underline cursor-pointer font-medium"
                      title="標準Markdownハイライト (==テキスト==)"
                    >
                      == 標準 ==
                    </button>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[
                      { name: 'イエロー', color: '#fef08a', bg: 'bg-yellow-200 text-yellow-900' },
                      { name: 'グリーン', color: '#bbf7d0', bg: 'bg-green-200 text-green-900' },
                      { name: 'ブルー', color: '#bfdbfe', bg: 'bg-blue-200 text-blue-900' },
                      { name: 'ピンク', color: '#fbcfe8', bg: 'bg-pink-200 text-pink-900' },
                      { name: 'オレンジ', color: '#fed7aa', bg: 'bg-orange-200 text-orange-900' },
                      { name: 'パープル', color: '#e9d5ff', bg: 'bg-purple-200 text-purple-900' },
                    ].map((c) => (
                      <button
                        key={c.color}
                        type="button"
                        onClick={() => applyBgHighlight(c.color)}
                        className={`size-6 rounded-md ${c.bg} transition-transform hover:scale-110 cursor-pointer border border-border/40 shadow-xs flex items-center justify-center text-[10px] font-bold`}
                        title={c.name}
                      >
                        A
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-border mx-1" />

          <button
            type="button"
            onClick={() => wrapText('# ', '', '見出し1')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="大見出し (H1)"
          >
            <Heading1 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => wrapText('## ', '', '見出し2')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="中見出し (H2)"
          >
            <Heading2 className="size-4" />
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          <button
            type="button"
            onClick={() => wrapText('- ', '', 'リスト項目')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="箇条書きリスト"
          >
            <List className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => wrapText('1. ', '', '番号付きリスト')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="番号付きリスト"
          >
            <ListOrdered className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => wrapText('> ', '', '引用テキスト')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="引用"
          >
            <Quote className="size-4" />
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          <button
            type="button"
            onClick={() => wrapText('```ts\n', '\n```', 'console.log("Hello, Klados!");')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="コードブロック"
          >
            <Code className="size-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              insertText(
                '\n| ヘッダー 1 | ヘッダー 2 | ヘッダー 3 |\n| :--- | :---: | ---: |\n| データ 1 | 中央揃え | 右揃え |\n| データ 2 | データ | データ |\n'
              )
            }
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="テーブル (表)"
          >
            <TableIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => wrapText('[', '](https://example.com)', 'リンクテキスト')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="リンク"
          >
            <LinkIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => wrapText('$$ ', ' $$', 'E = mc^2')}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            title="KaTeX数式"
          >
            <Sigma className="size-4" />
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          {/* 画像アップロードボタン */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept="image/*"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer font-medium disabled:opacity-50"
            title="画像を直接アップロードして挿入"
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin text-blue-500" />
            ) : (
              <ImageIcon className="size-4" />
            )}
            <span>{isUploading ? 'アップロード中...' : '画像アップロード'}</span>
          </button>

          {/* メディアライブラリから選択 */}
          <button
            type="button"
            onClick={() => setMediaLibraryOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors cursor-pointer font-medium"
            title="アップロード済みメディアから選択"
          >
            <Images className="size-3.5" />
            <span>メディア一覧から挿入</span>
          </button>
        </div>
      )}

      {/* エディタ & プレビュー本体 */}
      <div className="flex-1 flex overflow-hidden relative" onKeyDown={handleEditorKeyDown}>
        {/* エディタ領域 */}
        {(tab === 'edit' || tab === 'split') && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={handlePaste}
            className={`${
              tab === 'split' ? 'w-1/2 border-r border-border' : 'w-full'
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

            <div
              ref={editorRef}
              className="flex-1 overflow-auto focus:outline-none [&_.cm-editor]:h-full [&_.cm-editor]:text-base [&_.cm-scroller]:font-mono [&_.cm-content]:p-6"
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
          </div>
        )}

        {/* プレビュー領域 */}
        {(tab === 'preview' || tab === 'split') && (
          <div
            className={`${
              tab === 'split' ? 'w-1/2' : 'w-full'
            } overflow-auto p-8 bg-card/40`}
          >
            <div className="max-w-3xl mx-auto">
              {preview ? (
                <MarkdownRenderer content={preview} />
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
                        <span className="text-xs text-muted-foreground">
                          作成日時: {new Date(selectedVersion.created_at).toLocaleString('ja-JP')}
                        </span>
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
          onSelectImage={(url, filename) => {
            const alt = filename.replace(/\.[^/.]+$/, '');
            insertText(`\n![${alt}](${url})\n`);
          }}
        />
      )}
    </div>
  );
}
