import type { Metadata } from 'next';
import { headers } from 'next/headers';
import SitePageClient from './SitePageClient';
import { resolveMediaUrl } from '@/lib/media';

const API_BASE =
  process.env.INTERNAL_API_URL ||
  (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.startsWith('/')
    ? process.env.NEXT_PUBLIC_API_URL
    : (process.env.NODE_ENV === 'production' ? 'http://klados-api:8080/v1' : 'http://127.0.0.1:8080/v1'));

interface Props {
  params: Promise<{ slug: string; pageSlug?: string[] }>;
}

/**
 * リクエストヘッダーから現在の完全なオリジン (例: https://example.com) を取得
 */
async function getRequestOrigin(): Promise<string> {
  try {
    const headersList = await headers();
    const host =
      headersList.get('x-forwarded-host') ||
      headersList.get('host') ||
      process.env.NEXT_PUBLIC_MAIN_DOMAIN ||
      'localhost:3000';
    const proto =
      headersList.get('x-forwarded-proto') ||
      (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  } catch {
    return 'http://localhost:3000';
  }
}

/**
 * 画像パス/メディアIDを、SNSクローラーが確実に到達できる絶対URLに変換
 */
function makeAbsoluteUrl(rawUrl: string, origin: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  // resolveMediaUrl により /v1/public/media/... などの正規パスを取得
  const resolved = resolveMediaUrl(trimmed);
  if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
    return resolved;
  }
  return `${origin}${resolved.startsWith('/') ? '' : '/'}${resolved}`;
}

/**
 * Markdown本文から最初の画像URLまたはメディアIDを抽出
 */
function extractFirstImageFromMarkdown(content?: string): string | null {
  if (!content) return null;
  // 1. Markdown標準: ![alt](url)
  const mdMatch = content.match(/!\[.*?\]\((.+?)\)/);
  if (mdMatch && mdMatch[1]) {
    const url = mdMatch[1].split(/\s+/)[0];
    return url;
  }
  // 2. MediaWiki / Klados記法: [[File:xxx]] or [[Image:xxx]] or [[media:xxx]]
  const mwMatch = content.match(/\[\[(?:File|Image|ファイル|画像|media):([^|\]]+).*?\]\]/i);
  if (mwMatch && mwMatch[1]) {
    return mwMatch[1].trim();
  }
  // 3. 独立した media:UUID
  const mediaMatch = content.match(/\b(media:[0-9a-fA-F-]{36})\b/);
  if (mediaMatch && mediaMatch[1]) {
    return mediaMatch[1];
  }
  return null;
}

/**
 * Markdown本文から冒頭の説明文を抽出
 */
function extractDescriptionFromMarkdown(content?: string): string {
  if (!content) return '';
  return content
    .replace(/^---[\s\S]*?---/, '') // frontmatter 除去
    .replace(/\[\[Category:[^\]]+\]\]/gi, '') // カテゴリ除去
    .replace(/!\[.*?\]\(.*?\)/g, '') // 画像除去
    .replace(/\[\[(?:File|Image|ファイル|画像|media):.*?\]\]/gi, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // リンクテキスト
    .replace(/\[\[(.*?)\]\]/g, '$1') // wikiリンク
    .replace(/#{1,6}\s+/g, '') // 見出し記号
    .replace(/[*_~`>]/g, '') // 装飾記号
    .replace(/\s+/g, ' ') // 連続空白を正規化
    .trim()
    .slice(0, 160);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, pageSlug } = await params;
  const origin = await getRequestOrigin();

  try {
    const siteRes = await fetch(`${API_BASE}/public/sites/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!siteRes.ok) throw new Error('not found');
    const siteData = await siteRes.json();
    const site = siteData?.data;
    const siteTitle: string = site?.title ?? slug;
    const siteOgpTitle: string = site?.settings?.ogp_title || siteTitle;
    const siteDesc: string = site?.settings?.ogp_description || site?.description || '';
    const siteOgpImage: string = site?.settings?.ogp_image || '';
    const primaryColor: string = site?.primary_color || site?.settings?.primary_color || '#3b82f6';

    const currentSlug = Array.isArray(pageSlug) ? pageSlug.join('/') : '';
    const cleanSlug = currentSlug.replace(/^\.?\//, '').replace(/\.(?:md|markdown)$/i, '');

    let pageTitle = siteOgpTitle;
    let pageDesc = siteDesc;
    let rawOgpImage = siteOgpImage;
    let isArticle = false;

    if (cleanSlug) {
      isArticle = true;
      try {
        const pageRes = await fetch(
          `${API_BASE}/public/sites/${slug}/pages/${cleanSlug}`,
          { next: { revalidate: 60 } }
        );
        if (pageRes.ok) {
          const pageData = await pageRes.json();
          const page = pageData?.data?.page ?? pageData?.data;
          if (page) {
            if (page.title) {
              pageTitle = `${page.title} - ${siteTitle}`;
            }

            // 説明文の優先度: ページのfrontmatter > ページの本文要約 > サイト説明文
            const contentDesc = extractDescriptionFromMarkdown(page.content);
            pageDesc =
              page.frontmatter?.description ||
              page.frontmatter?.ogp_description ||
              (contentDesc ? contentDesc : siteDesc);

            // OGP画像の優先度:
            // 1. ページのfrontmatter画像 (ogp_image / image / thumbnail)
            // 2. 本文中の最初の画像
            // 3. サイト設定の ogp_image
            const pageFrontmatterImg =
              page.frontmatter?.ogp_image ||
              page.frontmatter?.image ||
              page.frontmatter?.thumbnail;
            const firstImg = extractFirstImageFromMarkdown(page.content);

            if (pageFrontmatterImg) {
              rawOgpImage = pageFrontmatterImg;
            } else if (firstImg) {
              rawOgpImage = firstImg;
            }
          }
        }
      } catch {
        // fall through to site metadata
      }
    }

    // 画像が一切指定されていない場合は、動的OGPジェネレーター (/api/og) をフォールバックとして使用
    const dynamicFallback = `${origin}/api/og?title=${encodeURIComponent(
      pageTitle
    )}&site=${encodeURIComponent(siteTitle)}&desc=${encodeURIComponent(
      pageDesc
    )}&color=${encodeURIComponent(primaryColor)}`;

    const absoluteOgpImage = rawOgpImage
      ? makeAbsoluteUrl(rawOgpImage, origin)
      : dynamicFallback;

    const pageUrl = cleanSlug
      ? `${origin}/sites/${slug}/${cleanSlug}`
      : `${origin}/sites/${slug}`;

    return {
      title: pageTitle,
      description: pageDesc || undefined,
      metadataBase: new URL(origin),
      alternates: {
        canonical: pageUrl,
      },
      openGraph: {
        title: pageTitle,
        description: pageDesc || undefined,
        url: pageUrl,
        siteName: siteTitle,
        locale: 'ja_JP',
        type: isArticle ? 'article' : 'website',
        images: [
          {
            url: absoluteOgpImage,
            width: 1200,
            height: 630,
            alt: pageTitle,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: pageTitle,
        description: pageDesc || undefined,
        images: [absoluteOgpImage],
      },
    };
  } catch {
    const fallbackImage = `${origin}/api/og?title=${encodeURIComponent(slug)}&site=${encodeURIComponent(slug)}`;
    return {
      title: slug,
      openGraph: {
        title: slug,
        images: [
          {
            url: fallbackImage,
            width: 1200,
            height: 630,
            alt: slug,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: slug,
        images: [fallbackImage],
      },
    };
  }
}

export default function PublicSitePage() {
  return <SitePageClient />;
}