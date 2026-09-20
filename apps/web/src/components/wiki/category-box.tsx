'use client';

import React from 'react';
import Link from 'next/link';
import { Folder, Tags } from 'lucide-react';
import { getSitePrefix } from '@/lib/site-url';

export interface CategoryBoxProps {
  categories: Array<{ name: string; sortKey?: string } | string>;
  siteSlug: string;
  primaryColor?: string;
  className?: string;
}

export function CategoryBox({
  categories,
  siteSlug,
  primaryColor = '#3b82f6',
  className = '',
}: CategoryBoxProps) {
  if (!categories || categories.length === 0) {
    return null;
  }

  const normalized = categories.map((c) => (typeof c === 'string' ? { name: c } : c));
  const sitePrefix = getSitePrefix(siteSlug);

  return (
    <div
      className={`mt-8 pt-3.5 pb-3.5 px-4 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400 ${className}`}
    >
      <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 shrink-0 select-none">
        <Folder className="size-3.5 text-primary" style={{ color: primaryColor }} />
        <span>カテゴリ:</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {normalized.map((cat, idx) => {
          const encodedName = encodeURIComponent(cat.name);
          const href = `${sitePrefix}/Category:${encodedName}`;

          return (
            <React.Fragment key={cat.name}>
              {idx > 0 && (
                <span className="text-slate-300 dark:text-slate-700 select-none" aria-hidden="true">
                  |
                </span>
              )}
              <Link
                href={href}
                className="hover:underline transition-colors font-medium text-slate-700 hover:text-primary dark:text-slate-300 dark:hover:text-white"
                style={{ color: primaryColor }}
                title={`カテゴリ「${cat.name}」の一覧を開く`}
              >
                {cat.name}
              </Link>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
