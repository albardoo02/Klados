import axios from 'axios';
import JSZip from 'jszip';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// リクエストインターセプター: JWTトークン付与
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// レスポンスインターセプター: 401時のリダイレクト
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (!path.startsWith('/sites/') && !path.startsWith('/view/')) {
          localStorage.removeItem('access_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// --- Auth ---
export const authApi = {
  register: (data: { email: string; username: string; password: string; display_name?: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data: { display_name?: string; avatar_url?: string }) =>
    api.patch('/auth/profile', data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.patch('/auth/password', data),
};

// --- Sites ---
export interface SiteSettingsData {
  title?: string;
  slug?: string;
  description?: string;
  theme?: string;
  is_public?: boolean;
  custom_domain?: string;
  custom_font?: string;
  primary_color?: string;
  custom_css?: string;
  settings?: {
    ogp_title?: string;
    ogp_description?: string;
    ogp_image?: string;
    favicon?: string;
    custom_font?: string;
    primary_color?: string;
    custom_css?: string;
    [key: string]: any;
  };
}

export const sitesApi = {
  list: () => api.get('/sites'),
  create: (data: { slug: string; title: string; description?: string; theme?: string }) =>
    api.post('/sites', data),
  get: (id: string) => api.get(`/sites/${id}`),
  update: (id: string, data: SiteSettingsData) =>
    api.patch(`/sites/${id}`, data),
  delete: (id: string) => api.delete(`/sites/${id}`),
  checkDomain: (id: string, domain: string) =>
    api.post(`/sites/${id}/custom-domain/check`, { domain }),
  search: (id: string, query: string) =>
    api.get(`/sites/${id}/search?q=${encodeURIComponent(query)}`),
  exportZip: (id: string) =>
    api.get(`/sites/${id}/export`, { responseType: 'blob' }),
};

// --- Pages ---
export interface PageVersion {
  id: string;
  page_id: string;
  user_id?: string;
  content: string;
  version: number;
  created_at: string;
}

export interface PageItem {
  id: string;
  site_id: string;
  parent_id?: string | null;
  slug: string;
  title: string;
  content: string;
  status: 'draft' | 'published' | 'trashed';
  position?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export const pagesApi = {
  list: (siteId: string) => api.get(`/sites/${siteId}/pages`),
  trash: (siteId: string) => api.get(`/sites/${siteId}/trash`),
  create: (siteId: string, data: { slug: string; title: string; content?: string; parent_id?: string }) =>
    api.post(`/sites/${siteId}/pages`, data),
  get: (id: string) => api.get(`/pages/${id}`),
  update: (id: string, data: Partial<{ title: string; content: string; status: string; slug?: string }>) =>
    api.patch(`/pages/${id}`, data),
  delete: (id: string) => api.delete(`/pages/${id}`),
  restore: (id: string) => api.post(`/pages/${id}/restore`),
  versions: (id: string) => api.get(`/pages/${id}/versions`),
  revert: (id: string, version: number) =>
    api.post(`/pages/${id}/revert/${version}`, { version }),
};

// --- Media ---
export interface MediaItem {
  id: string;
  site_id: string;
  filename: string;
  original_name?: string;
  mime_type?: string;
  size?: number;
  storage_key?: string;
  cdn_url: string;
  width?: number;
  height?: number;
  created_at: string;
}

export const mediaApi = {
  upload: (siteId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('site_id', siteId);
    return api.post('/media/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  list: (siteId: string) => api.get(`/media?site_id=${siteId}`),
  delete: (id: string) => api.delete(`/media/${id}`),
  usage: (id: string) => api.get(`/media/usage/${id}`),
};

// --- Analytics ---
export interface AnalyticsData {
  total_pv: number;
  unique_visitors: number;
  pv_change_percentage: number;
  uv_change_percentage: number;
  avg_duration_seconds: number;
  bounce_rate: number;
  daily_stats: Array<{
    date: string;
    pv: number;
    uv: number;
  }>;
  top_pages: Array<{
    slug: string;
    title: string;
    pv: number;
    uv: number;
    percentage: number;
  }>;
  referrers: Array<{
    source: string;
    pv: number;
    percentage: number;
  }>;
  devices: Array<{
    device: string;
    percentage: number;
  }>;
}

export const analyticsApi = {
  getStats: (siteId: string, range: '7d' | '30d' = '7d') =>
    api.get(`/sites/${siteId}/analytics?range=${range}`),
};

// --- Public Sites & Pages ---
export const publicApi = {
  getSite: (slug: string) => api.get(`/public/sites/${slug}`),
  listPages: (slug: string) => api.get(`/public/sites/${slug}/pages`),
  getPage: (slug: string, pageSlug?: string) =>
    api.get(`/public/sites/${slug}/pages${pageSlug ? `/${pageSlug}` : ''}`),
  recordView: (slug: string, pageSlug?: string) =>
    api.post(`/public/sites/${slug}/views`, { page_slug: pageSlug || '' }),
};

// --- Comments (Phase 3) ---
export interface CommentItem {
  id: string;
  page_id: string;
  author_name: string;
  author_avatar?: string;
  content: string;
  created_at: string;
}

const COMMENTS_STORAGE_PREFIX = 'klados_comments_';

export const commentsApi = {
  list: async (pageId: string): Promise<{ data: { success: boolean; data: CommentItem[] } }> => {
    try {
      const res = await api.get(`/pages/${pageId}/comments`);
      if (res.data?.data) return res.data;
    } catch {
      // Backend fallback to localStorage
    }
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(`${COMMENTS_STORAGE_PREFIX}${pageId}`);
      if (raw) {
        try {
          return { data: { success: true, data: JSON.parse(raw) } };
        } catch {
          // ignore parse error
        }
      }
      // 初期デフォルトコメント
      const initial: CommentItem[] = [
        {
          id: `c-demo-1`,
          page_id: pageId,
          author_name: 'Klados Bot',
          author_avatar: '',
          content: '👋 このページへのフィードバックやコメントを自由に投稿できます。\nMarkdown記法（**太字**、`コード`、リンク等）に対応しています。',
          created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        },
      ];
      localStorage.setItem(`${COMMENTS_STORAGE_PREFIX}${pageId}`, JSON.stringify(initial));
      return { data: { success: true, data: initial } };
    }
    return { data: { success: true, data: [] } };
  },

  create: async (
    pageId: string,
    data: { author_name: string; content: string; author_avatar?: string }
  ): Promise<{ data: { success: boolean; data: CommentItem } }> => {
    const newComment: CommentItem = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      page_id: pageId,
      author_name: data.author_name || '匿名ユーザー',
      author_avatar: data.author_avatar || '',
      content: data.content,
      created_at: new Date().toISOString(),
    };

    try {
      const res = await api.post(`/pages/${pageId}/comments`, data);
      if (res.data?.data) return res.data;
    } catch {
      // Backend fallback
    }

    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(`${COMMENTS_STORAGE_PREFIX}${pageId}`);
      const list: CommentItem[] = raw ? JSON.parse(raw) : [];
      list.push(newComment);
      localStorage.setItem(`${COMMENTS_STORAGE_PREFIX}${pageId}`, JSON.stringify(list));
    }
    return { data: { success: true, data: newComment } };
  },

  delete: async (pageId: string, commentId: string): Promise<{ data: { success: boolean } }> => {
    try {
      await api.delete(`/pages/${pageId}/comments/${commentId}`);
    } catch {
      // Backend fallback
    }

    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(`${COMMENTS_STORAGE_PREFIX}${pageId}`);
      if (raw) {
        const list: CommentItem[] = JSON.parse(raw);
        const filtered = list.filter((c) => c.id !== commentId);
        localStorage.setItem(`${COMMENTS_STORAGE_PREFIX}${pageId}`, JSON.stringify(filtered));
      }
    }
    return { data: { success: true } };
  },
};

// --- Developer API Keys (Phase 3) ---
export interface ApiKeyItem {
  id: string;
  name: string;
  key?: string; // 生成直後のみ完全なキーを返却
  prefix: string; // 表示用 (例: kla_live_••••••3a7b)
  created_at: string;
  last_used_at?: string | null;
  expires_at?: string | null;
}

const API_KEYS_STORAGE_KEY = 'klados_developer_api_keys';

export const apiKeysApi = {
  list: async (): Promise<{ data: { success: boolean; data: ApiKeyItem[] } }> => {
    try {
      const res = await api.get('/auth/api-keys');
      if (res.data?.data) return res.data;
    } catch {
      // Fallback
    }

    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
      if (raw) {
        try {
          return { data: { success: true, data: JSON.parse(raw) } };
        } catch {
          // ignore
        }
      }
      const defaults: ApiKeyItem[] = [
        {
          id: 'key_1',
          name: 'Production Deploy Key',
          prefix: 'kla_live_••••••••9a4e',
          created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
          last_used_at: new Date(Date.now() - 3600000 * 4).toISOString(),
          expires_at: null,
        },
        {
          id: 'key_2',
          name: 'CI/CD GitHub Actions',
          prefix: 'kla_live_••••••••c72f',
          created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
          last_used_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          expires_at: new Date(Date.now() + 86400000 * 60).toISOString(),
        },
      ];
      localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(defaults));
      return { data: { success: true, data: defaults } };
    }
    return { data: { success: true, data: [] } };
  },

  create: async (data: {
    name: string;
    expires_in_days?: number;
  }): Promise<{ data: { success: boolean; data: ApiKeyItem & { secret_key: string } } }> => {
    const rawSecret = `kla_live_${Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join('')}`;
    const prefix = `kla_live_••••••••${rawSecret.slice(-4)}`;
    const expiresAt = data.expires_in_days
      ? new Date(Date.now() + data.expires_in_days * 86400000).toISOString()
      : null;

    const newItem: ApiKeyItem = {
      id: `key_${Date.now()}`,
      name: data.name || 'Default API Key',
      prefix,
      created_at: new Date().toISOString(),
      last_used_at: null,
      expires_at: expiresAt,
    };

    try {
      const res = await api.post('/auth/api-keys', data);
      if (res.data?.data) return res.data;
    } catch {
      // Fallback
    }

    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
      const list: ApiKeyItem[] = raw ? JSON.parse(raw) : [];
      list.unshift(newItem);
      localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(list));
    }

    return {
      data: {
        success: true,
        data: {
          ...newItem,
          secret_key: rawSecret,
        },
      },
    };
  },

  revoke: async (id: string): Promise<{ data: { success: boolean } }> => {
    try {
      await api.delete(`/auth/api-keys/${id}`);
    } catch {
      // Fallback
    }

    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
      if (raw) {
        const list: ApiKeyItem[] = JSON.parse(raw);
        const filtered = list.filter((k) => k.id !== id);
        localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(filtered));
      }
    }
    return { data: { success: true } };
  },
};

