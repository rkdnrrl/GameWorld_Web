'use client';
/**
 * Script Asset 생성/편집 모달.
 *
 * UI 는 ScriptComponentsModal 의 편집 폼과 동일 — 통일된 UX.
 * 차이: 백엔드 엔드포인트만 다름 (script asset → /api/assets/script POST/PATCH).
 *
 * 입력: 이름, 아이콘, 설명, propsSchema (PropsSchemaEditor 공용), 코드 (스니펫 드롭다운).
 * 진입점: /assets 페이지의 "📜 스크립트 만들기" + 스튜디오 에셋 picker 우클릭 + 카드 클릭(편집).
 * 닫기: X 버튼만 (배경 클릭 무시).
 */
import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api, type ScriptAssetInput } from '@/lib/api';
import { session } from '@/lib/api';
import type { Asset } from '@/lib/assets/types';
import PropsSchemaEditor, { normalizePropsSchema } from '@/components/studio/PropsSchemaEditor';
import { SCRIPT_SNIPPETS, SNIPPET_CATEGORIES } from '@/lib/world/scriptSnippets';

const DEFAULT_CODE = `// 부착된 오브젝트에 자동 호출되는 라이프사이클 함수들.
// self = 이 오브젝트, props = 부착 시 입력한 키-값.

function onStart() {
  // 씬 시작 시 1회
}

function onUpdate(dt) {
  // 매 프레임. props.speed 같이 자유롭게 사용.
  // let s = props.speed || 1;
  // let p = self.getPosition();
  // self.setPosition(p.x, p.y, p.z + s * dt);
}

function onGrab(grabberId) {
  // 1인칭 E 키로 잡혔을 때
}

function onRelease(grabberId) {
  // 놓였을 때
}
`;

interface Props {
  open: boolean;
  editing?: Asset | null;
  folder?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

interface ScriptMeta { code?: string; icon?: string; description?: string; propsSchema?: unknown[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PropDef = any;

export default function ScriptAssetEditor({ open, editing, folder, onClose, onSaved }: Props) {
  const t = useTranslations('Studio.scriptComponents');

  // 폼 state — ScriptComponentsModal 과 동일 구조
  const [name, setName]               = useState('');
  const [icon, setIcon]               = useState('📜');
  const [description, setDescription] = useState('');
  const [code, setCode]               = useState(DEFAULT_CODE);
  const [propsSchema, setPropsSchema] = useState<PropDef[]>([]);
  const [saving, setSaving]           = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // editing 변경 시 폼 채움
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const meta = (editing.metadata ?? {}) as ScriptMeta;
      setName(editing.name);
      setIcon(meta.icon || '📜');
      setDescription(meta.description || '');
      setCode(meta.code || '');
      setPropsSchema(Array.isArray(meta.propsSchema) ? (meta.propsSchema as PropDef[]) : []);
    } else {
      setName('');
      setIcon('📜');
      setDescription('');
      setCode(DEFAULT_CODE);
      setPropsSchema([]);
    }
    setErr(null);
    setSnippetsOpen(false);
  }, [editing, open]);

  // ESC 닫기 — 코드 편집 중이라도 textarea 안에서 ESC 누르면 모달 닫힘 (textarea blur 후 ESC 1회 더 권장)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement)?.tagName;
      // 코드 편집 중 (TEXTAREA) 에선 ESC 1번에 모달 안 닫음 — 사용자 의도가 코드 편집 종료일 수도
      if (tag === 'TEXTAREA') (e.target as HTMLTextAreaElement).blur();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 예제 스니펫 삽입 — 비었거나 기본 템플릿이면 교체, 아니면 끝에 덧붙임.
  function insertSnippet(snippetCode: string) {
    setCode(prev => {
      const trimmed = prev.trim();
      if (trimmed === '' || prev === DEFAULT_CODE) return snippetCode;
      return prev.replace(/\s*$/, '') + '\n\n' + snippetCode;
    });
  }

  if (!open) return null;

