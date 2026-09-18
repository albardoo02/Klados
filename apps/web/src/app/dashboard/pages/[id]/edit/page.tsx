'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pagesApi, sitesApi, mediaApi, PageVersion } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { DiffViewer } from '@/components/diff-viewer';
import { MediaLibraryModal } from '@/components/media-library-modal';
import Link from 'next/link';
import {
  ArrowLeft,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
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
} from 'lucide-react';

export default function PageEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState('');
  const [tab, setTab] = useState<'edit' | 'preview' | 'split'>('split');
  const [saved, setSaved] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // モーダル開閉ステート
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<PageVersion | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertSuccessMsg, setRevertSuccessMsg] = useState<string | null>(null);

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

  // CodeMirror エディタ初期化
  useEffect(() => {
    if (!editorRef.current || !page || viewRef.current) return;

    const startState = EditorState.create({
      doc: page.content ?? '',
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            setPreview(content);
            setSaved(false);
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

  // 自動保存 (5秒ごと)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!saved && viewRef.current) {
        updateMutation.mutate(viewRef.current.state.doc.toString());
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [saved, updateMutation]);

  const handleManualSave = () => {
    if (viewRef.current) {
      updateMutation.mutate(viewRef.current.state.doc.toString());
    }
  };

  // バージョン復元処理
  const handleRestoreVersion = async (targetVer: PageVersion) => {
    if (!confirm(`バージョン v${targetVer.version} に復元しますか？\n現在のドキュメントは新バージョンとして保存された上でロールバックされます。`)) {
      return;
    }

    try {
      setIsReverting(true);
      // API呼び出し (revertエンドポイント、未対応環境ではupdateでフォールバック)
      try {
        await pagesApi.revert(id, targetVer.version);
      } catch (err) {
        console.warn('Direct revert API fallback to update:', err);
        await pagesApi.update(id, { content: targetVer.content });
      }

      // エディタ内のテキストを復元したバージョンで置き換え
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

  // テキスト挿入ユーティリティ
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
    const selectedText = state.sliceDoc(from, to) || defaultText;
    const replacement = `${before}${selectedText}${after}`;

    dispatch({
      changes: { from, to, insert: replacement },
      selection: {
        anchor: from + before.length,
        head: from + before.length + selectedText.length,
      },
      scrollIntoView: true,
    });
    view.focus();
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
            <span className="font-semibold text-sm leading-tight">{page?.title ?? '読み込み中...'}</span>
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

        <div className="flex items-center gap-2">
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
            <span className="hidden md:inline">メディア一覧</span>
          </button>

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
              <span className="hidden lg:inline">公開サイトを開く</span>
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
            {updateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
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
      <div className="flex-1 flex overflow-hidden relative">
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
                <p className="text-xs text-muted-foreground mt-1">PNG, JPEG, GIF, WebP, SVG に対応</p>
              </div>
            )}
            <div
              ref={editorRef}
              className="flex-1 overflow-auto focus:outline-none [&_.cm-editor]:h-full [&_.cm-editor]:text-base [&_.cm-scroller]:font-mono [&_.cm-content]:p-6"
            />
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

      {/* バージョン履歴 & 差分表示モーダル / ドロワー */}
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

            {/* モーダルコンテンツ (左: バージョンリスト, 右: 差分ビュー) */}
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
                      まだ過去のバージョン履歴がありません。<br />
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
                        oldTitle={`v${selectedVersion.version} (${new Date(selectedVersion.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})`}
                        newTitle="現在のドキュメント (最新)"
                        initialMode="side-by-side"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                    <HistoryIcon className="size-12 stroke-[1.2] mb-3 text-muted-foreground/40" />
                    <p className="font-semibold text-sm">左側のリストからバージョンを選択してください</p>
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
