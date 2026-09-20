'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  X,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  FileArchive,
  ArrowRight,
  Globe,
  FileCheck,
  FolderTree,
  Tag,
  Plus,
} from 'lucide-react';
import { ParsedMarkdownPage, parseUploadedFiles, appendCategoriesToMarkdown } from '@/lib/markdown-import';
import { pagesApi, categoriesApi, CategorySummary } from '@/lib/api';

interface ImportMarkdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  existingPages: Array<{ id: string; slug: string; title: string }>;
  onSuccess: (importedCount: number) => void;
}

export function ImportMarkdownModal({
  isOpen,
  onClose,
  siteId,
  existingPages,
  onSuccess,
}: ImportMarkdownModalProps) {
  const [parsedPages, setParsedPages] = useState<ParsedMarkdownPage[]>([]);
  const [isPublishing, setIsPublishing] = useState<boolean>(true);
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(true);
  const [isProcessingFiles, setIsProcessingFiles] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // カテゴリ管理用ステート
  const [siteCategories, setSiteCategories] = useState<CategorySummary[]>([]);
  const [commonCategories, setCommonCategories] = useState<string[]>([]);
  const [commonCatInput, setCommonCatInput] = useState<string>('');
  const [editingCatIndex, setEditingCatIndex] = useState<number | null>(null);
  const [pageCatInput, setPageCatInput] = useState<string>('');

  // サイト内既存カテゴリの取得
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    categoriesApi
      .listForSite(siteId)
      .then((res) => {
        if (isMounted && res.data?.data) {
          setSiteCategories(res.data.data);
        }
      })
      .catch(() => {
        // オフラインまたはフォールバック
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, siteId]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setIsProcessingFiles(true);
    setErrorMessage(null);
    try {
      const results = await parseUploadedFiles(acceptedFiles);
      if (results.length === 0) {
        setErrorMessage('有効な Markdown (.md) または ZIP ファイルが見つかりませんでした');
      } else {
        setParsedPages((prev) => [...prev, ...results]);
      }
    } catch (err: any) {
      setErrorMessage('ファイルの解析中にエラーが発生しました: ' + (err?.message || '不明なエラー'));
    } finally {
      setIsProcessingFiles(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md', '.markdown'],
      'text/plain': ['.txt'],
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
    },
  });

  if (!isOpen) return null;

  const handleRemovePage = (index: number) => {
    setParsedPages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTitleChange = (index: number, val: string) => {
    setParsedPages((prev) => {
      const next = [...prev];
      next[index].title = val;
      return next;
    });
  };

  const handleSlugChange = (index: number, val: string) => {
    setParsedPages((prev) => {
      const next = [...prev];
      next[index].slug = val.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      return next;
    });
  };

  // 共通カテゴリ操作
  const handleAddCommonCategory = (cat: string) => {
    const trimmed = cat.trim();
    if (!trimmed) return;
    if (!commonCategories.includes(trimmed)) {
      setCommonCategories((prev) => [...prev, trimmed]);
    }
    setCommonCatInput('');
  };

  const handleRemoveCommonCategory = (cat: string) => {
    setCommonCategories((prev) => prev.filter((c) => c !== cat));
  };

  // ページ個別カテゴリ操作
  const handleAddPageCategory = (index: number, cat: string) => {
    const trimmed = cat.trim();
    if (!trimmed) return;
    setParsedPages((prev) => {
      const next = [...prev];
      const cats = next[index].categories || [];
      if (!cats.includes(trimmed)) {
        next[index] = { ...next[index], categories: [...cats, trimmed] };
      }
      return next;
    });
    setPageCatInput('');
    setEditingCatIndex(null);
  };

  const handleRemovePageCategory = (pageIndex: number, cat: string) => {
    setParsedPages((prev) => {
      const next = [...prev];
      const cats = next[pageIndex].categories || [];
      next[pageIndex] = {
        ...next[pageIndex],
        categories: cats.filter((c) => c !== cat),
      };
      return next;
    });
  };

  // インポート実行
  const handleExecuteImport = async () => {
    if (parsedPages.length === 0) return;
    setIsImporting(true);
    setProgress({ current: 0, total: parsedPages.length });
    setErrorMessage(null);

    let successCount = 0;

    try {
      for (let i = 0; i < parsedPages.length; i++) {
        const item = parsedPages[i];
        setProgress({ current: i + 1, total: parsedPages.length });

        // カテゴリを MediaWiki 構文 [[Category:xxx]] として本文末尾に反映
        const pageCats = Array.from(
          new Set([...(item.categories || []), ...commonCategories])
        );
        const finalContent = appendCategoriesToMarkdown(item.content, pageCats);

        // 同一スラグのページが既に存在するか確認
        const existing = existingPages.find(
          (p) => p.slug === item.slug || p.slug === `/${item.slug}`
        );

        if (existing && overwriteExisting) {
          // 上書き更新
          await pagesApi.update(existing.id, {
            title: item.title,
            content: finalContent,
            status: isPublishing ? 'published' : 'draft',
          });
        } else {
          // 新規作成
          const res = await pagesApi.create(siteId, {
            slug: item.slug,
            title: item.title,
            content: finalContent,
          });

          // 即時公開が選択されている場合は status を published に更新
          if (isPublishing && res.data?.data?.id) {
            await pagesApi.update(res.data.data.id, {
              status: 'published',
            });
          }
        }

        successCount++;
      }

      onSuccess(successCount);
      onClose();
      // リセット
      setParsedPages([]);
      setCommonCategories([]);
    } catch (err: any) {
      setErrorMessage(
        `インポート処理中にエラーが発生しました (${successCount} 件完了): ` +
          (err?.response?.data?.error || err?.message || '不明なエラー')
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-0 zoom-in-95 duration-150">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <UploadCloud className="size-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                Markdown / ZIP インポート & 公開
              </h2>
              <p className="text-xs text-slate-400">
                .md ファイルや ZIP アーカイブをアップロードして、一括でページを作成・公開します
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* メインエリア */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ドロップゾーン */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragActive
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 scale-[0.99]'
                : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                {isProcessingFiles ? (
                  <Loader2 className="size-6 animate-spin" />
                ) : (
                  <UploadCloud className="size-6" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {isDragActive
                    ? 'ファイルをここにドロップしてください'
                    : 'Markdown (.md) または ZIP (.zip) ファイルをドラッグ＆ドロップ'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  またはクリックしてファイルを選択（複数選択対応）
                </p>
              </div>
            </div>
          </div>

          {/* 一括共通カテゴリ指定エリア */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderTree className="size-4 text-blue-600 dark:text-blue-400" />
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                  共通カテゴリ (全アップロードページに適用)
                </span>
              </div>
              {commonCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCommonCategories([])}
                  className="text-[11px] text-slate-400 hover:text-rose-500 transition-colors"
                >
                  共通カテゴリをクリア
                </button>
              )}
            </div>

            {/* 現在設定されている共通カテゴリバッジ */}
            <div className="flex flex-wrap items-center gap-1.5 min-h-6">
              {commonCategories.map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200 dark:border-blue-800"
                >
                  <Tag className="size-3 text-blue-500" />
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCommonCategory(cat)}
                    className="hover:text-rose-600 ml-0.5 rounded-full"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}

              {/* 追加入力フォーム */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={commonCatInput}
                  onChange={(e) => setCommonCatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCommonCategory(commonCatInput);
                    }
                  }}
                  placeholder="カテゴリ名を入力..."
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleAddCommonCategory(commonCatInput)}
                  disabled={!commonCatInput.trim()}
                  className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-slate-700 dark:text-slate-200 text-xs rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                >
                  追加
                </button>
              </div>
            </div>

            {/* サイト内の既存カテゴリ候補 */}
            {siteCategories.length > 0 && (
              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                <div className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1">
                  <span>サイト内の既存カテゴリから選択:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {siteCategories.map((sc) => {
                    const isAlreadyAdded = commonCategories.includes(sc.name);
                    return (
                      <button
                        key={sc.name}
                        type="button"
                        onClick={() => {
                          if (isAlreadyAdded) {
                            handleRemoveCommonCategory(sc.name);
                          } else {
                            handleAddCommonCategory(sc.name);
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer border ${
                          isAlreadyAdded
                            ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                        }`}
                      >
                        <Plus className={`size-2.5 ${isAlreadyAdded ? 'rotate-45 text-blue-500' : ''}`} />
                        <span>{sc.name}</span>
                        <span className="text-[9px] opacity-60 font-mono">({sc.total_count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 読み込み済みページリスト */}
          {parsedPages.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  インポート対象ページ ({parsedPages.length} 件)
                </span>
                <button
                  type="button"
                  onClick={() => setParsedPages([])}
                  className="text-slate-400 hover:text-rose-500 transition-colors"
                >
                  すべてクリア
                </button>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {parsedPages.map((item, index) => {
                  const isConflict = existingPages.some(
                    (p) => p.slug === item.slug || p.slug === `/${item.slug}`
                  );

                  return (
                    <div
                      key={index}
                      className="p-3 bg-white dark:bg-slate-900/60 flex flex-col gap-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <FileText className="size-4 text-blue-500 shrink-0" />
                          <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => handleTitleChange(index, e.target.value)}
                              placeholder="ページタイトル"
                              className="bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs truncate"
                            />
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 font-mono text-[10px]">/</span>
                              <input
                                type="text"
                                value={item.slug}
                                onChange={(e) => handleSlugChange(index, e.target.value)}
                                placeholder="スラグ"
                                className="bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-xs flex-1 truncate"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isConflict && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-medium">
                              上書き対象
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                            {item.content.length.toLocaleString()} 字
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePage(index)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* ページ個別カテゴリ行 */}
                      <div className="flex flex-wrap items-center gap-1.5 pl-6">
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Tag className="size-3 text-slate-400" />
                          <span>個別カテゴリ:</span>
                        </span>
                        {(item.categories || []).map((cat) => (
                          <span
                            key={cat}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] border border-slate-200 dark:border-slate-700"
                          >
                            <span>{cat}</span>
                            <button
                              type="button"
                              onClick={() => handleRemovePageCategory(index, cat)}
                              className="text-slate-400 hover:text-rose-500 ml-0.5"
                            >
                              <X className="size-2.5" />
                            </button>
                          </span>
                        ))}

                        {editingCatIndex === index ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              autoFocus
                              value={pageCatInput}
                              onChange={(e) => setPageCatInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddPageCategory(index, pageCatInput);
                                } else if (e.key === 'Escape') {
                                  setEditingCatIndex(null);
                                }
                              }}
                              placeholder="カテゴリ名..."
                              className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-blue-400 rounded text-[11px] w-24"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddPageCategory(index, pageCatInput)}
                              className="text-[10px] px-1.5 py-0.5 bg-blue-600 text-white rounded cursor-pointer"
                            >
                              追加
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCatIndex(null)}
                              className="text-[10px] text-slate-400 hover:text-slate-600"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCatIndex(index);
                              setPageCatInput('');
                            }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
                          >
                            <Plus className="size-2.5" />
                            <span>追加</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* オプション設定 */}
              <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPublishing}
                    onChange={(e) => setIsPublishing(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 size-4"
                  />
                  <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                    <Globe className="size-3.5 text-emerald-500" />
                    <span>インポート後に即座に「公開」状態にする (チェックを外すと下書き)</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(e) => setOverwriteExisting(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 size-4"
                  />
                  <span className="text-slate-600 dark:text-slate-400">
                    同一スラグのページが既に存在する場合は内容を上書き更新する
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* プログレスバー */}
          {isImporting && (
            <div className="space-y-1.5 p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs">
              <div className="flex items-center justify-between font-medium text-blue-700 dark:text-blue-300">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>ページをインポート中...</span>
                </span>
                <span>
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-900 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-200"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400">
            {parsedPages.length > 0 ? `${parsedPages.length} 件のページを準備中` : 'ファイルを選択してください'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={parsedPages.length === 0 || isImporting}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>インポート中...</span>
                </>
              ) : (
                <>
                  <FileCheck className="size-3.5" />
                  <span>{parsedPages.length} 件をインポート{isPublishing ? '＆公開' : ''}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
