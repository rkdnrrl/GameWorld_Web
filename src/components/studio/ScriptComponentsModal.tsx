'use client';

/**
 * 내 스크립트 컴포넌트 관리 모달.
 * 새 컴포넌트 만들기 / 편집 / 삭제. 부착은 인스펙터의 컴포넌트 picker 에서.
 */
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api, session, type ScriptComponent, type ScriptComponentPropDef } from '@/lib/api';
import PropsSchemaEditor, { normalizePropsSchema } from './PropsSchemaEditor';
import { SCRIPT_SNIPPETS, SNIPPET_CATEGORIES } from '@/lib/world/scriptSnippets';
import { ScriptApiGuideModal } from './ScriptApiGuideModal';

interface Props {
  open: boolean;
  onClose: () => void;
  components: ScriptComponent[];
  onChanged: (next: ScriptComponent[]) => void; // 목록 갱신 시 부모에 통보
  /** 지정 시 열릴 때 해당 컴포넌트 편집 화면으로 바로 진입 */
  editId?: string | null;
}

const DEFAULT_CODE = `// 부착된 오브젝트에 자동 호출되는 라이프사이클 함수들.
// self = 이 오브젝트, props = 부착 시 입력한 키-값.
// 예: 다른 컴포넌트랑 같은 자리에 부착돼도 props 만 다르면 동작 다르게 가능.

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

export default function ScriptComponentsModal({ open, onClose, components, onChanged, editId }: Props) {
  const t = useTranslations('Studio.scriptComponents');
  // 'list' = 목록, 'edit' = 새/편집 폼
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [editing, setEditing] = useState<ScriptComponent | null>(null); // null = 새로 만들기

  // 폼 state
  const [name, setName]               = useState('');
  const [icon, setIcon]               = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode]               = useState(DEFAULT_CODE);
  const [propsSchema, setPropsSchema] = useState<ScriptComponentPropDef[]>([]);
  const [saving, setSaving]           = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // 예제 스니펫 삽입 — 코드가 비었거나 기본 템플릿이면 교체, 아니면 끝에 덧붙임(유저가 합침).
  function insertSnippet(snippetCode: string) {
    setCode(prev => {
      const trimmed = prev.trim();
      if (trimmed === '' || prev === DEFAULT_CODE) return snippetCode;
      return prev.replace(/\s*$/, '') + '\n\n' + snippetCode;
    });
  }

  // 열릴 때 — editId 가 있으면(인스펙터 카드 'edit') 그 컴포넌트 편집으로 바로 진입, 없으면 목록부터.
  // (모달이 마운트 유지되어 view 상태가 남기 때문에 열 때마다 정리)
  useEffect(() => {
    if (!open) return;
    if (editId) {
      const c = components.find(x => x.id === editId);
      if (c) {
        setEditing(c);
        setName(c.name); setIcon(c.icon || ''); setDescription(c.description || ''); setCode(c.code);
        setPropsSchema(c.propsSchema ?? []);
        setView('edit');
        return;
      }
    }
    setView('list');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  if (!open) return null;

  const startNew = () => {
    setEditing(null);
    setName(''); setIcon(''); setDescription(''); setCode(DEFAULT_CODE); setPropsSchema([]);
    setView('edit');
  };
  const startEdit = (c: ScriptComponent) => {
    setEditing(c);
    setName(c.name); setIcon(c.icon || ''); setDescription(c.description || ''); setCode(c.code);
    setPropsSchema(c.propsSchema ?? []);
    setView('edit');
  };

  const save = async () => {
    const tok = session.getToken();
    if (!tok) { alert(t('msg_login_required')); return; }
    if (!name.trim()) { alert(t('msg_enter_name')); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(), icon: icon.trim() || null,
        description: description.trim() || null, code,
        propsSchema: normalizePropsSchema(propsSchema),
      };
      if (editing) {
        const res = await api.updateScriptComponent(tok, editing.id, body);
        onChanged(components.map(c => c.id === editing.id ? res.component : c));
      } else {
        const res = await api.createScriptComponent(tok, body);
        onChanged([res.component, ...components]);
      }
      setView('list');
    } catch (e) {
      alert(t('msg_save_failed', { message: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t('confirm_delete_component'))) return;
    const tok = session.getToken();
    if (!tok) return;
    try {
      await api.deleteScriptComponent(tok, id);
      onChanged(components.filter(c => c.id !== id));
    } catch (e) {
      alert(t('msg_delete_failed', { message: (e as Error).message }));
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(6px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        style={{ width: 'min(720px, 96vw)', maxHeight: '92vh', overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(180deg, rgba(30,41,59,0.97), rgba(15,23,42,0.97))', color: '#fff', display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {view === 'edit' && (
              <button type="button" onClick={() => setView('list')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>{t('btn_back_to_list')}</button>
            )}
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {view === 'list' ? t('title_my_components') : (editing ? t('title_edit_component') : t('title_new_component'))}
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>

        {/* 본문 */}
        {view === 'list' ? (
          <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" onClick={startNew}
              style={{ alignSelf: 'flex-start', background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              {t('btn_new_component')}
            </button>
            {components.length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.45, textAlign: 'center', padding: '20px 0', lineHeight: 1.5 }}>
                {t('msg_no_components')}<br/>
                {t('msg_create_hint')}<br/>
                {t('msg_example_names')}
              </div>
            )}
            {components.map(c => (
              <div key={c.id}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{c.icon || '🧩'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
                  {c.description && (
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2, lineHeight: 1.4 }}>{c.description}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" onClick={() => startEdit(c)}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{t('btn_edit')}</button>
                  <button type="button" onClick={() => remove(c.id)}
                    style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{t('btn_delete')}</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
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
                  placeholder="🚪"
                  style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 9px', fontSize: 14, outline: 'none', textAlign: 'center' }} />
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
              {t('label_description')}
              <input value={description} onChange={e => setDescription(e.target.value)} maxLength={300}
                placeholder={t('ph_description')}
                style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 9px', fontSize: 12, outline: 'none' }} />
            </label>
            {/* Props 스키마 편집기 */}
            <PropsSchemaEditor schema={propsSchema} onChange={setPropsSchema} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                {t('label_code')}
                <span style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => setGuideOpen(true)}
                    style={{ background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.45)', color: '#fcd34d', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    📖 {t('btn_guide')}
                  </button>
                  <button type="button" onClick={() => setSnippetsOpen(o => !o)}
                    style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.45)', color: '#c7d2fe', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {t('btn_examples', { arrow: snippetsOpen ? '▲' : '▼' })}
                  </button>
                </span>
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setView('list')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{t('btn_cancel')}</button>
              <button type="button" onClick={save} disabled={saving}
                style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 18px', cursor: saving ? 'default' : 'pointer', fontSize: 12, fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
                {saving ? t('btn_saving') : (editing ? t('btn_save_edit') : t('btn_create'))}
              </button>
            </div>
          </div>
        )}
      </div>
      {/* 스크립트 API 가이드 — 라이프사이클·core·HTTP api·예제·보안·서비스 cheat-sheet */}
      <ScriptApiGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