  const save = async () => {
    const tok = session.getToken();
    if (!tok) { setErr(t('msg_login_required')); return; }
    if (!name.trim()) { setErr(t('msg_enter_name')); return; }
    setSaving(true); setErr(null);
    try {
      const payload: Partial<ScriptAssetInput> = {
        name: name.trim(),
        code,
        icon: icon.trim() || '📜',
        description: description.trim(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        propsSchema: normalizePropsSchema(propsSchema) as any,
      };
      if (editing) {
        await api.updateScriptAsset(tok, editing.id, payload);
      } else {
        await api.createScriptAsset(tok, { ...(payload as ScriptAssetInput), folder: folder || undefined });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(t('msg_save_failed', { message: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  // 배경: 클릭해도 닫지 않음 (X 버튼만 닫기 — 사용자 요청)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(6px)', zIndex: 16777280, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 'min(720px, 96vw)', maxHeight: '92vh', overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(180deg, rgba(30,41,59,0.97), rgba(15,23,42,0.97))', color: '#fff', display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            📜 {editing ? t('title_edit_script') : t('title_new_script')}
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>

        {/* 본문 — ScriptComponentsModal 편집 폼과 동일 구조 */}
        <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
              {t('label_name')}
              <input value={name} onChange={e => setName(e.target.value)} maxLength={60}
                placeholder={t('ph_name')}
                style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 9px', fontSize: 12, outline: 'none' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
              {t('label_icon')}
              <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={4}
                placeholder="📜"
                style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 9px', fontSize: 14, outline: 'none', textAlign: 'center' }} />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
            {t('label_description')}
            <input value={description} onChange={e => setDescription(e.target.value)} maxLength={300}
              placeholder={t('ph_description')}
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 9px', fontSize: 12, outline: 'none' }} />
          </label>
          {/* Props 스키마 편집기 — 컴포넌트 편집기와 공용 */}
          <PropsSchemaEditor schema={propsSchema} onChange={setPropsSchema} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {t('label_code')}
              <button type="button" onClick={() => setSnippetsOpen(o => !o)}
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.45)', color: '#c7d2fe', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {t('btn_examples', { arrow: snippetsOpen ? '▲' : '▼' })}
              </button>
            </span>
            {snippetsOpen && (
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8 }}>
                <div style={{ fontSize: 10.5, opacity: 0.6 }}>{t('msg_snippet_hint')}</div>
                {SNIPPET_CATEGORIES.map(cat => (
                  <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: '#a5b4fc', opacity: 0.9 }}>{cat}</div>
                    {SCRIPT_SNIPPETS.filter(s => s.category === cat).map(s => (
                      <button key={s.id} type="button" title={s.desc}
                        onClick={() => { insertSnippet(s.code); setSnippetsOpen(false); }}
                        style={{ textAlign: 'left', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 6, padding: '6px 9px', cursor: 'pointer', fontSize: 11, lineHeight: 1.35 }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}>
                        <span style={{ fontWeight: 700 }}>{s.title}</span>
                        <span style={{ opacity: 0.6, marginLeft: 6 }}>{s.desc}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <textarea value={code} onChange={e => setCode(e.target.value)}
              spellCheck={false}
              style={{ background: '#0d1117', color: '#e6edf3', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '10px 12px', fontSize: 11.5, fontFamily: 'ui-monospace, monospace', lineHeight: 1.5, minHeight: 320, resize: 'vertical', outline: 'none', tabSize: 2 }}
              onKeyDown={e => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const ta = e.currentTarget;
                  const s = ta.selectionStart, end = ta.selectionEnd;
                  const v = ta.value;
                  ta.value = v.slice(0, s) + '  ' + v.slice(end);
                  ta.selectionStart = ta.selectionEnd = s + 2;
                  setCode(ta.value);
                }
              }}
            />
          </div>
          {err && (
            <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontSize: 11, padding: '8px 12px', borderRadius: 6 }}>{err}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} disabled={saving}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: saving ? 'default' : 'pointer', fontSize: 12, fontWeight: 700 }}>{t('btn_cancel')}</button>
            <button type="button" onClick={save} disabled={saving}
              style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 18px', cursor: saving ? 'default' : 'pointer', fontSize: 12, fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
              {saving ? t('btn_saving') : (editing ? t('btn_save_edit') : t('btn_create'))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
