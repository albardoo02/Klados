import type { Metadata } from 'next';
import SitePageClient from './SitePageClient';

const API_BASE =
  process.env.INTERNAL_API_URL ||
  (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.startsWith('/')
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://127.0.0.1:8080/v1');

interface Props {
  params: Promise<{ slug: string; pageSlug?: string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, pageSlug } = await params;

  try {
    const siteRes = await fetch(`${API_BASE}/public/sites/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!siteRes.ok) throw new Error('not found');
    const siteData = await siteRes.json();
    const site = siteData?.data;
    const siteTitle: string = site?.title ?? slug;

    const currentSlug = Array.isArray(pageSlug) ? pageSlug.join('/') : '';
    if (currentSlug) {
      try {
        const pageRes = await fetch(
          `${API_BASE}/public/sites/${slug}/pages/${currentSlug}`,
          { next: { revalidate: 60 } }
        );
        if (pageRes.ok) {
          const pageData = await pageRes.json();
          const page = pageData?.data?.page ?? pageData?.data;
          if (page?.title) {
            return {
              title: `${page.title} - ${siteTitle}`,
              description: site?.description ?? undefined,
            };
          }
        }
      } catch {
        // fall through to site title
      }
    }

    return {
      title: siteTitle,
      description: site?.description ?? undefined,
    };
  } catch {
    return { title: slug };
  }
}

export default function PublicSitePage() {
  return <SitePageClient />;
}