import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseHost, getMainPortalUrl, setDynamicMainDomains } from './lib/domains';

let lastDomainsFetch = 0;
const DOMAINS_CACHE_TTL = 60 * 1000; // 60秒キャッシュ

async function refreshDynamicDomains() {
  const now = Date.now();
  if (now - lastDomainsFetch < DOMAINS_CACHE_TTL) {
    return;
  }
  lastDomainsFetch = now;

  try {
    const apiUrl = process.env.INTERNAL_API_URL || 'http://api:8080/v1';
    const res = await fetch(`${apiUrl}/system/domains`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.data?.domains) {
        setDynamicMainDomains(json.data.domains);
      }
    }
  } catch {
    // API未接続・タイムアウト時は既存設定・フォールバックで安全に続行
  }
}

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname =
    (req.headers.get('x-forwarded-host') || req.headers.get('host'))
      ?.split(':')[0]
      ?.toLowerCase() || '';

  // 1. システム内部・静的アセットパスは常にそのまま通す
  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/v1') ||
    url.pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 動的メインドメインの定期同期
  await refreshDynamicDomains();

  const hostInfo = parseHost(hostname);

  // 2. メインCMSドメイン (klados.app, www.klados.app, localhost 等)
  if (hostInfo.type === 'main') {
    return NextResponse.next();
  }

  // 3. Klados サブドメイン (例: developer.klados.app)
  if (hostInfo.type === 'subdomain') {
    const slug = hostInfo.slug;

    // (a) もしブラウザから直接 /sites/slug を開こうとした場合はクリーンなURLへ 307 リダイレクト
    if (url.pathname === `/sites/${slug}` || url.pathname.startsWith(`/sites/${slug}/`)) {
      const cleanPath = url.pathname.slice(`/sites/${slug}`.length) || '/';
      url.pathname = cleanPath;
      return NextResponse.redirect(url, 307);
    }

    // (b) 管理画面・認証ページへアクセスされた場合はメインCMSポータルへリダイレクト
    if (
      url.pathname.startsWith('/dashboard') ||
      url.pathname.startsWith('/login') ||
      url.pathname.startsWith('/register')
    ) {
      const portalUrl = `${url.protocol}//${hostInfo.rootDomain}${url.pathname}${url.search}`;
      return NextResponse.redirect(new URL(portalUrl));
    }

    // (c) 内部で /sites/:slug に動的リライト！
    const targetPath = url.pathname === '/' ? `/sites/${slug}` : `/sites/${slug}${url.pathname}`;
    url.pathname = targetPath;
    return NextResponse.rewrite(url);
  }

  // 4. 第三者独自ドメイン (例: example.com, wiki.company.org)
  if (hostInfo.type === 'custom_domain') {
    const domain = hostInfo.domain;

    // (a) 直接 /sites/domain が開かれた場合はクリーンURLへ
    if (url.pathname === `/sites/${domain}` || url.pathname.startsWith(`/sites/${domain}/`)) {
      const cleanPath = url.pathname.slice(`/sites/${domain}`.length) || '/';
      url.pathname = cleanPath;
      return NextResponse.redirect(url, 307);
    }

    // (b) 管理画面アクセスはメインCMSへリダイレクト
    if (
      url.pathname.startsWith('/dashboard') ||
      url.pathname.startsWith('/login') ||
      url.pathname.startsWith('/register')
    ) {
      const mainPortal = getMainPortalUrl();
      return NextResponse.redirect(new URL(`${mainPortal}${url.pathname}${url.search}`));
    }

    // (c) 内部で /sites/:domain に動的リライト（Go APIが custom_domain 列で検索）
    const targetPath = url.pathname === '/' ? `/sites/${domain}` : `/sites/${domain}${url.pathname}`;
    url.pathname = targetPath;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static assets
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
