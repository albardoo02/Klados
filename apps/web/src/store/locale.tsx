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

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale;
      if (saved === 'en' || saved === 'ja') {
        setLocaleState(saved);
      }
    }
  }, []);

  const setLocale = (l: Locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, l);
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
