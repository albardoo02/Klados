# Markdownサイトビルダー アプリケーション仕様書

> **ドキュメント種別**: 製品仕様書 (Product Specification)
> **バージョン**: v1.0.0-draft
> **作成日**: 2026-09-18

---

## 概要 (Overview)

Markdownで記述されたコンテンツをWebサイトとして公開・管理できるフルスタックWebアプリケーション。  
GitHubのREADMEやNotionのような直感的な編集体験と、Vercel/Netlifyのような即時公開体験を組み合わせたSaaS型プラットフォーム。

---

## アーキテクチャ方針

| 領域 | 採用方針 |
|------|----------|
| **フロントエンド** | SPA (Single Page Application) + SSR |
| **バックエンド** | REST API + WebSocket (リアルタイム協調編集) |
| **データ永続化** | RDB + Object Storage + CDN |
| **デプロイ** | コンテナベース (Docker / Kubernetes) |
| **認証** | JWT + OAuth2.0 (Google / GitHub) |

---

## 技術スタック (Tech Stack)

### フロントエンド

| 技術 | バージョン | 用途 |
|------|-----------|------|
| **TypeScript** | 5.x | 型安全な開発言語 |
| **Next.js** | 15.x (App Router) | SSR/SSG/ISR対応のReactフレームワーク |
| **React** | 19.x | UIライブラリ |
| **Tailwind CSS** | v4 | ユーティリティファーストCSS |
| **shadcn/ui** | latest | アクセシブルなUIコンポーネント集 |
| **CodeMirror 6** | 6.x | 高性能Markdownエディタ |
| **Zustand** | 5.x | 軽量グローバル状態管理 |
| **TanStack Query** | v5 | サーバー状態管理・キャッシュ |
| **react-dropzone** | latest | ファイルドラッグ&ドロップ |

### バックエンド

| 技術 | バージョン | 用途 |
|------|-----------|------|
| **Go** | 1.23+ | メインAPIサーバー (高パフォーマンス) |
| **Gin** | latest | HTTPルーター |
| **GORM** | v2 | ORM |
| **golang-jwt** | v5 | JWT認証 |
| **MinIO SDK** | latest | オブジェクトストレージクライアント |

> **なぜGo?**
> - 高いスループット・低レイテンシ
> - goroutineによる並行処理（画像変換・WebSocket等）
> - コンパイル済みバイナリで本番デプロイが容易
> - TypeScriptと対比してバックエンドに最適

### データベース・インフラ

| 技術 | 用途 |
|------|------|
| **PostgreSQL 16** | メインRDB（ユーザー、サイト、ページ等） |
| **Redis 7** | セッションキャッシュ、レート制限、リアルタイムコラボ状態管理 |
| **MinIO** (or AWS S3) | 画像・ファイルのオブジェクトストレージ |
| **CloudFront** (or Cloudflare CDN) | 画像・静的ファイルの高速配信 |
| **Docker / Docker Compose** | ローカル開発環境 |
| **Kubernetes** | 本番環境オーケストレーション |

---

## 機能仕様 (Feature Specification)

### 1. 認証・ユーザー管理

#### 1.1 認証方式
- **メール & パスワード認証**
  - bcrypt によるパスワードハッシュ化
  - メールアドレス確認 (Email Verification)
  - パスワードリセット (SMTP経由)
- **OAuth2.0 ソーシャルログイン**
  - Google アカウント連携
  - GitHub アカウント連携
- **JWTトークン方式**
  - Access Token: 有効期限15分
  - Refresh Token: 有効期限7日 (HttpOnly Cookie)
  - リフレッシュローテーション対応

#### 1.2 ユーザープロフィール
- ユーザー名 / 表示名
- プロフィール画像（アップロードまたはGravatar連携）
- 自己紹介文（Markdown対応）
- プラン情報 (Free / Pro / Team)

---

### 2. サイト管理

#### 2.1 サイト作成
- **サブドメイン**: `{username}.klados.app` 形式で自動発行
- **カスタムドメイン**: 独自ドメインのCNAME設定対応
- **テーマ選択**: プリセットテーマ（ライト/ダーク/複数デザイン）
- **サイトメタデータ**: タイトル、説明、OGP画像、favicon

