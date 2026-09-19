import { API_BASE } from './api';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * 内部メディアID (media:UUID) または各種画像URLを、
 * 常に表示可能な恒久的URL（APIエンドポイント等）に解決する
 */
export function resolveMediaUrl(src?: string): string {
  if (!src) return '';
  const trimmed = src.trim();

  // 1. media:UUID または klados-media:UUID
  if (trimmed.startsWith('media:') || trimmed.startsWith('klados-media:')) {
    const rawId = trimmed.replace(/^(media:|klados-media:)/, '').trim();
    // 拡張子(.pngなど)が付いている場合でも除去してUUID部分を取得
    const cleanId = rawId.replace(/\.[^/.]+$/, '');
    return `${API_BASE}/public/media/${cleanId}`;
  }

  // 2. 単体UUID指定
  if (UUID_REGEX.test(trimmed)) {
    return `${API_BASE}/public/media/${trimmed}`;
  }

  // 3. /v1/public/media/:id または /api/v1/media/:id
  if (trimmed.startsWith('/v1/public/media/') || trimmed.startsWith('/public/media/')) {
    const relative = trimmed.startsWith('/v1') ? trimmed : `/v1${trimmed}`;
    const baseHost = API_BASE.replace(/\/v1\/?$/, '');
    return `${baseHost}${relative}`;
  }

  // 4. 既存の MinIO 直URL (http://localhost:9000/klados-media/...) の救済
  // 例: http://localhost:9000/klados-media/sites/{siteId}/media/{fileUuid}.png
  if (trimmed.includes('/klados-media/')) {
    // sites/.../media/ 形式の storageKey を抽出
    const matchKey = trimmed.match(/\/klados-media\/(sites\/[^\s"')]+)/);
    if (matchKey && matchKey[1]) {
      const storageKey = matchKey[1];
      // さらに media/{uuid}.ext の UUID を抽出できるか試す
      const uuidMatch = storageKey.match(/\/media\/([0-9a-fA-F-]{36})(?:\.[a-zA-Z0-9]+)?/);
      if (uuidMatch && uuidMatch[1]) {
        return `${API_BASE}/public/media/${uuidMatch[1]}`;
      }
      return `${API_BASE}/public/media/file/${storageKey}`;
    }
  }

  return trimmed;
}

/**
 * メディアIDまたはファイル情報から Markdown 画像タグの src 文字列を生成
 */
export function formatMediaRef(id?: string, fallbackUrl?: string): string {
  if (id && UUID_REGEX.test(id)) {
    return `media:${id}`;
  }
  return fallbackUrl || (id ? `media:${id}` : '');
}
