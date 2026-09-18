# Klados

> Markdownで美しいWebサイトを作成するプラットフォーム

## 技術スタック

| 領域     | 技術                                 |
|----------|--------------------------------------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Backend  | Go 1.23 + Gin                        |
| Database | PostgreSQL 16                        |
| Cache    | Redis 7                              |
| Storage  | MinIO (S3互換)                       |

## クイックスタート

### ワンコマンド起動（推奨）

**Windows エクスプローラーから:**
- `start.bat` をダブルクリックするだけ

**ターミナルから:**
```bash
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
│   └── web/          # Next.js フロントエンド
├── docker-compose.yml
└── package.json
```
