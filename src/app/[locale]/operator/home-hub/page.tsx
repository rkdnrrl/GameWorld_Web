"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { session } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "https://airliveplay.com";

interface World {
  id: string;
  name: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  isPublic?: boolean;
}

export default function OperatorHomeHubPage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentWorldId, setCurrentWorldId] = useState<string | null>(null);
  const [currentWorld, setCurrentWorld] = useState<World | null>(null);
  const [myWorlds, setMyWorlds] = useState<World[]>([]);
  const [publicWorlds, setPublicWorlds] = useState<World[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<'mine' | 'public'>('mine');

  const fetchAll = useCallback(async () => {
    const tk = session.getToken();
    if (!tk) { router.replace('/login'); return; }
    setLoading(true);
    try {
      const [hubRes, mineRes, publicRes] = await Promise.all([
        fetch(`${API}/api/operator/home-hub`, { headers: { Authorization: `Bearer ${tk}` } }),
        fetch(`${API}/api/worlds/my`, { headers: { Authorization: `Bearer ${tk}` } }),
        fetch(`${API}/api/worlds/public`),
      ]);
      if (hubRes.status === 403) { setForbidden(true); return; }
      const hub = await hubRes.json();
      setCurrentWorldId(hub.worldId);
      setCurrentWorld(hub.world);
      const mine = await mineRes.json();
      setMyWorlds(mine.worlds || []);
      const pub = await publicRes.json();
      setPublicWorlds(pub.worlds || []);
    } catch (e) {
      setError('데이터 로드 실패: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveHub = async (worldId: string | null) => {
    setError(null); setSuccess(null); setSaving(true);
    try {
      const tk = session.getToken();
      const res = await fetch(`${API}/api/operator/home-hub`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ worldId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message || `HTTP ${res.status}`);
      }
      setSuccess(worldId ? '홈허브가 설정되었습니다.' : '홈허브가 해제되었습니다 (기본 데모 섬으로 복귀).');
      await fetchAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">권한 없음</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">운영자 권한이 필요합니다.</p>
      </div>
    );
  }
  if (loading) {
    return <div className="mx-auto w-full max-w-4xl px-4 py-16 text-sm text-zinc-500">불러오는 중...</div>;
  }

  const list = tab === 'mine' ? myWorlds : publicWorlds;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* 제목 */}
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">운영자</p>
        <h1 className="mt-0.5 text-2xl font-bold text-zinc-900 dark:text-zinc-100">🏠 홈허브 맵 설정</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          유저가 <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">/world</code> 에 ID 없이 진입할 때 보이는 월드를 지정합니다.
          공개 월드만 가능. 해제하면 기본 데모 섬으로 복귀합니다.
        </p>
      </div>

      {/* 현재 설정 */}
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">현재 홈허브</p>
        {currentWorldId && currentWorld ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="h-14 w-14 flex-shrink-0 rounded-lg bg-cover bg-center"
                style={{
                  backgroundImage: currentWorld.thumbnailUrl
                    ? `url(${currentWorld.thumbnailUrl})`
                    : 'linear-gradient(135deg, #1d4ed8, #0f766e)',
                }}
              />
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {currentWorld.name}
                </div>
                <div className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {currentWorldId}
                </div>
              </div>
            </div>
            <button
              onClick={() => saveHub(null)}
              disabled={saving}
              className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✕ 해제
            </button>
          </div>
        ) : currentWorldId ? (
          <div className="text-sm text-amber-700 dark:text-amber-400">
            ⚠ 설정된 worldId ({currentWorldId}) 가 더 이상 존재하지 않습니다.
            <button
              onClick={() => saveHub(null)}
              disabled={saving}
              className="ml-2 rounded bg-red-600 px-2 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              해제
            </button>
          </div>
        ) : (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            설정 안 됨 — 기본 데모 섬이 표시됩니다.
          </div>
        )}
      </div>

      {/* 에러/성공 메시지 */}
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400">
          ✓ {success}
        </div>
      )}

      {/* 탭 */}
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setTab('mine')}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            tab === 'mine'
              ? 'bg-blue-600 text-white'
              : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
          }`}
        >
          내 월드 ({myWorlds.length})
        </button>
        <button
          onClick={() => setTab('public')}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            tab === 'public'
              ? 'bg-blue-600 text-white'
              : 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
          }`}
        >
          공개 월드 ({publicWorlds.length})
        </button>
      </div>

      {/* 월드 리스트 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.length === 0 ? (
          <div className="col-span-full py-10 text-center text-sm text-zinc-500">
            {tab === 'mine' ? '월드가 없습니다. 먼저 월드를 만드세요.' : '공개 월드가 없습니다.'}
          </div>
        ) : (
          list.map((w) => {
            const isPublic = w.isPublic !== false;
            const isCurrent = w.id === currentWorldId;
            const disabled = !isPublic || isCurrent || saving;
            return (
              <div
                key={w.id}
                className={`overflow-hidden rounded-xl border ${
                  isCurrent
                    ? 'border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950/30'
                    : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                }`}
              >
                <div
                  className="h-24 bg-cover bg-center"
                  style={{
                    backgroundImage: w.thumbnailUrl
                      ? `url(${w.thumbnailUrl})`
                      : 'linear-gradient(135deg, #334155, #1e293b)',
                  }}
                />
                <div className="p-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className="flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {w.name}
                    </div>
                    {!isPublic && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                        비공개
                      </span>
                    )}
                    {isCurrent && (
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/50 dark:text-green-400">
                        설정됨
                      </span>
                    )}
                  </div>
                  <div className="mb-2 truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                    {w.id}
                  </div>
                  <button
                    onClick={() => saveHub(w.id)}
                    disabled={disabled}
                    className={`w-full rounded-md py-1.5 text-xs font-bold ${
                      disabled
                        ? 'cursor-default bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isCurrent ? '현재 설정됨' : !isPublic ? '공개 월드만 가능' : '홈허브로 지정'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
