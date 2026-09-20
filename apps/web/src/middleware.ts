import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get('host')?.split(':')[0]?.toLowerCase() || '';

  // 内部API、静的ファイル、Next.js内部通信はそのまま通す
  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/v1') ||
    url.pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next();
  }

  // メイン管理画面ドメイン（CMS）やローカル開発環境の場合はリライトしない
  const mainDomains = [
    process.env.MAIN_DOMAIN?.toLowerCase() || 'cms.azisaba.net',
    'cms.azisaba.net',
    'klados.app',
    'localhost',
    '127.0.0.1',
  ];

  const isMainDomain = mainDomains.includes(hostname) || hostname.endsWith('.trycloudflare.com');

  if (isMainDomain) {
    return NextResponse.next();
  }

  // 独自ドメイン（例: newiki.azisaba.net など、管理画面以外の任意のドメイン）からのアクセス:
  // アクセスされたホスト名（hostname）をキーにして、DBのカスタムドメインと一致するサイトへ動的リライト！
  // 例: / -> /sites/newiki.azisaba.net
  //     /about -> /sites/newiki.azisaba.net/about
  if (!url.pathname.startsWith('/sites/')) {
    const targetPath = url.pathname === '/' ? `/sites/${hostname}` : `/sites/${hostname}${url.pathname}`;
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
