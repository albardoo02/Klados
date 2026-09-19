'use client';

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mediaApi, MediaItem } from '@/lib/api';
import {
  X,
  Upload,
  Search,
  Trash2,
  Copy,
  Check,
  Image as ImageIcon,
  Loader2,
  ExternalLink,
  Plus,
  FileImage,
} from 'lucide-react';

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  onSelectImage?: (url: string, filename: string, item?: MediaItem) => void;
}

function formatBytes(bytes?: number, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function MediaLibraryModal({
  isOpen,
  onClose,
  siteId,
  onSelectImage,
}: MediaLibraryModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: mediaItems, isLoading } = useQuery<MediaItem[]>({
    queryKey: ['media', siteId],
    queryFn: () => mediaApi.list(siteId).then((r) => r.data?.data || r.data || []),
    enabled: isOpen && Boolean(siteId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mediaApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', siteId] });
      setDeletingId(null);
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
      await mediaApi.upload(siteId, file);
      queryClient.invalidateQueries({ queryKey: ['media', siteId] });
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

  const handleCopyUrl = (id: string, url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = id ? `media:${id}` : url;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`画像「${name}」を完全に削除しますか？\n※既にページ内で参照されている場合、画像が表示されなくなる可能性があります。`)) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileImage className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-none">メディアライブラリ</h2>
              <p className="text-xs text-muted-foreground mt-1">
                サイトにアップロードされた画像やアセットを管理・挿入できます
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-6 py-3 border-b border-border bg-muted/10">
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

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUploadFile(e.target.files[0]);
                }
              }}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50 transition-colors"
            >
              {isUploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              <span>画像をアップロード</span>
            </button>
          </div>
        </div>

        {/* 画像一覧グリッド */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className="flex-1 overflow-y-auto p-6 relative"
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
                {searchQuery ? '検索条件に一致する画像がありません' : 'メディアファイルがありません'}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredItems.map((item) => {
                const displayName = item.original_name || item.filename;
                const isSelectedForInsertion = Boolean(onSelectImage);

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (onSelectImage) {
                        const targetRef = item.id ? `media:${item.id}` : item.cdn_url;
                        onSelectImage(targetRef, displayName, item);
                        onClose();
                      }
                    }}
                    className={`group relative bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all flex flex-col ${
                      isSelectedForInsertion
                        ? 'cursor-pointer hover:border-primary ring-offset-background hover:ring-2 hover:ring-primary/40'
                        : ''
                    }`}
                  >
                    {/* サムネイル画像領域 */}
                    <div className="aspect-square w-full bg-muted/40 relative overflow-hidden flex items-center justify-center">
                      <img
                        src={item.cdn_url}
                        alt={displayName}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />

                      {/* ホバー時アクションオーバーレイ */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2">
                        {onSelectImage && (
                          <span className="px-2.5 py-1 bg-primary text-primary-foreground text-[11px] font-semibold rounded-md shadow-xs pointer-events-none">
                            挿入する
                          </span>
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
                      <span className="font-medium truncate text-foreground" title={displayName}>
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
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          <span>全 {filteredItems.length} 件のメディア</span>
          <div className="flex items-center gap-2">
            {onSelectImage && (
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                画像をクリックするとMarkdownエディタに挿入されます
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
