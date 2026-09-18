# Klados

> Markdownで美しいWebサイトを作成するプラットフォーム

Klados は、Markdown を書くだけで美しい Web サイトを構築・公開できるプラットフォームです。  
リアルタイム共同編集・テーマカスタマイズ・アナリティクス・コメント機能を標準搭載しています。

## 技術スタック

| 領域     | 技術                                 |
|----------|--------------------------------------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Backend  | Go 1.23 + Gin                        |
| Database | PostgreSQL 16                        |
| Cache    | Redis 7                              |
| Storage  | MinIO (S3互換)                       |

## 主な機能

- **Markdown エディタ** — リアルタイムプレビュー・KaTeX 数式・シンタックスハイライト対応
- **サイト管理** — 複数サイト・ページ階層・テーマ・カスタムドメイン
- **認証** — メール＆パスワード / Google / GitHub / デモログイン（登録不要）
- **リアルタイム共同編集** — WebSocket による複数人同時編集
- **メディアライブラリ** — 画像アップロード（MinIO / S3 / R2）
- **アナリティクス** — PV・UU・リファラー・デバイス統計
- **コメント** — ページごとのコメント機能
- **API キー** — 外部ツールからの API アクセス
- **サイトエクスポート** — ZIP 形式で Markdown 一括ダウンロード
- **バージョン履歴** — ページの変更履歴と任意バージョンへのリバート

## クイックスタート

### ワンコマンド起動（推奨）

**Windows エクスプローラーから:**
- `start.bat` をダブルクリックするだけ

**ターミナルから:**
```powershell
# PowerShell
.\dev.ps1

# または pnpm
pnpm dev
```

インフラ（PostgreSQL, Redis, MinIO）の起動、環境変数ファイルの準備、バックエンドおよびフロントエンドの起動が一括で実行されます。

### 完全 Docker 起動（オプション）

ローカルに Go や Node.js をインストールせず、すべて Docker コンテナ内で動かす場合:
```bash
docker compose --profile all up -d --build
```

### 個別起動

#### 1. インフラ起動 (Docker)
```bash
pnpm infra
# または docker compose up -d
```

#### 2. バックエンド起動
```bash
pnpm dev:api
```
API が `http://localhost:8080` で起動します。

#### 3. フロントエンド起動
```bash
pnpm dev:web
```
UI が `http://localhost:3000` で起動します。

## 主要エンドポイント

| サービス      | URL                          |
|---------------|------------------------------|
| Frontend      | http://localhost:3000        |
| API           | http://localhost:8080/v1     |
| MinIO Console | http://localhost:9001        |
| Health Check  | http://localhost:8080/health |

## プロジェクト構成

```
klados/
├── apps/
│   ├── api/          # Go バックエンド
│   │   ├── internal/
│   │   │   ├── config/    # 環境変数読み込み
│   │   │   ├── handler/   # HTTP ハンドラー
│   │   │   ├── middleware/ # JWT / API キー認証
│   │   │   ├── model/     # GORM モデル定義
│   │   │   └── router/    # ルーティング
│   │   └── .env.example   # 環境変数テンプレート
│   └── web/          # Next.js フロントエンド
│       └── src/
│           ├── app/       # App Router ページ
│           ├── components/ # 共通コンポーネント
│           ├── lib/       # API クライアント
│           └── store/     # Zustand ステート
├── docs/
│   └── setup.md      # セットアップガイド（認証・環境変数・デプロイ）
├── docker-compose.yml
└── package.json
```

## ドキュメント

詳細なセットアップ手順・環境変数リファレンス・Google/GitHub OAuth の設定方法・本番デプロイのチェックリストは [`docs/setup.md`](docs/setup.md) を参照してください。

## ライセンス

MIT
