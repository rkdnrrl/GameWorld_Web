'use client';
/**
 * 인터랙트 prompt 글로벌 상태 — 가까운 트리거 (door / dialogue / vending) 가 있을 때
 * controller 들이 이걸 set 하고, InteractButton 이 구독해서 시각 강조.
 *
 * 모듈 레벨 state — 컴포넌트 간 공유. React state 아닌 단순 글로벌 변수 + listener Set.
 * (Zustand 같은 라이브러리 도입은 과함)
 */
import { useEffect, useState } from 'react';

export type PromptKind = 'door' | 'dialogue' | 'vending' | 'seat' | null;

let promptKind: PromptKind = null;
const listeners = new Set<(k: PromptKind) => void>();

/** controller 가 자기 owner key 로 prompt 상태 갱신. 같은 값이면 emit 생략. */
export function setInteractPrompt(kind: PromptKind) {
  if (promptKind === kind) return;
  promptKind = kind;
  for (const l of listeners) l(kind);
}

export function getInteractPrompt() { return promptKind; }

/** React 컴포넌트에서 prompt 상태 구독. */
export function useInteractPrompt(): PromptKind {
  const [k, setK] = useState<PromptKind>(promptKind);
  useEffect(() => {
    const cb = (next: PromptKind) => setK(next);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);
  return k;
}
