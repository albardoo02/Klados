'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { sitesApi, pagesApi, analyticsApi, AnalyticsData } from '@/lib/api';
import { getSitePublicUrl } from '@/lib/site-url';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  Users,
  Eye,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  FileText,
  Settings,
  Smartphone,
  Monitor,
  Tablet,
  Globe2,
  RefreshCw,
} from 'lucide-react';

interface PageItem {
  id: string;
  slug: string;
  title: string;
  status: string;
}

export default function SiteAnalyticsPage() {
  const t = useTranslations('analytics');
  const tNav = useTranslations('site_nav');
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<'7d' | '30d'>('7d');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  const { data: site } = useQuery({
    queryKey: ['site', id],
    queryFn: () => sitesApi.get(id).then((r) => r.data.data),
  });

  const { data: pages } = useQuery<PageItem[]>({
    queryKey: ['pages', id],
    queryFn: () => pagesApi.list(id).then((r) => r.data.data || []),
  });

  const { data: apiAnalytics, isLoading, refetch, isFetching } = useQuery<AnalyticsData>({
    queryKey: ['analytics', id, range],
    queryFn: () =>
      analyticsApi
        .getStats(id, range)
        .then((r) => r.data?.data)
        .catch(() => null),
  });

  // APIの実データをそのまま利用（ゼロの場合は真実のゼロおよび空状態を表示）
  const analytics: AnalyticsData = useMemo(() => {
    if (apiAnalytics) {
      return apiAnalytics;
    }

    const is7d = range === '7d';
    const dayCount = is7d ? 7 : 30;
    const now = new Date();

    const daily_stats = Array.from({ length: dayCount }).map((_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (dayCount - 1 - i));
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      return { date: dateStr, pv: 0, uv: 0 };
    });

    return {
      total_pv: 0,
      unique_visitors: 0,
      pv_change_percentage: 0,
      uv_change_percentage: 0,
      avg_duration_seconds: 0,
      bounce_rate: 0,
      daily_stats,
      top_pages: [],
      referrers: [],
      devices: [],
    };
  }, [apiAnalytics, range]);

  const maxDailyPv = useMemo(() => {
    return Math.max(...analytics.daily_stats.map((d) => d.pv), 1);
  }, [analytics]);

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* ナビゲーション & ヘッダー */}
      <div className="mb-6">
        <Link
          href={`/dashboard/sites/${id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="size-3.5" />
          <span>{tNav('back_to_sites')}</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="size-6 text-primary" />
              <span>{t('title')}</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {site?.title ? `${site.title} - ` : ''}
              {t('subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* 期間切り替えピッカー */}
            <div className="flex items-center p-0.5 bg-muted rounded-xl border border-border text-xs">
              <button
                type="button"
                onClick={() => setRange('7d')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  range === '7d'
                    ? 'bg-background shadow-xs text-foreground font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('range_7d')}
              </button>
              <button
                type="button"
                onClick={() => setRange('30d')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  range === '30d'
                    ? 'bg-background shadow-xs text-foreground font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('range_30d')}
              </button>
            </div>

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title={t('refresh')}
            >
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* タブナビゲーション */}
        <div className="flex items-center gap-2 mt-6 border-b border-border text-sm">
          <Link
            href={`/dashboard/sites/${id}`}
            className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent"
          >
            <FileText className="size-4" />
            <span>{tNav('pages')}</span>
          </Link>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2.5 font-semibold text-primary border-b-2 border-primary"
          >
            <BarChart3 className="size-4" />
            <span>{tNav('analytics')}</span>
          </button>
          <Link
            href={`/dashboard/sites/${id}/members`}
            className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent"
          >
            <Users className="size-4" />
            <span>{tNav('members')}</span>
          </Link>
          <Link
            href={`/dashboard/sites/${id}/settings`}
            className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent"
          >
            <Settings className="size-4" />
            <span>{tNav('settings')}</span>
          </Link>
        </div>
      </div>

      {/* 4連スタッツカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* 1. 総PV */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{t('total_pv')}</span>
            <div className="size-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Eye className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {analytics.total_pv.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-medium">PV</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs">
            {analytics.pv_change_percentage > 0 ? (
              <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                <ArrowUpRight className="size-3.5" />
                +{analytics.pv_change_percentage}%
              </span>
            ) : analytics.pv_change_percentage < 0 ? (
              <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-semibold">
                <ArrowDownRight className="size-3.5" />
                {analytics.pv_change_percentage}%
              </span>
            ) : (
              <span className="text-muted-foreground font-normal">±0%</span>
            )}
            <span className="text-[11px] text-muted-foreground font-normal ml-1">{t('prev_period')}</span>
          </div>
        </div>

        {/* 2. ユニークビジター */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{t('unique_visitors')}</span>
            <div className="size-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {analytics.unique_visitors.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground font-medium">UU</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs">
            {analytics.uv_change_percentage > 0 ? (
              <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                <ArrowUpRight className="size-3.5" />
                +{analytics.uv_change_percentage}%
              </span>
            ) : analytics.uv_change_percentage < 0 ? (
              <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-semibold">
                <ArrowDownRight className="size-3.5" />
                {analytics.uv_change_percentage}%
              </span>
            ) : (
              <span className="text-muted-foreground font-normal">±0%</span>
            )}
            <span className="text-[11px] text-muted-foreground font-normal ml-1">{t('prev_period')}</span>
          </div>
        </div>

        {/* 3. 平均滞在時間 */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{t('avg_duration')}</span>
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {Math.floor(analytics.avg_duration_seconds / 60)}m {analytics.avg_duration_seconds % 60}s
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {analytics.total_pv > 0 ? t('subtitle') : t('no_data')}
          </div>
        </div>

        {/* 4. 直帰率 */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{t('bounce_rate')}</span>
            <div className="size-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {analytics.bounce_rate}%
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {analytics.total_pv > 0 ? t('subtitle') : t('no_data')}
          </div>
        </div>
      </div>

      {/* 日次PV & 訪問者チャート */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xs mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
          <div>
            <h2 className="text-base font-bold">{t('daily_traffic')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('daily_traffic_desc')}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-blue-500" />
              <span>{t('pv_legend')}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-blue-300 dark:bg-blue-800" />
              <span>{t('uv_legend')}</span>
            </span>
          </div>
        </div>

        {/* バーチャート本体 */}
        <div className="h-64 flex items-end gap-2 sm:gap-3 pt-6 px-2 relative select-none">
          {/* 背景グリッド線 */}
          <div className="absolute inset-x-0 top-0 border-b border-border/40 text-[10px] text-muted-foreground/60">
            {maxDailyPv} PV
          </div>
          <div className="absolute inset-x-0 top-1/2 border-b border-border/30 text-[10px] text-muted-foreground/60">
            {Math.round(maxDailyPv / 2)} PV
          </div>
          <div className="absolute inset-x-0 bottom-6 border-b border-border/60 text-[10px] text-muted-foreground/60">
            0 PV
          </div>

          {/* 各日のバー */}
          <div className="flex-1 h-[calc(100%-1.5rem)] flex items-end gap-1.5 sm:gap-2.5 z-10">
            {analytics.daily_stats.map((day, idx) => {
              const pvHeight = maxDailyPv > 0 && day.pv > 0 ? Math.max(4, Math.round((day.pv / maxDailyPv) * 100)) : 0;
              const uvHeight = maxDailyPv > 0 && day.uv > 0 ? Math.max(3, Math.round((day.uv / maxDailyPv) * 100)) : 0;
              const isHovered = hoveredBarIndex === idx;

              return (
                <div
                  key={idx}
                  className="flex-1 h-full flex flex-col justify-end items-center relative group cursor-pointer"
                  onMouseEnter={() => setHoveredBarIndex(idx)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                >
                  {/* ホバー時ツールチップ */}
                  {isHovered && (
                    <div className="absolute -top-16 z-30 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-2.5 py-1.5 rounded-lg shadow-xl text-[11px] pointer-events-none whitespace-nowrap animate-in fade-in-0 zoom-in-95">
                      <div className="font-bold">{day.date}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                        <span className="text-blue-400 dark:text-blue-600 font-semibold">{day.pv} PV</span>
                        <span className="text-slate-400">/</span>
                        <span className="text-slate-300 dark:text-slate-600">{day.uv} UU</span>
                      </div>
                    </div>
                  )}

                  {/* バー表示 (PV & UV) */}
                  <div className="w-full max-w-[28px] flex items-end justify-center gap-0.5 sm:gap-1 h-full">
                    {/* PV バー */}
                    <div
                      style={{ height: `${pvHeight}%`, minHeight: day.pv > 0 ? '4px' : '0' }}
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        isHovered
                          ? 'bg-blue-600 shadow-sm'
                          : 'bg-blue-500 group-hover:bg-blue-600'
                      }`}
                    />
                    {/* UV バー */}
                    <div
                      style={{ height: `${uvHeight}%`, minHeight: day.uv > 0 ? '3px' : '0' }}
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        isHovered
                          ? 'bg-blue-400 dark:bg-blue-700 shadow-sm'
                          : 'bg-blue-300 dark:bg-blue-800 group-hover:bg-blue-400'
                      }`}
                    />
                  </div>

                  {/* X軸日付ラベル */}
                  <span className="text-[10px] text-muted-foreground mt-2 truncate w-full text-center">
                    {day.date}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2カラムレイアウト: 左(人気ページテーブル) / 右(流入元 & デバイス統計) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 人気ページ一覧テーブル */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h2 className="text-base font-bold">{t('top_pages')}</h2>
              <p className="text-xs text-muted-foreground">
                {t('top_pages_desc')}
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-muted text-muted-foreground">
              {analytics.top_pages.length} pages
            </span>
          </div>

          {analytics.top_pages.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {t('no_page_data')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-2.5 font-semibold w-8">{t('col_rank')}</th>
                    <th className="pb-2.5 font-semibold">{t('col_page')}</th>
                    <th className="pb-2.5 font-semibold text-right">{t('col_pv')}</th>
                    <th className="pb-2.5 font-semibold text-right">{t('col_ratio')}</th>
                    <th className="pb-2.5 font-semibold text-right w-16">{t('col_link')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {analytics.top_pages.map((p, idx) => (
                    <tr key={p.slug} className="hover:bg-muted/20 transition-colors group">
                      <td className="py-3 font-mono font-bold text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {p.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          /{p.slug}
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-foreground">
                        {p.pv.toLocaleString()}
                      </td>
                      <td className="py-3 text-right pr-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              style={{ width: `${p.percentage}%` }}
                              className="h-full bg-blue-500 rounded-full"
                            />
                          </div>
                          <span className="w-8 font-mono text-[11px] text-muted-foreground">
                            {p.percentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        {site && (
                          <a
                            href={`${getSitePublicUrl(site)}/${p.slug === 'index' ? '' : p.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors inline-block"
                            title={t('open_public_page')}
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 流入元 & デバイス構成 */}
        <div className="space-y-6">
          {/* 流入元 (Referrers) */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
            <div className="pb-3 border-b border-border flex items-center gap-2">
              <Globe2 className="size-4 text-primary" />
              <h2 className="text-base font-bold">{t('referrers')}</h2>
            </div>
            {analytics.referrers.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('no_referrer_data')}
              </div>
            ) : (
              <div className="space-y-3">
                {analytics.referrers.map((ref) => (
                  <div key={ref.source} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{ref.source}</span>
                      <span className="font-mono text-muted-foreground">{ref.percentage}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        style={{ width: `${ref.percentage}%` }}
                        className="h-full bg-indigo-500 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* デバイス比率 */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
            <div className="pb-3 border-b border-border flex items-center gap-2">
              <Monitor className="size-4 text-primary" />
              <h2 className="text-base font-bold">{t('devices')}</h2>
            </div>
            {analytics.devices.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('no_device_data')}
              </div>
            ) : (
              <div className="space-y-3">
                {analytics.devices.map((dev) => (
                  <div key={dev.device} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground flex items-center gap-1.5">
                        {dev.device.includes('デスクトップ') || dev.device.includes('Desktop') ? (
                          <Monitor className="size-3 text-muted-foreground" />
                        ) : dev.device.includes('モバイル') || dev.device.includes('Mobile') ? (
                          <Smartphone className="size-3 text-muted-foreground" />
                        ) : (
                          <Tablet className="size-3 text-muted-foreground" />
                        )}
                        <span>{dev.device}</span>
                      </span>
                      <span className="font-mono text-muted-foreground">{dev.percentage}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        style={{ width: `${dev.percentage}%` }}
                        className="h-full bg-emerald-500 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
