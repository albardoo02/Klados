import axios from 'axios';

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
};

// --- Sites ---
export interface SiteSettingsData {
  title?: string;
  slug?: string;
  description?: string;
  theme?: string;
  is_public?: boolean;
  custom_domain?: string;
  settings?: {
    ogp_title?: string;
    ogp_description?: string;
    ogp_image?: string;
    favicon?: string;
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

export const pagesApi = {
  list: (siteId: string) => api.get(`/sites/${siteId}/pages`),
  create: (siteId: string, data: { slug: string; title: string; content?: string; parent_id?: string }) =>
    api.post(`/sites/${siteId}/pages`, data),
  get: (id: string) => api.get(`/pages/${id}`),
  update: (id: string, data: Partial<{ title: string; content: string; status: string; slug?: string }>) =>
    api.patch(`/pages/${id}`, data),
  delete: (id: string) => api.delete(`/pages/${id}`),
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
