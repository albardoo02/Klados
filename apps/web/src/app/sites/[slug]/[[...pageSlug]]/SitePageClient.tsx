'use client';

import { useQuery } from '@tanstack/react-query';
import { publicApi, commentsApi } from '@/lib/api';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { CommandPalette } from '@/components/command-palette';
import { CommentsDrawer } from '@/components/comments-drawer';
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
  Search,
  MessageSquare,
  Settings2,
  Dices,
  Printer,
  Link2,
  Info,
} from 'lucide-react';
import { PageActionTabs } from '@/components/wiki/page-action-tabs';
import { SidebarEditorModal } from '@/components/wiki/sidebar-editor-modal';
import { PageInfoModal } from '@/components/wiki/page-info-modal';
import { SidebarSection, generateDefaultSidebar } from '@/types/sidebar';

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
  custom_font?: string;
  primary_color?: string;
  custom_css?: string;
  settings?: {
    ogp_title?: string;
    ogp_description?: string;
    ogp_image?: string;
    favicon?: string;
    custom_font?: string;
    primary_color?: string;
    custom_css?: string;
    [key: string]: any;
  };
  pages?: PublicPage[];
}

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
| **マルチテーマ & カスタムCSS** | Minimal, Dark, Google Fonts, 独自CSS | ✅ サポート |

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
- [x] グローバル検索 (Ctrl+K) & コメント
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

// フォントURL & CSSファミリーマップ
const FONT_CONFIG: Record<string, { url: string; family: string }> = {
  Inter: {
    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
    family: "'Inter', sans-serif",
  },
  Roboto: {
    url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
    family: "'Roboto', sans-serif",
  },
  'Noto Sans JP': {
    url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap',
    family: "'Noto Sans JP', sans-serif",
  },
  'JetBrains Mono': {
    url: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap',
    family: "'JetBrains Mono', monospace",
  },
  Serif: {
    url: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&display=swap',
    family: "'Merriweather', Georgia, serif",
  },
};

