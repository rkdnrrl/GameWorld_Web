'use client';
/**
 * 내 API 키 관리 모달 — 유저가 임의 이름으로 등록.
 *
 * 사용 흐름:
 *   1. "내 API 키 등록" 클릭 → 이름·인증방식·키 값 입력
 *   2. 스크립트에서 api.callMyApi("이름", url, options, resultKey) 로 호출
 *   3. 런타임이 인증 헤더 자동 주입 — 스크립트엔 키 노출 X
 *
 * 인증방식:
 *   - bearer: Authorization: Bearer {value}  (OpenAI, 대부분 서비스)
 *   - custom: 지정 헤더: {value}  (예: x-api-key for Anthropic)
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import {
  listApiKeys, setApiKeyConfig, removeApiKey, isValidApiName,
  syncFromServer, syncToServer, removeFromServer,
  type ApiKeyConfig, type AuthType,
} from '@/lib/world/userApiKeys';

function maskValue(v: string): string {
  if (!v || v.length < 8) return '••••';
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export function UserApiKeysModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('World');
  const tCommon = useTranslations('Common');
  const [items, setItems] = useState<Array<{ name: string; config: ApiKeyConfig }>>([]);
  const [adding, setAdding] = useState(false);
  // 새 추가/편집 폼 상태
  const [draft, setDraft] = useState<{ name: string; authType: AuthType; customHeader: string; value: string; label: string }>(
    { name: '', authType: 'bearer', customHeader: '', value: '', label: '' }
  );
  const [editingName, setEditingName] = useState<string | null>(null);

  const reload = () => setItems(listApiKeys());

  useEffect(() => {
    if (!open) return;
    reload();
    void syncFromServer().then(reload);
    setAdding(false);
    setEditingName(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  function startAdd() {
    setDraft({ name: '', authType: 'bearer', customHeader: '', value: '', label: '' });
    setEditingName(null);
    setAdding(true);
  }
  function startEdit(name: string, config: ApiKeyConfig) {
    setDraft({
      name,
      authType: config.authType,
      customHeader: config.customHeader || '',
      value: config.value,
      label: config.label || '',
    });
    setEditingName(name);
    setAdding(true);
  }
  function cancelForm() {
    setAdding(false);
    setEditingName(null);
  }

  async function save() {
    try {
      if (!isValidApiName(draft.name)) { alert(t('apiKeysNameInvalid')); return; }
      if (!draft.value.trim()) { alert(t('apiKeysValueRequired')); return; }
      if (draft.authType === 'custom' && !draft.customHeader.trim()) { alert(t('apiKeysCustomHeaderRequired')); return; }
      // 편집 모드에서 이름이 바뀌면 옛 이름 row 삭제 필요
      if (editingName && editingName !== draft.name) {
        removeApiKey(editingName);
        await removeFromServer(editingName);
      }
      setApiKeyConfig(draft.name, {
        authType: draft.authType,
        customHeader: draft.authType === 'custom' ? draft.customHeader.trim() : undefined,
        value: draft.value.trim(),
        label: draft.label.trim() || undefined,
      });
      const synced = await syncToServer(draft.name);
      if (!synced) alert(t('apiKeysSyncFailed'));
      reload();
      cancelForm();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function destroy(name: string) {
    if (!confirm(t('apiKeysConfirmDelete'))) return;
    removeApiKey(name);
    await removeFromServer(name);
    reload();
  }

  return createPortal((
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2147483600 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 620, maxWidth: '92vw', maxHeight: '85vh', background: '#1e1b4b', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, color: '#fff', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>🔑 {t('apiKeysTitle')}</h3>
          <button onClick={onClose} aria-label={tCommon('close')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
          🔒 {t('apiKeysSecurityHint')}
        </div>
        <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
          💡 {t('apiKeysUsageHint')}
        </div>

        {/* 등록된 키 목록 */}
        {items.length === 0 && !adding && (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24, fontSize: 13 }}>
            {t('apiKeysEmpty')}
          </div>
        )}
        {items.map((it) => (
          <div key={it.name} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ padding: '4px 10px', background: 'rgba(99,102,241,0.2)', borderRadius: 6, fontSize: 12, color: '#a5b4fc', fontWeight: 700 }}>
                {it.name}
              </code>
              {it.config.label && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{it.config.label}</span>}
              <div style={{ flex: 1 }} />
              <button onClick={() => startEdit(it.name, it.config)}
                style={{ padding: '6px 12px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, color: '#a5b4fc', fontSize: 12, cursor: 'pointer' }}>
                {t('apiKeysEdit')}
              </button>
              <button onClick={() => destroy(it.name)}
                style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, color: '#fca5a5', fontSize: 12, cursor: 'pointer' }}>
                {t('apiKeysDelete')}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)', display: 'flex', gap: 12 }}>
              <span>{t('apiKeysAuthType')}: <code style={{ color: '#86efac' }}>{it.config.authType}{it.config.authType === 'custom' ? ` (${it.config.customHeader})` : ''}</code></span>
              <span>{t('apiKeysValue')}: <code style={{ color: '#86efac' }}>{maskValue(it.config.value)}</code></span>
            </div>
          </div>
        ))}

        {/* 추가/편집 폼 */}
        {adding ? (
          <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              {editingName ? `✏️ ${t('apiKeysEditing')}: ${editingName}` : `➕ ${t('apiKeysNew')}`}
            </div>
            <Field label={t('apiKeysFieldName') + ' *'}>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="myGpt"
                style={inputStyle} />
              <div style={hintStyle}>{t('apiKeysNameHint')}</div>
            </Field>
            <Field label={t('apiKeysFieldLabel')}>
              <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder={t('apiKeysLabelPlaceholder')}
                style={inputStyle} />
            </Field>
            <Field label={t('apiKeysFieldAuthType') + ' *'}>
              <select value={draft.authType}
                onChange={(e) => setDraft({ ...draft, authType: e.target.value as AuthType })}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="bearer">Bearer (Authorization: Bearer ...)</option>
                <option value="custom">Custom Header</option>
              </select>
            </Field>
            {draft.authType === 'custom' && (
              <Field label={t('apiKeysFieldCustomHeader') + ' *'}>
                <input value={draft.customHeader} onChange={(e) => setDraft({ ...draft, customHeader: e.target.value })}
                  placeholder="x-api-key"
                  style={inputStyle} />
              </Field>
            )}
            <Field label={t('apiKeysFieldValue') + ' *'}>
              <input type="password" autoComplete="off" spellCheck={false}
                value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                placeholder="sk-..."
                style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={cancelForm}
                style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer' }}>
                {tCommon('cancel')}
              </button>
              <button onClick={save}
                style={{ padding: '8px 16px', background: '#6366f1', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {t('apiKeysSave')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={startAdd}
            style={{ padding: '10px 16px', background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: 8, color: '#c4b5fd', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ➕ {t('apiKeysAddNew')}
          </button>
        )}
      </div>
    </div>
  ), document.body);
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6, color: '#fff', fontSize: 12,
};
const hintStyle: React.CSSProperties = {
  marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.45)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
