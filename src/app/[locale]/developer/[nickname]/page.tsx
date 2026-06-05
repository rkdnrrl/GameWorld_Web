/**
 * /developer/[nickname] — /users/[username] 로 redirect.
 *
 * 옛 페이지 (게임 개발자 프로필) 는 /users/[username] 로 수렴됨.
 * 게임 목록은 /games?dev={username} 로 필터 (follow-up).
 */
import { redirect } from 'next/navigation';

export default async function DeveloperRedirect({ params }: { params: Promise<{ locale: string; nickname: string }> }) {
  const { locale, nickname } = await params;
  redirect(`/${locale}/users/${encodeURIComponent(nickname)}`);
}
