'use client';
/**
 * 하단 플로팅 일괄 작업 바
 * 1개 이상 선택돼 있을 때만 표시
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { normalizeFolder } from '@/lib/assets/folders';

interface Props {
  selectedCount: number;
  totalVisible: number;
  busy?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onBulkDelete: () => void;
  onBulkMove: (folder: string | null) => void;
  onBulkAddTags: (tags: string[]) => void;
  onBulkSetPublic: (isPublic: boolean) => void;
}

type SubAction = null | 'move' | 'tag';

export default function AssetBulkBar(p: Props) {
  const t = useTranslations('Assets');
  const [sub, setSub]   = useState<SubAction>(null);
  const [folder, setFolder] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  if (p.selectedCount === 0) return null;

  function commitMove() {
    const norm = normalizeFolder(folder);
    p.onBulkMove(norm);
    setSub(null); setFolder('');
  }
  function commitTags() {
    const tags = tagsInput.split(',').map(s => s.trim()).filter(Boolean);
    if (tags.length === 0) return;
    p.onBulkAddTags(tags);
    setSub(null); setTagsInput('');
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 80,
      background: 'rgba(30,41,59,0.97)', backdropFilter: 'blur(10px)',
      borderRadius: 12, padding: '10px 14px',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', gap: 8,
      maxWidth: 'calc(100vw - 32px)',
      flexWrap: 'wrap',
      color: '#fff', fontSize: 13,
    }}>
      {/* 카운트 */}
      <div style={{ fontWeight: 700, padding: '0 6px' }}>
        {t('bulkSelected', { count: p.selectedCount })}
      </div>

      <button onClick={p.onSelectAll}
        style={btn('transparent', '#a5b4fc')}
        disabled={p.busy}>
        {t('bulkSelectAllVisible', { count: p.totalVisible })}
      </button>
      <button onClick={p.onClear}
        style={btn('transparent', 'rgba(255,255,255,0.55)')}
        disabled={p.busy}>
        {t('bulkClear')}
      </button>

      <Divider />

      {/* 폴더 이동 */}
      {sub === 'move' ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input
            value={folder}
            onChange={e => setFolder(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitMove(); if (e.key === 'Escape') setSub(null); }}
            placeholder="/캐릭터/주인공"
            autoFocus
            style={{
              padding: '4px 8px', fontSize: 12,
              background: 'rgba(0,0,0,0.4)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
              outline: 'none', fontFamily: 'monospace', width: 200,
            }}
          />
          <button onClick={commitMove} disabled={p.busy} style={btn('#6366f1', '#fff')}>OK</button>
          <button onClick={() => p.onBulkMove(null)} disabled={p.busy} style={btn('rgba(239,68,68,0.2)', '#fca5a5')}>
            {t('bulkMoveToRoot')}
          </button>
          <button onClick={() => setSub(null)} disabled={p.busy} style={btn('transparent', 'rgba(255,255,255,0.55)')}>✕</button>
        </span>
      ) : (
        <button onClick={() => setSub('move')} disabled={p.busy} style={btn('rgba(255,255,255,0.06)', '#fff')}>
          📁 {t('bulkMove')}
        </button>
      )}

      {/* 태그 추가 */}
      {sub === 'tag' ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitTags(); if (e.key === 'Escape') setSub(null); }}
            placeholder={t('bulkTagsPlaceholder')}
            autoFocus
            style={{
              padding: '4px 8px', fontSize: 12,
              background: 'rgba(0,0,0,0.4)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5,
              outline: 'none', width: 200,
            }}
          />
          <button onClick={commitTags} disabled={p.busy} style={btn('#6366f1', '#fff')}>OK</button>
          <button onClick={() => setSub(null)} disabled={p.busy} style={btn('transparent', 'rgba(255,255,255,0.55)')}>✕</button>
        </span>
      ) : (
        <button onClick={() => setSub('tag')} disabled={p.busy} style={btn('rgba(255,255,255,0.06)', '#fff')}>
          # {t('bulkAddTags')}
        </button>
      )}

      {/* 공개/비공개 */}
      <button onClick={() => p.onBulkSetPublic(true)} disabled={p.busy} style={btn('rgba(16,185,129,0.2)', '#6ee7b7')}>
        {t('bulkMakePublic')}
      </button>
      <button onClick={() => p.onBulkSetPublic(false)} disabled={p.busy} style={btn('rgba(255,255,255,0.06)', 'rgba(255,255,255,0.7)')}>
        {t('bulkMakePrivate')}
      </button>

      <Divider />

      {/* 삭제 — 한 번 더 확인 */}
      <DeleteButton onConfirm={p.onBulkDelete} busy={p.busy} label={t('bulkDelete')} confirmLabel={t('bulkDeleteConfirm')} />
    </div>
  );
}

function Divider() {
  return <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />;
}

function btn(bg: string, color: string): React.CSSProperties {
  return {
    padding: '6px 12px', fontSize: 12,
    background: bg, color, border: 'none', borderRadius: 6,
    cursor: 'pointer',
  };
}

function DeleteButton({ onConfirm, busy, label, confirmLabel }: { onConfirm: () => void; busy?: boolean; label: string; confirmLabel: string }) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <button onClick={() => { onConfirm(); setArmed(false); }} disabled={busy} style={btn('#dc2626', '#fff')}>
          {confirmLabel}
        </button>
        <button onClick={() => setArmed(false)} disabled={busy} style={btn('transparent', 'rgba(255,255,255,0.55)')}>✕</button>
      </span>
    );
  }
  return (
    <button onClick={() => setArmed(true)} disabled={busy} style={btn('rgba(239,68,68,0.15)', '#fca5a5')}>
      🗑 {label}
    </button>
  );
}
