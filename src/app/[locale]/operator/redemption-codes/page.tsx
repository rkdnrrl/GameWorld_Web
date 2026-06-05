"use client";
/**
 * /operator/redemption-codes — 후원자 코드 일괄 생성 + 관리.
 * 텀블벅 등 외부 결제 후원자에게 발송할 1회용 코드 발급.
 */
import { useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, session, ApiError } from "@/lib/api";

type Tier = 'bronze' | 'silver' | 'gold' | 'legend';

interface CodeRow {
  id: string;
  code: string;
  tier: string;
  batchLabel: string | null;
  usedByUserId: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

const TIER_LABEL: Record<string, string> = {
  bronze: '🥉 Bronze', silver: '🥈 Silver', gold: '🥇 Gold', legend: '🏆 Legend',
};

export default function OperatorRedemptionCodesPage() {
  const router = useRouter();
  const t = useTranslations('OperatorRedemption');
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [unusedByTier, setUnusedByTier] = useState<Record<string, number>>({});
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'unused' | 'used' | 'revoked' | 'all'>('unused');
  const [filterTier, setFilterTier] = useState<string>('');
  const [filterBatch, setFilterBatch] = useState<string>('');

  // 생성 폼
  const [genTier, setGenTier] = useState<Tier>('bronze');
  const [genCount, setGenCount] = useState(10);
  const [genLabel, setGenLabel] = useState('');
  const [genExpires, setGenExpires] = useState('');
  const [generating, setGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<Array<{ id: string; code: string; tier: string; batchLabel: string | null; expiresAt: string | null; createdAt: string }> | null>(null);

  async function reload() {
    const tk = session.getToken();
    if (!tk) return;
    try {
      const r = await api.operatorListRedemptionCodes(tk, {
        tier: filterTier || undefined,
        batchLabel: filterBatch || undefined,
        status: filterStatus === 'all' ? undefined : filterStatus,
      });
      setCodes(r.codes);
      const tierMap: Record<string, number> = {};
      r.unusedByTier.forEach((x) => { tierMap[x.tier] = x._count._all; });
      setUnusedByTier(tierMap);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setForbidden(true);
      else setErr(e instanceof Error ? e.message : 'load failed');
    }
  }

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { router.replace("/login"); return; }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterTier, filterBatch]);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    const tk = session.getToken();
    if (!tk) return;
    setGenerating(true);
    setErr(null);
    try {
      const r = await api.operatorGenerateRedemptionCodes(tk, {
        tier: genTier,
        count: genCount,
        batchLabel: genLabel || undefined,
        expiresAt: genExpires ? new Date(genExpires).toISOString() : undefined,
      });
      setLastGenerated(r.codes);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'generate failed');
    } finally {
      setGenerating(false);
    }
  }

  async function toggleRevoke(id: string, revoked: boolean) {
    const tk = session.getToken();
    if (!tk) return;
    try {
      await api.operatorRevokeRedemptionCode(tk, id, !revoked);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'update failed');
    }
  }

  function exportCSV(rows: Array<{ code: string; tier: string; batchLabel: string | null; expiresAt: string | null }>) {
    const header = 'code,tier,batchLabel,expiresAt';
    const lines = rows.map(r => `${r.code},${r.tier},${r.batchLabel || ''},${r.expiresAt || ''}`);
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `alp-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (forbidden) return <div style={{ padding: 40, textAlign: 'center', opacity: 0.6 }}>{t('forbidden')}</div>;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto', color: '#fff' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🎁 {t('title')}</h1>
      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 24 }}>{t('desc')}</p>

      {err && <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{err}</div>}

      {/* 미사용 코드 통계 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
        {(['bronze', 'silver', 'gold', 'legend'] as Tier[]).map((tier) => (
          <div key={tier} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>{TIER_LABEL[tier]}</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{unusedByTier[tier] || 0}</div>
            <div style={{ fontSize: 10, opacity: 0.4 }}>{t('unused')}</div>
          </div>
        ))}
      </div>

      {/* 생성 폼 */}
      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, padding: 18, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>➕ {t('generateTitle')}</div>
        <form onSubmit={onGenerate} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{t('tierLabel')}</label>
            <select value={genTier} onChange={(e) => setGenTier(e.target.value as Tier)} style={inputStyle}>
              <option value="bronze">🥉 Bronze</option>
              <option value="silver">🥈 Silver</option>
              <option value="gold">🥇 Gold</option>
              <option value="legend">🏆 Legend</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{t('countLabel')}</label>
            <input type="number" min={1} max={1000} value={genCount} onChange={(e) => setGenCount(parseInt(e.target.value) || 1)} style={{ ...inputStyle, width: 90 }} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{t('batchLabelLabel')}</label>
            <input type="text" placeholder={t('batchPlaceholder')} value={genLabel} onChange={(e) => setGenLabel(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{t('expiresLabel')}</label>
            <input type="date" value={genExpires} onChange={(e) => setGenExpires(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </div>
          <button type="submit" disabled={generating} style={{ padding: '9px 18px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: generating ? 'wait' : 'pointer', fontSize: 13 }}>
            {generating ? t('generating') : t('generateBtn')}
          </button>
        </form>

        {lastGenerated && lastGenerated.length > 0 && (
          <div style={{ marginTop: 14, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#86efac', fontWeight: 700 }}>✓ {t('generatedHint', { count: lastGenerated.length })}</span>
              <button onClick={() => exportCSV(lastGenerated)} style={{ background: 'rgba(34,197,94,0.25)', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                📥 {t('downloadCsv')}
              </button>
            </div>
            <div style={{ maxHeight: 120, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12, opacity: 0.85, columns: 3, columnGap: 16 }}>
              {lastGenerated.map(c => <div key={c.id}>{c.code}</div>)}
            </div>
          </div>
        )}
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['unused', 'used', 'revoked', 'all'] as const).map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: filterStatus === s ? 'rgba(99,102,241,0.85)' : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {t(`status_${s}`)}
          </button>
        ))}
        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} style={inputStyle}>
          <option value="">{t('allTiers')}</option>
          <option value="bronze">🥉 Bronze</option>
          <option value="silver">🥈 Silver</option>
          <option value="gold">🥇 Gold</option>
          <option value="legend">🏆 Legend</option>
        </select>
        <input type="text" placeholder={t('filterBatch')} value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <button onClick={() => exportCSV(codes)} disabled={!codes.length} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8, fontSize: 12, cursor: codes.length ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
          📥 {t('downloadAll')}
        </button>
      </div>

      {/* 목록 */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.06)', textAlign: 'left' }}>
              <th style={th}>{t('thCode')}</th>
              <th style={th}>{t('thTier')}</th>
              <th style={th}>{t('thBatch')}</th>
              <th style={th}>{t('thStatus')}</th>
              <th style={th}>{t('thCreated')}</th>
              <th style={th}>{t('thExpires')}</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', opacity: 0.5 }}>{t('empty')}</td></tr>
            ) : codes.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={td}><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.code}</span></td>
                <td style={td}>{TIER_LABEL[c.tier] || c.tier}</td>
                <td style={td}>{c.batchLabel || <span style={{ opacity: 0.3 }}>—</span>}</td>
                <td style={td}>
                  {c.revoked ? <span style={{ color: '#f87171' }}>🚫 {t('status_revoked')}</span>
                  : c.usedByUserId ? <span style={{ color: '#86efac' }}>✓ {t('status_used')}</span>
                  : c.expiresAt && new Date(c.expiresAt) < new Date() ? <span style={{ color: '#fbbf24' }}>⏰ {t('expired')}</span>
                  : <span style={{ color: '#a5b4fc' }}>○ {t('status_unused')}</span>}
                </td>
                <td style={{ ...td, opacity: 0.6 }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td style={{ ...td, opacity: 0.6 }}>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}</td>
                <td style={td}>
                  {!c.usedByUserId && (
                    <button onClick={() => toggleRevoke(c.id, c.revoked)} style={{ padding: '3px 9px', background: c.revoked ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', color: c.revoked ? '#86efac' : '#fca5a5', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                      {c.revoked ? t('btnRestore') : t('btnRevoke')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 7,
  padding: '7px 11px',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
};

const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.3 };
const td: React.CSSProperties = { padding: '10px 12px' };
