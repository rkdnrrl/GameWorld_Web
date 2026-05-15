import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const handler = createMiddleware(routing);

export function proxy(request: Parameters<typeof handler>[0]) {
  return handler(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|backend-connection-check|.*\\..*).*)'],
};
