'use client';
/**
 * 이모트 라디얼 휠 — 기존 이모트 바와 동일한 setEmoteSlot 을 호출하는 대체 UI.
 * 슬롯을 원형으로 배치해 빠르게 선택(VRChat 식). 루프/한번만 토글은 기존 바에 유지.
 *
 * 자족형 오버레이: slots/active 만 받고 선택 시 onSelect(slot), 바깥/센터 클릭 시 onClose.
 */
import React from 'react';

export function EmoteWheel({ slots, active, title, onSelect, onClose }: {
  slots: string[];
  active: string | null;
  title: string;
  onSelect: (slot: string) => void;
  onClose: () => void;
}) {
  const n = slots.length;
  const R = Math.max(110, Math.min(190, n * 18));   // 개수 따라 반경
  const box = R * 2 + 96;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 16777275,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(3px)',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: box, height: box }}>
        {/* 센터 — 제목 + 닫기 */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 92, height: 92, borderRadius: '50%', cursor: 'pointer',
            background: 'rgba(10,10,20,0.85)', border: '1px solid rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 700,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            backdropFilter: 'blur(10px)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <span style={{ fontSize: 22 }}>🎭</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>{title}</span>
        </button>

        {slots.map((slot, i) => {
          const ang = (i / n) * Math.PI * 2 - Math.PI / 2;   // 12시 방향부터 시계
          const x = Math.cos(ang) * R;
          const y = Math.sin(ang) * R;
          const isActive = active === slot;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onSelect(slot)}
              title={slot}
              style={{
                position: 'absolute', left: '50%', top: '50%',
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                maxWidth: 96, padding: '8px 12px', borderRadius: 12, cursor: 'pointer',
                background: isActive ? 'rgba(99,102,241,0.72)' : 'rgba(10,10,20,0.8)',
                border: isActive ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 12, fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                backdropFilter: 'blur(8px)', boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
                transition: 'background 0.12s, transform 0.12s',
              }}
            >
              {isActive ? '■ ' : ''}{slot}
            </button>
          );
        })}
      </div>
    </div>
  );
}