#### 2.2 サイト設定
- パスワード保護（非公開サイト）
- カスタムCSS / カスタムJavaScript (Proプラン)
- Google Analytics / Plausible Analytics 連携
- 言語・タイムゾーン設定
- サイトマップ自動生成 (`/sitemap.xml`)
- robots.txt 設定

#### 2.3 サイト複製・エクスポート
- サイト丸ごとの ZIP エクスポート（Markdownファイル + 画像）
- 他ユーザーへのサイト移譲

---

### 3. ページ・コンテンツ管理

#### 3.1 ページ構造
```
サイト
 └── ページ (階層型)
      ├── /         (トップページ)
      ├── /about
      ├── /blog/
      │    ├── /blog/2026-01-01-hello
      │    └── /blog/2026-01-15-second
      └── /docs/
           ├── /docs/getting-started
           └── /docs/advanced
```

- 階層型URL構造（スラッグベース）
- ページの並び替え（ドラッグ&ドロップ）
- ページのコピー・移動
- ゴミ箱機能（30日間保持）
- ページ単位のアクセス制御（公開/非公開）

#### 3.2 バージョン管理
- 自動保存（60秒ごと or 変更時）
- 変更履歴（最大50バージョン）
- バージョン間の差分表示 (Unified Diff)
- 任意バージョンへのロールバック

---

### 4. Markdownエディタ

#### 4.1 エディタ機能
- **Split View**: 左にMarkdown、右にリアルタイムプレビュー
- **Fullscreen編集モード**
- **Preview専用モード**
- **vim / Emacs キーバインド対応**（設定で切り替え）

#### 4.2 対応Markdown構文
- **CommonMark** 完全準拠
- **GFM (GitHub Flavored Markdown)**
  - テーブル
  - チェックリスト
  - 取り消し線
  - 自動リンク
- **拡張構文**
  - シンタックスハイライト（コードブロック）
  - 数式: KaTeX (`$inline$` / `$$block$$`)
  - 脚注 (Footnotes)
  - 絵文字 `:smile:`
  - Mermaidダイアグラム
  - カスタムコンテナ (`:::warning` 等)
  - Frontmatter (YAML)
  - 目次自動生成 `[TOC]`

