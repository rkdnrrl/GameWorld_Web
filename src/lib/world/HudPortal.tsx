'use client';
/**
 * R3F <Canvas> 안에서 DOM(HTML) HUD/모달을 렌더하는 헬퍼.
 *
 * ⚠️ R3F 컴포넌트(useFrame 쓰는 컨트롤러 등) 안에서 react-dom 의 `createPortal(<div>, body)` 을 쓰면,
 *    포털 children 이 **R3F 리컨실러**로 reconcile 되어 <div> 를 THREE 객체로 만들려다
 *    "R3F: Div is not part of the THREE namespace" 크래시가 난다 (React19/R3F 신버전에서 strict).
 * → 별도의 react-dom root 를 document.body 에 만들어 그쪽(=react-dom 리컨실러)에 렌더한다.
 *
 * 사용: 기존 `createPortal(content, document.body)` 를 `<HudPortal>{content}</HudPortal>` 로 교체.
 * R3F 트리에는 아무것도 안 남긴다(return null).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export default function HudPortal({ children }: { children: ReactNode }) {
  const [container] = useState<HTMLDivElement | null>(() =>
    typeof document !== 'undefined' ? document.createElement('div') : null,
  );
  const rootRef = useRef<Root | null>(null);

  useEffect(() => {
    if (!container) return;
    document.body.appendChild(container);
    rootRef.current = createRoot(container);
    return () => {
      const root = rootRef.current;
      rootRef.current = null;
      // 동기 unmount-during-render 경고 회피 — 다음 tick 에 정리
      setTimeout(() => {
        try { root?.unmount(); } catch { /* noop */ }
        try { container.remove(); } catch { /* noop */ }
      }, 0);
    };
  }, [container]);

  useEffect(() => {
    rootRef.current?.render(children);
  });

  return null;
}
