'use client';

import { useLocale } from '@/store/locale';
import type { Locale } from '@/i18n/config';

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  const options: { value: Locale; label: string; flag: string }[] = [
    { value: 'ja', label: 'JP', flag: '🇯🇵' },
    { value: 'en', label: 'EN', flag: '🇺🇸' },
  ];

  return (
    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setLocale(opt.value)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
            locale === opt.value
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
          aria-label={`Switch to ${opt.label}`}
        >
          <span>{opt.flag}</span>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
