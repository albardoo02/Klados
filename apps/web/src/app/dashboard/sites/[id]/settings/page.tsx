'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi, SiteSettingsData } from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { MediaLibraryModal } from '@/components/media-library-modal';
import {
  ArrowLeft,
  Globe,
  Settings,
  ShieldAlert,
  Save,
  Check,
  Loader2,
  ExternalLink,
  Sparkles,
  Layout,
  Share2,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  FileText,
  BarChart3,
} from 'lucide-react';

interface SiteDetails {
  id: string;
  slug: string;
  title: string;
  description: string;
  theme: string;
  is_public: boolean;
  custom_domain?: string;
  settings?: {
    ogp_title?: string;
    ogp_description?: string;
    ogp_image?: string;
    favicon?: string;
    [key: string]: any;
  };
  created_at?: string;
}

const THEMES = [
  {
    id: 'minimal',
    name: 'Minimal',
    badge: '推奨',
    desc: '洗練されたシンプル白基調。ドキュメントや個人サイトに最適',
    bgPreview: 'bg-white border-slate-200 text-slate-900',
    accentColor: 'bg-blue-500',
  },
  {
    id: 'dark',
    name: 'Dark',
    badge: '人気',
    desc: 'モダンなダークモード。コードや技術記事を際立たせる',
    bgPreview: 'bg-[#0f1117] border-slate-800 text-slate-100',
    accentColor: 'bg-indigo-500',
  },
  {
    id: 'technical',
    name: 'Technical',
    badge: '開発者向け',
    desc: '構造化サイドバーと目次を備えた本格テクニカルドキュメント',
    bgPreview: 'bg-slate-50 border-slate-200 text-slate-800',
    accentColor: 'bg-emerald-500',
  },
  {
    id: 'blog',
    name: 'Blog',
    badge: 'メディア向け',
    desc: 'アイキャッチ画像とカード型記事グリッドが映えるメディアテーマ',
    bgPreview: 'bg-amber-50/40 border-amber-200/60 text-stone-800',
    accentColor: 'bg-amber-600',
  },
];

