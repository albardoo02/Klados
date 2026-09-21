import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isMainDomain, isSystemPath, setDynamicMainDomains } from './lib/domains';

let lastDomainsFetch = 0;
const DOMAINS_CACHE_TTL = 60 * 1000; // 60秒キャッシュ

async function refreshDynamicDomains() {
  const now = Date.now();
  if (now - lastDomainsFetch < DOMAINS_CACHE_TTL) {
    return;
  }
  lastDomainsFetch = now;

  try {
    const apiUrl = process.env.INTERNAL_API_URL || 'http://klados-api:8080/v1';
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
  const hostname = req.headers.get('host')?.split(':')[0]?.toLowerCase() || '';

  // 1. システム共通パス（_next, api, login, dashboard, callback, sites等）はリライトせずそのまま通す
  if (isSystemPath(url.pathname)) {
    return NextResponse.next();
  }

  // 2. メインCMSドメイン（klados.azisaba.net, cms.azisaba.net等）の場合はリライトしない
  if (isMainDomain(hostname)) {
    return NextResponse.next();
  }

  // 3. 未知のドメインの場合、DBに保存された動的メインドメイン設定をフェッチして再チェック
  await refreshDynamicDomains();
  if (isMainDomain(hostname)) {
    return NextResponse.next();
  }

  // 4. 独自ドメイン（Custom Domain: 例 wiki.azisaba.net 等）からのアクセス:
  // (a) もしブラウザが直接 /sites/hostname を開こうとした場合はクリーンなURL（/ など）へ 307 リダイレクト
  if (url.pathname.startsWith(`/sites/${hostname}`)) {
    const cleanPath = url.pathname.slice(`/sites/${hostname}`.length) || '/';
    url.pathname = cleanPath;
    return NextResponse.redirect(url);
  }

  // (b) 独自ドメインのアクセスを内部で /sites/${hostname} に動的リライト！
  const targetPath = url.pathname === '/' ? `/sites/${hostname}` : `/sites/${hostname}${url.pathname}`;
  url.pathname = targetPath;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static assets
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
