'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { sitesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';
import { useState } from 'react';
import { Sparkles, AlertCircle, Globe } from 'lucide-react';

interface Site {
  id: string;
  slug: string;
  title: string;
  description: string;
  theme: string;
  is_public: boolean;
  role?: string;
  is_owner?: boolean;
  created_at: string;
}

export default function DashboardPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list().then((r) => r.data.data as Site[]),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', description: '' });
  const [errorMessage, setErrorMessage] = useState('');

  const ownedSites = data?.filter((s) => s.is_owner !== false) || [];
  const siteCount = ownedSites.length;

  const createMutation = useMutation({
    mutationFn: () => sitesApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setShowCreate(false);
      setForm({ slug: '', title: '', description: '' });
      setErrorMessage('');
    },
    onError: (err: any) => {
      setErrorMessage(err?.response?.data?.error || t('dashboard.create_error'));
    },
  });

  const handleOpenCreate = () => {
    setErrorMessage('');
    setShowCreate(true);
  };

  const roleBadge = (site: Site) => {
    if (site.is_owner === false) {
      const roleLabel =
        site.role === 'admin' ? t('dashboard.badge_admin') :
        site.role === 'editor' ? t('dashboard.badge_editor') :
        site.role === 'viewer' ? t('dashboard.badge_viewer') :
        t('dashboard.badge_custom');
      return `${roleLabel} (${t('dashboard.badge_member')})`;
    }
    return t('dashboard.badge_owner');
  };

  if (isLoading) {
    return <div className="text-center py-20 text-slate-400">{t('dashboard.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* OSSフリーバナー */}
      <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200/60 dark:border-blue-800/40 rounded-2xl p-4 sm:p-5 flex items-center gap-3">
        <div className="p-2.5 bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-xl">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-white">
              {t('oss_banner.title')}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-medium">
              {t('oss_banner.sites_count', { count: siteCount })}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {t('oss_banner.desc')}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('dashboard.my_sites')}</h1>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-1.5"
        >
          {t('dashboard.new_site')}
        </button>
      </div>

      {showCreate && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4">{t('dashboard.create_form_title')}</h2>
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('dashboard.site_name_label')} <span className="text-red-500">*</span>
              </label>
              <input
                placeholder={t('dashboard.site_name_placeholder')}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('dashboard.subdomain_label')} <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  placeholder="my-blog"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-transparent font-mono"
                />
                <span className="text-sm text-slate-500 font-mono">.klados.app</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('dashboard.description_label')}
              </label>
              <input
                placeholder={t('dashboard.description_placeholder')}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-transparent"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.title || !form.slug}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? t('dashboard.create_submitting') : t('dashboard.create_submit')}
              </button>
              <button
                onClick={() => { setShowCreate(false); setErrorMessage(''); }}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-sm font-medium transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.map((site) => (
          <Link
            key={site.id}
            href={`/dashboard/sites/${site.id}`}
            className="group bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 hover:shadow-md hover:border-blue-500/50 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="font-semibold text-lg text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {site.title}
                </h2>
                <div className="flex items-center gap-1.5 shrink-0">
                  {site.is_owner === false ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      {roleBadge(site)}
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {t('dashboard.badge_owner')}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      site.is_public
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {site.is_public ? t('dashboard.badge_public') : t('dashboard.badge_draft')}
                  </span>
                </div>
              </div>
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-3">
                {site.slug}.klados.app
              </p>
              {site.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                  {site.description}
                </p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>{t('dashboard.theme_label')}: {site.theme || 'minimal'}</span>
              <span>{t('dashboard.manage_label')}</span>
            </div>
          </Link>
        ))}

        {data?.length === 0 && (
          <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8">
            <Globe className="w-12 h-12 mx-auto text-slate-400 mb-3 opacity-60" />
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              {t('dashboard.empty_title')}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              {t('dashboard.empty_desc')}
            </p>
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-1.5"
            >
              {t('dashboard.first_site')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
