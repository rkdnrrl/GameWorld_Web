'use client';
/**
 * /launcher — Steam 클라이언트 전용 메인 메뉴.
 *
 * ALP.exe 실행 시 자동 진입. 풀스크린 게임 같은 UX.
 * 일반 브라우저로 접근해도 동일 페이지 보임 (큰 문제 아님 — Steam 안 쓰는 유저는 이 URL 모름).
 *
 * 구조:
 *  - 상단 헤더: ALP 로고 + 닉네임/코인 + 알림
 *  - 큰 입장 CTA: "월드 입장" → /world
 *  - 6 카드: 게임/친구/캐릭터/스튜디오/공지/인벤토리
 *  - 하단: 종료 버튼 (Steam 클라이언트일 때만 window.alpSteam.quit())
 *
 * 비로그인 시: 큰 "로그인" CTA 만.
 */
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { api, session, type User } from '@/lib/api';

interface AlpSteamApi {
  isClient: true;
  version: string;
  quit: () => Promise<void>;
}
declare global {
  interface Window { alpSteam?: AlpSteamApi }
}

export default function LauncherPage() {
  const t = useTranslations('Launcher');
  const tCommon = useTranslations('Common');

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSteam, setIsSteam] = useState(false);

  useEffect(() => {
    setIsSteam(typeof window !== 'undefined' && !!window.alpSteam?.isClient);
    const tk = session.getToken();
    if (!tk) { setLoading(false); return; }
    api.me(tk)
      .then(d => setUser(d.user))
      .catch(() => { /* ignore — 비로그인 처리됨 */ })
      .finally(() => setLoading(false));
  }, []);

  async function handleQuit() {
    if (!window.confirm(t('quitConfirm'))) return;
    if (isSteam && window.alpSteam) {
      await window.alpSteam.quit();
    } else {
      // 일반 브라우저: 그냥 홈으로
      window.location.href = '/';
    }
  }

  return (
    <main className="fixed inset-0 overflow-y-auto bg-[#0b1220] text-white">
      {/* 배경 그라데이션 */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15)_0%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(236,72,153,0.10)_0%,transparent_50%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-8 py-6">
        {/* ── 헤더 ─────────────────────────────────────────── */}
        <header className="flex items-center justify-between border-b border-white/5 pb-5">
          <div className="flex items-baseline gap-3">
            <span className="bg-gradient-to-br from-indigo-400 to-pink-400 bg-clip-text text-3xl font-extrabold tracking-widest text-transparent">
              ALP
            </span>
            <span className="text-xs uppercase tracking-[3px] text-slate-500">
              {t('tagline')}
            </span>
          </div>

          {user ? (
            <div className="flex items-center gap-5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{t('welcome')}</span>
                <span className="font-semibold text-white">{user.nickname || user.email}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-amber-300">
                <span>💰</span>
                <span className="font-mono tabular-nums">
                  {typeof user.coins === 'number' ? user.coins.toLocaleString() : 0}
                </span>
              </div>
              <Link
                href="/notifications"
                className="rounded-full bg-white/5 px-3 py-1 text-slate-300 hover:bg-white/10"
              >
                🔔
              </Link>
            </div>
          ) : !loading ? (
            <Link
              href="/login"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
            >
              {t('loginButton')}
            </Link>
          ) : null}
        </header>

        {/* ── 큰 입장 CTA ─────────────────────────────────────── */}
        <section className="my-10 flex flex-col items-center text-center">
          {user ? (
            <>
              <h1 className="text-5xl font-bold tracking-tight">{t('readyTitle')}</h1>
              <p className="mt-3 text-base text-slate-400">{t('readyDesc')}</p>
              <Link
                href="/world"
                className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-pink-600 px-12 py-5 text-xl font-bold shadow-2xl shadow-indigo-900/40 transition hover:scale-105"
              >
                <span className="text-2xl">🌍</span>
                {t('enterWorld')}
              </Link>
            </>
          ) : !loading ? (
            <>
              <h1 className="text-4xl font-bold tracking-tight">{t('loginNeededTitle')}</h1>
              <p className="mt-3 text-base text-slate-400">{t('loginNeededDesc')}</p>
              <Link
                href="/login"
                className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-pink-600 px-12 py-5 text-xl font-bold shadow-2xl shadow-indigo-900/40 transition hover:scale-105"
              >
                {t('loginButton')}
              </Link>
            </>
          ) : (
            <div className="mt-12 text-slate-500">{tCommon('loading')}</div>
          )}
        </section>

        {/* ── 카드 그리드 (로그인 시만) ─────────────────────────── */}
        {user ? (
          <section className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
            <LauncherCard href="/games"         icon="🎮" title={t('cardGames')}         desc={t('cardGamesDesc')} />
            <LauncherCard href="/friends"       icon="👥" title={t('cardFriends')}       desc={t('cardFriendsDesc')} />
            <LauncherCard href="/character"     icon="🧑" title={t('cardCharacter')}     desc={t('cardCharacterDesc')} />
            <LauncherCard href="/studio"        icon="🛠️" title={t('cardStudio')}        desc={t('cardStudioDesc')} />
            <LauncherCard href="/announcements" icon="📢" title={t('cardAnnouncements')} desc={t('cardAnnouncementsDesc')} />
            <LauncherCard href="/inventory"     icon="🎒" title={t('cardInventory')}     desc={t('cardInventoryDesc')} />
          </section>
        ) : null}

        {/* ── 푸터 ─────────────────────────────────────────── */}
        <footer className="mt-10 flex items-center justify-between border-t border-white/5 pt-5 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span>v{isSteam ? (window.alpSteam?.version || '0.1.0') : 'web'}</span>
            {isSteam && <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400">Steam</span>}
            <Link href="/account" className="hover:text-white">⚙️ {t('settings')}</Link>
            <Link href="/support" className="hover:text-white">💝 {t('support')}</Link>
          </div>
          <div className="flex items-center gap-4">
            <kbd className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px]">F11</kbd>
            <span>{t('fullscreenHint')}</span>
            <button
              onClick={handleQuit}
              className="rounded-md border border-rose-700/50 bg-rose-900/20 px-3 py-1.5 text-rose-300 hover:bg-rose-900/40"
            >
              {t('quit')}
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}

function LauncherCard({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition hover:border-indigo-500/40 hover:bg-white/[0.05] hover:shadow-xl hover:shadow-indigo-900/20"
    >
      <div className="mb-3 text-3xl transition group-hover:scale-110">{icon}</div>
      <div className="text-lg font-semibold">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{desc}</div>
    </Link>
  );
}