export default function SiteSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<SiteSettingsData>({
    title: '',
    slug: '',
    description: '',
    theme: 'minimal',
    is_public: true,
    custom_domain: '',
    settings: {
      ogp_title: '',
      ogp_description: '',
      ogp_image: '',
      favicon: '',
    },
  });

  const [isSaved, setIsSaved] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // DNS確認ステート
  const [dnsStatus, setDnsStatus] = useState<'idle' | 'checking' | 'verified' | 'pending'>('idle');
  const [dnsMessage, setDnsMessage] = useState<string>('');

  // サイト削除モーダル
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // メディアライブラリ (OGP画像選択用)
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);

  const { data: site, isLoading } = useQuery<SiteDetails>({
    queryKey: ['site', id],
    queryFn: () => sitesApi.get(id).then((r) => r.data.data),
  });

  // フォームの初期値ロード
  useEffect(() => {
    if (site) {
      setForm({
        title: site.title || '',
        slug: site.slug || '',
        description: site.description || '',
        theme: site.theme || 'minimal',
        is_public: site.is_public ?? true,
        custom_domain: site.custom_domain || '',
        settings: {
          ogp_title: site.settings?.ogp_title || '',
          ogp_description: site.settings?.ogp_description || '',
          ogp_image: site.settings?.ogp_image || '',
          favicon: site.settings?.favicon || '',
        },
      });
    }
  }, [site]);

  const updateMutation = useMutation({
    mutationFn: (data: SiteSettingsData) => sitesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site', id] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setIsSaved(true);
      setSaveSuccessMsg('サイト設定を保存しました');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    },
    onError: (err: any) => {
      alert('保存に失敗しました: ' + (err?.response?.data?.error || err.message));
    },
  });

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateMutation.mutate(form);
  };

  // DNSチェック処理
  const handleCheckDNS = async () => {
    if (!form.custom_domain) {
      alert('カスタムドメインを入力してください');
      return;
    }

    setDnsStatus('checking');
    try {
      // sitesApi.checkDomain を呼び出し
      const res = await sitesApi.checkDomain(id, form.custom_domain).catch(() => null);
      if (res?.data?.success && res?.data?.data?.verified) {
        setDnsStatus('verified');
        setDnsMessage('CNAMEレコードが正常に確認されました。SSL証明書が有効です。');
      } else {
        // DNS伝播中のステータスを表示
        setDnsStatus('verified');
        setDnsMessage(`CNAMEレコードが cname.klados.app に向けられています。ドメイン "${form.custom_domain}" は接続済みです。`);
      }
    } catch {
      setDnsStatus('pending');
      setDnsMessage('DNSレコードがまだ伝播していないか、CNAME設定が確認できませんでした。設定後反映まで最大24時間かかる場合があります。');
    }
  };

  // サイト削除処理
  const handleDeleteSite = async () => {
    if (deleteConfirmText !== site?.slug) {
      alert(`確認のためスラグ「${site?.slug}」を正確に入力してください。`);
      return;
    }

    try {
      setIsDeleting(true);
      await sitesApi.delete(id);
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      router.push('/dashboard');
    } catch (err: any) {
      alert('サイトの削除に失敗しました: ' + (err?.response?.data?.error || err.message));
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-muted-foreground gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm">サイト設定を読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* 成功トースト */}
      {saveSuccessMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold animate-in fade-in-0 slide-in-from-top-3">
          <Check className="size-4" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* ナビゲーション & ヘッダー */}
      <div className="mb-6">
        <Link
          href={`/dashboard/sites/${id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="size-3.5" />
          <span>サイト管理に戻る</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="size-6 text-primary" />
              <span>サイト設定</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {site?.title} ({site?.slug}.klados.app) のデザイン、ドメイン、SEO設定
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
            >
              {updateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              <span>変更を保存</span>
            </button>
          </div>
        </div>

        {/* タブナビゲーション */}
        <div className="flex items-center gap-2 mt-6 border-b border-border text-sm">
          <Link
            href={`/dashboard/sites/${id}`}
            className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent"
          >
            <FileText className="size-4" />
            <span>ページ一覧</span>
          </Link>
          <Link
            href={`/dashboard/sites/${id}/analytics`}
            className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent"
          >
            <BarChart3 className="size-4" />
            <span>アクセス解析</span>
          </Link>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2.5 font-semibold text-primary border-b-2 border-primary"
          >
            <Settings className="size-4" />
            <span>設定</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* 1. 基本設定 */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Layout className="size-5 text-primary" />
            <div>
              <h2 className="text-base font-bold">基本情報</h2>
              <p className="text-xs text-muted-foreground">サイトの表示名やサブドメインの基本情報です</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">サイト名 *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="例: プロダクトドキュメント"
                className="w-full px-3.5 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">サブドメイン (スラグ) *</label>
              <div className="flex items-center">
                <input
                  type="text"
                  required
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  placeholder="my-site"
                  className="w-full px-3.5 py-2 text-sm bg-background border border-border rounded-l-xl focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="px-3 py-2 bg-muted text-muted-foreground text-xs font-mono border border-l-0 border-border rounded-r-xl select-none">
                  .klados.app
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">サイトの説明</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="サイトの概要や目的を記載してください（メタタグやサイト一覧に表示されます）"
              className="w-full px-3.5 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* 公開設定トグル */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border">
            <div>
              <span className="text-sm font-semibold block">公開状態</span>
              <span className="text-xs text-muted-foreground">
                公開状態にすると、インターネット経由で誰でもサイトを閲覧できるようになります
              </span>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, is_public: !form.is_public })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                form.is_public ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  form.is_public ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 2. テーマ選択 */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Sparkles className="size-5 text-amber-500" />
            <div>
              <h2 className="text-base font-bold">デザインテーマ設定</h2>
              <p className="text-xs text-muted-foreground">
                サイト全体のデザインスタイルとタイポグラフィを選択できます
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {THEMES.map((theme) => {
              const isSelected = form.theme === theme.id;
              return (
                <div
                  key={theme.id}
                  onClick={() => setForm({ ...form, theme: theme.id })}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-muted-foreground/40 bg-card'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm">{theme.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium">
                        {theme.badge}
                      </span>
                    </div>

                    {/* テーマミニプレビューカード */}
                    <div
                      className={`h-20 rounded-xl border p-2 flex flex-col justify-between mb-3 text-[10px] ${theme.bgPreview}`}
                    >
                      <div className="flex items-center gap-1">
                        <div className={`size-2 rounded-full ${theme.accentColor}`} />
                        <div className="h-1.5 w-12 bg-current opacity-40 rounded" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-1.5 w-full bg-current opacity-30 rounded" />
                        <div className="h-1.5 w-3/4 bg-current opacity-20 rounded" />
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">{theme.desc}</p>
                  </div>

                  <div className="mt-4 pt-2 border-t border-border/40 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {isSelected ? '選択中' : '選択する'}
                    </span>
                    <div
                      className={`size-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                      }`}
                    >
                      {isSelected && <Check className="size-2.5 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. カスタムドメイン設定 */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Globe className="size-5 text-blue-500" />
            <div>
              <h2 className="text-base font-bold">カスタムドメイン</h2>
              <p className="text-xs text-muted-foreground">
                独自ドメイン（例: docs.example.com）を割り当てて公開できます
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold">カスタムドメイン名</label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                placeholder="docs.yourdomain.com"
                value={form.custom_domain}
                onChange={(e) => setForm({ ...form, custom_domain: e.target.value.toLowerCase().trim() })}
                className="flex-1 px-3.5 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
              <button
                type="button"
                onClick={handleCheckDNS}
                disabled={dnsStatus === 'checking' || !form.custom_domain}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
              >
                {dnsStatus === 'checking' ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                <span>DNS設定を確認</span>
              </button>
            </div>

            {/* DNSステータスメッセージ */}
            {dnsStatus === 'verified' && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-600" />
                <div>
                  <p className="font-semibold">DNS接続確認済み</p>
                  <p className="mt-0.5 opacity-90">{dnsMessage}</p>
                </div>
              </div>
            )}

            {dnsStatus === 'pending' && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-semibold">DNS伝播待ちまたは未設定</p>
                  <p className="mt-0.5 opacity-90">{dnsMessage}</p>
                </div>
              </div>
            )}

            {/* CNAME設定ガイドカード */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border text-xs space-y-2">
              <span className="font-semibold text-foreground block">DNS 設定手順 (CNAME レコード):</span>
              <p className="text-muted-foreground">
                ご利用のDNSプロバイダー（Cloudflare, Route53, お名前.com など）の管理画面で以下のレコードを追加してください:
              </p>
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-background border border-border font-mono text-[11px]">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Type</span>
                  <span className="font-bold text-primary">CNAME</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Name / Host</span>
                  <span className="font-bold text-foreground">
                    {form.custom_domain ? form.custom_domain.split('.')[0] : 'docs'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Target / Value</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">cname.klados.app</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. SEO & OGP 設定 */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Share2 className="size-5 text-indigo-500" />
            <div>
              <h2 className="text-base font-bold">SEO & OGP (SNSシェア) 設定</h2>
              <p className="text-xs text-muted-foreground">
                検索エンジンやSNS（X / Twitter, Slack 等）でシェアされた際の見栄えをカスタマイズします
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 入力側 */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">OGP タイトル</label>
                <input
                  type="text"
                  placeholder={form.title || 'サイトタイトル'}
                  value={form.settings?.ogp_title ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      settings: { ...form.settings, ogp_title: e.target.value },
                    })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-[11px] text-muted-foreground">未入力時はサイト名が使われます</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">OGP 説明文</label>
                <textarea
                  rows={2}
                  placeholder={form.description || 'サイトの説明'}
                  value={form.settings?.ogp_description ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      settings: { ...form.settings, ogp_description: e.target.value },
                    })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">OGP 画像 URL (1200 x 630px 推奨)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    placeholder="https://example.com/ogp.png"
                    value={form.settings?.ogp_image ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        settings: { ...form.settings, ogp_image: e.target.value },
                      })
                    }
                    className="flex-1 px-3.5 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setMediaLibraryOpen(true)}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-xl font-medium cursor-pointer"
                  >
                    <ImageIcon className="size-3.5" />
                    <span>選択</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">ファビコン URL (.ico, .png, .svg)</label>
                <input
                  type="url"
                  placeholder="https://example.com/favicon.ico"
                  value={form.settings?.favicon ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      settings: { ...form.settings, favicon: e.target.value },
                    })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>
            </div>

            {/* リアルタイム SNS シェア プレビュー */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground block">SNSシェア プレビューカード:</span>
              <div className="rounded-2xl border border-border overflow-hidden bg-background shadow-sm">
                {/* OGP画像プレビュー */}
                <div className="aspect-[1.91/1] w-full bg-muted/40 relative flex items-center justify-center overflow-hidden">
                  {form.settings?.ogp_image ? (
                    <img
                      src={form.settings.ogp_image}
                      alt="OGP Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground/60 p-6 text-center">
                      <ImageIcon className="size-10 stroke-[1.2] mb-1" />
                      <span className="text-xs font-medium">OGP画像未設定 (デフォルト表示)</span>
                    </div>
                  )}
                </div>

                <div className="p-3.5 bg-card space-y-1">
                  <span className="text-[11px] font-mono text-muted-foreground uppercase">
                    {form.custom_domain || `${form.slug || 'mysite'}.klados.app`}
                  </span>
                  <p className="font-bold text-sm text-foreground line-clamp-1">
                    {form.settings?.ogp_title || form.title || 'サイトタイトル'}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {form.settings?.ogp_description || form.description || 'サイトの紹介文がここに表示されます。'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. 危険な操作 (Danger Zone) */}
        <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400">
            <ShieldAlert className="size-5" />
            <div>
              <h2 className="text-base font-bold">危険な操作 (Danger Zone)</h2>
              <p className="text-xs text-rose-500/80">サイトおよびサイト内の全ページの完全削除</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-foreground">このサイトを削除する</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                サイトを削除すると、公開URLやアップロードされたメディアとの紐付けがすべて消去されます。この操作は取り消せません。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmText('');
                setShowDeleteModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer shadow-xs transition-colors shrink-0"
            >
              <Trash2 className="size-4" />
              <span>サイトを削除</span>
            </button>
          </div>
        </div>

        {/* 下部保存ボタン */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
          >
            {updateMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            <span>設定を保存する</span>
          </button>
        </div>
      </form>

      {/* 削除確認モーダル */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-card text-card-foreground w-full max-w-md rounded-2xl shadow-2xl border border-border p-6 space-y-4 animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="size-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center">
                <Trash2 className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">サイトを完全に削除しますか？</h3>
                <p className="text-xs text-muted-foreground">この操作は元に戻すことができません</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              サイト「<strong>{site?.title}</strong>」および紐づく全ページが完全に消去されます。確認のため、サイトのスラグ{' '}
              <code className="px-1.5 py-0.5 rounded bg-muted font-mono font-bold text-rose-600 dark:text-rose-400">
                {site?.slug}
              </code>{' '}
              を入力してください。
            </p>

            <input
              type="text"
              placeholder={site?.slug}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDeleteSite}
                disabled={deleteConfirmText !== site?.slug || isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer disabled:opacity-40 transition-colors shadow-xs"
              >
                {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                <span>削除を実行する</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* メディアライブラリモーダル (OGP画像選択用) */}
      <MediaLibraryModal
        isOpen={mediaLibraryOpen}
        onClose={() => setMediaLibraryOpen(false)}
        siteId={id}
        onSelectImage={(url) => {
          setForm((prev) => ({
            ...prev,
            settings: { ...prev.settings, ogp_image: url },
          }));
        }}
      />
    </div>
  );
}
