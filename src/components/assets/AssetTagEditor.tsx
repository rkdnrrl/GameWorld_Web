'use client';
/**
 * 태그 편집 모달 — 단일 에셋의 태그 추가/삭제
 * 기존 태그를 suggestion 으로 노출 (자동완성)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Asset } from '@/lib/assets/types';
import { topTags } from '@/lib/assets/filters';

interface Props {
  asset: Asset;
  allAssets: Asset[];
  onClose: () => void;
  onSave: (tags: string[]) => Promise<void> | void;
}

const MAX_TAG_LEN = 50;
const MAX_TAGS    = 30;

function normalize(tag: string): string {
  return tag.trim().slice(0, MAX_TAG_LEN);
}

export default function AssetTagEditor({ asset, allAssets, onClose, onSave }: Props) {
  const t = useTranslations('Assets');
  const tCommon = useTranslations('Common');
  const [tags, setTags] = useState<string[]>(asset.tags || []);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 다른 에셋들이 쓰던 태그 (현재 에셋 태그 제외)
  const suggestions = useMemo(() => {
    const used = new Set(tags);
    const all = topTags(allAssets);
    const filtered = all.filter(t => !used.has(t.tag));
    const q = input.trim().toLowerCase();
    if (q) return filtered.filter(t => t.tag.toLowerCase().includes(q)).slice(0, 8);
    return filtered.slice(0, 12);
  }, [tags, allAssets, input]);

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function addTag(raw: string) {
    const t = normalize(raw);
    if (!t) return;
    if (tags.includes(t)) { setInput(''); return; }
    if (tags.length >= MAX_TAGS) { setError(t.length + ''); return; }
    setTags([...tags, t]);
    setInput('');
    setError('');
    inputRef.current?.focus();
  }

  function removeTag(tag: string) {
    setTags(tags.filter(x => x !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(tags);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: '#1e293b', borderRadius: 16,
          padding: 24, color: '#fff',
          fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>{t('tagEditorFor')}</div>
            <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.name}</div>
          </div>
          <button onClick={onClose} aria-label={tCommon('close')}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: 0.6 }}>
            ✕
          </button>
        </div>

        {/* 현재 태그 + 입력 */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          padding: '8px 8px 6px', minHeight: 44,
          background: 'rgba(0,0,0,0.3)', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {tags.map(tag => (
            <span key={tag} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 4px 3px 9px', fontSize: 12,
              background: 'rgba(99,102,241,0.25)', color: '#c7d2fe',
              borderRadius: 6,
            }}>
              {tag}
              <button onClick={() => removeTag(tag)}
                style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, opacity: 0.7, padding: '0 4px' }}>
                ✕
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={tags.length === 0 ? t('tagInputPlaceholder') : ''}
            autoFocus
            maxLength={MAX_TAG_LEN}
            style={{
              flex: 1, minWidth: 100,
              background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 13, padding: '4px 4px',
            }}
          />
        </div>
        <div style={{ fontSize: 10, opacity: 0.45, marginTop: 4 }}>
          {t('tagInputHint')} · {tags.length}/{MAX_TAGS}
        </div>

        {/* 자동완성/제안 */}
        {suggestions.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('tagSuggestions')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {suggestions.map(s => (
                <button key={s.tag} onClick={() => addTag(s.tag)}
                  style={{
                    padding: '4px 10px', fontSize: 12,
                    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                    cursor: 'pointer',
                  }}>
                  + {s.tag} <span style={{ opacity: 0.4 }}>({s.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 12 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} disabled={saving}
            style={{
              padding: '8px 16px', fontSize: 13,
              background: 'rgba(255,255,255,0.06)', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
            }}>
            {t('cancel')}
          </button>
          <button onClick={save} disabled={saving}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 700,
              background: '#6366f1', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
