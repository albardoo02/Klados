import { isMainDomain, isSystemPath } from './domains';

/**
 * 独自ドメインおよびCMSドメイン配下でのURL生成ヘルパー
 */

export function isCustomDomainHost(siteSlug?: string): boolean {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    // ブラウザのURLが /sites/... で始まる場合は必ずパスベースのルーティング（メインドメイン扱い）。
    // 独自ドメインでは middleware が /sites/... を隠すため、このパスがブラウザに現れることはない。
    // ※ クライアント側では MAIN_DOMAIN や DB 設定のメインドメインを参照できないため、
    //   ホスト名だけで判定すると未登録ホスト（IPアクセス等）で誤判定し、プレフィックスが欠落する。
    if (path === '/sites' || path.startsWith('/sites/')) {
      return false;
    }
    // ダッシュボード等のシステムパスから生成するリンクも /sites/... 形式が常に有効
    if (isSystemPath(path)) {
      return false;
    }
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
