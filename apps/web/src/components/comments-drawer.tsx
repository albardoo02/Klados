'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commentsApi, CommentItem } from '@/lib/api';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Trash2,
  User,
  Clock,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

interface CommentsDrawerProps {
  pageId: string;
  pageTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  currentUser?: {
    name?: string;
    avatar?: string;
  };
}

// ユーザー名から背景色を決定するヘルパー
function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-indigo-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-purple-500',
    'bg-cyan-500',
    'bg-teal-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// 相対時間の表示ヘルパー
function formatTimeAgo(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 60) return 'たった今';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}分前`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}時間前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}日前`;
    return d.toLocaleDateString('ja-JP');
  } catch {
    return dateStr;
  }
}

export function CommentsDrawer({
  pageId,
  pageTitle,
  isOpen,
  onClose,
  currentUser,
}: CommentsDrawerProps) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [authorName, setAuthorName] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 初回ロード時に保存された名前またはログイン中ユーザー名を設定
  useEffect(() => {
    if (currentUser?.name) {
      setAuthorName(currentUser.name);
    } else if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('klados_comment_author');
      if (stored) setAuthorName(stored);
    }
  }, [currentUser]);

  // コメント一覧クエリ
  const { data: comments = [], isLoading } = useQuery<CommentItem[]>({
    queryKey: ['comments', pageId],
    queryFn: () => commentsApi.list(pageId).then((r) => r.data.data),
    enabled: isOpen && !!pageId,
  });

  // 新規投稿ミューテーション (楽観的更新付き)
  const submitMutation = useMutation({
    mutationFn: (data: { author_name: string; content: string }) =>
      commentsApi.create(pageId, data),
    onMutate: async (newEntry) => {
      await queryClient.cancelQueries({ queryKey: ['comments', pageId] });
      const prev = queryClient.getQueryData<CommentItem[]>(['comments', pageId]) || [];

      const optimisticComment: CommentItem = {
        id: `optimistic_${Date.now()}`,
        page_id: pageId,
        author_name: newEntry.author_name || 'ゲスト',
        content: newEntry.content,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<CommentItem[]>(['comments', pageId], [...prev, optimisticComment]);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['comments', pageId], context.prev);
      }
      alert('コメントの送信に失敗しました');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', pageId] });
    },
  });

  // コメント削除ミューテーション
  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => commentsApi.delete(pageId, commentId),
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: ['comments', pageId] });
      const prev = queryClient.getQueryData<CommentItem[]>(['comments', pageId]) || [];
      queryClient.setQueryData<CommentItem[]>(
        ['comments', pageId],
        prev.filter((c) => c.id !== commentId)
      );
      return { prev };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', pageId] });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    const name = authorName.trim() || 'ゲスト';
    if (typeof window !== 'undefined') {
      localStorage.setItem('klados_comment_author', name);
    }

    setIsSubmitting(true);
    try {
      await submitMutation.mutateAsync({
        author_name: name,
        content: content.trim(),
      });
      setContent('');
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card text-card-foreground h-full shadow-2xl border-l border-border flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ドロワーヘッダー */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <MessageSquare className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm leading-none">コメント & フィードバック</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                  {comments.length}
                </span>
              </div>
              {pageTitle && (
                <p className="text-xs text-muted-foreground mt-1 truncate max-w-[240px]">
                  {pageTitle}
                </p>
              )}
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

        {/* コメント一覧スレッド */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 divide-y divide-border/40">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-xs">コメントを読み込み中...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <MessageSquare className="size-10 mx-auto stroke-[1.2] text-muted-foreground/40 mb-2" />
              <p className="text-sm font-semibold">まだコメントはありません</p>
              <p className="text-xs text-muted-foreground/80 max-w-xs mx-auto">
                最初のフィードバックや質問、ご感想を下のフォームから投稿してみましょう！
              </p>
            </div>
          ) : (
            comments.map((comment) => {
              const avatarColor = getAvatarColor(comment.author_name);
              const initial = comment.author_name.charAt(0).toUpperCase() || 'U';

              return (
                <div key={comment.id} className="pt-4 first:pt-0 group">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`size-7 rounded-full ${avatarColor} text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs`}
                      >
                        {initial}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-foreground">
                          {comment.author_name}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="size-2.5" />
                          <span>{formatTimeAgo(comment.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('このコメントを削除しますか？')) {
                          deleteMutation.mutate(comment.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-rose-600 rounded transition-all cursor-pointer"
                      title="コメントを削除"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  {/* Markdown コメント本文 */}
                  <div className="pl-9 text-xs leading-relaxed text-foreground prose-xs prose-neutral dark:prose-invert">
                    <MarkdownRenderer content={comment.content} />
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* コメント投稿フォーム */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-muted/20 space-y-3">
          <div className="flex items-center gap-2">
            <User className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="お名前 (例: 山田太郎 / ゲスト)"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="w-full px-2.5 py-1 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="relative">
            <textarea
              rows={3}
              required
              placeholder="コメントをMarkdownで入力... (**太字**, `コード` など対応)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary resize-none placeholder:text-muted-foreground/70"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-muted-foreground">
              <kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono">
                Ctrl+Enter
              </kbd>{' '}
              で送信
            </span>

            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
            >
              {isSubmitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              <span>送信する</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
