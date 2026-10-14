'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Locale } from '@/i18n/config';
import { defaultLocale } from '@/i18n/config';

const STORAGE_KEY = 'klados-locale';

interface LocaleContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: defaultLocale,
  setLocale: () => {},
});

export function getCookieLocale(): Locale | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]*)/);
  const val = match ? decodeURIComponent(match[1]) : null;
  if (val === 'ja' || val === 'en') return val;
  return null;
}

export function setLocaleCookie(l: Locale) {
  if (typeof document === 'undefined') return;
  const host = window.location.hostname;
  let domainPart = '';
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && host.includes('.')) {
    const parts = host.split('.');
    if (parts.length >= 2) {
      const rootDomain = parts.slice(-2).join('.');
      domainPart = `; domain=.${rootDomain}`;
    }
  }
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (domainPart) {
    document.cookie = `NEXT_LOCALE=${l}; path=/; max-age=31536000${domainPart}; SameSite=Lax${secure}`;
  }
  document.cookie = `NEXT_LOCALE=${l}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return getCookieLocale() || defaultLocale;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const cookieLocale = getCookieLocale();
      const savedStorage = localStorage.getItem(STORAGE_KEY) as Locale;
      const target = cookieLocale || (savedStorage === 'en' || savedStorage === 'ja' ? savedStorage : defaultLocale);
      setLocaleState(target);
      setLocaleCookie(target);
      localStorage.setItem(STORAGE_KEY, target);
    }
  }, []);

  const setLocale = (l: Locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, l);
      setLocaleCookie(l);
    }
    setLocaleState(l);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);
