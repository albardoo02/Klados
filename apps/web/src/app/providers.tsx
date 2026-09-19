'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, useEffect } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { LocaleProvider, useLocale } from '@/store/locale';
import type { Locale } from '@/i18n/config';

import jaMessages from '@/messages/ja.json';
import enMessages from '@/messages/en.json';

const messages: Record<Locale, typeof jaMessages> = {
  ja: jaMessages,
  en: enMessages as typeof jaMessages,
};

/** Inner wrapper — reads locale from context, feeds NextIntlClientProvider */
function IntlWrapper({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render with 'ja' on first SSR pass to avoid hydration mismatch,
  // then switch to the real locale after mount.
  const activeLocale = mounted ? locale : 'ja';

  return (
    <NextIntlClientProvider locale={activeLocale} messages={messages[activeLocale]}>
      {children}
    </NextIntlClientProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <IntlWrapper>
          {children}
        </IntlWrapper>
      </LocaleProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
