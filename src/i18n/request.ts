import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

/** 영어를 베이스로, 현재 locale 메시지를 섹션+키 단위로 덮어씀 */
function mergeWithEnFallback(
  en: Record<string, Record<string, string>>,
  locale: Record<string, Record<string, string>>,
) {
  const result: Record<string, Record<string, string>> = { ...en };
  for (const section of Object.keys(locale)) {
    result[section] = { ...(en[section] ?? {}), ...locale[section] };
  }
  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale;
  }

  const enMessages = (await import('../../messages/en.json')).default;
  const messages = locale === 'en'
    ? enMessages
    : mergeWithEnFallback(
        enMessages as Record<string, Record<string, string>>,
        (await import(`../../messages/${locale}.json`)).default as Record<string, Record<string, string>>,
      );

  return { locale, messages };
});