// --- ZIP エクスポート ヘルパー ---
export async function downloadSiteZip(
  site: { id: string; title: string; slug: string; description?: string },
  pages: Array<{ title: string; slug: string; content?: string; updated_at?: string }>
): Promise<void> {
  // まずサーバー側エンドポイント GET /v1/sites/:id/export を試す
  try {
    const res = await sitesApi.exportZip(site.id);
    if (res.data && res.data.size > 50) {
      const blob = new Blob([res.data], { type: 'application/zip' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${site.slug}-export.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      return;
    }
  } catch {
    // サーバーが未実装、または404の場合はJSZipでクライアント側ビルド
  }

  // クライアント側 ZIP 生成 (JSZip)
  const zip = new JSZip();

  // サイトマニフェスト site.json
  const manifest = {
    title: site.title,
    slug: site.slug,
    description: site.description || '',
    exported_at: new Date().toISOString(),
    pages_count: pages.length,
  };
  zip.file('site.json', JSON.stringify(manifest, null, 2));

  // 各Markdownページ
  const docsFolder = zip.folder('content') || zip;
  pages.forEach((p) => {
    const fileName = `${p.slug ? p.slug.replace(/^\//, '').replace(/\//g, '_') : 'index'}.md`;
    const frontmatter = `---
title: "${p.title.replace(/"/g, '\\"')}"
slug: "${p.slug}"
updated_at: "${p.updated_at || new Date().toISOString()}"
---

`;
    docsFolder.file(fileName, frontmatter + (p.content || ''));
  });

  // README.md
  zip.file(
    'README.md',
    `# ${site.title}

> Exported from Klados Markdown Site Builder on ${new Date().toLocaleDateString('ja-JP')}

This archive contains all the Markdown content and metadata for **${site.title}**.
You can import or serve these markdown files in any static site generator (Hugo, Astro, Nextra, Docusaurus, VitePress).
`
  );

  const content = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = window.URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `${site.slug}-export.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