#### 4.3 エディタショートカット
| ショートカット | 操作 |
|-------------|------|
| `Ctrl+B` | 太字 |
| `Ctrl+I` | 斜体 |
| `Ctrl+K` | リンク挿入 |
| `Ctrl+Shift+I` | 画像挿入ダイアログ |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+S` | 手動保存 |
| `Ctrl+/` | コメントトグル |
| `Tab` | インデント（リスト内） |

#### 4.4 スラッシュコマンド
エディタ内で `/` を入力するとコマンドパレットを表示:

- `/image` — 画像アップロード
- `/table` — テーブル挿入
- `/code` — コードブロック
- `/link` — リンク挿入
- `/callout` — コールアウトブロック
- `/divider` — 区切り線
- `/toc` — 目次

---

### 5. メディア管理（画像アップロード）

#### 5.1 アップロード方法
- **ファイル選択ダイアログ**
- **ドラッグ&ドロップ**（エディタ上に直接ドロップ）
- **クリップボードからペースト**（スクリーンショット等）
- **URL からインポート**（外部画像をホスティング）

#### 5.2 対応ファイル形式
| 種別 | 対応形式 |
|------|---------|
| 画像 | JPEG, PNG, GIF, WebP, AVIF, SVG |
| ドキュメント | PDF |
| その他 | ZIP, CSV, JSON（Proプラン） |

#### 5.3 画像処理パイプライン
```
アップロード → バリデーション → リサイズ処理 → WebP変換 → S3/MinIO保存 → CDN配信
```

- **自動リサイズ**: 最大幅 2560px、最大サイズ 10MB (Free) / 50MB (Pro)
- **フォーマット変換**: 自動でWebP変換（非対応ブラウザには元形式）
- **サムネイル生成**: 100px / 400px / 800px の3段階
- **メタデータ除去**: EXIFデータ自動削除（プライバシー保護）

#### 5.4 メディアライブラリ
- アップロード済みファイル一覧（グリッド/リスト表示切り替え）
- 検索・フィルタリング（種類、アップロード日、サイズ）
- ファイル名変更・削除
- 使用箇所の確認（どのページで使用されているか）
- 容量使用状況表示（Free: 1GB / Pro: 50GB）

---

### 6. リアルタイム協調編集 (Proプラン・Teamプラン)

- **WebSocket** によるリアルタイム同期
- **CRDT (Conflict-free Replicated Data Type)** によるコンフリクト解決
- 他ユーザーのカーソル位置表示（色付きカーソル）
- 同時編集ユーザーのアバター表示
- チャット機能（ページ内コメント）

---

### 7. コメント・フィードバック

- ページ単位のコメントシステム
- パラグラフ単位のインラインコメント
- コメントのMarkdown対応
- 通知（メール / インアプリ）

---

### 8. 検索機能

- **全文検索**: サイト内のページコンテンツを横断検索
- **ファセット検索**: タグ、カテゴリ、日付での絞り込み
- **キーボードショートカット**: `Ctrl+K` でクイック検索
- インクリメンタルサーチ（入力しながらリアルタイム表示）

---

### 9. SEO・OGP対応

- **メタタグ管理**: title、description、canonical URLをページごとに設定
- **OGP / Twitter Card**: SNSシェア時のカード表示最適化
- **構造化データ (JSON-LD)**: Article、BreadcrumbList スキーマ
- **サイトマップ**: `/sitemap.xml` の自動生成・更新
- **RSS フィード**: `/rss.xml` 自動生成（ブログ向け）

---

### 10. テーマ・デザインカスタマイズ

#### 10.1 プリセットテーマ
- **Minimal**: シンプル白基調
- **Dark**: ダークモード
- **Technical**: ドキュメント向けサイドバー付き
- **Blog**: 記事リスト + カード型レイアウト
- **Portfolio**: クリエイター向けビジュアル重視

#### 10.2 デザイン設定
- フォントファミリー（Google Fonts連携）
- プライマリカラー、アクセントカラー
- コンテンツ幅
- ヘッダー/フッターのカスタマイズ
- ナビゲーションメニューの設定

---

### 11. 分析・アナリティクス

- ページビュー / ユニークビジター
- 流入元（リファラー）分析
- デバイス・ブラウザ統計
- 人気ページランキング
- プライバシーファースト（Cookie不使用オプション）

---

## API仕様 (REST API)

### ベースURL
```
https://api.klados.app/v1
```

### 主要エンドポイント

#### 認証
```
POST   /auth/register          ユーザー登録
POST   /auth/login             ログイン
POST   /auth/logout            ログアウト
POST   /auth/refresh           トークンリフレッシュ
GET    /auth/me                ログインユーザー情報
POST   /auth/forgot-password   パスワードリセット要求
POST   /auth/reset-password    パスワードリセット実行
```

#### サイト
```
GET    /sites                  サイト一覧
POST   /sites                  サイト作成
GET    /sites/:id              サイト詳細
PATCH  /sites/:id              サイト更新
DELETE /sites/:id              サイト削除
POST   /sites/:id/publish      公開/非公開切り替え
```

#### ページ
```
GET    /sites/:id/pages        ページ一覧（ツリー構造）
POST   /sites/:id/pages        ページ作成
GET    /pages/:id              ページ詳細
PATCH  /pages/:id              ページ更新
DELETE /pages/:id              ページ削除（ゴミ箱へ）
POST   /pages/:id/restore      ゴミ箱からリストア
GET    /pages/:id/versions     バージョン履歴
POST   /pages/:id/revert/:ver  バージョンロールバック
```

#### メディア
```
POST   /media/upload           ファイルアップロード (multipart/form-data)
GET    /media                  メディア一覧
DELETE /media/:id              メディア削除
GET    /media/usage/:id        使用箇所一覧
```

#### 検索
```
GET    /sites/:id/search?q=    全文検索
```

### レスポンス形式
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100
  }
}
```

---

## データベーススキーマ (主要テーブル)

