import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get('host')?.split(':')[0]?.toLowerCase() || '';

  // メイン管理画面ドメインやローカル開発環境の場合はリライトしない
  const mainDomains = [
    'cms.azisaba.net',
    'localhost',
    '127.0.0.1',
  ];

  // 内部API、静的ファイル、Next.js内部通信、管理画面・認証関連はそのまま通す
  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/v1') ||
    url.pathname.startsWith('/favicon.ico') ||
    url.pathname.startsWith('/dashboard') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/register') ||
    url.pathname.startsWith('/verify-email') ||
    mainDomains.includes(hostname) ||
    hostname.endsWith('.trycloudflare.com')
  ) {
    return NextResponse.next();
  }

  // newiki.azisaba.net のアクセスを /sites/wiki にリライト（アドレスバーは newiki.azisaba.net を維持）
  if (hostname === 'newiki.azisaba.net') {
    if (url.pathname.startsWith('/sites/')) {
      return NextResponse.next();
    }
    const targetPath = url.pathname === '/' ? '/sites/wiki' : `/sites/wiki${url.pathname}`;
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
