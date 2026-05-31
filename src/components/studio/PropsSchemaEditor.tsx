'use client';

/**
 * 스크립트 컴포넌트의 props 스키마 편집기.
 * 운영자 페이지 + 유저 ScriptComponentsModal 양쪽에서 사용.
 *
 * 정의된 스키마는 부착 시 Studio 인스펙터가 자동으로 타입별 input UI 렌더:
 *  - number: 숫자 input (min/max/step)
 *  - string: 텍스트 input
 *  - boolean: 체크박스
 *  - enum: 가로 radio 버튼 (options 배열)
 */
import { useTranslations } from 'next-intl';
import type { ScriptComponentPropDef } from '@/lib/api';

interface Props {
  schema: ScriptComponentPropDef[];
  onChange: (next: ScriptComponentPropDef[]) => void;
}

export default function PropsSchemaEditor({ schema, onChange }: Props) {
  const tStudio = useTranslations('Studio.propsSchema');
  const updateAt = (idx: number, patch: Partial<ScriptComponentPropDef>) => {
    onChange(schema.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };
  const removeAt = (idx: number) => {
    onChange(schema.filter((_, i) => i !== idx));
  };
  const addNew = () => {
    onChange([...schema, { key: '', label: '', type: 'string', default: '' }]);
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{tStudio("props_schema_title")}</div>
          <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
            {tStudio("props_schema_desc")}
          </div>
        </div>
        <button type="button" onClick={addNew}
          style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {tStudio("btn_add_prop")}
        </button>
      </div>
      {schema.length === 0 && (
        <div style={{ fontSize: 10, opacity: 0.4, textAlign: 'center', padding: '6px 0' }}>{tStudio("msg_empty")}</div>
      )}
      {schema.map((p, idx) => (
        <div key={idx} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 8, marginTop: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 28px', gap: 5 }}>
            <input type="text" placeholder={tStudio("placeholder_key")} value={p.key}
              onChange={(e) => updateAt(idx, { key: e.target.value.trim() })}
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '5px 7px', borderRadius: 4, outline: 'none' }} />
            <input type="text" placeholder={tStudio("placeholder_label")} value={p.label}
              onChange={(e) => updateAt(idx, { label: e.target.value })}
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '5px 7px', borderRadius: 4, outline: 'none' }} />
            <select value={p.type}
              onChange={(e) => {
                const t = e.target.value as ScriptComponentPropDef['type'];
                const def: number | string | boolean = t === 'number' ? 0 : t === 'boolean' ? false : '';
                updateAt(idx, { type: t, default: def });
              }}
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '5px 4px', borderRadius: 4, outline: 'none' }}>
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="enum">enum</option>
            </select>
            <button type="button" onClick={() => removeAt(idx)}
              style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 5, alignItems: 'center' }}>
            <span style={{ fontSize: 10, opacity: 0.6, minWidth: 50 }}>{tStudio("label_default")}</span>
            {p.type === 'boolean' ? (
              <input type="checkbox" checked={!!p.default}
                onChange={(e) => updateAt(idx, { default: e.target.checked })} />
            ) : (
              <input type={p.type === 'number' ? 'number' : 'text'} value={String(p.default)}
                onChange={(e) => updateAt(idx, { default: p.type === 'number' ? Number(e.target.value) : e.target.value })}
                style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '4px 7px', borderRadius: 4, outline: 'none' }} />
            )}
          </div>
          {p.type === 'enum' && (
            <div style={{ display: 'flex', gap: 5, marginTop: 5, alignItems: 'center' }}>
              <span style={{ fontSize: 10, opacity: 0.6, minWidth: 50 }}>{tStudio("label_options")}</span>
              <input type="text" placeholder={tStudio("placeholder_enum_options")}
                value={(p.options ?? []).join(',')}
                onChange={(e) => {
                  // 입력 중 빈 항목 허용 (콤마 직후 등). 저장 시 filter.
                  updateAt(idx, { options: e.target.value.split(',').map(s => s.trim()) });
                }}
                style={{ flex: 1, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '4px 7px', borderRadius: 4, outline: 'none' }} />
            </div>
          )}
          {p.type === 'number' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginTop: 5 }}>
              <input type="number" placeholder="min" value={p.min ?? ''}
                onChange={(e) => updateAt(idx, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '4px 6px', borderRadius: 4, outline: 'none' }} />
              <input type="number" placeholder="max" value={p.max ?? ''}
                onChange={(e) => updateAt(idx, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '4px 6px', borderRadius: 4, outline: 'none' }} />
              <input type="number" placeholder="step" value={p.step ?? ''}
                onChange={(e) => updateAt(idx, { step: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 10, padding: '4px 6px', borderRadius: 4, outline: 'none' }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 저장 직전 정규화: enum options 빈 항목 제거 */
export function normalizePropsSchema(schema: ScriptComponentPropDef[]): ScriptComponentPropDef[] {
  return schema.map((p) =>
    p.type === 'enum'
      ? { ...p, options: (p.options ?? []).filter(Boolean) }
      : p
  );
}