```sql
-- ユーザー
users (
  id          UUID PRIMARY KEY,
  email       VARCHAR(255) UNIQUE NOT NULL,
  username    VARCHAR(50) UNIQUE NOT NULL,
  password    VARCHAR(255),          -- NULL = OAuthのみ
  display_name VARCHAR(100),
  avatar_url  VARCHAR(500),
  plan        ENUM('free','pro','team') DEFAULT 'free',
  created_at  TIMESTAMP,
  updated_at  TIMESTAMP
)

-- OAuthプロバイダー連携
oauth_accounts (
  id           UUID PRIMARY KEY,
  user_id      UUID REFERENCES users(id),
  provider     VARCHAR(20),          -- 'google' | 'github'
  provider_id  VARCHAR(255),
  UNIQUE(provider, provider_id)
)

-- サイト
sites (
  id           UUID PRIMARY KEY,
  user_id      UUID REFERENCES users(id),
  slug         VARCHAR(63) UNIQUE NOT NULL,   -- サブドメイン用
  custom_domain VARCHAR(253),
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  theme        VARCHAR(50) DEFAULT 'minimal',
  is_public    BOOLEAN DEFAULT true,
  settings     JSONB,                          -- テーマ設定等
  created_at   TIMESTAMP,
  updated_at   TIMESTAMP
)

-- ページ
pages (
  id           UUID PRIMARY KEY,
  site_id      UUID REFERENCES sites(id),
  parent_id    UUID REFERENCES pages(id),      -- 階層構造
  slug         VARCHAR(200) NOT NULL,
  title        VARCHAR(500) NOT NULL,
  content      TEXT,                           -- Markdown本文
  frontmatter  JSONB,                          -- YAML Frontmatter
  status       ENUM('draft','published','trashed') DEFAULT 'draft',
  position     INTEGER DEFAULT 0,             -- 並び順
  published_at TIMESTAMP,
  deleted_at   TIMESTAMP,
  created_at   TIMESTAMP,
  updated_at   TIMESTAMP,
  UNIQUE(site_id, slug)
)

-- ページバージョン
page_versions (
  id           UUID PRIMARY KEY,
  page_id      UUID REFERENCES pages(id),
  content      TEXT,
  user_id      UUID REFERENCES users(id),
  version      INTEGER NOT NULL,
  created_at   TIMESTAMP
)

-- メディア
media_files (
  id           UUID PRIMARY KEY,
  site_id      UUID REFERENCES sites(id),
  user_id      UUID REFERENCES users(id),
  filename     VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  mime_type    VARCHAR(100),
  size         BIGINT,
  storage_key  VARCHAR(500),                  -- S3/MinIOのキー
  cdn_url      VARCHAR(500),
  width        INTEGER,
  height       INTEGER,
  created_at   TIMESTAMP
)
```

---

## セキュリティ要件

| 項目 | 対応内容 |
|------|---------|
| **通信暗号化** | TLS 1.3 必須 (HSTS設定) |
| **認証** | JWT + HttpOnly Cookie、CSRF対策 |
| **入力バリデーション** | サーバーサイドで全入力を検証 |
| **XSS対策** | Markdownレンダリング時にDOMPurifyでサニタイズ |
| **SQLインジェクション** | プリペアドステートメント使用 |
| **ファイルアップロード** | MIMEタイプ検証、マジックバイト検証、ウイルススキャン（ClamAV） |
| **レート制限** | IPベース・ユーザーベースのレート制限 (Redis) |
| **CORS** | 許可ドメインの明示的設定 |
| **依存パッケージ** | 定期的な脆弱性スキャン (Snyk / Dependabot) |

---

## プラン・料金体系

| 機能 | Free | Pro | Team |
|------|------|-----|------|
| サイト数 | 1 | 10 | 無制限 |
| ページ数/サイト | 50 | 無制限 | 無制限 |
| ストレージ | 1 GB | 50 GB | 200 GB |
| カスタムドメイン | ✗ | ✓ | ✓ |
| 協調編集 | ✗ | ✓ (3名) | ✓ (無制限) |
| バージョン履歴 | 10件 | 50件 | 無制限 |
| カスタムCSS/JS | ✗ | ✓ | ✓ |
| アナリティクス | 基本のみ | 詳細 | 詳細 + API |
| 優先サポート | ✗ | ✓ | ✓ (専任) |
| 価格 | 無料 | \$9/月 | \$29/月 |

