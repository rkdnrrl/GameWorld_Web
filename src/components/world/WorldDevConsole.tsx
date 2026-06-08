'use client';

/**
 * 월드/스튜디오 안 스크립트 디버그 콘솔.
 * - 모든 스크립트 VM 의 print() 출력 + 에러를 한 곳에 표시 (jsRuntime 전역 싱크).
 * - 백틱(`) 키로 토글. 기본 숨김 — 제작자가 게임 만들 때 디버깅용.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getDevLogs, clearDevLogs } from '@/lib/world/jsRuntime';

const btn = {
  padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, cursor: 'pointer',
} as const;

export default function WorldDevConsole() {
  const t = useTranslations('DevConsole');
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const lastSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 백틱(`) 토글 — 입력창에 포커스 있을 땐 무시
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote') return;
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      setOpen(o => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 열려 있을 때만 폴링 (새 로그 있으면 재렌더)
  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => {
      const logs = getDevLogs();
      const seq = logs.length ? logs[logs.length - 1].seq : 0;
      if (seq !== lastSeq.current) { lastSeq.current = seq; force(v => v + 1); }
    }, 200);
    return () => clearInterval(iv);
  }, [open]);

  // 새 로그 시 맨 아래로 스크롤
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  });

  if (!open) return null;
  const logs = getDevLogs().slice(-80);
  const errCount = logs.filter(l => l.level === 'err').length;

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, height: '34vh', zIndex: 9500,
      background: 'rgba(10,12,20,0.93)', borderTop: '1px solid rgba(255,255,255,0.15)',
      color: '#e5e7eb', fontFamily: 'monospace', fontSize: 12, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ fontWeight: 700 }}>🐛 {t('title')}</span>
        <span style={{ opacity: 0.5 }}>{t('lineCount', { n: logs.length })}{errCount ? ` · ❌ ${errCount}` : ''}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => { clearDevLogs(); lastSeq.current = 0; force(v => v + 1); }} style={btn}>{t('clear')}</button>
        <button onClick={() => setOpen(false)} style={btn}>✕ (`)</button>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {logs.length === 0 && <div style={{ opacity: 0.4 }}>{t('empty')}</div>}
        {logs.map(l => (
          <div key={l.seq} style={{ color: l.level === 'err' ? '#f87171' : '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
            <span style={{ opacity: 0.4 }}>[{l.id}]</span> {l.level === 'err' ? '❌ ' : ''}{l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
