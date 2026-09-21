import { isMainDomain } from './domains';

/**
 * 独自ドメインおよびCMSドメイン配下でのURL生成ヘルパー
 */

export function isCustomDomainHost(siteSlug?: string): boolean {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    return !isMainDomain(host);
  }
  // SSRフォールバック: siteSlug にドメイン名形式（ドットを含む）が渡された場合で、かつメインドメインでない場合
  if (siteSlug && siteSlug.includes('.') && !isMainDomain(siteSlug)) {
    return true;
  }
  return false;
}

export function getSitePrefix(siteSlug?: string): string {
  if (isCustomDomainHost(siteSlug)) {
    return '';
  }
  return siteSlug ? `/sites/${siteSlug}` : '';
}

export function getSitePageHref(siteSlug: string, pageSlug: string): string {
  const prefix = getSitePrefix(siteSlug);
  const clean = (pageSlug || '').replace(/^\//, '');
  if (!clean || clean === 'index' || clean === 'home') {
    return prefix || '/';
  }
  return `${prefix}/${clean}`;
}
