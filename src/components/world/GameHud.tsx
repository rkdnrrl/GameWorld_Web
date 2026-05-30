'use client';
/**
 * 게임 HUD 오버레이 — gameRuntime 의 hud 맵을 화면에 그린다. (월드 + 스튜디오 시뮬 공용)
 * 루트는 position:absolute; inset:0 — 호출부가 위치 잡힌 부모 안에 넣어줘야 한다.
 *  - 월드: 전체화면 fixed 래퍼 안
 *  - 스튜디오: position:relative 인 뷰포트 컨테이너 안
 */
import { useEffect, useReducer, type CSSProperties } from 'react';
import type { GameRuntimeStore, HudElement } from '@/lib/world/gameRuntime';

export default function GameHud({ runtime }: { runtime: GameRuntimeStore }) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => runtime.subscribe(force), [runtime]);
  const hud = runtime.getHud();
  if (hud.size === 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 5 }}>
      {[...hud.values()].map(el => <HudItem key={el.id} el={el} />)}
    </div>
  );
}

function HudItem({ el }: { el: HudElement }) {
  const left = `${Math.max(0, Math.min(1, el.x)) * 100}%`;
  const top = `${Math.max(0, Math.min(1, el.y)) * 100}%`;

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
