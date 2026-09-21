/**
 * ドメインおよびシステム共通ルーティング判定ユーティリティ
 */

// 既知のメインCMSドメイン（フォールバック用）
const DEFAULT_MAIN_DOMAINS = [
  'klados.azisaba.net',
  'cms.azisaba.net',
  'klados.app',
  'localhost',
  '127.0.0.1',
];

// メモリ上で動的に保持するメインドメインキャッシュ
let dynamicMainDomains: string[] = [];

/**
 * DBから取得した動的メインドメインをメモリキャッシュに登録
 */
export function setDynamicMainDomains(domains: string[] | string) {
  if (Array.isArray(domains)) {
    dynamicMainDomains = domains.map((d) => d.trim().toLowerCase()).filter(Boolean);
  } else if (typeof domains === 'string') {
    dynamicMainDomains = domains
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }
}

/**
 * 環境変数、DB設定、デフォルトをマージしてメインドメイン一覧を取得
 */
export function getMainDomains(): string[] {
  const envDomains = [
    process.env.MAIN_DOMAIN,
    process.env.NEXT_PUBLIC_MAIN_DOMAIN,
  ]
    .filter(Boolean)
    .flatMap((d) => (d as string).split(',').map((s) => s.trim().toLowerCase()));

  const allDomains = new Set([
    ...DEFAULT_MAIN_DOMAINS,
    ...envDomains,
    ...dynamicMainDomains,
  ]);
  return Array.from(allDomains);
}

/**
 * 指定されたホスト名がメインドメイン（CMS本体）かどうかを判定
 */
export function isMainDomain(hostname: string): boolean {
  if (!hostname) return true;
  const cleanHost = hostname.split(':')[0].toLowerCase();

  // Cloudflare Tunnel の一時URL (.trycloudflare.com) もメイン扱い
  if (cleanHost.endsWith('.trycloudflare.com')) {
    return true;
  }

  const mainDomains = getMainDomains();
  return mainDomains.includes(cleanHost);
}

/**
 * 管理機能や認証など、どんなドメインであってもWikiリライトしてはならないシステム共通パス
 */
export const SYSTEM_PATH_PREFIXES = [
  '/_next',
  '/api',
  '/v1',
  '/favicon.ico',
  '/login',
  '/register',
  '/dashboard',
  '/callback',
  '/verify-email',
  '/auth',
  '/sites',
];

export function isSystemPath(pathname: string): boolean {
  if (!pathname) return false;
  return SYSTEM_PATH_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * 現在のホストに応じた管理画面・メインポータルのベースURLを取得
 * 独自ドメイン（azipedia.azisaba.net等）から呼び出された場合でも、
 * 集中型OAuthリレーのブローカーとなるメインポータルのURL（https://klados.azisaba.net等）を正確に返します。
 */
export function getMainPortalUrl(mainDomainsConfig?: string): string {
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname.toLowerCase();
    // ローカル開発環境（localhost / 127.0.0.1）または既にメインドメイン上の場合は自身のオリジンを返す
    if (isMainDomain(currentHost)) {
      return window.location.origin;
    }
  }

  // 1. 引数で渡された DB 保存のメインドメイン設定 (AuthConfig.main_domains)
  if (mainDomainsConfig) {
    const first = mainDomainsConfig.split(',')[0].trim();
    if (first) {
      return first.startsWith('http') ? first : `https://${first}`;
    }
  }

  // 2. メモリキャッシュにある動的メインドメイン
  if (dynamicMainDomains.length > 0) {
    const first = dynamicMainDomains[0];
    if (first && first !== 'localhost' && first !== '127.0.0.1') {
      return first.startsWith('http') ? first : `https://${first}`;
    }
  }

  // 3. 環境変数 (NEXT_PUBLIC_MAIN_DOMAIN / MAIN_DOMAIN)
  const configured = process.env.NEXT_PUBLIC_MAIN_DOMAIN || process.env.MAIN_DOMAIN;
  if (configured) {
    const first = configured.split(',')[0].trim();
    if (first) {
      return first.startsWith('http') ? first : `https://${first}`;
    }
  }

  // 4. デフォルトフォールバック
  return 'https://klados.azisaba.net';
}
