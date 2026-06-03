'use client';
/**
 * 프로필 꾸미기 모달 — /account 페이지에서 인라인 편집용.
 * 폼 자체는 ProfileCustomizeForm 으로 분리 (페이지·모달 공통).
 */
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import ProfileCustomizeForm from './ProfileCustomizeForm';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProfileCustomizeModal({ open, onClose }: Props) {
  const t = useTranslations('AccountCustomize');
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 px-4 py-8 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#0f172a] text-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">{t('title')}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-full w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 text-lg"
          >×</button>
        </div>
        <div className="px-6 py-6">
          <ProfileCustomizeForm onSaved={onClose} onClose={onClose} closeLabel={t('back')} />
        </div>
      </div>
    </div>
  );
}
