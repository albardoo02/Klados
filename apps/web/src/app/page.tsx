import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  FileText,
  Sparkles,
  Zap,
  Globe,
  Users,
  ShieldCheck,
  History,
  Code2,
  ArrowRight,
  CheckCircle2,
  Terminal,
  Images,
  FolderTree,
  ChevronRight,
  Lock,
  Layers,
  Server,
  Cpu,
  BarChart3,
  MessageSquare,
} from 'lucide-react';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function HomePage() {
  const t = await getTranslations();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary">
      {/* ナビゲーションバー (Google / Microsoft スタイルのクリーンなヘッダー) */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="size-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center font-bold text-lg shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform">
                K
              </div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
                Klados
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                CMS
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">
                特徴・使いやすさ
              </a>
              <a href="#editor" className="hover:text-foreground transition-colors">
                エディタ体験
              </a>
              <a href="#self-hosting" className="hover:text-foreground transition-colors">
                自宅鯖ホスティング
              </a>
              <a href="#comparison" className="hover:text-foreground transition-colors">
                他ツール比較
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
            >
              ログイン
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm shadow-primary/25 hover:shadow-primary/40 active:scale-95"
            >
              <span>無料で始める</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ヒーローセクション */}
        <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
          {/* 背景のグラデーションブロブ */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-blue-500/15 via-indigo-500/15 to-purple-500/10 blur-[120px] pointer-events-none rounded-full" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            {/* バッジチップ */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/80 border border-border text-xs font-medium text-foreground mb-8 shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-500">
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>新世代の Markdown サイト公開プラットフォーム</span>
              <span className="text-muted-foreground">|</span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold">自鯖・Proxmox対応</span>
            </div>

            {/* メインキャッチコピー */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.15] mb-6">
              書くことに、もっと集中を。
              <span className="block mt-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Markdownが、美しいWebサイトになる。
              </span>
            </h1>

            {/* サブテキスト */}
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
              複雑な設定やHTML・CSSは不要。リアルタイム共同編集、KaTeX数式、独自ドメイン、メディア管理まで、すべてを直感的に使いこなせます。
            </p>

            {/* CTAボタングループ */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mb-14">
              <Link
                href="/register"
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 active:scale-98 flex items-center justify-center gap-2"
              >
                <span>今すぐ無料でサイトを作成</span>
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-muted/60 hover:bg-muted text-foreground border border-border font-semibold text-base transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="size-4 text-blue-500" />
                <span>デモを体験（登録不要）</span>
              </Link>
            </div>

            {/* ハイライトバッジ群 */}
            <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-xs font-semibold text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>Next.js 15 超高速レンダリング</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>リアルタイム WebSocket 共同編集</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>独自ドメイン・SSL 自動対応</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span>完全オープンソース (MIT)</span>
              </div>
            </div>
          </div>
        </section>

        {/* インタラクティブ・プロダクトプレビュー (エディタ & 公開サイトのモックアップ) */}
        <section id="editor" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div className="rounded-3xl border border-border bg-card/60 backdrop-blur-xl shadow-2xl overflow-hidden">
            {/* ウィンドウヘッダーバー */}
            <div className="px-5 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-red-500/80" />
                <div className="size-3 rounded-full bg-amber-500/80" />
                <div className="size-3 rounded-full bg-emerald-500/80" />
                <span className="text-xs font-mono text-muted-foreground ml-2 hidden sm:inline">
                  klados.app/dashboard/pages/edit
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex -space-x-1.5 items-center">
                  <div className="size-5 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                    A
                  </div>
                  <div className="size-5 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
                    K
                  </div>
                </div>
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  2人が編集中
                </span>
              </div>
            </div>

            {/* スプリットビューモック */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border font-sans">
              {/* 左側: エディタ画面 */}
              <div className="p-6 bg-muted/10 font-mono text-xs space-y-3 leading-relaxed">
                <div className="text-muted-foreground flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                  <span className="font-semibold text-foreground">Markdown Source</span>
                  <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-md">Vim / nano 対応</span>
                </div>
                <p className="text-blue-600 dark:text-blue-400 font-bold"># Kotlinで作るSpigotプラグイン入門</p>
                <p className="text-muted-foreground">&gt; Minecraft サーバー開発をゼロからマスター</p>
                <p className="text-foreground">
                  Klados なら、ページタイトルを見ながら <span className="bg-primary/20 text-primary px-1 rounded">[[内部リンク]]</span> を瞬時に挿入できます。
                </p>
                <div className="bg-background/80 p-3 rounded-xl border border-border text-[11px] space-y-1">
                  <span className="text-muted-foreground font-semibold">$$ 数式プレビュー $$</span>
                  <p className="text-purple-600 dark:text-purple-400 font-serif">\int_{'{-\\infty}'}^{'{\\infty}'} e^{'{-x^2}'} dx = \sqrt{'{ \\pi }'}</p>
                </div>
                <p className="text-emerald-600 dark:text-emerald-400">:::info ヒント</p>
                <p className="text-foreground pl-3 border-l-2 border-emerald-500">
                  独自ドメイン設定により、<code className="text-primary font-bold">developer.klados.app</code> で公開中！
                </p>
                <p className="text-emerald-600 dark:text-emerald-400">:::</p>
              </div>

              {/* 右側: リアルタイム完成ビュー */}
              <div className="p-6 bg-background space-y-4">
                <div className="text-muted-foreground flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                  <span className="font-semibold text-foreground">Live Public Site</span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    公開中
                  </span>
                </div>
                <h2 className="text-xl font-bold text-foreground">Kotlinで作るSpigotプラグイン入門</h2>
                <blockquote className="border-l-3 border-blue-500 pl-3 text-xs text-muted-foreground italic">
                  Minecraft サーバー開発をゼロからマスター
                </blockquote>
                <p className="text-xs text-foreground/90 leading-relaxed">
                  Klados なら、ページタイトルを見ながら{' '}
                  <span className="text-blue-600 dark:text-blue-400 underline font-semibold cursor-pointer">
                    内部リンク
                  </span>{' '}
                  を瞬時に挿入できます。
                </p>
                <div className="p-3 bg-muted/40 rounded-xl border border-border/60 text-center text-xs">
                  <span className="font-serif italic text-sm">∫<sub>-∞</sub><sup>∞</sup> e<sup>-x²</sup> dx = √π</span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-900 dark:text-emerald-200">
                  <span className="font-bold block mb-0.5">💡 ヒント</span>
                  独自ドメイン設定により、<strong className="underline">developer.klados.app</strong> で公開中！
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 使い勝手の良さを強調する 6大機能 (Feature Grid) */}
        <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-border/60">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
              EXCEPTIONAL USABILITY
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              直感的で、迷わない。
              <br />
              使いやすさを追求したコア機能
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              初心者でも迷わずすぐに書き始められ、エンジニアも納得する高機能ツール群をビルトイン。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all group">
              <div className="size-11 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Sparkles className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                スラッシュコマンド &amp; 高速記法
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                エディタ上で <code className="text-xs px-1.5 py-0.5 rounded bg-muted text-foreground">/</code> を入力するだけで、見出し、数式、コールアウト、表組みをワンタッチで展開。Vim や nano のキーバインドにも対応。
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all group">
              <div className="size-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Users className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                リアルタイム共同編集 (WebSocket)
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Google Docs のように、チームメンバー全員で同時にひとつの Markdown を執筆。カーソルやアバターを同期し、コンフリクトなく作業できます。
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all group">
              <div className="size-11 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <FolderTree className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                ページ名を見ながら内部リンク挿入
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                別タブでページ名を確認する面倒はゼロ。検索ダイアログから既存ページを選択するだけで、<code className="text-xs px-1.5 py-0.5 rounded bg-muted text-foreground">[[Wikiリンク]]</code> を瞬時に挿入できます。
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all group">
              <div className="size-11 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Globe className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                独自ドメイン &amp; アクセス保護
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <code className="text-xs px-1.5 py-0.5 rounded bg-muted text-foreground">docs.yourdomain.com</code> を登録するだけで、サイト単位で即時公開。パスワード保護機能も標準搭載。
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all group">
              <div className="size-11 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Images className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                ドラッグ＆ドロップ メディア管理
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                画像をエディタに直接ドロップするだけで、内蔵 S3 / MinIO へ自動アップロード。メディア一覧モーダルからいつでも再利用可能です。
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all group">
              <div className="size-11 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <History className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                バージョン履歴 &amp; 差分ロールバック
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                編集ごとに自動で履歴が保存され、Git のように差分（Diff）を視覚的に比較。ワンクリックで過去の任意バージョンへ安全に復元できます。
              </p>
            </div>
          </div>
        </section>

        {/* 自宅鯖ホスティング・Proxmox 親和性セクション */}
        <section id="self-hosting" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-border/60">
          <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 sm:p-12 lg:p-16 relative overflow-hidden shadow-2xl">
            <div className="max-w-2xl relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold mb-6">
                <Server className="size-3.5" />
                <span>SELF-HOSTED FREEDOM</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-6">
                データはすべてあなたの手元に。
                <br />
                Proxmox / Docker で 1 コマンド起動。
              </h2>
              <p className="text-slate-300 text-base leading-relaxed mb-8">
                外部のクラウドベンダーに大事な社内文書や個人ノートを預ける必要はありません。
                自宅サーバーやプライベートVPSで完全に自己完結し、Cloudflare Tunnel や Caddy と組み合わせればポート開放なしで即座に一般公開できます。
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8 text-xs font-mono">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-slate-400 block mb-1">Database</span>
                  <span className="font-bold text-white">PostgreSQL 16</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-slate-400 block mb-1">Storage</span>
                  <span className="font-bold text-white">MinIO (S3互換)</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-slate-400 block mb-1">Cache</span>
                  <span className="font-bold text-white">Redis 7</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/register"
                  className="px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm transition-all shadow-md active:scale-95"
                >
                  サーバーでセットアップする
                </Link>
                <a
                  href="https://github.com/albardoo02/Klados"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-all flex items-center gap-2"
                >
                  <Code2 className="size-4" />
                  <span>GitHub を見る</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* 比較表セクション */}
        <section id="comparison" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-border/60">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
              従来のツールと何が違うのか？
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              WordPressの重さや、静的サイトジェネレータの煩雑なビルド作業から解放されます。
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-4 font-semibold">比較項目</th>
                  <th className="p-4 font-bold text-primary">Klados</th>
                  <th className="p-4 font-semibold">WordPress</th>
                  <th className="p-4 font-semibold">静的ジェネレータ (SSG)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="p-4 font-semibold">執筆フォーマット</td>
                  <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">純粋な Markdown</td>
                  <td className="p-4 text-muted-foreground">ブロックエディタ (HTML)</td>
                  <td className="p-4 text-muted-foreground">Markdown</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold">共同編集</td>
                  <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">リアルタイム同期 (同時編集)</td>
                  <td className="p-4 text-muted-foreground">ロック制 (1人のみ)</td>
                  <td className="p-4 text-muted-foreground">Git コンフリクト解決が必要</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold">公開スピード</td>
                  <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">即時 (0秒反映)</td>
                  <td className="p-4 text-muted-foreground">即時</td>
                  <td className="p-4 text-muted-foreground">CI/CD ビルド待ち (数分)</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold">自鯖・Proxmox運用</td>
                  <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">Compose 1行で完結</td>
                  <td className="p-4 text-muted-foreground">プラグイン・DB保守が複雑</td>
                  <td className="p-4 text-muted-foreground">Webサーバー構築が必要</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold">数式・KaTeX対応</td>
                  <td className="p-4 font-bold text-emerald-600 dark:text-emerald-400">標準で高速表示</td>
                  <td className="p-4 text-muted-foreground">プラグイン導入が必要</td>
                  <td className="p-4 text-muted-foreground">設定ファイル編集が必要</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ボトムCTAバナー (Microsoft / Google スタイル) */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div className="rounded-3xl border border-primary/20 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 p-10 sm:p-14 text-center relative overflow-hidden">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground mb-4">
              さあ、最初のサイトを立ち上げましょう。
            </h2>
            <p className="text-muted-foreground text-base max-w-xl mx-auto mb-8">
              セットアップはわずか数分。あなたの思考やチームの知識を、誰でも美しく共有できます。
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-98"
              >
                無料アカウントを作成する
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-background hover:bg-muted text-foreground border border-border font-semibold text-base transition-all"
              >
                ログイン
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* フッター */}
      <footer className="border-t border-border bg-muted/20 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">Klados</span>
            <span>&copy; {new Date().getFullYear()} Azisaba Network. Released under MIT License.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/albardoo02/Klados" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              GitHub
            </a>
            <Link href="/login" className="hover:text-foreground transition-colors">
              ログイン
            </Link>
            <Link href="/register" className="hover:text-foreground transition-colors">
              新規登録
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
