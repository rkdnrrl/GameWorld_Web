'use client';
/**
 * 자판기 / 상점 (vendingMachine) — 가까이서 E 키로 모달 열기 → 코인으로 아이템 구매.
 *  - capture phase 에서 keydown 수신. Door / Dialogue 다음 mount → 그들이 처리 안하면 통과 → 가까운 자판기 처리.
 *  - 가까운 자판기 + 모달 닫힘 상태에서 E → 모달 열기 + 잔액 fetch
 *  - 모달 열려 있을 때 E / ESC / 닫기 버튼 → 모달 닫기
 *  - 구매 클릭 → POST /api/shop/purchase → 잔액 갱신 + 토스트
 *  - 모달은 createPortal 로 document.body. pointerEvents:auto 라 클릭 받음 (HUD 와 다름).
 *  - 멀티: 본인 화면만 (구매는 서버 단일 유저 행위).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFrame } from '@react-three/fiber';
import type { VendingSpot, VendingItem } from './components';
import { api, session } from '@/lib/api';
import { setInteractPrompt } from './interactPrompt';

type Toast = { text: string; kind: 'ok' | 'err' };

export default function VendingController({
  vendings,
  localPoseRef,
}: {
  vendings: VendingSpot[];
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | null | undefined;
}) {
  const nearRef = useRef<VendingSpot | null>(null);
  const [hudText, setHudText] = useState('');
  const lastHud = useRef('');
  const [open, setOpen] = useState<VendingSpot | null>(null);
  const openRef = useRef<VendingSpot | null>(null);
  openRef.current = open;
  const [coins, setCoins] = useState<number | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, kind: 'ok' | 'err') => {
    setToast({ text, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const close = useCallback(() => {
    setOpen(null);
    setBusyName(null);
  }, []);

  // 모달 열 때 잔액 fetch
  useEffect(() => {
    if (!open) return;
    const tok = session.getToken();
    if (!tok) { setCoins(0); return; }
    let cancelled = false;
    setCoins(null);
    api.getShopBalance(tok)
      .then(r => { if (!cancelled) setCoins(r.coins); })
      .catch(() => { if (!cancelled) setCoins(0); });
    return () => { cancelled = true; };
  }, [open]);

  // 키 capture — 가까운 자판기 있으면 E 로 열기, 모달 열림 시 E/ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.repeat) return;
      // 모달 열려 있는 동안 — E/ESC 로 닫기 (그리고 다른 핸들러 차단)
      if (openRef.current) {
        if (e.code === 'KeyE' || e.code === 'Escape') {
          e.stopImmediatePropagation();
          e.preventDefault();
          close();
        }
        return;
      }
      if (e.code !== 'KeyE') return;
      const near = nearRef.current;
      if (!near) return; // 통과
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(near);
      lastHud.current = '';
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      setInteractPrompt(null);
    };
  }, [close]);

  // 컴포넌트가 사라지면 모달 자동 닫기
  useEffect(() => {
    if (!open) return;
    if (!vendings.find(v => v.id === open.id)) close();
  }, [vendings, open, close]);

  // 언마운트 시 토스트 타이머 정리
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  useFrame(() => {
    const pose = localPoseRef?.current;
    let nearest: VendingSpot | null = null;
    let bestD = Infinity;
    if (pose) {
      for (const v of vendings) {
        const dx = v.cx - pose.x, dy = v.cy - pose.y, dz = v.cz - pose.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= v.range && dist < bestD) { bestD = dist; nearest = v; }
      }
    }
    nearRef.current = nearest;

    // 모달 열려 있는 동안에는 거리 너무 멀어지면 자동 닫기
    if (openRef.current && pose) {
      const v = vendings.find(x => x.id === openRef.current!.id);
      if (v) {
        const dx = v.cx - pose.x, dy = v.cy - pose.y, dz = v.cz - pose.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) > v.range * 2) close();
      }
    }

    let newHud = '';
    if (!openRef.current && nearest) newHud = `🏪 E: ${nearest.title}`;
    if (newHud !== lastHud.current) {
      lastHud.current = newHud;
      setHudText(newHud);
      // 모달 열려 있을 때 (E=닫기) 또는 가까운 자판기 (E=열기) 모두 prompt active
      setInteractPrompt(openRef.current || nearest ? 'vending' : null);
    }
  });

  const buy = useCallback(async (item: VendingItem) => {
    if (!open) return;
    if (busyName) return;
    const tok = session.getToken();
    if (!tok) { showToast('로그인이 필요합니다', 'err'); return; }
    setBusyName(item.name);
    try {
      const r = await api.purchaseShopItem(tok, {
        name: item.name,
        icon: item.icon,
        price: item.price,
        sourceGame: open.sourceGame,
        category: open.category,
      });
      setCoins(r.coins);
      showToast(`${item.icon || ''} ${item.name} 구매 완료 (-${item.price})`, 'ok');
    } catch (e: unknown) {
      // 402 코인 부족
      const msg = (e as { message?: string })?.message || '';
      if (/INSUFFICIENT_COINS|402/.test(msg)) showToast('코인이 부족합니다', 'err');
      else showToast('구매 실패: ' + (msg || '네트워크 오류'), 'err');
    } finally {
      setBusyName(null);
    }
  }, [open, busyName, showToast]);

  const itemsView = useMemo(() => open?.items ?? [], [open]);

  return (
    <>
      {/* 머리 위 안내 HUD */}
      {hudText && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', bottom: 120, left: '50%', transform: 'translateX(-50%)',
          zIndex: 2147480000, pointerEvents: 'none',
          padding: '8px 16px', borderRadius: 999,
          background: 'rgba(0,0,0,0.65)', color: '#fff',
          fontSize: 14, fontWeight: 700, fontFamily: 'system-ui, sans-serif',
          backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.18)',
        }}>{hudText}</div>,
        document.body,
      )}

      {/* 상점 모달 */}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2147480002,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'auto', fontFamily: 'system-ui, sans-serif',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div style={{
            width: 'min(560px, 92vw)', maxHeight: '80vh', overflow: 'auto',
            background: '#111827', color: '#fff', borderRadius: 16,
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.12)',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{open.title}</div>
              <button
                onClick={close}
                aria-label="close"
                style={{
                  background: 'transparent', border: 'none', color: '#fff',
                  fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1,
                }}
              >✕</button>
            </div>
            <div style={{
              padding: '10px 20px', fontSize: 13, opacity: 0.85,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span>잔액</span>
              <span style={{ fontWeight: 700, color: '#fbbf24' }}>
                🪙 {coins == null ? '…' : coins.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14 }}>
              {itemsView.map((it, i) => {
                const cant = coins != null && coins < it.price;
                const busy = busyName === it.name;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{ fontSize: 26 }}>{it.icon || '📦'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>🪙 {it.price}</div>
                    </div>
                    <button
                      disabled={busy || cant || coins == null}
                      onClick={() => buy(it)}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        background: cant ? '#374151' : '#10b981',
                        color: '#fff', border: 'none', fontWeight: 700,
                        cursor: cant || busy ? 'not-allowed' : 'pointer',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >{busy ? '...' : cant ? '부족' : '구매'}</button>
                  </div>
                );
              })}
            </div>
            <div style={{
              padding: '10px 20px 16px', fontSize: 11, opacity: 0.5, textAlign: 'center',
            }}>
              E / ESC 또는 바깥 클릭 → 닫기
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 토스트 */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', bottom: 180, left: '50%', transform: 'translateX(-50%)',
          zIndex: 2147480003, pointerEvents: 'none',
          padding: '10px 18px', borderRadius: 999,
          background: toast.kind === 'ok' ? '#10b981' : '#dc2626',
          color: '#fff', fontSize: 14, fontWeight: 700,
          fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>{toast.text}</div>,
        document.body,
      )}
    </>
  );
}
