'use client';
/**
 * Presence 종합 페이지 (Phase 5-O) — "지금 누가 어디 있는지" 한눈에.
 *  - useFriendLocations() 의 접속 친구 위치를 공개 월드별로 그룹핑
 *  - 각 월드 그룹에 "들어가기" (그 월드로 합류)
 *  - 위치 비공개(비공개 월드) 친구는 별도 그룹에 온라인 표시만
 *  - 데이터는 5-G presence 인프라 그대로 재사용 (신규 API 없음)
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { session } from '@/lib/api';
import { useFriendLocations, type FriendLocation } from '@/lib/world/useFriendLocations';

export default function PresencePage() {
  const t = useTranslations('Presence');
  const locale = useLocale();
  const { locations, loading } = useFriendLocations();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => { setLoggedIn(!!session.getToken()); }, []);

  // 공개 월드별 그룹 + 비공개/위치숨김 그룹으로 분리
  const publicGroups = new Map<string, { worldId: string; worldName: string; friends: FriendLocation[] }>();
  const privateFriends: FriendLocation[] = [];
  for (const loc of locations) {
    if (loc.worldIsPublic && loc.worldName) {
      const g = publicGroups.get(loc.worldId) ?? { worldId: loc.worldId, worldName: loc.worldName, friends: [] };
      g.friends.push(loc);
      publicGroups.set(loc.worldId, g);
    } else {
      privateFriends.push(loc);
    }
  }
  const groups = [...publicGroups.values()].sort((a, b) => b.friends.length - a.friends.length);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">🟢 {t('title')}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('subtitle')}</p>
        {loggedIn && !loading && locations.length > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t('onlineNow', { count: locations.length })}
          </p>
        )}
      </header>

      {loggedIn === null || (loading && locations.length === 0) ? (
        <p className="py-16 text-center text-sm text-zinc-400">{t('loading')}</p>
      ) : !loggedIn ? (
        <div className="py-16 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('loginRequired')}</p>
          <Link href={`/${locale}/login`} className="mt-3 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900">
            {t('login')}
          </Link>
        </div>
      ) : locations.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-base font-medium text-zinc-600 dark:text-zinc-300">{t('empty')}</p>
          <p className="mt-1 text-sm text-zinc-400">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 공개 월드 그룹 — 합류 가능 */}
          {groups.map(g => (
            <section key={g.worldId} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-zinc-900 dark:text-white">🌍 {g.worldName}</h2>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">{t('peopleCount', { count: g.friends.length })}</span>
                </div>
                <Link href={`/${locale}/world?id=${g.worldId}`} className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
                  {t('join')}
                </Link>
              </div>
              <ul className="flex flex-wrap gap-2">
                {g.friends.map(f => <FriendChip key={f.userId} loc={f} />)}
              </ul>
            </section>
          ))}

          {/* 위치 비공개 친구 — 온라인 표시만 */}
          {privateFriends.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 font-semibold text-zinc-500 dark:text-zinc-400">🔒 {t('privateTitle')}</h2>
              <ul className="flex flex-wrap gap-2">
                {privateFriends.map(f => <FriendChip key={f.userId} loc={f} />)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function FriendChip({ loc }: { loc: FriendLocation }) {
  return (
    <li className="flex items-center gap-2 rounded-full bg-zinc-100 py-1 pl-1 pr-3 dark:bg-zinc-800">
      <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-300 text-xs font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
        {loc.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={loc.profileImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          loc.username.slice(0, 1).toUpperCase()
        )}
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-100 bg-emerald-500 dark:border-zinc-800" />
      </span>
      <span className="max-w-[8rem] truncate text-sm text-zinc-800 dark:text-zinc-100">{loc.username}</span>
    </li>
  );
}
