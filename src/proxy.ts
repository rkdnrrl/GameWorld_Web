import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const handler = createMiddleware(routing);

export function proxy(request: Parameters<typeof handler>[0]) {
  return handler(request);
}

export const config = {
  // ingest 추가: PostHog 리버스 프록시 (광고차단기 우회) — next.config.ts 의 /ingest 리라이트와 짝.
  matcher: ['/((?!api|ingest|_next|_vercel|backend-connection-check|.*\\..*).*)'],
};
