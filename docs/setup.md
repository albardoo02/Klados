# Klados セットアップガイド

## 目次

1. [必要環境](#必要環境)
2. [クイックスタート](#クイックスタート)
3. [環境変数リファレンス](#環境変数リファレンス)
   - [バックエンド（API）](#バックエンドapi)
   - [フロントエンド（Web）](#フロントエンドweb)
4. [認証の設定](#認証の設定)
   - [メール＆パスワード認証](#メールパスワード認証)
   - [Google ログイン](#google-ログイン)
   - [GitHub ログイン](#github-ログイン)
   - [デモログイン](#デモログイン)
   - [JWT について](#jwt-について)
5. [外部サービスの設定](#外部サービスの設定)
   - [PostgreSQL](#postgresql)
   - [Redis](#redis)
   - [MinIO（ファイルストレージ）](#miniofファイルストレージ)
6. [本番環境へのデプロイ](#本番環境へのデプロイ)
7. [トラブルシューティング](#トラブルシューティング)

---

## 必要環境

| ツール         | バージョン | 用途                           |
|----------------|------------|--------------------------------|
| Go             | 1.23 以上  | バックエンド API               |
| Node.js        | 20 以上    | フロントエンド                 |
| pnpm           | 9 以上     | パッケージ管理                 |
| Docker Desktop | 最新版     | インフラ（DB / Redis / MinIO） |

---

## クイックスタート

### 1. リポジトリのクローン

```bash
git clone https://github.com/yourname/klados.git
cd klados
```

### 2. 環境変数ファイルの準備

```bash
# バックエンド用
cp apps/api/.env.example apps/api/.env
```

`apps/api/.env` を開き、少なくとも `JWT_SECRET` を変更してください（後述）。

### 3. 起動

```powershell
# Windows（推奨）
.\dev.ps1

# または pnpm 経由
pnpm dev
```

> スクリプトは Docker でインフラを起動し、その後バックエンドとフロントエンドを自動起動します。

### 4. 動作確認

| サービス         | URL                          |
|------------------|------------------------------|
| フロントエンド   | http://localhost:3000        |
| API              | http://localhost:8080/v1     |
| ヘルスチェック   | http://localhost:8080/health |
| MinIO コンソール | http://localhost:9001        |

---

## 環境変数リファレンス

### バックエンド（API）

ファイル: `apps/api/.env`（`.env.example` からコピー）

| 変数名             | デフォルト値                                                                         | 説明                                                               |
|--------------------|--------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| `PORT`             | `8080`                                                                               | API サーバーのリスンポート                                         |
| `DATABASE_URL`     | `host=localhost user=klados password=klados dbname=klados port=5432 sslmode=disable` | PostgreSQL 接続文字列                                              |
| `REDIS_URL`        | `redis://localhost:6379`                                                             | Redis 接続 URL                                                     |
| `JWT_SECRET`       | *(要変更)*                                                                           | **⚠️ 必ず変更してください**（後述）                                |
| `MINIO_ENDPOINT`   | `localhost:9000`                                                                     | MinIO の API エンドポイント                                        |
| `MINIO_ACCESS_KEY` | `minioadmin`                                                                         | MinIO のアクセスキー                                               |
| `MINIO_SECRET_KEY` | `minioadmin`                                                                         | MinIO のシークレットキー                                           |
| `MINIO_BUCKET`     | `klados-media`                                                                       | メディアファイル用バケット名                                       |
| `MINIO_USE_SSL`    | `false`                                                                              | MinIO への接続に SSL を使用するか                                  |
| `ALLOW_ORIGINS`    | `http://localhost:3000`                                                              | CORS で許可するオリジン（カンマ区切りで複数指定可）                |
| `ENVIRONMENT`      | `development`                                                                        | `development` または `production`（後者で Gin がリリースモードに） |

### フロントエンド（Web）

ファイル: `apps/web/.env.local`

| 変数名                | デフォルト値               | 説明                                  |
|-----------------------|----------------------------|---------------------------------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080/v1` | フロントエンドが叩く API のベース URL |

---

## 認証の設定

### メール＆パスワード認証

標準の認証フローです。設定不要ですぐに使えます。

**フロー:**
1. `/register` ページでアカウント作成（email / username / password）
2. メールアドレス確認トークンが発行される（開発環境では `dev_verification_url` がレスポンスに含まれる）
3. 確認後、`/login` からログイン → JWT トークンが `localStorage` の `access_token` キーに保存される

**パスワード要件:** 8 文字以上

> **開発環境のメール確認**
> 現在はメール送信が未実装です。登録 API のレスポンスに含まれる `dev_verification_url` を直接ブラウザで開いて確認してください。

---

### Google ログイン

現在の実装は **クライアント側でメールアドレスを直接入力するモックフロー**です。  
本番環境でリアルな Google OAuth を有効化するには以下の手順が必要です。

#### 本番環境での Google OAuth 設定手順

1. **Google Cloud Console でプロジェクトを作成**
   - [Google Cloud Console](https://console.cloud.google.com/) → 「認証情報」→「OAuth 2.0 クライアント ID」を作成

2. **OAuth クライアントを設定**
   - アプリケーションの種類: **ウェブ アプリケーション**
   - 承認済みリダイレクト URI: `https://your-domain.com/auth/google/callback`
   - クライアント ID とクライアントシークレットをコピー

3. **API 側でトークン検証を実装**

   `apps/api/internal/handler/auth.go` の `GoogleLogin` ハンドラーにトークン検証を追加します:

   ```go
   // go get google.golang.org/api/idtoken
   payload, err := idtoken.Validate(ctx, req.Token, clientID)
   if err != nil {
       c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid google token"})
       return
   }
   req.Email = payload.Claims["email"].(string)
   req.Name  = payload.Claims["name"].(string)
   ```

4. **フロントエンドに Google Client ID を設定**

   `apps/web/.env.local` に追加:
   ```env
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
   ```

   `apps/web/src/components/social-login.tsx` で `@react-oauth/google` などのライブラリを使用し、取得した `credential` を API に送信します。

---

### GitHub ログイン

現在の実装は **クライアント側でメールアドレスを直接入力するモックフロー**です。  
本番環境でリアルな GitHub OAuth を有効化するには以下の手順が必要です。

#### 本番環境での GitHub OAuth 設定手順

1. **GitHub OAuth App を作成**
   - [GitHub Developer Settings](https://github.com/settings/developers) → 「OAuth Apps」→「New OAuth App」
   - **Authorization callback URL**: `https://your-domain.com/auth/github/callback`
   - Client ID と Client Secret を取得

2. **サーバーサイドのコールバックを実装**

   本番環境ではサーバーサイドで GitHub の OAuth コードをアクセストークンに交換するフローを推奨します:

   ```
   フロントエンド → GitHub 認証画面 → コールバック URL → サーバーがトークン交換 → JWT 発行
   ```

3. **環境変数に追加**

   `apps/api/.env` に追加:
   ```env
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   ```

---

### デモログイン

登録不要でアプリを体験できる機能です。

- `POST /v1/auth/demo-login` を呼び出すと `demo@klados.app` のデモユーザーが自動作成またはログインされます
- デモユーザーは初回作成時にサンプルサイトとサンプルページが自動生成されます
- **本番環境では無効化を推奨**します（誰でも同じデモアカウントにアクセスできる設計のため）

デモログインを無効化するには `apps/api/internal/router/router.go` の以下の行を削除してください:

```go
auth.POST("/demo-login", authH.DemoLogin)
```

---

### JWT について

JWT（JSON Web Token）は認証に使用されます。

| 項目                       | 設定値                                   |
|----------------------------|------------------------------------------|
| アルゴリズム               | HS256                                    |
| 有効期限                   | 7 日間                                   |
| 保存場所（フロントエンド） | `localStorage` の `access_token` キー    |
| 送信方法                   | `Authorization: Bearer <token>` ヘッダー |

#### JWT_SECRET の設定

> ⚠️ **警告**: デフォルトの `JWT_SECRET` は公開リポジトリに含まれています。**本番環境では必ず変更してください。**  
> デフォルトのままでは JWT が偽造可能になります。

安全なシークレットの生成方法:

```powershell
# PowerShell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
```

```bash
# Linux / macOS
openssl rand -base64 64
```

生成した値を `apps/api/.env` の `JWT_SECRET` に設定します:

```env
JWT_SECRET=ここに生成した長いランダム文字列を設定
```

#### API キー認証

API キーによる認証もサポートしています。ダッシュボードの「設定 → API キー」から発行できます。

- API キーは SHA-256 ハッシュでデータベースに保存されます（元の値は発行時のみ表示）
- `X-API-Key: <your_key>` ヘッダー、または `Authorization: Bearer <your_key>` ヘッダーで送信できます

---

## 外部サービスの設定

### PostgreSQL

Docker Compose で自動起動するため、ローカル開発では追加設定は不要です。

```yaml
# docker-compose.yml より
POSTGRES_USER: klados
POSTGRES_PASSWORD: klados
POSTGRES_DB: klados
```

本番環境では `DATABASE_URL` 環境変数にマネージド PostgreSQL（Supabase, Neon, Amazon RDS など）の接続文字列を設定してください:

```env
DATABASE_URL=host=your-db-host user=klados password=your-password dbname=klados port=5432 sslmode=require
```

### Redis

セッション・キャッシュ用途で使用しています（現在はオプション）。

```env
REDIS_URL=redis://:password@your-redis-host:6379
```

### MinIO（ファイルストレージ）

画像・メディアファイルのアップロード先として使用します。S3 互換のため、本番環境では AWS S3 や Cloudflare R2 に置き換えることができます。

#### ローカル開発（MinIO コンテナ）

Docker Compose で自動起動します。

- API エンドポイント: `http://localhost:9000`
- 管理コンソール: `http://localhost:9001`
- ユーザー名 / パスワード: `minioadmin` / `minioadmin`

#### 本番環境（AWS S3 に置き換える場合）

`apps/api/.env` を以下のように設定:

```env
MINIO_ENDPOINT=s3.amazonaws.com
MINIO_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
MINIO_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
MINIO_BUCKET=your-s3-bucket-name
MINIO_USE_SSL=true
```

#### 本番環境（Cloudflare R2 に置き換える場合）

```env
MINIO_ENDPOINT=<your-account-id>.r2.cloudflarestorage.com
MINIO_ACCESS_KEY=your-r2-access-key
MINIO_SECRET_KEY=your-r2-secret-key
MINIO_BUCKET=klados-media
MINIO_USE_SSL=true
```

---

## 本番環境へのデプロイ

### チェックリスト

- [ ] `JWT_SECRET` を強力なランダム文字列に変更する
- [ ] `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` を変更する（またはマネージド S3 / R2 に切り替える）
- [ ] `DATABASE_URL` を本番 DB の接続文字列に変更する
- [ ] `ENVIRONMENT=production` を設定する（Gin がリリースモードになりログが最小化される）
- [ ] `ALLOW_ORIGINS` を本番ドメインに変更する（例: `https://your-domain.com`）
- [ ] `NEXT_PUBLIC_API_URL` を本番 API の URL に変更する
- [ ] デモログインエンドポイントを無効化する（任意）
- [ ] HTTPS を有効化する（リバースプロキシ: Nginx / Caddy 推奨）

### Docker Compose（全サービス一括）

```bash
docker compose --profile all up -d --build
```

### 個別デプロイ

バックエンドとフロントエンドを別サービス（Cloud Run, Fly.io, Vercel など）にデプロイする場合は、各サービスの環境変数を本番の値に設定してください。

フロントエンドを Vercel にデプロイする場合は、Vercel ダッシュボードの「Environment Variables」に `NEXT_PUBLIC_API_URL` を追加します。

---

## トラブルシューティング

### API が起動しない（MinIO 接続エラー）

```
failed to init minio: ...
```

MinIO コンテナが起動していない可能性があります:

```bash
docker compose up -d
docker compose ps
```

---

### ログインで 401 エラーが出る

`JWT_SECRET` が API と一致していることを確認してください。

```powershell
# Windows PowerShell
Get-Content apps/api/.env
```

---

### Google / GitHub ログインでエラーが出る

現在の実装はモックです。ボタンをクリックするとダッシュボードに直接ログインされます（メールアドレスはダミー）。本番の OAuth フローは未実装です。詳細は [認証の設定](#認証の設定) を参照してください。

---

### メール確認ができない

開発環境ではメール送信機能が未実装です。アカウント登録後、API のレスポンスに含まれる `dev_verification_url` をコピーしてブラウザで開いてください。

```json
{
  "data": {
    "dev_verification_url": "http://localhost:3000/verify-email?token=xxx"
  }
}
```

---

### MinIO コンソールにアクセスできない

`http://localhost:9001` にアクセスし、`minioadmin` / `minioadmin` でログインします。コンテナが停止している場合:

```bash
docker compose up minio -d
```
