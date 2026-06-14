'use client';

/**
 * 음성 설정 패널 — 마이크 버튼 옆 🎚 버튼 클릭 시 표시.
 *
 * 3가지 게인 조절:
 *   1) 내 마이크 (다른 사람에게 들리는 내 목소리 크기)
 *   2) 전체 음성 (마스터 — 모든 원격 음성 한꺼번에)
 *   3) 개별 유저 (음성 켠 유저들 목록에서 각각)
 *
 * 모든 값은 useVoiceChat 내부에서 localStorage 영속화됨 (재접속 후에도 유지).
 */

import { useEffect, useRef } from 'react';

interface PeerInfo { id: string; name: string }

interface Props {
  micGain: number;
  setMicGain: (v: number) => void;
  masterGain: number;
  setMasterGain: (v: number) => void;
  voiceRange: number;
  setVoiceRange: (v: number) => void;
  /** 음성 켠 (다른) 유저들 목록 — 표시·게인 조절 대상 */
  micOnPeers: PeerInfo[];
  speakingIds: Set<string>;
  getPeerGain: (peerId: string) => number;
  setPeerGain: (peerId: string, v: number) => void;
  onClose: () => void;
}

export default function VoiceSettingsPanel({
  micGain, setMicGain, masterGain, setMasterGain, voiceRange, setVoiceRange,
  micOnPeers, speakingIds, getPeerGain, setPeerGain, onClose,
}: Props) {
  // ESC 키로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 외부 클릭으로 닫기
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    // 다음 tick — 패널 여는 클릭이 즉시 닫지 않도록
    const tid = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(tid); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed', top: 130, right: 16, width: 280,
        background: 'rgba(10,15,30,0.92)', color: '#fff',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12,
        padding: 16, zIndex: 16777274,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>🎚 음성 설정</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
            fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1,
          }}
        >×</button>
      </div>

      <SliderRow
        icon="🎤" label="내 마이크"
        value={micGain} onChange={setMicGain} max={3}
        hint="100% 기본 · 그 이상은 증폭 (작게 들리면 ↑)"
      />

      <SliderRow
        icon="🔊" label="전체 음성"
        value={masterGain} onChange={setMasterGain} max={3}
        hint="모든 원격 유저 마스터 · 100% 초과 = 증폭"
      />

      <SliderRow
        icon="📏" label="음성 거리"
        value={voiceRange} onChange={setVoiceRange}
        min={0.5} max={2} format={(v) => `×${v.toFixed(1)}`}
        hint="클수록 멀리 있는 사람 목소리도 들림"
      />

      <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>
        음성 켠 유저 ({micOnPeers.length})
      </div>

      {micOnPeers.length === 0 ? (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '12px 0' }}>
          현재 음성 켠 사람 없음
        </div>
      ) : (
        <div style={{ maxHeight: 200, overflowY: 'auto', marginRight: -4, paddingRight: 4 }}>
          {micOnPeers.map(p => (
            <PeerRow
              key={p.id}
              name={p.name}
              speaking={speakingIds.has(p.id)}
              value={getPeerGain(p.id)}
              onChange={(v) => setPeerGain(p.id, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SliderRow({
  icon, label, value, onChange, hint, min = 0, max = 1, format,
}: {
  icon: string; label: string; value: number; onChange: (v: number) => void; hint?: string;
  min?: number; max?: number; format?: (v: number) => string;
}) {
  const display = format ? format(value) : `${Math.round(value * 100)}%`;
  // 증폭 구간(>100%) 경고색 — 게인 슬라이더에서 1.0 초과 시 라벨 강조
  const amplified = !format && value > 1;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{icon} {label}</span>
        <span style={{ fontSize: 11, color: amplified ? '#fbbf24' : 'rgba(255,255,255,0.6)', minWidth: 36, textAlign: 'right' }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: amplified ? '#fbbf24' : '#6366f1' }}
      />
      {hint && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{hint}</div>
      )}
    </div>
  );
}

function PeerRow({
  name, speaking, value, onChange,
}: {
  name: string; speaking: boolean; value: number; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
      <span
        title={speaking ? '말하는 중' : ''}
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: speaking ? '#22c55e' : 'rgba(255,255,255,0.2)',
          flexShrink: 0,
        }}
      />
      <span style={{
        fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </span>
      <input
        type="range"
        min={0} max={3} step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: 90, accentColor: value > 1 ? '#fbbf24' : '#6366f1' }}
      />
      <span style={{ fontSize: 10, color: value > 1 ? '#fbbf24' : 'rgba(255,255,255,0.5)', minWidth: 30, textAlign: 'right' }}>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}
