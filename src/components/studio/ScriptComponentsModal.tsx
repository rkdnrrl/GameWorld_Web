'use client';

/**
 * 내 스크립트 컴포넌트 관리 모달.
 * 새 컴포넌트 만들기 / 편집 / 삭제. 부착은 인스펙터의 컴포넌트 picker 에서.
 */
import { useState } from 'react';
import { api, session, type ScriptComponent, type ScriptComponentPropDef } from '@/lib/api';
import PropsSchemaEditor, { normalizePropsSchema } from './PropsSchemaEditor';

interface Props {
  open: boolean;
  onClose: () => void;
  components: ScriptComponent[];
  onChanged: (next: ScriptComponent[]) => void; // 목록 갱신 시 부모에 통보
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

export default function ScriptComponentsModal({ open, onClose, components, onChanged }: Props) {
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
    if (!tok) { alert('로그인이 필요합니다.'); return; }
    if (!name.trim()) { alert('이름을 입력하세요.'); return; }
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
      alert('저장 실패: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('이 컴포넌트를 삭제할까요? (부착된 인스턴스는 동작 안 함)')) return;
    const tok = session.getToken();
    if (!tok) return;
    try {
      await api.deleteScriptComponent(tok, id);
      onChanged(components.filter(c => c.id !== id));
    } catch (e) {
      alert('삭제 실패: ' + (e as Error).message);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(6px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(720px, 96vw)', maxHeight: '92vh', overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'linear-gradient(180deg, rgba(30,41,59,0.97), rgba(15,23,42,0.97))', color: '#fff', display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {view === 'edit' && (
              <button type="button" onClick={() => setView('list')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>← 목록</button>
            )}
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {view === 'list' ? '🧩 내 컴포넌트' : (editing ? '컴포넌트 편집' : '새 컴포넌트')}
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
              + 새 컴포넌트
            </button>
            {components.length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.45, textAlign: 'center', padding: '20px 0', lineHeight: 1.5 }}>
                아직 컴포넌트가 없습니다.<br/>
                "+ 새 컴포넌트" 로 만들어 보세요.<br/>
                (예: Door, Bouncer, AutoTeleport 등)
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
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>편집</button>
                  <button type="button" onClick={() => remove(c.id)}
                    style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
                이름 *
                <input value={name} onChange={e => setName(e.target.value)} maxLength={60}
                  placeholder="예: Door, Bouncer"
                  style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 9px', fontSize: 12, outline: 'none' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
                아이콘
                <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={4}
                  placeholder="🚪"
                  style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 9px', fontSize: 14, outline: 'none', textAlign: 'center' }} />
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
              설명 (선택)
              <input value={description} onChange={e => setDescription(e.target.value)} maxLength={300}
                placeholder="이 컴포넌트가 뭐 하는지 한 줄로"
                style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '7px 9px', fontSize: 12, outline: 'none' }} />
            </label>
            {/* Props 스키마 편집기 */}
            <PropsSchemaEditor schema={propsSchema} onChange={setPropsSchema} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, opacity: 0.7 }}>
              코드 *
              <textarea value={code} onChange={e => setCode(e.target.value)}
                spellCheck={false}
                style={{ background: '#0d1117', color: '#e6edf3', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '10px 12px', fontSize: 11.5, fontFamily: 'ui-monospace, monospace', lineHeight: 1.5, minHeight: 320, resize: 'vertical', outline: 'none', tabSize: 2 }}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const t = e.currentTarget;
                    const s = t.selectionStart, end = t.selectionEnd;
                    const v = t.value;
                    t.value = v.slice(0, s) + '  ' + v.slice(end);
                    t.selectionStart = t.selectionEnd = s + 2;
                    setCode(t.value);
                  }
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setView('list')}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>취소</button>
              <button type="button" onClick={save} disabled={saving}
                style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 18px', cursor: saving ? 'default' : 'pointer', fontSize: 12, fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
                {saving ? '저장 중…' : (editing ? '수정 저장' : '만들기')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
