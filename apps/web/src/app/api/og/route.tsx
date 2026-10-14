import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'Klados';
    const site = searchParams.get('site') || 'Klados';
    const desc = searchParams.get('desc') || '';
    const color = searchParams.get('color') || '#3b82f6';

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '60px 80px',
            backgroundColor: '#0f172a',
            backgroundImage: `radial-gradient(circle at 10% 20%, ${color}33 0%, transparent 40%), radial-gradient(circle at 90% 80%, ${color}22 0%, transparent 40%)`,
            fontFamily: 'sans-serif',
            color: '#f8fafc',
          }}
        >
          {/* ヘッダー: サイトロゴ & サイト名 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '24px',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              K
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: '#e2e8f0',
                letterSpacing: '-0.5px',
              }}
            >
              {site}
            </div>
          </div>

          {/* メイン: タイトル & 説明文 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxWidth: '1040px',
            }}
          >
            <div
              style={{
                fontSize: title.length > 30 ? '48px' : '56px',
                fontWeight: '800',
                lineHeight: 1.2,
                color: '#ffffff',
                textShadow: '0 2px 10px rgba(0,0,0,0.4)',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {title}
            </div>
            {desc ? (
              <div
                style={{
                  fontSize: '24px',
                  lineHeight: 1.4,
                  color: '#94a3b8',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {desc}
              </div>
            ) : null}
          </div>

          {/* フッター: ブランドバー */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(148, 163, 184, 0.2)',
              paddingTop: '24px',
            }}
          >
            <div
              style={{
                fontSize: '18px',
                color: '#64748b',
                fontWeight: '600',
              }}
            >
              Powered by Klados Wiki & Publishing
            </div>
            <div
              style={{
                width: '120px',
                height: '4px',
                borderRadius: '2px',
                backgroundColor: color,
              }}
            />
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e: any) {
    return new Response(`Failed to generate OGP image: ${e.message}`, { status: 500 });
  }
}
