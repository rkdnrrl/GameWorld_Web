'use client';
/**
 * Script Asset 생성/편집 모달.
 *
 * 신규 생성: editing=null → POST /api/assets/script
 * 편집: editing=Asset → PATCH /api/assets/:id/script
 *
 * 입력: 이름, 아이콘(이모지), 코드 (textarea), propsSchema (간단 key/type 입력)
 * 사용처: /assets 페이지의 "📜 스크립트 만들기" 버튼.
 */
import React, { useState, useEffect } from 'react';
import { api, type ScriptAssetInput } from '@/lib/api';
import { session } from '@/lib/api';
import type { Asset } from '@/lib/assets/types';

interface PropRow { key: string; type: 'number' | 'string' | 'boolean' }

interface Props {
  open: boolean;
  editing?: Asset | null;
  folder?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ScriptAssetEditor({ open, editing, folder, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📜');
  const [code, setCode] = useState('function onUpdate(dt) {\n  // self.setRotation(0, world.time, 0);\n}\n');
  const [props, setProps] = useState<PropRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // editing 변경 시 폼 채움
  useEffect(() => {
    if (editing) {
      const meta = (editing.metadata ?? {}) as { code?: string; icon?: string; propsSchema?: Array<{ key: string; type: string }> };
      setName(editing.name);
      setIcon(meta.icon || '📜');
      setCode(meta.code || '');
      setProps((meta.propsSchema || []).map(p => ({ key: p.key, type: (p.type as PropRow['type']) || 'number' })));
    } else {
      setName('새 스크립트');
      setIcon('📜');
      setCode('function onUpdate(dt) {\n  // self.setRotation(0, world.time, 0);\n}\n');
      setProps([]);
    }
    setErr(null);
  }, [editing, open]);

  if (!open) return null;

  const save = async () => {
    const tok = session.getToken();
    if (!tok) { setErr('로그인 필요'); return; }
    if (!name.trim()) { setErr('이름을 입력하세요.'); return; }
    setBusy(true); setErr(null);
    try {
      const payload: Partial<ScriptAssetInput> = {
        name: name.trim(),
        code,
        icon,
        propsSchema: props.filter(p => p.key.trim()).map(p => ({
          key: p.key.trim(), label: p.key.trim(), type: p.type,
          default: p.type === 'number' ? 0 : p.type === 'boolean' ? false : '',
        })),
      };
      if (editing) {
        await api.updateScriptAsset(tok, editing.id, payload);
      } else {
        await api.createScriptAsset(tok, { ...(payload as ScriptAssetInput), folder: folder || undefined });
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr('저장 실패: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(8px)',
      zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0f172a', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14,
        width: 'min(780px, 100%)', maxHeight: '92vh', padding: 20, color: '#fff',
        display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{editing ? '📜 스크립트 편집' : '📜 새 스크립트'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 22, cursor: 'pointer', padding: '0 6px' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 10, alignItems: 'center' }}>
          <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={4}
            placeholder="📜" style={{ ...inputStyle, fontSize: 22, textAlign: 'center' }} />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="스크립트 이름"
            style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }} />
        </div>

        <div>
          <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 4 }}>코드 (JavaScript ES5)</div>
          <textarea value={code} onChange={e => setCode(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, minHeight: 280, lineHeight: 1.5, resize: 'vertical' }} />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 11, opacity: 0.65 }}>인스펙터 변수 (props)</div>
            <button onClick={() => setProps(p => [...p, { key: '', type: 'number' }])}
              style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', borderRadius: 6, padding: '3px 9px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>+ 추가</button>
          </div>
          {props.length === 0 ? (
            <div style={{ fontSize: 10, opacity: 0.4, padding: '6px 0' }}>없음 (스크립트 코드 안 변수가 자동 노출됨)</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {props.map((p, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 28px', gap: 4 }}>
                  <input value={p.key} onChange={e => setProps(arr => arr.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                    placeholder="키" style={{ ...inputStyle, fontSize: 11 }} />
                  <select value={p.type} onChange={e => setProps(arr => arr.map((x, j) => j === i ? { ...x, type: e.target.value as PropRow['type'] } : x))}
                    style={{ ...inputStyle, fontSize: 11, padding: '4px 6px' }}>
                    <option value="number">number</option>
                    <option value="string">string</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <button onClick={() => setProps(arr => arr.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {err && <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontSize: 11, padding: '8px 12px', borderRadius: 6 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 7, color: '#fff', fontSize: 12, padding: '8px 16px', cursor: busy ? 'default' : 'pointer' }}>취소</button>
          <button onClick={save} disabled={busy}
            style={{ background: busy ? 'rgba(99,102,241,0.5)' : '#4f46e5', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, padding: '8px 18px', cursor: busy ? 'default' : 'pointer', fontWeight: 700 }}>
            {busy ? '저장 중...' : editing ? '✓ 업데이트' : '✨ 만들기'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', minWidth: 0,
  background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.14)',
  color: '#fff', padding: '6px 9px', borderRadius: 6, outline: 'none',
};
