'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mediaApi, MediaItem } from '@/lib/api';
import {
  buildMediaMarkdown,
  formatMediaRef,
  MediaImageAlign,
  MediaImageFrame,
  resolveMediaUrl,
} from '@/lib/media';
import {
  X,
  Upload,
  Search,
  Trash2,
  Copy,
  Check,
  Image as ImageIcon,
  Loader2,
  Plus,
  FileImage,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Settings2,
  Sparkles,
  Download,
  FolderArchive,
} from 'lucide-react';

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  onSelectImage?: (
    url: string,
    filename: string,
    item?: MediaItem,
    formattedMarkdown?: string
  ) => void;
}

function formatBytes(bytes?: number, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const SIZE_PRESETS = [
  { label: '自動', value: '' },
  { label: '小 (200px)', value: '200px' },
  { label: '標準 (300px)', value: '300px' },
  { label: '中 (450px)', value: '450px' },
  { label: '大 (650px)', value: '650px' },
  { label: '最大 (100%)', value: '100%' },
];

export function MediaLibraryModal({
  isOpen,
  onClose,
  siteId,
  onSelectImage,
}: MediaLibraryModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedSyntax, setCopiedSyntax] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 選択中の画像 & MediaWiki風挿入オプションステート
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [syntaxMode, setSyntaxMode] = useState<'mediawiki' | 'markdown'>('mediawiki');
  const [frame, setFrame] = useState<MediaImageFrame>('thumb');
  const [align, setAlign] = useState<MediaImageAlign>('right');
  const [widthInput, setWidthInput] = useState<string>('300px');
  const [heightInput, setHeightInput] = useState<string>('');
  const [captionInput, setCaptionInput] = useState<string>('');
  const [altInput, setAltInput] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState<number>(36);

  const { data: mediaItems, isLoading } = useQuery<MediaItem[]>({
    queryKey: ['media', siteId],
    queryFn: () => mediaApi.list(siteId).then((r) => r.data?.data || r.data || []),
    enabled: isOpen && Boolean(siteId),
  });

  // 初回または画像一覧ロード時に先頭アイテムを選択状態にする
  useEffect(() => {
    if (isOpen && mediaItems && mediaItems.length > 0 && !selectedItem) {
      handleSelectItemForConfig(mediaItems[0]);
    }
  }, [isOpen, mediaItems]);

  const handleSelectItemForConfig = (item: MediaItem) => {
    setSelectedItem(item);
    const baseName = (item.original_name || item.filename || '').replace(/\.[^/.]+$/, '');
    setCaptionInput(baseName);
    setAltInput('');
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mediaApi.delete(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['media', siteId] });
      setDeletingId(null);
      if (selectedItem?.id === deletedId) {
        setSelectedItem(null);
      }
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || '画像の削除に失敗しました');
      setDeletingId(null);
    },
  });

  const handleUploadFile = async (file: File) => {
    if (!siteId) return;
    if (!file.type.startsWith('image/')) {
      alert('画像ファイル (PNG, JPEG, GIF, WebP, SVG) を選択してください');
      return;
    }

    try {
      setIsUploading(true);
      const res = await mediaApi.upload(siteId, file);
      const uploaded: MediaItem | undefined = res.data?.data || res.data;
      await queryClient.invalidateQueries({ queryKey: ['media', siteId] });
      if (uploaded && uploaded.id) {
        handleSelectItemForConfig(uploaded);
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      alert(err?.response?.data?.error || 'アップロードに失敗しました');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportZip = async () => {
    if (!siteId || isExporting) return;
    setIsExporting(true);
    try {
      const res = await mediaApi.exportZip(siteId);
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `media-export-${siteId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('メディアのエクスポートに失敗しました: ' + (err?.message || err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportZip = async (file: File) => {
    if (!siteId || isImporting) return;
    setIsImporting(true);
    setImportMessage(null);
    try {
      const res = await mediaApi.importZip(siteId, file);
      await queryClient.invalidateQueries({ queryKey: ['media', siteId] });
      setImportMessage(res.data?.message || 'インポートが完了しました');
      setTimeout(() => setImportMessage(null), 6000);
    } catch (err: any) {
      alert('メディアのインポートに失敗しました: ' + (err?.response?.data?.error || err?.message || err));
    } finally {
      setIsImporting(false);
      if (zipInputRef.current) {
        zipInputRef.current.value = '';
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (
          file.name.toLowerCase().endsWith('.zip') ||
          file.type === 'application/zip' ||
          file.type === 'application/x-zip-compressed'
        ) {
          await handleImportZip(file);
          return;
        }
        if (file.type.startsWith('image/')) {
          await handleUploadFile(file);
        }
      }
    }
  };

  const handleCopyUrl = (id: string, url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = id ? `media:${id}` : resolveMediaUrl(url, id);
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      confirm(
        `画像「${name}」を完全に削除しますか？\n※既にページ内で参照されている場合、画像が表示されなくなる可能性があります。`
      )
    ) {
      setDeletingId(id);
      deleteMutation.mutate(id);
    }
  };

  if (!isOpen) return null;

  const filteredItems = (mediaItems || []).filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.filename?.toLowerCase().includes(q) ||
      item.original_name?.toLowerCase().includes(q)
    );
  });
  const displayedItems = filteredItems.slice(0, visibleCount);

  // 現在選択中アイテムに対する生成記法文字列
  const selectedRef = selectedItem
    ? formatMediaRef(
        selectedItem.id,
        selectedItem.id
          ? `media:${selectedItem.id}`
          : resolveMediaUrl(selectedItem.cdn_url, selectedItem.id)
      )
    : 'media:uuid';

  const generatedSyntax = buildMediaMarkdown(selectedRef, {
    syntaxMode,
    frame,
    align,
    width: widthInput.trim() || undefined,
    height: heightInput.trim() || undefined,
    caption: captionInput.trim() || undefined,
    alt: altInput.trim() || undefined,
  });

  const handleConfirmInsert = (itemToInsert?: MediaItem) => {
    const targetItem = itemToInsert || selectedItem;
    if (!targetItem || !onSelectImage) return;

    const displayName = targetItem.original_name || targetItem.filename;
    const targetRef = targetItem.id
      ? `media:${targetItem.id}`
      : resolveMediaUrl(targetItem.cdn_url, targetItem.id);

    const finalMarkdown = buildMediaMarkdown(targetRef, {
      syntaxMode,
      frame,
      align,
      width: widthInput.trim() || undefined,
      height: heightInput.trim() || undefined,
      caption:
        itemToInsert && itemToInsert.id !== selectedItem?.id
          ? displayName.replace(/\.[^/.]+$/, '')
          : captionInput.trim() || undefined,
      alt: altInput.trim() || undefined,
    });

    onSelectImage(targetRef, displayName, targetItem, finalMarkdown);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground w-full max-w-6xl h-[88vh] rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileImage className="size-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold leading-none">
                メディアライブラリ & 画像挿入設定
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                MediaWiki風のサイズ・挿入位置（回り込み）・サムネイル枠・キャプションを指定して挿入できます
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* コントロールバー */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-6 py-2.5 border-b border-border bg-muted/10 shrink-0">
          {/* 検索入力 */}
          <div className="relative flex-1 max-w-md">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="ファイル名で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                  for (let i = 0; i < e.target.files.length; i++) {
                    await handleUploadFile(e.target.files[i]);
                  }
                }
              }}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={zipInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleImportZip(e.target.files[0]);
                }
              }}
              accept=".zip,application/zip,application/x-zip-compressed"
              className="hidden"
            />

            <button
              type="button"
              onClick={handleExportZip}
              disabled={isExporting || isUploading || isImporting}
              title="サイト内の全画像をZIPファイルとして一括ダウンロードします（UUIDメタデータ付き）"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium cursor-pointer shadow-2xs disabled:opacity-50 transition-colors"
            >
              {isExporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5 text-blue-600 dark:text-blue-400" />}
              <span>一括エクスポート</span>
            </button>

            <button
              type="button"
              onClick={() => zipInputRef.current?.click()}
              disabled={isExporting || isUploading || isImporting}
              title="エクスポートしたZIPファイルや画像ZIPを一括復元・インポートします"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium cursor-pointer shadow-2xs disabled:opacity-50 transition-colors"
            >
              {isImporting ? <Loader2 className="size-3.5 animate-spin text-emerald-600" /> : <FolderArchive className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
              <span>一括インポート</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isImporting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50 transition-colors"
            >
              {isUploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              <span>画像アップロード</span>
            </button>
          </div>
        </div>

        {importMessage && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Check className="size-4" />
              {importMessage}
            </span>
            <button
              type="button"
              onClick={() => setImportMessage(null)}
              className="text-emerald-700/60 hover:text-emerald-700 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* メイン領域: 左側=画像一覧グリッド / 右側=MediaWiki挿入設定パネル */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* 画像一覧グリッド */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className="flex-1 overflow-y-auto p-5 relative"
          >
            {isDragging && (
              <div className="absolute inset-4 z-20 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-xl flex flex-col items-center justify-center pointer-events-none backdrop-blur-xs">
                <Upload className="size-12 text-blue-500 animate-bounce mb-2" />
                <p className="font-semibold text-sm text-blue-600 dark:text-blue-400">
                  ここに画像をドロップして即時アップロード
                </p>
              </div>
            )}

            {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-xs">メディアを読み込み中...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-16 text-center">
                <div className="size-16 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mb-4">
                  <ImageIcon className="size-8 stroke-[1.5]" />
                </div>
                <p className="font-semibold text-sm">
                  {searchQuery
                    ? '検索条件に一致する画像がありません'
                    : 'メディアファイルがありません'}
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  右上の「画像をアップロード」ボタンをクリックするか、ここに直接ドラッグ＆ドロップして画像を追加できます。
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 rounded-lg text-secondary-foreground font-medium cursor-pointer"
                >
                  <Upload className="size-3.5" />
                  <span>画像を選択</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                {displayedItems.map((item) => {
                  const displayName = item.original_name || item.filename;
                  const isCurrentlySelected = selectedItem?.id === item.id;
                  const primaryUrl = item.id
                    ? `/v1/public/media/${item.id}`
                    : resolveMediaUrl(item.cdn_url, item.id);
                  const fallbackUrl = resolveMediaUrl(item.cdn_url, item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItemForConfig(item)}
                      onDoubleClick={() => {
                        if (onSelectImage) {
                          handleConfirmInsert(item);
                        }
                      }}
                      className={`group relative bg-card border rounded-xl overflow-hidden hover:shadow-md transition-all flex flex-col cursor-pointer ${
                        isCurrentlySelected
                          ? 'border-primary ring-2 ring-primary/40 shadow-sm'
                          : 'border-border hover:border-primary/60'
                      }`}
                    >
                      {/* サムネイル画像領域 */}
                      <div className="aspect-square w-full bg-muted/40 relative overflow-hidden flex items-center justify-center">
                        <img
                          src={primaryUrl}
                          alt={displayName}
                          loading="lazy"
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (
                              fallbackUrl &&
                              target.src !== fallbackUrl &&
                              !target.src.endsWith(fallbackUrl)
                            ) {
                              target.src = fallbackUrl;
                            }
                          }}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />

                        {isCurrentlySelected && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shadow-xs flex items-center gap-1">
                            <Check className="size-3" />
                            <span>選択中</span>
                          </div>
                        )}

                        {/* ホバー時アクションオーバーレイ */}
                        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2">
                          {onSelectImage && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleConfirmInsert(item);
                              }}
                              className="px-2.5 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-semibold rounded-md shadow-xs cursor-pointer"
                              title="現在の設定で即時挿入"
                            >
                              即時挿入
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleCopyUrl(item.id, item.cdn_url, e)}
                            className="p-1.5 bg-background/90 hover:bg-background text-foreground rounded-md shadow-xs transition-colors cursor-pointer"
                            title="永続メディアID (media:UUID) をコピー"
                          >
                            {copiedId === item.id ? (
                              <Check className="size-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(item.id, displayName, e)}
                            disabled={deletingId === item.id}
                            className="p-1.5 bg-background/90 hover:bg-rose-500 hover:text-white text-rose-500 rounded-md shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                            title="画像を削除"
                          >
                            {deletingId === item.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* メタ情報 */}
                      <div className="p-2.5 flex flex-col justify-between flex-1 bg-background/50 text-[11px]">
                        <span
                          className="font-medium truncate text-foreground"
                          title={displayName}
                        >
                          {displayName}
                        </span>
                        <div className="flex items-center justify-between text-muted-foreground mt-1 pt-1 border-t border-border/40">
                          <span>{formatBytes(item.size)}</span>
                          {item.created_at && (
                            <span>
                              {new Date(item.created_at).toLocaleDateString('ja-JP', {
                                month: 'numeric',
                                day: 'numeric',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {visibleCount < filteredItems.length && (
                  <div className="col-span-full py-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + 36)}
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors cursor-pointer shadow-xs"
                    >
                      さらに読み込む (残り {filteredItems.length - visibleCount} 件)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 右側: MediaWiki風 画像挿入設定パネル */}
          <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-border bg-muted/15 flex flex-col overflow-y-auto shrink-0">
            <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="size-4 text-primary" />
                <h3 className="font-bold text-xs sm:text-sm">画像挿入・表示オプション</h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                MediaWiki 互換
              </span>
            </div>

            {selectedItem ? (
              <div className="p-4 space-y-4 flex-1 text-xs">
                {/* 選択中画像のミニプレビュー */}
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-background border border-border">
                  <img
                    src={
                      selectedItem.id
                        ? `/v1/public/media/${selectedItem.id}`
                        : resolveMediaUrl(selectedItem.cdn_url, selectedItem.id)
                    }
                    alt={selectedItem.original_name || selectedItem.filename}
                    className="size-14 rounded-lg object-cover border border-border shrink-0 bg-muted"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate text-foreground">
                      {selectedItem.original_name || selectedItem.filename}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {formatBytes(selectedItem.size)}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                      {selectedRef}
                    </div>
                  </div>
                </div>

                {/* 1. キャプション入力 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-foreground">
                      キャプション (説明文)
                    </label>
                    {captionInput && (
                      <button
                        type="button"
                        onClick={() => setCaptionInput('')}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={captionInput}
                    onChange={(e) => setCaptionInput(e.target.value)}
                    placeholder="画像の下に表示するキャプション..."
                    className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* 2. 挿入位置・配置 (Alignment) */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground block">
                    挿入位置・テキスト回り込み
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        {
                          id: 'right',
                          label: '右寄せ',
                          sub: '回り込み',
                          icon: AlignRight,
                        },
                        {
                          id: 'center',
                          label: '中央',
                          sub: 'ブロック',
                          icon: AlignCenter,
                        },
                        {
                          id: 'left',
                          label: '左寄せ',
                          sub: '回り込み',
                          icon: AlignLeft,
                        },
                        {
                          id: 'none',
                          label: '標準',
                          sub: '左詰め',
                          icon: Maximize2,
                        },
                      ] as const
                    ).map((opt) => {
                      const Icon = opt.icon;
                      const active = align === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAlign(opt.id)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                            active
                              ? 'border-primary bg-primary/10 text-primary font-semibold shadow-2xs'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                        >
                          <Icon className="size-3.5 mb-1" />
                          <span className="text-[11px] leading-tight">{opt.label}</span>
                          <span className="text-[9px] opacity-75 leading-tight mt-0.5">
                            {opt.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. 表示枠スタイル (Frame) */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground block">
                    表示スタイル (枠)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        {
                          id: 'thumb',
                          label: 'サムネイル枠 (thumb)',
                          desc: 'MediaWiki標準枠＋拡大ボタン',
                        },
                        {
                          id: 'none',
                          label: '標準カード',
                          desc: '角丸＋シャドウ＋中央キャプション',
                        },
                        {
                          id: 'frameless',
                          label: '枠なし (frameless)',
                          desc: 'キャプション非表示・画像のみ',
                        },
                        {
                          id: 'border',
                          label: '境界線のみ (border)',
                          desc: '細い枠線付きシンプル表示',
                        },
                      ] as const
                    ).map((f) => {
                      const active = frame === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFrame(f.id)}
                          className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                            active
                              ? 'border-primary bg-primary/10 text-primary font-semibold'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'
                          }`}
                        >
                          <div className="text-[11px] font-semibold">{f.label}</div>
                          <div className="text-[10px] opacity-75 mt-0.5">{f.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. サイズ指定 (Size) */}
                <div className="space-y-2">
                  <label className="font-semibold text-foreground block">
                    画像サイズ指定
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {SIZE_PRESETS.map((preset) => {
                      const active = widthInput === preset.value && !heightInput;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setWidthInput(preset.value);
                            setHeightInput('');
                          }}
                          className={`px-2 py-1 rounded-lg border text-[11px] transition-colors cursor-pointer ${
                            active
                              ? 'border-primary bg-primary text-primary-foreground font-semibold'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-1">
                        幅 (例: 300px, 50%)
                      </span>
                      <input
                        type="text"
                        value={widthInput}
                        onChange={(e) => setWidthInput(e.target.value)}
                        placeholder="300px"
                        className="w-full px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-1">
                        最大高さ (オプション, 例: 200px)
                      </span>
                      <input
                        type="text"
                        value={heightInput}
                        onChange={(e) => setHeightInput(e.target.value)}
                        placeholder="未指定"
                        className="w-full px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* 5. 記法モード選択 & プレビュー */}
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      <Sparkles className="size-3 text-primary" />
                      <span>出力記法</span>
                    </span>
                    <div className="flex rounded-lg border border-border bg-background p-0.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setSyntaxMode('mediawiki')}
                        className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          syntaxMode === 'mediawiki'
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        MediaWiki [[File:...]]
                      </button>
                      <button
                        type="button"
                        onClick={() => setSyntaxMode('markdown')}
                        className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          syntaxMode === 'markdown'
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Markdown ![...]
                      </button>
                    </div>
                  </div>

                  <div className="relative group/code">
                    <pre className="p-2.5 rounded-xl bg-slate-950 text-slate-100 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all border border-slate-800">
                      {generatedSyntax}
                    </pre>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedSyntax);
                        setCopiedSyntax(true);
                        setTimeout(() => setCopiedSyntax(false), 2000);
                      }}
                      className="absolute top-1.5 right-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] flex items-center gap-1 cursor-pointer"
                      title="記法をクリップボードにコピー"
                    >
                      {copiedSyntax ? (
                        <>
                          <Check className="size-3 text-emerald-400" />
                          <span>コピー済</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>コピー</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* 挿入確定ボタン */}
                {onSelectImage && (
                  <button
                    type="button"
                    onClick={() => handleConfirmInsert()}
                    className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Check className="size-4" />
                    <span>この設定でエディタに挿入する</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <ImageIcon className="size-10 stroke-[1.2] mb-2 opacity-40" />
                <p className="text-xs font-medium">
                  左の一覧から画像を選択すると、サイズ・配置・キャプションを設定できます
                </p>
              </div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground shrink-0">
          <span>全 {filteredItems.length} 件のメディア</span>
          <div className="flex items-center gap-2">
            {onSelectImage && (
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                画像を選択して右側でサイズ・位置・キャプションを調整後、「エディタに挿入する」をクリック（ダブルクリックで即時挿入）
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
