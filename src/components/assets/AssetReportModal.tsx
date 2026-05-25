'use client';
/**
 * 에셋 신고 모달
 * 사유 선택 (라디오) + 선택적 코멘트 (500자)
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Asset } from '@/lib/assets/types';

export type ReportReason = 'inappropriate' | 'copyright' | 'spam' | 'malware' | 'other';

interface Props {
  asset: Asset;
  onClose: () => void;
  onSubmit: (reason: ReportReason, comment: string) => Promise<void> | void;
}

const REASONS: ReportReason[] = ['inappropriate', 'copyright', 'spam', 'malware', 'other'];

export default function AssetReportModal({ asset, onClose, onSubmit }: Props) {
  const t = useTranslations('Assets');
  const [reason, setReason] = useState<ReportReason>('inappropriate');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(reason, comment.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: '#1e293b', borderRadius: 16, padding: 24, color: '#fff',
          fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
        }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.5 }}>{t('reportTitle')}</div>
            <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {asset.name}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', opacity: 0.6 }}>
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>{t('reportReasonLabel')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {REASONS.map(r => (
              <label key={r} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', cursor: 'pointer',
                background: reason === r ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                borderRadius: 8, fontSize: 13,
              }}>
                <input type="radio" name="reason" value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  style={{ accentColor: '#6366f1' }} />
                <span>{t(`reportReason_${r}`)}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 6 }}>{t('reportCommentLabel')}</div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={t('reportCommentPlaceholder')}
            maxLength={500}
            rows={3}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              background: 'rgba(0,0,0,0.3)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              outline: 'none', resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <div style={{ textAlign: 'right', fontSize: 10, opacity: 0.4, marginTop: 4 }}>
            {comment.length}/500
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>⚠️ {error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={submitting}
            style={{
              padding: '8px 16px', fontSize: 13,
              background: 'rgba(255,255,255,0.06)', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
            }}>
            {t('cancel')}
          </button>
          <button onClick={submit} disabled={submitting}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 700,
              background: '#dc2626', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}>
            {submitting ? t('reportSubmitting') : t('reportSubmit')}
          </button>
        </div>
      </div>
    </div>
  );
}