---

## 開発フェーズ計画

### Phase 1: MVP (3ヶ月) - [完了済]
- [x] ユーザー認証（メール + パスワード / JWT）
- [x] サイト・ページCRUD
- [x] Markdownエディタ（Split View）
- [x] 画像アップロード基本機能（MinIO / S3）
- [x] サブドメインによる公開機能
- [x] 基本テーマ（Minimal / Dark）

### Phase 2: 強化 (2ヶ月) - [完了済]
- [x] バージョン管理・差分表示 (Rollback & Diff UI)
- [x] メディアライブラリ (アップロード一覧・検索・挿入・削除)
- [x] SEO設定（OGPプレビュー / サイトマップ / robots.txt）
- [x] 全文検索 (Search API & UI: Ctrl+K)
- [x] カスタムドメイン対応（CNAME検証ロジック）
- [x] アナリティクス基本機能 (PV / UU / グラフ / 上位ページ)

### Phase 3: コラボ・拡張 (3ヶ月) - [完了済]
- [x] リアルタイム協調編集（WebSocket / 複数人アバター表示・同時編集同期）
- [x] コメントシステム（ページ単位コメント・Markdown対応・フィードバックドロワー）
- [x] 高度なテーマカスタマイズ（Google Fonts / ブランドカラー / カスタムCSS）
- [x] サイト一括 ZIP エクスポート (Frontmatter付きMarkdown + 画像)
- [x] ゴミ箱・リストア機能 (Trash & Restore)
- [x] APIキー発行・管理 (Personal Access Token & Bearer/X-API-Key認証)
- [x] エディタ スラッシュコマンド (`/`) & Vim モード切替
- [x] サイト パスワード保護 閲覧認証

---

## ディレクトリ構成 (モノレポ)

```
klados/
├── apps/
│   ├── web/              # Next.js フロントエンド
│   │   ├── app/          # App Router ページ
│   │   ├── components/   # UIコンポーネント
│   │   ├── lib/          # ユーティリティ
│   │   └── stores/       # Zustand ストア
│   └── api/              # Go バックエンド
│       ├── cmd/          # エントリーポイント
│       ├── internal/
│       │   ├── handler/  # HTTPハンドラー
│       │   ├── service/  # ビジネスロジック
│       │   ├── repo/     # データベースアクセス
│       │   └── model/    # データモデル
│       └── pkg/          # 共有パッケージ
├── packages/
│   └── markdown/         # Markdown処理共通ライブラリ
├── infra/
│   ├── docker/
│   ├── k8s/
│   └── terraform/
└── docs/                 # 開発ドキュメント
```

---

## 非機能要件

| 項目 | 目標値 |
|------|--------|
| **可用性** | 99.9% (月次ダウンタイム < 44分) |
| **応答速度** | API P95 < 200ms |
| **ページ読み込み** | LCP < 2.5秒 (Core Web Vitals Green) |
| **スケーラビリティ** | 水平スケール対応（ステートレスAPI） |
| **バックアップ** | PostgreSQL 日次バックアップ、7日間保持 |
| **監視** | Prometheus + Grafana、PagerDuty通知 |
| **ログ** | 構造化ログ (JSON)、90日間保持 |

---

## 開発・運用ツール

| 用途 | ツール |
|------|--------|
| パッケージ管理 (FE) | pnpm + Turborepo |
| リンタ/フォーマッタ (FE) | ESLint + Prettier + Biome |
| テスト (FE) | Vitest + Testing Library + Playwright |
| コードフォーマッタ (BE) | gofmt + golangci-lint |
| テスト (BE) | Go標準 `testing` + testcontainers |
| CI/CD | GitHub Actions |
| コンテナレジストリ | GitHub Container Registry (GHCR) |
| シークレット管理 | HashiCorp Vault (or AWS Secrets Manager) |
| エラートラッキング | Sentry |
| APM | Datadog (or OpenTelemetry) |
