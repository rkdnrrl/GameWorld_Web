"use client";

/**
 * 운영자: 스크립트 컴포넌트 관리.
 * - 모든 컴포넌트 목록 (공식 + 모든 유저 것)
 * - 새 공식 컴포넌트 만들기
 * - 기존 컴포넌트 isOfficial 토글, 편집, 삭제
 */
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { session, api, type ScriptComponent, type ScriptComponentPropDef } from "@/lib/api";

const DEFAULT_CODE = `// 공식 컴포넌트 코드 — 모든 유저가 부착해서 쓸 수 있음.
// self = 부착된 오브젝트, props = 부착 시 사용자가 입력한 키-값.

function onStart() {
  // 씬 시작 시
}

function onUpdate(dt) {
  // 매 프레임
}

function onGrab(grabberId) {
  // 1인칭 E 키로 잡혔을 때
}

function onRelease(grabberId) {
  // 놓였을 때
}
`;

export default function OperatorScriptComponentsPage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<ScriptComponent[]>([]);

  // 'list' | 'edit'
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<ScriptComponent | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [isOfficial, setIsOfficial] = useState(true);
  const [propsSchema, setPropsSchema] = useState<ScriptComponentPropDef[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    api.operatorListScriptComponents(tk)
      .then((r) => setComponents(r.components))
      .catch((e) => {
        const msg = String((e as Error).message ?? e);
        if (msg.includes("403")) setForbidden(true);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const startNew = () => {
    setEditing(null);
    setName(""); setIcon(""); setDescription(""); setCode(DEFAULT_CODE); setIsOfficial(true); setPropsSchema([]);
    setView("edit");
  };
  const startEdit = (c: ScriptComponent) => {
    setEditing(c);
    setName(c.name); setIcon(c.icon || ""); setDescription(c.description || "");
    setCode(c.code); setIsOfficial(!!c.isOfficial);
    setPropsSchema(c.propsSchema ?? []);
    setView("edit");
  };

  const save = async () => {
    const tk = session.getToken();
    if (!tk) return;
    if (!name.trim()) { alert("이름을 입력하세요."); return; }
    setSaving(true);
    try {
      // 저장 직전 정규화: enum options 빈 항목 제거
      const cleanedSchema = propsSchema.map((p) =>
        p.type === 'enum'
          ? { ...p, options: (p.options ?? []).filter(Boolean) }
          : p
      );
      const body = { name: name.trim(), icon: icon.trim() || null, description: description.trim() || null, code, isOfficial, propsSchema: cleanedSchema };
      if (editing) {
        const r = await api.operatorUpdateScriptComponent(tk, editing.id, body);
        setComponents((prev) => prev.map((c) => c.id === editing.id ? r.component : c));
      } else {
        const r = await api.operatorCreateScriptComponent(tk, body);
        setComponents((prev) => [r.component, ...prev]);
      }
      setView("list");
    } catch (e) {
      alert("저장 실패: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleOfficial = async (c: ScriptComponent) => {
    const tk = session.getToken();
    if (!tk) return;
    try {
      const r = await api.operatorUpdateScriptComponent(tk, c.id, { isOfficial: !c.isOfficial });
      setComponents((prev) => prev.map((x) => x.id === c.id ? r.component : x));
    } catch (e) {
      alert("토글 실패: " + (e as Error).message);
    }
  };

  const remove = async (c: ScriptComponent) => {
    if (!confirm(`"${c.name}" 컴포넌트를 삭제할까요? 부착된 인스턴스는 동작 안 함.`)) return;
    const tk = session.getToken();
    if (!tk) return;
    try {
      await api.operatorDeleteScriptComponent(tk, c.id);
      setComponents((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      alert("삭제 실패: " + (e as Error).message);
    }
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#0f172a", padding: 40, color: "#94a3b8" }}>로드 중...</div>;
  }
  if (forbidden) {
    return <div style={{ minHeight: "100vh", background: "#0f172a", padding: 40, color: "#fca5a5" }}>운영자만 접근할 수 있습니다.</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px 24px", color: "#e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🧩 공식 컴포넌트</h1>
          <p style={{ fontSize: 13, opacity: 0.65, margin: "4px 0 0" }}>
            여기서 만든 컴포넌트는 모든 유저의 스튜디오 picker 의 OFFICIAL 섹션에 나타납니다.
          </p>
        </div>
        {view === "list" && (
          <button onClick={startNew}
            style={{ background: "linear-gradient(135deg,#10b981,#06b6d4)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            + 새 공식 컴포넌트
          </button>
        )}
        {view === "edit" && (
          <button onClick={() => setView("list")}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: 8, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ← 목록
          </button>
        )}
      </div>

      {view === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {components.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", opacity: 0.5, background: "rgba(255,255,255,0.03)", borderRadius: 10 }}>
              아직 컴포넌트가 없습니다.
            </div>
          )}
          {components.map((c) => (
            <div key={c.id}
              style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" }}>
              <span style={{ fontSize: 24 }}>{c.icon || "🧩"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                  {c.isOfficial && (
                    <span style={{ fontSize: 10, background: "rgba(52,211,153,0.25)", color: "#86efac", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>공식</span>
                  )}
                </div>
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 3 }}>
                  by {c.creator?.username || "?"} · {new Date(c.updatedAt).toLocaleString()}
                </div>
                {c.description && (
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>{c.description}</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggleOfficial(c)}
                  style={{ background: c.isOfficial ? "rgba(52,211,153,0.18)" : "rgba(255,255,255,0.06)", border: `1px solid ${c.isOfficial ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.12)"}`, color: c.isOfficial ? "#86efac" : "#94a3b8", borderRadius: 6, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {c.isOfficial ? "공식 ON" : "공식 OFF"}
                </button>
                <button onClick={() => startEdit(c)}
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", borderRadius: 6, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  편집
                </button>
                <button onClick={() => remove(c)}
                  style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5", borderRadius: 6, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, opacity: 0.75 }}>
              이름 *
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                placeholder="예: Door, Bouncer, Teleport"
                style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: 7, padding: "9px 11px", fontSize: 13, outline: "none" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, opacity: 0.75 }}>
              아이콘
              <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4}
                placeholder="🚪"
                style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: 7, padding: "9px 11px", fontSize: 16, outline: "none", textAlign: "center" }} />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, opacity: 0.75 }}>
            설명
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300}
              placeholder="이 컴포넌트가 뭐 하는지 한 줄로"
              style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: 7, padding: "9px 11px", fontSize: 13, outline: "none" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.85, cursor: "pointer" }}>
            <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} />
            공식 (모든 유저의 picker 에 노출)
          </label>

          {/* ── Props Schema 편집기 ── */}
          <PropsSchemaEditor schema={propsSchema} onChange={setPropsSchema} />

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, opacity: 0.75 }}>
            코드 *
            <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false}
              style={{ background: "#0d1117", color: "#e6edf3", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 7, padding: "12px 14px", fontSize: 12, fontFamily: "ui-monospace, monospace", lineHeight: 1.55, minHeight: 380, resize: "vertical", outline: "none", tabSize: 2 }}
              onKeyDown={(e) => {
                if (e.key === "Tab") {
                  e.preventDefault();
                  const t = e.currentTarget;
                  const s = t.selectionStart, end = t.selectionEnd;
                  const v = t.value;
                  t.value = v.slice(0, s) + "  " + v.slice(end);
                  t.selectionStart = t.selectionEnd = s + 2;
                  setCode(t.value);
                }
              }} />
          </label>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setView("list")}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: 7, padding: "9px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              취소
            </button>
            <button onClick={save} disabled={saving}
              style={{ background: "linear-gradient(135deg,#10b981,#06b6d4)", border: "none", color: "#fff", borderRadius: 7, padding: "9px 22px", cursor: saving ? "default" : "pointer", fontSize: 13, fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
              {saving ? "저장 중…" : (editing ? "수정 저장" : "만들기")}
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

/* ── Props Schema 편집기 ── */
function PropsSchemaEditor({
  schema, onChange,
}: {
  schema: ScriptComponentPropDef[];
  onChange: (next: ScriptComponentPropDef[]) => void;
}) {
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
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Props 스키마</div>
          <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
            유저가 부착할 때 보이는 input UI. 비워두면 자유 key:value 입력 모드.
          </div>
        </div>
        <button type="button" onClick={addNew}
          style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          + prop 추가
        </button>
      </div>
      {schema.length === 0 && (
        <div style={{ fontSize: 10, opacity: 0.4, textAlign: 'center', padding: '6px 0' }}>없음</div>
      )}
      {schema.map((p, idx) => (
        <div key={idx} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 8, marginTop: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 28px', gap: 5 }}>
            <input type="text" placeholder="key (예: speed)" value={p.key}
              onChange={(e) => updateAt(idx, { key: e.target.value.trim() })}
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '5px 7px', borderRadius: 4, outline: 'none' }} />
            <input type="text" placeholder="라벨 (예: 속도)" value={p.label}
              onChange={(e) => updateAt(idx, { label: e.target.value })}
              style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, padding: '5px 7px', borderRadius: 4, outline: 'none' }} />
            <select value={p.type}
              onChange={(e) => {
                const t = e.target.value as ScriptComponentPropDef['type'];
                // 타입 변경 시 default 도 적절히 재설정
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
          {/* 기본값 + 추가 필드 */}
          <div style={{ display: 'flex', gap: 5, marginTop: 5, alignItems: 'center' }}>
            <span style={{ fontSize: 10, opacity: 0.6, minWidth: 50 }}>기본값</span>
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
              <span style={{ fontSize: 10, opacity: 0.6, minWidth: 50 }}>선택지</span>
              <input type="text" placeholder="x,y,z (쉼표 구분)"
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
