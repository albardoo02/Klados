/**
 * ドメインおよびシステム共通ルーティング判定ユーティリティ
 */

// 既知のメインCMSドメイン（フォールバック用）
const DEFAULT_MAIN_DOMAINS = [
  'klados.app',
  'cms.azisaba.net',
  'klados.azisaba.net',
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
 * 予約されたシステムサブドメイン（メインCMSポータルとして扱うサブドメイン）
 */
export const RESERVED_SUBDOMAINS = [
  'www',
  'api',
  'auth',
  'admin',
  'app',
  'status',
  'mail',
  'cms',
];

export type HostType =
  | { type: 'main' }
  | { type: 'subdomain'; slug: string; rootDomain: string }
  | { type: 'custom_domain'; domain: string };

/**
 * リクエストホスト名を解析し、メインポータル、Kladosサブドメイン、外部独自ドメインを判定
 */
export function parseHost(hostname: string): HostType {
  if (!hostname) return { type: 'main' };
  const cleanHost = hostname.split(':')[0].toLowerCase();

  // ローカル開発環境のIPやlocalhost
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1') {
    return { type: 'main' };
  }

  // Cloudflare Tunnel の一時URL (.trycloudflare.com)
  if (cleanHost.endsWith('.trycloudflare.com')) {
    return { type: 'main' };
  }

  const mainDomains = getMainDomains();

  // 1. 完全一致するメインドメイン
  if (mainDomains.includes(cleanHost)) {
    return { type: 'main' };
  }

  // 2. メインドメインのサブドメイン (例: developer.klados.app, my-wiki.cms.azisaba.net)
  for (const main of mainDomains) {
    if (main === 'localhost' || main === '127.0.0.1') continue;
    if (cleanHost.endsWith(`.${main}`)) {
      const sub = cleanHost.slice(0, -(main.length + 1));
      if (!sub) continue;

      // 予約済みサブドメイン (www.klados.app 等) はメインCMS扱い
      if (RESERVED_SUBDOMAINS.includes(sub)) {
        return { type: 'main' };
      }

      return { type: 'subdomain', slug: sub, rootDomain: main };
    }
  }

  // 3. 第三者の独自ドメイン (例: example.com, wiki.othercompany.co.jp)
  return { type: 'custom_domain', domain: cleanHost };
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
 * 集中型OAuthリレーのブローカーとなるメインポータルのURL（https://cms.azisaba.net等）を正確に返します。
 */
export function getMainPortalUrl(mainDomainsConfig?: string): string {
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname.toLowerCase();
    // ローカル開発環境（localhost / 127.0.0.1）または既にメインドメイン上の場合は自身のオリジンを返す
    if (isMainDomain(currentHost)) {
      return window.location.origin;
    }

    const hostInfo = parseHost(currentHost);
    if (hostInfo.type === 'subdomain') {
      return `${window.location.protocol}//${hostInfo.rootDomain}`;
    }

    // もし現在のホストが *.klados.app や *.azisaba.net などの場合、同じ親ドメインを持つメインドメインを優先
    const allMains = getMainDomains();
    const parts = currentHost.split('.');
    if (parts.length >= 2) {
      const parentDomain = parts.slice(-2).join('.');
      const matched = allMains.find((d) => d.endsWith(parentDomain));
      if (matched) {
        return matched.startsWith('http') ? matched : `https://${matched}`;
      }
    }
  }

  // 1. 引数で渡された DB 保存のメインドメイン設定 (AuthConfig.main_domains)
  if (mainDomainsConfig) {
    const domains = mainDomainsConfig.split(',').map((s) => s.trim()).filter(Boolean);
    if (domains[0]) {
      return domains[0].startsWith('http') ? domains[0] : `https://${domains[0]}`;
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
    const domains = configured.split(',').map((s) => s.trim()).filter(Boolean);
    if (domains[0]) {
      return domains[0].startsWith('http') ? domains[0] : `https://${domains[0]}`;
    }
  }

  // 4. デフォルトフォールバック
  return 'https://klados.app';
}
