import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, defaultTimeZone, locales, type Locale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  // Validate the incoming locale, check cookie, fall back to default
  let locale = await requestLocale;
  if (!locale || !locales.includes(locale as Locale)) {
    try {
      const cookieStore = await cookies();
      const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
      if (cookieLocale && locales.includes(cookieLocale as Locale)) {
        locale = cookieLocale as Locale;
      } else {
        locale = defaultLocale;
      }
    } catch {
      locale = defaultLocale;
    }
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: defaultTimeZone,
  };
});
