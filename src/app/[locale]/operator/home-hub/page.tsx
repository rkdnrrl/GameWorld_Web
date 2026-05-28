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
    return <div style={{ padding: 40, color: '#f87171' }}>운영자 권한이 필요합니다.</div>;
  }
  if (loading) {
    return <div style={{ padding: 40, color: '#94a3b8' }}>불러오는 중...</div>;
  }

  const list = tab === 'mine' ? myWorlds : publicWorlds;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px', color: '#fff' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>🏠 홈허브 맵 설정</h1>
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24 }}>
        유저가 <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>/world</code> 에 ID 없이 진입할 때 보이는 월드를 지정합니다.
        공개 월드만 지정 가능. 해제하면 기본 데모 섬으로 복귀합니다.
      </p>

      {/* 현재 설정 */}
      <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>현재 홈허브</div>
        {currentWorldId && currentWorld ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 8, flexShrink: 0,
                background: currentWorld.thumbnailUrl ? `url(${currentWorld.thumbnailUrl}) center/cover` : 'linear-gradient(135deg, #1d4ed8, #0f766e)',
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{currentWorld.name}</div>
                <div style={{ fontSize: 11, opacity: 0.65, fontFamily: 'monospace' }}>{currentWorldId}</div>
              </div>
            </div>
            <button onClick={() => saveHub(null)} disabled={saving}
              style={{ background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ✕ 해제
            </button>
          </div>
        ) : currentWorldId ? (
          <div style={{ fontSize: 13, color: '#fbbf24' }}>
            ⚠ 설정된 worldId ({currentWorldId}) 가 더 이상 존재하지 않습니다.
            <button onClick={() => saveHub(null)} disabled={saving} style={{ marginLeft: 12, background: '#ef4444', border: 'none', borderRadius: 6, color: '#fff', padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>해제</button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>설정 안 됨 — 기본 데모 섬이 표시됩니다.</div>
        )}
      </div>

      {/* 에러/성공 메시지 */}
      {error && <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>⚠ {error}</div>}
      {success && <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#6ee7b7', marginBottom: 12 }}>✓ {success}</div>}

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button onClick={() => setTab('mine')}
          style={{ background: tab === 'mine' ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          내 월드 ({myWorlds.length})
        </button>
        <button onClick={() => setTab('public')}
          style={{ background: tab === 'public' ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          공개 월드 ({publicWorlds.length})
        </button>
      </div>

      {/* 월드 리스트 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {list.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>
            {tab === 'mine' ? '월드가 없습니다. 먼저 월드를 만드세요.' : '공개 월드가 없습니다.'}
          </div>
        ) : list.map(w => {
          const isPublic = w.isPublic !== false;
          const isCurrent = w.id === currentWorldId;
          const disabled = !isPublic || isCurrent || saving;
          return (
            <div key={w.id} style={{
              background: isCurrent ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isCurrent ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 10, overflow: 'hidden',
            }}>
              <div style={{
                height: 100,
                background: w.thumbnailUrl ? `url(${w.thumbnailUrl}) center/cover` : 'linear-gradient(135deg, #334155, #1e293b)',
              }} />
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                  {!isPublic && <span style={{ fontSize: 9, background: 'rgba(251,191,36,0.25)', color: '#fbbf24', padding: '2px 5px', borderRadius: 3, fontWeight: 700 }}>비공개</span>}
                  {isCurrent && <span style={{ fontSize: 9, background: 'rgba(16,185,129,0.3)', color: '#6ee7b7', padding: '2px 5px', borderRadius: 3, fontWeight: 700 }}>설정됨</span>}
                </div>
                <div style={{ fontSize: 10, opacity: 0.5, fontFamily: 'monospace', marginBottom: 8 }}>{w.id}</div>
                <button onClick={() => saveHub(w.id)} disabled={disabled}
                  style={{
                    width: '100%', background: disabled ? 'rgba(255,255,255,0.06)' : '#4f46e5',
                    color: '#fff', border: 'none', borderRadius: 6, padding: '7px',
                    fontSize: 11, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }}>
                  {isCurrent ? '현재 설정됨' : !isPublic ? '공개 월드만 가능' : '홈허브로 지정'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
