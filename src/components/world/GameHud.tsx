'use client';
/**
 * 게임 HUD 오버레이 — gameRuntime 의 hud 맵을 화면에 그린다. (월드 + 스튜디오 시뮬 공용)
 * 루트는 position:absolute; inset:0 — 호출부가 위치 잡힌 부모 안에 넣어줘야 한다.
 *  - 월드: 전체화면 fixed 래퍼 안
 *  - 스튜디오: position:relative 인 뷰포트 컨테이너 안
 */
import { useEffect, useReducer, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type { GameRuntimeStore, HudElement } from '@/lib/world/gameRuntime';

export default function GameHud({ runtime }: { runtime: GameRuntimeStore }) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  // RAF 폴링 + flushSync — 카메라 회전 등 연속 입력 중 React 가 re-render 를 미뤄
  // HUD(체력·스태미나 바)가 멈추는 문제 해결. 버전 바뀐 프레임만 동기 렌더.
  useEffect(() => {
    let raf = 0; let mounted = true; let last = -1;
    const loop = () => {
      if (!mounted) return;
      runtime.pruneExpired();   // duration 만료된 HUD(카운트다운·승리 메시지) 제거 → 버전 bump
      const v = runtime.getHudVersion();
      if (v !== last) { last = v; flushSync(() => force()); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { mounted = false; cancelAnimationFrame(raf); };
  }, [runtime]);
  const hud = runtime.getHud();
  if (hud.size === 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 5 }}>
      {[...hud.values()].map(el => <HudItem key={el.id} el={el} onClick={() => runtime.clickHud(el.id)} />)}
    </div>
  );
}

function HudItem({ el, onClick }: { el: HudElement; onClick: () => void }) {
  const left = `${Math.max(0, Math.min(1, el.x)) * 100}%`;
  const top = `${Math.max(0, Math.min(1, el.y)) * 100}%`;

  // 패널 — 반투명 박스 (인벤토리/제작창 배경). pointerEvents 막아 뒤 클릭 차단.
  if (el.type === 'panel') {
    return (
      <div style={{
        position: 'absolute', left, top, transform: 'translate(-50%, -50%)',
        width: el.w && el.w > 0 ? el.w : 200, height: el.h && el.h > 0 ? el.h : 120,
        background: el.bg || 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 12, pointerEvents: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: el.color || '#fff', fontSize: el.size && el.size > 0 ? el.size : 13, fontWeight: 700,
        textAlign: 'center', whiteSpace: 'pre-wrap', padding: 8,
      }}>{el.text || ''}</div>
    );
  }

  // 버튼 — 클릭 시 스크립트 onUiClick(id) 호출 (제작 버튼 등).
  if (el.type === 'button') {
    return (
      <button onClick={(e) => { e.stopPropagation(); onClick(); }} style={{
        position: 'absolute', left, top, transform: 'translate(-50%, -50%)',
        width: el.w && el.w > 0 ? el.w : undefined, height: el.h && el.h > 0 ? el.h : undefined,
        minWidth: 64, padding: '8px 14px',
        background: el.bg || '#6366f1', color: el.color || '#fff',
        border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
        fontSize: el.size && el.size > 0 ? el.size : 13, fontWeight: 700, cursor: 'pointer',
        pointerEvents: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        {el.url ? <img src={el.url} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} /> : null}
        {el.text || ''}
      </button>
    );
  }

  if (el.type === 'image') {
    if (!el.url) return null;
    const imgStyle: CSSProperties = {
      position: 'absolute', left, top, transform: 'translate(-50%, -50%)',
      width: el.w && el.w > 0 ? el.w : undefined,
      height: el.h && el.h > 0 ? el.h : undefined,
      maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
      pointerEvents: 'none', userSelect: 'none',
    };
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={el.url} alt="" style={imgStyle} />;
  }

  if (el.type === 'bar') {
    const max = el.max && el.max > 0 ? el.max : 100;
    const pct = Math.max(0, Math.min(1, (el.value ?? 0) / max));
    const h = el.size && el.size > 0 ? el.size : 16;
    return (
      <div style={{ position: 'absolute', left, top, transform: 'translate(-50%, -50%)' }}>
        <div style={{
          width: 220, height: h, borderRadius: h,
          background: el.bg || 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.25)', overflow: 'hidden',
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', background: el.color || '#4ade80', transition: 'width .15s ease-out' }} />
        </div>
      </div>
    );
  }

  // text
  const align = el.align ?? 'center';
  const tx = align === 'left' ? '0%' : align === 'right' ? '-100%' : '-50%';
  return (
    <div style={{
      position: 'absolute', left, top, transform: `translate(${tx}, -50%)`,
      fontSize: el.size && el.size > 0 ? el.size : 22, fontWeight: 800,
      color: el.color || '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.85)',
      whiteSpace: 'pre', textAlign: align,
      background: el.bg || 'transparent',
      padding: el.bg ? '4px 12px' : 0, borderRadius: el.bg ? 8 : 0,
    }}>
      {el.text}
    </div>
  );
}
