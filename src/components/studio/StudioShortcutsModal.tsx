'use client';

import { useTranslations } from 'next-intl';

interface StudioShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function StudioShortcutsModal({ open, onClose }: StudioShortcutsModalProps) {
  const t = useTranslations('Studio');
  if (!open) return null;

  const sections: { title: string; hint: string }[] = [
    { title: t('scCamera'),  hint: t('scCamHint') },
    { title: t('scGizmo'),   hint: t('scGizmoHint') },
    { title: t('scEdit'),    hint: t('scEditHint') },
    { title: t('scSim'),     hint: t('scSimHint') },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(6px)',
        zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(520px, 96vw)',
          borderRadius: 14, border: '1px solid rgba(255,255,255,0.16)',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.97), rgba(10,15,30,0.97))',
          color: '#fff', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{t('shortcutsTitle')}</div>
          <button onClick={onClose} style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
            {t('shortcutsClose')}
          </button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map(({ title, hint }) => (
            <div key={title}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#a5b4fc', marginBottom: 4, letterSpacing: 0.3 }}>
                {title}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {hint}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