export default function SitePageClient() {
  const params = useParams<{ slug: string; pageSlug?: string[] }>();
  const siteSlug = params.slug;
  const rawPageSlug = params.pageSlug;

  const currentSlug = Array.isArray(rawPageSlug)
    ? rawPageSlug.join('/')
    : rawPageSlug || '';

  // 1. PV記録 (Analytics Tracking)
  useEffect(() => {
    if (siteSlug) {
      publicApi.recordView(siteSlug, currentSlug).catch((err) => {
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

  const isFallback = isSiteError || (!isSiteLoading && !siteData);
  const site: PublicSite = siteData || {
    id: 'demo-site',
    slug: siteSlug,
    title: siteSlug.charAt(0).toUpperCase() + siteSlug.slice(1) + ' Site',
    description: 'Klados Markdown Site Builder で構築されたサイト',
    theme: 'minimal',
    custom_font: 'Inter',
    primary_color: '#3b82f6',
    pages: DEMO_PAGES,
  };

  const pages: PublicPage[] =
    siteData?.pages && siteData.pages.length > 0
      ? siteData.pages
      : isFallback
      ? DEMO_PAGES
      : [];

  const targetSlug =
    currentSlug ||
    (pages.find((p) => p.slug === 'home' || p.slug === 'index' || p.slug === '')?.slug ||
      pages[0]?.slug ||
      '');

  // 個別ページ情報取得
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

  const activePage: PublicPage | undefined =
    pageData ||
    (targetSlug
      ? pages.find((p) => p.slug === targetSlug || p.slug === `/${targetSlug}`)
      : pages[0]);

  // コメント数取得
  const { data: comments = [] } = useQuery({
    queryKey: ['comments', activePage?.id],
    queryFn: async () => {
      if (!activePage?.id) return [];
      try {
        const r = await commentsApi.list(activePage.id);
        return r.data?.data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!activePage?.id,
  });

  // UIステート: 検索モーダル & コメントドロワー
  const [searchOpen, setSearchOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarEditorOpen, setSidebarEditorOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);

  // サイドバー構成ステート (MediaWiki:Sidebar)
  const [sidebarSections, setSidebarSections] = useState<SidebarSection[] | null>(null);
  const [showToolsSection, setShowToolsSection] = useState<boolean>(true);

  // サイドバー初期値の解決 (サイト設定 -> LocalStorage -> デフォルト)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(`klados_sidebar_${siteSlug}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.sections && Array.isArray(parsed.sections)) {
            setSidebarSections(parsed.sections);
            setShowToolsSection(parsed.showTools ?? true);
            return;
          }
        } catch {
          // ignore
        }
      }
    }

    if (site.settings?.sidebar_sections && Array.isArray(site.settings.sidebar_sections)) {
      setSidebarSections(site.settings.sidebar_sections);
      setShowToolsSection(site.settings.sidebar_show_tools ?? true);
    }
  }, [site.settings, siteSlug]);

  // 実効サイドバーセクション (設定がなければ既存ページ一覧から生成)
  const activeSidebarSections = useMemo<SidebarSection[]>(() => {
    if (sidebarSections && sidebarSections.length > 0) {
      return sidebarSections;
    }
    return generateDefaultSidebar(pages);
  }, [sidebarSections, pages]);

  // おまかせ表示 (ランダムページへ移動)
  const getRandomPageHref = () => {
    if (pages.length === 0) return `/sites/${siteSlug}`;
    const rand = pages[Math.floor(Math.random() * pages.length)];
    return rand.slug === 'index' || rand.slug === 'home' || rand.slug === ''
      ? `/sites/${siteSlug}`
      : `/sites/${siteSlug}/${rand.slug}`;
  };

  // テーマ切り替え
  const [theme, setTheme] = useState<'minimal' | 'dark'>('minimal');

  useEffect(() => {
    if (siteData) {
      const stored =
        typeof window !== 'undefined'
          ? localStorage.getItem(`klados_theme_${siteSlug}`)
          : null;
      if (stored === 'dark' || stored === 'minimal') {
        setTheme(stored);
      } else {
        const isSiteDark = siteData.theme === 'dark';
        setTheme(isSiteDark ? 'dark' : 'minimal');
      }
    }
  }, [siteData, siteSlug]);

  const isDark = theme === 'dark';
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('dark');
      }
    };
  }, [isDark]);

  const toggleTheme = () => {
    const nextTheme = theme === 'minimal' ? 'dark' : 'minimal';
    setTheme(nextTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`klados_theme_${siteSlug}`, nextTheme);
    }
  };

  // 前後のページナビゲーション
  const currentIndex = pages.findIndex(
    (p) => p.id === activePage?.id || p.slug === activePage?.slug
  );
  const prevPage = currentIndex > 0 ? pages[currentIndex - 1] : null;
  const nextPage =
    currentIndex >= 0 && currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;

  // カスタムフォント & カラー & CSS設定
  const customFontKey = site.settings?.custom_font || site.custom_font || 'Inter';
  const fontConfig = FONT_CONFIG[customFontKey] || FONT_CONFIG['Inter'];
  const brandPrimaryColor =
    site.settings?.primary_color || site.primary_color || '#3b82f6';
  const customCss = site.settings?.custom_css || site.custom_css || '';

  // メタタグ情報
  const pageTitle = activePage ? `${activePage.title} - ${site.title}` : site.title;
  const pageDescription =
    site.settings?.ogp_description ||
    site.description ||
    `${site.title} の公開Markdownコンテンツ`;
  const ogTitle = site.settings?.ogp_title || pageTitle;
  const ogImage = site.settings?.ogp_image || '';
  const favicon = site.settings?.favicon || '/favicon.ico';

  useEffect(() => {
    if (typeof document !== 'undefined') {
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
  }, [favicon]);

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${
        isDark ? 'dark bg-[#0f1117] text-slate-100' : 'bg-white text-slate-900'
      }`}
      style={{ fontFamily: fontConfig.family }}
    >
      {/* Google Fonts スタイルシート */}
      {fontConfig.url && <link rel="stylesheet" href={fontConfig.url} />}

      {/* 動的ブランドカラー & カスタム CSS 埋め込み */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root {
              --brand-primary: ${brandPrimaryColor};
            }
            .klados-brand-accent {
              color: var(--brand-primary);
            }
            .klados-brand-bg {
              background-color: var(--brand-primary);
            }
            ${customCss}
          `,
        }}
      />

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

            <Link href={`/sites/${siteSlug}`} className="flex items-center gap-2.5 group">
              <div
                className="size-8 rounded-lg flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform"
                style={{ backgroundColor: brandPrimaryColor }}
              >
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
            {/* グローバル検索ボタン (Ctrl+K) */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs text-muted-foreground transition-colors cursor-pointer ${
                isDark
                  ? 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:text-slate-200'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <Search className="size-3.5" />
              <span className="hidden sm:inline">検索...</span>
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted border border-border">
                Ctrl K
              </kbd>
            </button>

            {/* コメント ドロワー開閉ボタン */}
            {activePage && (
              <button
                type="button"
                onClick={() => setCommentsOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                  isDark
                    ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
                title="このページへのコメントとフィードバック"
              >
                <MessageSquare className="size-3.5" />
                <span className="hidden sm:inline">コメント</span>
                {comments.length > 0 && (
                  <span
                    className="size-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center -mr-1"
                    style={{ backgroundColor: brandPrimaryColor }}
                  >
                    {comments.length}
                  </span>
                )}
              </button>
            )}

            {/* テーマ切替ボタン */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
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
              className={`hidden sm:inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl border transition-colors ${
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
        {/* デスクトップ用サイドバー (MediaWiki:Sidebar) */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="sticky top-24 space-y-5">
            {/* サイドバーヘッダー & 編集ボタン */}
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                ナビゲーション
              </span>
              <button
                type="button"
                onClick={() => setSidebarEditorOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="サイドバーを編集 (MediaWiki:Sidebar)"
              >
                <Settings2 className="size-3.5" />
                <span>編集</span>
              </button>
            </div>

            {/* セクション別ナビゲーション一覧 */}
            <div className="space-y-4">
              {activeSidebarSections.map((sec) => (
                <div key={sec.id} className="space-y-1">
                  {sec.title && (
                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 py-1 border-b border-slate-100 dark:border-slate-800/60 mb-1">
                      {sec.title}
                    </div>
                  )}
                  <nav className="space-y-0.5">
                    {sec.links.map((link) => {
                      const isExternal =
                        link.isExternal ||
                        link.url.startsWith('http://') ||
                        link.url.startsWith('https://');

                      if (isExternal) {
                        return (
                          <a
                            key={link.id}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group"
                          >
                            <span className="truncate">{link.title}</span>
                            <ExternalLink className="size-3 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0" />
                          </a>
                        );
                      }

                      const cleanUrl = link.url.replace(/^\//, '');
                      const isSelected =
                        (cleanUrl === '' && (currentSlug === '' || currentSlug === 'index' || currentSlug === 'home')) ||
                        (cleanUrl !== '' && (currentSlug === cleanUrl || currentSlug === `/${cleanUrl}`));

                      const pageHref =
                        cleanUrl === '' || cleanUrl === 'index' || cleanUrl === 'home'
                          ? `/sites/${siteSlug}`
                          : `/sites/${siteSlug}/${cleanUrl}`;

                      return (
                        <Link
                          key={link.id}
                          href={pageHref}
                          style={
                            isSelected
                              ? {
                                  color: brandPrimaryColor,
                                  borderColor: `${brandPrimaryColor}40`,
                                  backgroundColor: `${brandPrimaryColor}15`,
                                }
                              : undefined
                          }
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors group ${
                            isSelected
                              ? 'font-bold border'
                              : isDark
                              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                        >
                          <span className="truncate">{link.title}</span>
                          {isSelected && (
                            <ChevronRight
                              className="size-3 shrink-0"
                              style={{ color: brandPrimaryColor }}
                            />
                          )}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              ))}

              {/* MediaWiki風「ツール」セクション */}
              {showToolsSection && (
                <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 py-1 mb-1">
                    ツール
                  </div>
                  <nav className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    <Link
                      href={getRandomPageHref()}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white transition-colors"
                      title="ランダムなページへジャンプ"
                    >
                      <Dices className="size-3.5 text-slate-400" />
                      <span>おまかせ表示</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => typeof window !== 'undefined' && window.print()}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white transition-colors text-left cursor-pointer"
                    >
                      <Printer className="size-3.5 text-slate-400" />
                      <span>印刷用バージョン</span>
                    </button>
                    {activePage && (
                      <button
                        type="button"
                        onClick={() => setInfoModalOpen(true)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white transition-colors text-left cursor-pointer"
                      >
                        <Info className="size-3.5 text-slate-400" />
                        <span>ページ情報</span>
                      </button>
                    )}
                  </nav>
                </div>
              )}
            </div>

            {/* サイドバーカスタマイズリンク */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => setSidebarEditorOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 text-xs font-medium transition-colors cursor-pointer"
              >
                <Settings2 className="size-3.5" />
                <span>サイドバーをカスタマイズ</span>
              </button>
            </div>

            {isFallback && (
              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 text-xs text-blue-600 dark:text-blue-300">
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
                <span className="font-bold text-sm">ナビゲーション</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="space-y-4">
                {activeSidebarSections.map((sec) => (
                  <div key={sec.id} className="space-y-1">
                    {sec.title && (
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
                        {sec.title}
                      </div>
                    )}
                    <nav className="space-y-1">
                      {sec.links.map((link) => {
                        const isExternal =
                          link.isExternal ||
                          link.url.startsWith('http://') ||
                          link.url.startsWith('https://');

                        if (isExternal) {
                          return (
                            <a
                              key={link.id}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between px-3 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <span>{link.title}</span>
                              <ExternalLink className="size-3.5 text-slate-400" />
                            </a>
                          );
                        }

                        const cleanUrl = link.url.replace(/^\//, '');
                        const isSelected =
                          (cleanUrl === '' && (currentSlug === '' || currentSlug === 'index' || currentSlug === 'home')) ||
                          (cleanUrl !== '' && (currentSlug === cleanUrl || currentSlug === `/${cleanUrl}`));

                        const pageHref =
                          cleanUrl === '' || cleanUrl === 'index' || cleanUrl === 'home'
                            ? `/sites/${siteSlug}`
                            : `/sites/${siteSlug}/${cleanUrl}`;

                        return (
                          <Link
                            key={link.id}
                            href={pageHref}
                            onClick={() => setMobileMenuOpen(false)}
                            style={isSelected ? { backgroundColor: brandPrimaryColor } : undefined}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors ${
                              isSelected
                                ? 'text-white font-semibold'
                                : isDark
                                ? 'text-slate-300 hover:bg-slate-800'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span>{link.title}</span>
                            {isSelected && <ChevronRight className="size-4" />}
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                ))}

                {showToolsSection && (
                  <div className="pt-2 border-t border-border space-y-1">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
                      ツール
                    </div>
                    <Link
                      href={getRandomPageHref()}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Dices className="size-4 text-slate-400" />
                      <span>おまかせ表示</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* メインコンテンツ記事領域 */}
        <main className="flex-1 min-w-0 max-w-4xl mx-auto">
          {isPageLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div
                className="size-8 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: `${brandPrimaryColor} transparent ${brandPrimaryColor} ${brandPrimaryColor}` }}
              />
              <p className="text-sm">ページを読み込み中...</p>
            </div>
          ) : activePage ? (
            <article className="space-y-6">
              {/* MediaWiki スタイル アクションタブバー (閲覧・編集・ソースを表示・履歴表示・★・その他▼) */}
              <PageActionTabs
                page={activePage}
                site={site}
                onOpenComments={() => setCommentsOpen(true)}
                commentsCount={comments.length}
              />

              {/* パンくずリスト */}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                <Link
                  href={`/sites/${siteSlug}`}
                  className="hover:underline transition-colors"
                  style={{ color: brandPrimaryColor }}
                >
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
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-400 dark:text-slate-500">
                  {activePage.created_at && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      <span>
                        公開日: {new Date(activePage.created_at).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                  )}

                  {/* コメントを開くボタン */}
                  <button
                    type="button"
                    onClick={() => setCommentsOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted text-foreground transition-colors cursor-pointer"
                  >
                    <MessageSquare className="size-3 text-primary" />
                    <span>コメント ({comments.length})</span>
                  </button>
                </div>
              </div>

              {/* Markdown コンテンツ */}
              <div className="py-4">
                <MarkdownRenderer content={activePage.content.replace(/^#[^\n]*\n?/, '')} />
              </div>

              {/* 記事下部コメントエリア */}
              <div className="pt-8 border-t border-border">
                <div className="p-6 rounded-2xl bg-muted/20 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <MessageSquare className="size-4 text-primary" />
                      <span>この記事についてフィードバックを送る</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      疑問点や改善要望など、お気軽にコメントを投稿してください。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCommentsOpen(true)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-xs transition-opacity cursor-pointer hover:opacity-90"
                    style={{ backgroundColor: brandPrimaryColor }}
                  >
                    コメントを書く ({comments.length})
                  </button>
                </div>
              </div>

              {/* ページ送りナビゲーション */}
              <div className="pt-6 mt-8 border-t border-border flex flex-col sm:flex-row items-stretch justify-between gap-4">
                {prevPage ? (
                  <Link
                    href={
                      prevPage.slug === 'index' ||
                      prevPage.slug === 'home' ||
                      prevPage.slug === ''
                        ? `/sites/${siteSlug}`
                        : `/sites/${siteSlug}/${prevPage.slug}`
                    }
                    className={`flex-1 p-4 rounded-xl border transition-all group ${
                      isDark
                        ? 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-800/50'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 mb-1 group-hover:text-primary transition-colors">
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
                    <div className="flex items-center justify-end gap-1 text-xs text-slate-400 dark:text-slate-500 mb-1 group-hover:text-primary transition-colors">
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
                className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: brandPrimaryColor }}
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
            <span>
              © {new Date().getFullYear()} {site.title}. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>Powered by</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">Klados</span>
            <span>Markdown Platform</span>
          </div>
        </div>
      </footer>

      {/* グローバル検索ダイアログ */}
      <CommandPalette
        siteId={site.id}
        siteSlug={siteSlug}
        pages={pages}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* コメント ドロワー */}
      {activePage && (
        <CommentsDrawer
          pageId={activePage.id}
          pageTitle={activePage.title}
          isOpen={commentsOpen}
          onClose={() => setCommentsOpen(false)}
        />
      )}

      {/* サイドバー編集モーダル (MediaWiki:Sidebar) */}
      <SidebarEditorModal
        isOpen={sidebarEditorOpen}
        onClose={() => setSidebarEditorOpen(false)}
        siteId={site.id}
        siteSlug={siteSlug}
        currentSections={activeSidebarSections}
        showToolsSection={showToolsSection}
        availablePages={pages}
        onSaved={(newSections, newShowTools) => {
          setSidebarSections(newSections);
          setShowToolsSection(newShowTools);
        }}
      />

      {/* ページ情報モーダル (MediaWiki:PageInfo) */}
      {activePage && (
        <PageInfoModal
          isOpen={infoModalOpen}
          onClose={() => setInfoModalOpen(false)}
          page={activePage}
          site={site}
        />
      )}
    </div>
  );
}
