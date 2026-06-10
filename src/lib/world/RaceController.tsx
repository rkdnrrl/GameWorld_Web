'use client';
/**
 * 타임 트라이얼 (raceStart + raceFinish).
 *  - raceStart 진입 → 그 raceId 의 timer 시작 (restartOnReentry=true 면 재진입 시 리셋).
 *  - raceFinish 진입 → 같은 raceId 의 timer 가 진행 중이면 측정 종료.
 *  - 베스트 시간 localStorage `alp_race_best_${raceId}` (ms).
 *  - 진행 중 HUD: 화면 상단 가운데 큰 시간 + 경주 이름.
 *  - 완주 토스트: "완주! 12.34초 (베스트 11.20)" 또는 "🏆 새 베스트!".
 *
 * 멀티: 본인만. 글로벌 리더보드는 V2.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFrame } from '@react-three/fiber';
import type { RaceStartSpot, RaceFinishSpot } from './components';

interface ActiveRace {
  raceId: string;
  raceName: string;
  startedAt: number; // elapsed 기준 (초)
}

interface Toast {
  text: string;
  isBest: boolean;
  ts: number;
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = (ms / 1000) % 60;
  if (m > 0) return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
  return `${sec.toFixed(2)}초`;
}

function bestKey(raceId: string) { return `alp_race_best_${raceId}`; }
function readBest(raceId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(bestKey(raceId));
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}
function writeBest(raceId: string, ms: number) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(bestKey(raceId), String(ms)); } catch { /* noop */ }
}

export default function RaceController({
  starts,
  finishes,
  localPoseRef,
}: {
  starts: RaceStartSpot[];
  finishes: RaceFinishSpot[];
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | null | undefined;
}) {
  const elapsed = useRef(0);
  const activeRef = useRef<ActiveRace | null>(null);
  const lastInsideStart = useRef<Map<string, boolean>>(new Map());
  const lastInsideFinish = useRef<Map<string, boolean>>(new Map());
  const [active, setActive] = useState<ActiveRace | null>(null);
  const [, forceTick] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);

  // 진행 중일 때만 매초 정도 forceTick 으로 HUD 갱신 (성능 위해 200ms 주기)
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => forceTick(v => v + 1), 100);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(curr => curr?.ts === toast.ts ? null : curr), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  function isInside(
    cx: number, cy: number, cz: number,
    hx: number, hy: number, hz: number,
    px: number, py: number, pz: number,
  ) {
    return Math.abs(px - cx) <= hx && Math.abs(py - cy) <= hy && Math.abs(pz - cz) <= hz;
  }

  useFrame((_state, dt) => {
    elapsed.current += dt;
    const pose = localPoseRef?.current;
    if (!pose) return;

    // raceStart 체크
    for (const s of starts) {
      const within = isInside(s.cx, s.cy, s.cz, s.hx, s.hy, s.hz, pose.x, pose.y, pose.z);
      const wasIn = !!lastInsideStart.current.get(s.id);
      lastInsideStart.current.set(s.id, within);
      if (!within || wasIn) continue;
      // 새로 진입
      const cur = activeRef.current;
      if (cur && cur.raceId === s.raceId && !s.restartOnReentry) continue;
      const next: ActiveRace = { raceId: s.raceId, raceName: s.raceName, startedAt: elapsed.current };
      activeRef.current = next;
      setActive(next);
    }

    // raceFinish 체크
    for (const f of finishes) {
      const within = isInside(f.cx, f.cy, f.cz, f.hx, f.hy, f.hz, pose.x, pose.y, pose.z);
      const wasIn = !!lastInsideFinish.current.get(f.id);
      lastInsideFinish.current.set(f.id, within);
      if (!within || wasIn) continue;
      const cur = activeRef.current;
      if (!cur || cur.raceId !== f.raceId) continue;
      const ms = (elapsed.current - cur.startedAt) * 1000;
      const prevBest = readBest(f.raceId);
      const isBest = prevBest == null || ms < prevBest;
      if (isBest) writeBest(f.raceId, ms);
      const baseText = `🏁 완주 ${fmt(ms)}`;
      const detail = isBest
        ? (prevBest == null ? ' — 첫 기록!' : ` — 🏆 베스트! (이전 ${fmt(prevBest)})`)
        : (prevBest != null ? ` (베스트 ${fmt(prevBest)})` : '');
      setToast({ text: baseText + detail, isBest, ts: elapsed.current });
      activeRef.current = null;
      setActive(null);
    }
  });

  // active 사라진 raceId 정리
  useEffect(() => {
    const a = activeRef.current;
    if (!a) return;
    const stillHasStart = starts.some(s => s.raceId === a.raceId);
    if (!stillHasStart) { activeRef.current = null; setActive(null); }
  }, [starts]);

  const activeMs = active ? (elapsed.current - active.startedAt) * 1000 : 0;
  const bestForActive = active ? readBest(active.raceId) : null;

  return (
    <>
      {/* 진행 중 timer HUD (상단 가운데) */}
      {active && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 2147480000, pointerEvents: 'none',
          padding: '10px 24px', borderRadius: 14,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: '#fff', fontFamily: 'system-ui, sans-serif',
          textAlign: 'center', minWidth: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            🏁 {active.raceName}
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
            {fmt(activeMs)}
          </div>
          {bestForActive != null && (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              베스트 {fmt(bestForActive)}
            </div>
          )}
        </div>,
        document.body,
      )}

      {/* 완주 토스트 */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: '38%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 2147480001, pointerEvents: 'none',
          padding: '14px 28px', borderRadius: 14,
          background: toast.isBest ? '#fbbf24' : 'rgba(15,23,42,0.95)',
          color: toast.isBest ? '#1f2937' : '#fff',
          fontSize: 20, fontWeight: 800, fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          border: toast.isBest ? '2px solid #fff7ed' : '1px solid rgba(255,255,255,0.2)',
        }}>{toast.text}</div>,
        document.body,
      )}
    </>
  );
}
