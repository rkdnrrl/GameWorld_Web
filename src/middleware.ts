import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // api, _next, _vercel, 파일 확장자 제외한 모든 경로에 적용
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
