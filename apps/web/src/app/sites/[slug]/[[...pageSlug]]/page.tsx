'use client';

import { useQuery } from '@tanstack/react-query';
import { publicApi } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import {
  BookOpen,
  ChevronRight,
  Sun,
  Moon,
  Menu,
  X,
  Calendar,
  FileText,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Tag,
  Share2,
} from 'lucide-react';

interface PublicPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  status: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface PublicSite {
  id: string;
  slug: string;
  title: string;
  description?: string;
  theme?: string;
  settings?: {
    ogp_title?: string;
    ogp_description?: string;
    ogp_image?: string;
    favicon?: string;
    [key: string]: any;
  };
  pages?: PublicPage[];
}

// バックエンド未起動時やデモ表示用のフォールバックデータ
const DEMO_PAGES: PublicPage[] = [
  {
    id: 'demo-1',
    slug: 'index',
    title: 'Klados へようこそ',
    status: 'published',
    created_at: new Date().toISOString(),
    content: `# Klados へようこそ 🚀

Klados は、Markdownで書かれたドキュメントや記事を美しく高速に配信するモダンなWebパブリッシングプラットフォームです。

## 主な特徴

| 機能 | 説明 | 状態 |
| :--- | :--- | :---: |
| **GFM 完全対応** | テーブル、チェックリスト、取り消し線など | ✅ サポート |
| **シンタックスハイライト** | 多彩な言語に対応したコードブロック | ✅ サポート |
| **KaTeX 数式表示** | インラインおよびブロック数式の美麗なレンダリング | ✅ サポート |
| **画像最適化** | MinIO & CDN による高速画像配信 | ✅ サポート |
| **マルチテーマ** | Minimal, Dark, Technical, Blog に対応 | ✅ サポート |

---

## コードハイライト例

TypeScript と React を用いたコードスニペットの例です。右上のボタンでワンクリックコピーできます:

\`\`\`typescript
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState<number>(0);

  return (
    <button 
      onClick={() => setCount((c) => c + 1)}
      className="px-4 py-2 bg-blue-500 text-white rounded-lg"
    >
      クリック数: {count}
    </button>
  );
}
\`\`\`

## 数式表現 (KaTeX)

インライン数式 $E = mc^2$ や、高度な微積分・フーリエ変換ブロック数式にも対応しています:

$$
\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x)\\,e^{-2\\pi i x \\xi}\\,dx
$$

## チェックリスト & 引用

> 「シンプルさは究極の洗練である」
> — レオナルド・ダ・ヴィンチ

- [x] フロントエンドの高速化
- [x] リッチなMarkdownプレビュー
- [x] ドラッグ＆ドロップ画像アップロード
- [x] バージョン履歴と差分ロールバック
- [x] アクセス解析 (PV & UU)
`,
  },
  {
    id: 'demo-2',
    slug: 'guide',
    title: 'スタートガイド',
    status: 'published',
    created_at: new Date().toISOString(),
    content: `# スタートガイド 📖

Klados で新しいWebサイトを立ち上げる手順を解説します。

## 1. サイトの作成
ダッシュボードから「+ 新規サイト作成」をクリックし、お好みのスラグとタイトルを入力します。

## 2. ページの追加
サイト詳細画面で「+ 新規ページ」をクリックします。
\`index\` スラグを設定すると、サイトのトップページとして表示されます。

## 3. Markdown エディタでの編集
- **左側**: CodeMirror によるリアルタイム入力
- **右側**: GFMテーブル、シンタックスハイライト、KaTeX数式が即時反映されるリッチプレビュー
- **画像の挿入**: ツールバーの画像ボタンまたはエディタへのドラッグ＆ドロップで即座にアップロード

\`\`\`bash
# ローカル開発の起動
pnpm dev
\`\`\`
`,
  },
  {
    id: 'demo-3',
    slug: 'syntax',
    title: 'Markdown 記法リファレンス',
    status: 'published',
    created_at: new Date().toISOString(),
    content: `# Markdown 記法リファレンス ✍️

Klados で使用できる代表的な記法一覧です。

### 見出し
# H1 大見出し
## H2 中見出し
### H3 小見出し

### テキスト装飾
- **太字 (Bold)**: \`**太字**\`
- *斜体 (Italic)*: \`*斜体*\`
- ~~取り消し線~~: \`~~取り消し線~~\`
- \`インラインコード\`: \`\` \`インラインコード\` \`\`

### リスト
1. 番号付き項目 1
2. 番号付き項目 2
   - ネストされた項目
   - ネストされた項目

### テーブル (表)
| パッケージ名 | バージョン | 用途 |
| :--- | :---: | ---: |
| \`react-markdown\` | 10.x | Markdownパーサー |
| \`remark-gfm\` | 4.x | GFM拡張 |
| \`rehype-highlight\` | 7.x | 構文ハイライト |
| \`rehype-katex\` | 7.x | 数式レンダリング |
`,
  },
];

