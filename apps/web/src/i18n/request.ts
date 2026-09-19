import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, defaultTimeZone, locales, type Locale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  // Validate the incoming locale, fall back to default if invalid
  let locale = await requestLocale;
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: defaultTimeZone,
  };
});
