'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi, ApiKeyItem } from '@/lib/api';
import Link from 'next/link';
import {
  KeyRound,
  Plus,
  ArrowLeft,
  Copy,
  Check,
  Trash2,
  Calendar,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Terminal,
  ExternalLink,
  Code,
} from 'lucide-react';

export default function ApiKeysSettingsPage() {
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined);
  const [createdKeyData, setCreatedKeyData] = useState<{
    secret_key: string;
    name: string;
  } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // 削除確認モーダル
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyItem | null>(null);

  // APIキー一覧クエリ
  const { data: keys = [], isLoading } = useQuery<ApiKeyItem[]>({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list().then((r) => r.data.data),
  });

  // APIキー発行ミューテーション
  const createMutation = useMutation({
    mutationFn: (data: { name: string; expires_in_days?: number }) =>
      apiKeysApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setCreatedKeyData({
        secret_key: res.data.data.secret_key,
        name: res.data.data.name,
      });
      setName('');
      setExpiresInDays(undefined);
    },
  });

  // APIキー失効ミューテーション
  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setKeyToRevoke(null);
    },
  });

  const handleCopyKey = () => {
    if (createdKeyData?.secret_key) {
      navigator.clipboard.writeText(createdKeyData.secret_key);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* 戻るリンク */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors mb-3"
        >
          <ArrowLeft className="size-3.5" />
          <span>ダッシュボードに戻る</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <KeyRound className="size-6 text-blue-600" />
              <span>開発者 API キー (API Keys)</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Klados REST API を外部プログラム、GitHub Actions、CLI ツールから呼び出すためのAPIキーを管理します
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setCreatedKeyData(null);
              setCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="size-3.5" />
            <span>新規 API キーを発行</span>
          </button>
        </div>
      </div>

      {/* APIキー一覧テーブル */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs mb-8">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-xs text-slate-700 uppercase tracking-wider">
            発行済み API キー ({keys.length})
          </span>
          <span className="text-[11px] text-slate-500">Bearer 認証対応</span>
        </div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="size-6 animate-spin text-blue-600" />
            <p className="text-xs">API キーを読み込み中...</p>
          </div>
        ) : keys.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-2">
            <KeyRound className="size-10 mx-auto stroke-[1.2] text-slate-300 mb-1" />
            <p className="text-sm font-semibold text-slate-700">有効な API キーはありません</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              「新規 API キーを発行」からキーを生成して、外部自動化やAPI連携を開始してください。
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {keys.map((k) => (
              <div
                key={k.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-sm text-slate-900 truncate">{k.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                      有効
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <code className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs font-mono text-slate-600 select-all">
                      {k.prefix}
                    </code>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      <span>作成日: {new Date(k.created_at).toLocaleDateString('ja-JP')}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      <span>
                        最終使用:{' '}
                        {k.last_used_at
                          ? new Date(k.last_used_at).toLocaleDateString('ja-JP')
                          : '未使用'}
                      </span>
                    </span>
                    {k.expires_at && (
                      <span className="text-amber-600">
                        有効期限: {new Date(k.expires_at).toLocaleDateString('ja-JP')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setKeyToRevoke(k)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                    <span>失効 (Revoke)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API 利用サンプル コードスニペット */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Terminal className="size-4 text-blue-400" />
          <span className="text-xs font-bold font-mono">API 利用クイックスタート (cURL / Fetch)</span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          発行した API キーは HTTP リクエストヘッダーの <code className="text-blue-400">Authorization: Bearer &lt;API_KEY&gt;</code> に付与して送信します:
        </p>

        <div className="p-3.5 rounded-xl bg-black/60 font-mono text-xs text-emerald-400 overflow-x-auto leading-relaxed">
          <p className="text-slate-500"># サイト一覧を取得する例</p>
          <p>
            curl -X GET https://api.klados.app/v1/sites \<br />
            &nbsp;&nbsp;-H &quot;Authorization: Bearer kla_live_YOUR_KEY_HERE&quot; \<br />
            &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot;
          </p>
        </div>
      </div>

      {/* 新規発行モーダル */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => {
            if (!createdKeyData) setCreateModalOpen(false);
          }}
        >
          <div
            className="bg-white text-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-5 animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {!createdKeyData ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <KeyRound className="size-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">新しい API キーを発行</h3>
                    <p className="text-xs text-slate-500">用途に応じた識別名と有効期間を設定します</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">API キーの名前 *</label>
                    <input
                      type="text"
                      required
                      placeholder="例: GitHub Actions デプロイ, 本番バックアップ CLI"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">有効期限</label>
                    <select
                      value={expiresInDays ?? ''}
                      onChange={(e) =>
                        setExpiresInDays(e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="w-full px-3.5 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">無期限 (Never Expire)</option>
                      <option value="30">30 日間</option>
                      <option value="90">90 日間</option>
                      <option value="365">1 年間</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2 text-xs rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => createMutation.mutate({ name, expires_in_days: expiresInDays })}
                    disabled={!name.trim() || createMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer disabled:opacity-50 transition-colors shadow-xs"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="size-3.5" />
                    )}
                    <span>キーを発行</span>
                  </button>
                </div>
              </>
            ) : (
              /* 生成後のキー表示画面 */
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-emerald-600">
                  <div className="size-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <ShieldCheck className="size-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">API キーが発行されました</h3>
                    <p className="text-xs text-slate-500">{createdKeyData.name}</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">このキーは二度と表示されません！</p>
                    <p className="leading-relaxed opacity-90">
                      今すぐ安全なパスワードマネージャーや環境変数に保存してください。ウィンドウを閉じると再確認できなくなります。
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">シークレット API キー</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdKeyData.secret_key}
                      className="flex-1 px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-2xs ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      <span>{isCopied ? 'コピー完了' : 'コピー'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateModalOpen(false);
                      setCreatedKeyData(null);
                    }}
                    className="px-5 py-2 text-xs rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer transition-colors"
                  >
                    保存完了して閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 失効確認モーダル */}
      {keyToRevoke && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setKeyToRevoke(null)}
        >
          <div
            className="bg-white text-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-600">
              <div className="size-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <Trash2 className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">API キーを失効させますか？</h3>
                <p className="text-xs text-slate-500">{keyToRevoke.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              このキー (<code>{keyToRevoke.prefix}</code>) を失効させると、このキーを使用しているすべてのスクリプトや外部サービスからのリクエストが直ちに拒否されます。この操作は取り消せません。
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setKeyToRevoke(null)}
                className="px-4 py-2 text-xs rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => revokeMutation.mutate(keyToRevoke.id)}
                disabled={revokeMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer disabled:opacity-40 transition-colors shadow-xs"
              >
                {revokeMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                <span>失効を実行する</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
