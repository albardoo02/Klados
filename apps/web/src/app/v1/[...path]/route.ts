import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_INTERNAL_URL =
  process.env.INTERNAL_API_URL?.replace(/\/v1\/?$/, '') ||
  process.env.BACKEND_INTERNAL_URL ||
  (process.env.NODE_ENV === 'production' ? 'http://klados-api:8080' : 'http://127.0.0.1:8080');

async function handleProxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const pathStr = path.join('/');
  const targetUrl = new URL(`/v1/${pathStr}`, BACKEND_INTERNAL_URL);
  targetUrl.search = req.nextUrl.search;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    // ホスト名などは転送せず、バックエンド内部アクセスとして処理
    if (lowerKey !== 'host' && lowerKey !== 'connection') {
      headers.set(key, value);
    }
  });

  const body = req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined;

  try {
    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
      // @ts-ignore Node.js 18+ streaming request body support
      duplex: 'half',
      redirect: 'manual',
    });

    const resHeaders = new Headers();
    res.headers.forEach((value, key) => {
      resHeaders.set(key, value);
    });

    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    });
  } catch (err: any) {
    console.error(`[API Proxy Error] Failed to proxy ${req.method} ${targetUrl}:`, err);
    return NextResponse.json(
      { error: 'Backend API proxy error', details: err?.message },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const HEAD = handleProxy;
export const OPTIONS = handleProxy;