export default function PublicSitePage() {
  const params = useParams<{ slug: string; pageSlug?: string[] }>();
  const siteSlug = params.slug;
  const rawPageSlug = params.pageSlug;

  // 現在のページスラグ (スラッシュ結合)
  const currentSlug = Array.isArray(rawPageSlug)
    ? rawPageSlug.join('/')
    : rawPageSlug || '';

  // 1. PV記録 (Analytics Tracking)
  useEffect(() => {
    if (siteSlug) {
      publicApi.recordView(siteSlug, currentSlug).catch((err) => {
        // バックエンド未起動環境や開発時は静かに処理
        console.debug('Analytics view recorded:', siteSlug, currentSlug, err?.message);
      });
    }
  }, [siteSlug, currentSlug]);

  // サイト情報取得
  const {
    data: siteData,
    isLoading: isSiteLoading,
    isError: isSiteError,
  } = useQuery({
    queryKey: ['public-site', siteSlug],
    queryFn: () =>
      publicApi
        .getSite(siteSlug)
        .then((res) => res.data?.data as PublicSite)
        .catch(() => null),
  });

  // フォールバック制御 & ページ一覧
  const isFallback = isSiteError || (!isSiteLoading && !siteData);
  const site: PublicSite = siteData || {
    id: 'demo-site',
    slug: siteSlug,
    title: siteSlug.charAt(0).toUpperCase() + siteSlug.slice(1) + ' Site',
    description: 'Klados Markdown Site Builder で構築されたサイト',
    theme: 'minimal',
    pages: DEMO_PAGES,
  };

  const pages: PublicPage[] =
    siteData?.pages && siteData.pages.length > 0
      ? siteData.pages
      : isFallback
      ? DEMO_PAGES
      : [];

  // ターゲットとなるスラッグの決定 (指定がなければ最初の公開ページ、または home/index)
  const targetSlug =
    currentSlug ||
    (pages.find((p) => p.slug === 'home' || p.slug === 'index' || p.slug === '')?.slug ||
      pages[0]?.slug ||
      '');

  // 個別ページ情報取得 (ターゲットスラッグがある場合のみ実行)
  const {
    data: pageData,
    isLoading: isPageLoading,
  } = useQuery({
    queryKey: ['public-page', siteSlug, targetSlug],
    queryFn: async () => {
      if (!targetSlug) return null;
      try {
        const res = await publicApi.getPage(siteSlug, targetSlug);
        const data = res.data?.data;
        // 単一ページオブジェクトであることを確認 (配列なら null)
        if (data && !Array.isArray(data)) {
          return (data.page || data) as PublicPage;
        }
        return null;
      } catch {
        return null;
      }
    },
    enabled: !!siteSlug && !!targetSlug,
  });

  // 表示する現在のアクティブページを特定
  const activePage: PublicPage | undefined =
    pageData ||
    (targetSlug
      ? pages.find((p) => p.slug === targetSlug || p.slug === `/${targetSlug}`)
      : pages[0]);

  // テーマ切り替え
  const siteThemePreset = site.theme || 'minimal';
  const [theme, setTheme] = useState<'minimal' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('klados_viewer_theme');
      if (stored === 'dark' || stored === 'minimal') return stored;
    }
    return siteThemePreset === 'dark' ? 'dark' : 'minimal';
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleTheme = () => {
    const nextTheme = theme === 'minimal' ? 'dark' : 'minimal';
    setTheme(nextTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('klados_viewer_theme', nextTheme);
    }
  };

  // 前後のページナビゲーション
  const currentIndex = pages.findIndex((p) => p.id === activePage?.id || p.slug === activePage?.slug);
  const prevPage = currentIndex > 0 ? pages[currentIndex - 1] : null;
  const nextPage = currentIndex >= 0 && currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;

  const isDark = theme === 'dark';

  // 動的メタタグ値の計算
  const pageTitle = activePage ? `${activePage.title} - ${site.title}` : site.title;
  const pageDescription =
    site.settings?.ogp_description ||
    site.description ||
    `${site.title} の公開Markdownコンテンツ`;
  const ogTitle = site.settings?.ogp_title || pageTitle;
  const ogImage = site.settings?.ogp_image || '';
  const favicon = site.settings?.favicon || '/favicon.ico';

  // クライアント側での document.title および favicon 反映
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = pageTitle;

      if (favicon) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = favicon;
      }
    }
  }, [pageTitle, favicon]);

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        isDark ? 'dark bg-[#0f1117] text-slate-100' : 'bg-white text-slate-900'
      }`}
    >
      {/* 2. 動的メタタグ (React 19 / Next.js 15+ による head への自動ホイスティング) */}
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:site_name" content={site.title} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta property="og:type" content="article" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle} />
      <meta name="twitter:description" content={pageDescription} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}

      {/* サイト上部ヘッダー */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-md border-b transition-colors ${
          isDark
            ? 'bg-[#0f1117]/80 border-slate-800'
            : 'bg-white/80 border-slate-200'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              aria-label="メニューを開く"
            >
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>

            <Link
              href={`/sites/${siteSlug}`}
              className="flex items-center gap-2 group"
            >
              <div className="size-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
                <BookOpen className="size-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-base leading-tight tracking-tight">
                    {site.title}
                  </span>
                  {site.theme && site.theme !== 'minimal' && (
                    <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {site.theme}
                    </span>
                  )}
                </div>
                {site.description && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block truncate max-w-xs">
                    {site.description}
                  </span>
                )}
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* テーマ切替ボタン */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                isDark
                  ? 'border-slate-700 bg-slate-800/80 text-amber-400 hover:bg-slate-700'
                  : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title={isDark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
              aria-label="テーマ切替"
            >
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>

            {/* ダッシュボードへのリンク */}
            <Link
              href="/dashboard"
              className={`hidden sm:inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                isDark
                  ? 'border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>ダッシュボード</span>
              <ExternalLink className="size-3" />
            </Link>
          </div>
        </div>
      </header>

      {/* メインレイアウト */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex gap-8">
        {/* デスクトップ用サイドバー (ページナビゲーション) */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="sticky top-24 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                ページ一覧 ({pages.length})
              </span>
            </div>
            <nav className="space-y-1">
              {pages.map((p) => {
                const isSelected =
                  activePage?.id === p.id ||
                  (currentSlug === '' && (p.slug === 'index' || p.slug === 'home' || p.slug === '')) ||
                  p.slug === currentSlug;
                const pageHref =
                  p.slug === 'index' || p.slug === 'home' || p.slug === ''
                    ? `/sites/${siteSlug}`
                    : `/sites/${siteSlug}/${p.slug}`;

                return (
                  <Link
                    key={p.id || p.slug}
                    href={pageHref}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors group ${
                      isSelected
                        ? isDark
                          ? 'bg-blue-900/30 text-blue-400 font-medium border border-blue-800/40'
                          : 'bg-blue-50 text-blue-600 font-medium border border-blue-100'
                        : isDark
                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className={`size-4 shrink-0 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} />
                      <span className="truncate">{p.title}</span>
                    </div>
                    {isSelected && <ChevronRight className="size-3.5 shrink-0 text-blue-500" />}
                  </Link>
                );
              })}
            </nav>

            {isFallback && (
              <div className="mt-8 p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 text-xs text-blue-600 dark:text-blue-300">
                <p className="flex items-center gap-1 font-semibold mb-1">
                  <Sparkles className="size-3" /> デモプレビュー中
                </p>
                <p className="opacity-90 leading-relaxed">
                  バックエンドに接続されると公開データが即時反映されます。
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* モバイルドロワーメニュー */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div
              className={`w-72 h-full p-6 space-y-4 overflow-y-auto ${
                isDark ? 'bg-[#0f1117] text-slate-100' : 'bg-white text-slate-900'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <span className="font-bold text-sm">ページナビゲーション</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  <X className="size-5" />
                </button>
              </div>
              <nav className="space-y-1">
                {pages.map((p) => {
                  const isSelected = activePage?.id === p.id || p.slug === currentSlug;
                  const pageHref =
                    p.slug === 'index' || p.slug === 'home' || p.slug === ''
                      ? `/sites/${siteSlug}`
                      : `/sites/${siteSlug}/${p.slug}`;

                  return (
                    <Link
                      key={p.id || p.slug}
                      href={pageHref}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                        isSelected
                          ? 'bg-blue-500 text-white font-medium'
                          : isDark
                          ? 'text-slate-300 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{p.title}</span>
                      {isSelected && <ChevronRight className="size-4" />}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* メインコンテンツ記事領域 */}
        <main className="flex-1 min-w-0 max-w-4xl mx-auto">
          {isPageLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="size-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">ページを読み込み中...</p>
            </div>
          ) : activePage ? (
            <article className="space-y-6">
              {/* パンくずリスト */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                <Link href={`/sites/${siteSlug}`} className="hover:text-blue-500 transition-colors">
                  {site.title}
                </Link>
                <ChevronRight className="size-3" />
                <span className="text-slate-600 dark:text-slate-300 truncate font-medium">
                  {activePage.title}
                </span>
              </div>

              {/* 記事ヘッダー */}
              <div className="pb-6 border-b border-border">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-3">
                  {activePage.title}
                </h1>
                {activePage.created_at && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <Calendar className="size-3.5" />
                    <span>
                      公開日: {new Date(activePage.created_at).toLocaleDateString('ja-JP')}
                    </span>
                  </div>
                )}
              </div>

              {/* Markdown コンテンツ */}
              <div className="py-4">
                <MarkdownRenderer content={activePage.content} />
              </div>

              {/* ページ送り (前後の記事へのナビゲーション) */}
              <div className="pt-10 mt-12 border-t border-border flex flex-col sm:flex-row items-stretch justify-between gap-4">
                {prevPage ? (
                  <Link
                    href={
                      prevPage.slug === 'index' || prevPage.slug === 'home' || prevPage.slug === ''
                        ? `/sites/${siteSlug}`
                        : `/sites/${siteSlug}/${prevPage.slug}`
                    }
                    className={`flex-1 p-4 rounded-xl border transition-all group ${
                      isDark
                        ? 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-800/50'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 mb-1 group-hover:text-blue-500 transition-colors">
                      <ArrowLeft className="size-3" />
                      <span>前のページ</span>
                    </div>
                    <span className="font-semibold text-sm line-clamp-1 text-slate-800 dark:text-slate-200">
                      {prevPage.title}
                    </span>
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}

                {nextPage ? (
                  <Link
                    href={`/sites/${siteSlug}/${nextPage.slug}`}
                    className={`flex-1 p-4 rounded-xl border transition-all text-right group ${
                      isDark
                        ? 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-800/50'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center justify-end gap-1 text-xs text-slate-400 dark:text-slate-500 mb-1 group-hover:text-blue-500 transition-colors">
                      <span>次のページ</span>
                      <ArrowRight className="size-3" />
                    </div>
                    <span className="font-semibold text-sm line-clamp-1 text-slate-800 dark:text-slate-200">
                      {nextPage.title}
                    </span>
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}
              </div>
            </article>
          ) : (
            <div className="py-24 text-center space-y-4">
              <FileText className="size-12 mx-auto text-slate-300 dark:text-slate-600" />
              <h2 className="text-xl font-bold">ページが見つかりませんでした</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                指定されたページが存在しないか、まだ公開されていません。
              </p>
              <Link
                href={`/sites/${siteSlug}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                サイトトップへ戻る
              </Link>
            </div>
          )}
        </main>
      </div>

      {/* フッター */}
      <footer
        className={`mt-24 border-t py-8 transition-colors ${
          isDark ? 'border-slate-800 bg-[#0c0d12]' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} {site.title}. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Powered by</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">Klados</span>
            <span>Markdown Platform</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
