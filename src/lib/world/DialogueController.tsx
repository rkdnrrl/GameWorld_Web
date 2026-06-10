'use client';
/**
 * 대화 (dialogue) — 가까이서 E 키로 대화 시작/다음 줄/닫기.
 *  - capture phase 에서 keydown 수신. Door 컨트롤러가 먼저 mount → 먼저 등록 →
 *    문이 가까이 있으면 Door 가 stopImmediatePropagation 으로 가로채 dialogue 차단.
 *    문이 없으면 통과 → dialogue 가 처리 → stopImmediatePropagation 으로 grab 차단.
 *  - 대화 중에는 매 E = 다음 줄. 마지막 줄에서 E = 닫힘 (autoClose) 또는 다시 처음.
 *  - 거리 밖으로 벗어나면 자동 닫힘.
 *  - HUD: 화면 하단 createPortal 말풍선 (speakerName + 현재 줄 + "E: 다음 ▸").
 *  - 멀티: 본인 화면만 (V2 sync).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFrame } from '@react-three/fiber';
import type { DialogueSpot } from './components';
import { setInteractPrompt } from './interactPrompt';

interface DialogueState {
  spotId: string;
  lineIndex: number;
  speakerName: string;
  text: string;
  bubbleColor: string;
  textColor: string;
  total: number;
}

export default function DialogueController({
  dialogues,
  localPoseRef,
}: {
  dialogues: DialogueSpot[];
  localPoseRef: React.MutableRefObject<{ x: number; y: number; z: number; rotY: number }> | null | undefined;
}) {
  const activeRef = useRef<{ spotId: string; lineIndex: number } | null>(null);
  const nearRef = useRef<DialogueSpot | null>(null);
  const [hudText, setHudText] = useState('');
  const [dialogState, setDialogState] = useState<DialogueState | null>(null);
  const lastHud = useRef('');

  // 대화창이 떠 있는 동안 상태 sync 용
  const applyActive = () => {
    const a = activeRef.current;
    if (!a) { setDialogState(null); return; }
    const s = dialogues.find(d => d.id === a.spotId);
    if (!s) { activeRef.current = null; setDialogState(null); return; }
    const idx = Math.min(a.lineIndex, s.lines.length - 1);
    setDialogState({
      spotId: s.id,
      lineIndex: idx,
      speakerName: s.speakerName,
      text: s.lines[idx],
      bubbleColor: s.bubbleColor,
      textColor: s.textColor,
      total: s.lines.length,
    });
  };

  // E 키 capture — 대화 중이면 다음 줄, 아니면 가까운 대화 시작. 둘 다 없으면 통과 (grab).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.repeat) return;

      // 1) 대화 중인 경우 — 다음 줄 또는 닫기
      const cur = activeRef.current;
      if (cur) {
        e.stopImmediatePropagation();
        e.preventDefault();
        const s = dialogues.find(d => d.id === cur.spotId);
        if (!s) { activeRef.current = null; applyActive(); return; }
        const nextIdx = cur.lineIndex + 1;
        if (nextIdx >= s.lines.length) {
          if (s.autoClose) { activeRef.current = null; applyActive(); }
          else { activeRef.current = { spotId: s.id, lineIndex: 0 }; applyActive(); }
        } else {
          activeRef.current = { spotId: s.id, lineIndex: nextIdx };
          applyActive();
        }
        lastHud.current = '';
        return;
      }

      // 2) 대화 없음 + 가까운 dialogue 있음 → 시작
      const near = nearRef.current;
      if (!near) return; // 통과 → grab 등 정상 동작
      e.stopImmediatePropagation();
      e.preventDefault();
      activeRef.current = { spotId: near.id, lineIndex: 0 };
      applyActive();
      lastHud.current = '';
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      setInteractPrompt(null);
    };
    // applyActive 가 dialogues 클로저를 잡아야 함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogues]);

  // dialogues 가 바뀌어 active spot 이 사라지면 닫기
  useEffect(() => {
    const a = activeRef.current;
    if (!a) return;
    if (!dialogues.find(d => d.id === a.spotId)) {
      activeRef.current = null;
      setDialogState(null);
    }
  }, [dialogues]);

  useFrame(() => {
    const pose = localPoseRef?.current;
    // 가까운 dialogue 찾기
    let nearest: DialogueSpot | null = null;
    let bestD = Infinity;
    if (pose) {
      for (const d of dialogues) {
        const dx = d.cx - pose.x, dy = d.cy - pose.y, dz = d.cz - pose.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= d.range && dist < bestD) { bestD = dist; nearest = d; }
      }
    }
    nearRef.current = nearest;

    // 대화 중이라면 거리 벗어남 체크 → 자동 닫기
    const a = activeRef.current;
    if (a && pose) {
      const s = dialogues.find(d => d.id === a.spotId);
      if (s) {
        const dx = s.cx - pose.x, dy = s.cy - pose.y, dz = s.cz - pose.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > s.range * 1.5) {
          activeRef.current = null;
          setDialogState(null);
          lastHud.current = '';
        }
      }
    }

    // HUD prompt (대화 안 떴을 때만, 가까운 dialogue 있으면 안내)
    let newHud = '';
    if (!activeRef.current && nearest) {
      newHud = nearest.speakerName ? `💬 E: ${nearest.speakerName} 와 대화` : '💬 E: 대화';
    }
    if (newHud !== lastHud.current) {
      lastHud.current = newHud;
      setHudText(newHud);
      // 대화 중일 땐 prompt active (E 로 다음 줄), 가까운 dialogue 있을 때도 active
      setInteractPrompt(activeRef.current || nearest ? 'dialogue' : null);
    }
  });

  return (
    <>
      {/* 머리 위 안내 HUD (대화 시작 전) */}
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
      {/* 대화 말풍선 (대화 중) */}
      {dialogState && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 2147480001, pointerEvents: 'none',
          width: 'min(720px, 92vw)',
          padding: '18px 22px 16px',
          borderRadius: 16,
          background: dialogState.bubbleColor,
          color: dialogState.textColor,
          fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.18)',
        }}>
          {dialogState.speakerName && (
            <div style={{
              fontSize: 13, fontWeight: 700, opacity: 0.85,
              marginBottom: 6, letterSpacing: 0.3,
            }}>{dialogState.speakerName}</div>
          )}
          <div style={{
            fontSize: 17, lineHeight: 1.55, fontWeight: 500,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            minHeight: 24,
          }}>{dialogState.text}</div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 10, fontSize: 12, opacity: 0.7,
          }}>
            <span>{dialogState.lineIndex + 1} / {dialogState.total}</span>
            <span>
              {dialogState.lineIndex + 1 < dialogState.total ? 'E: 다음 ▸' : 'E: 닫기'}
            </span>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
