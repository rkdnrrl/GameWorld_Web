'use client';
/**
 * 에셋 카드 — kind 핸들러에서 Thumbnail/Editor 가져옴
 * 미등록 kind 는 일반 박스로 fallback (다운로드만 가능)
 */
import { useTranslations } from 'next-intl';
import type { Asset, AssetKind } from '@/lib/assets/types';
import { detectKindFromUrl } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';

interface Props {
  asset: Asset;
  kinds: AssetKind[];
  onEdit: (a: Asset) => void;
  onTogglePublic: (a: Asset) => void;
  onDelete: (id: string) => void;
}

export default function AssetCard({ asset, kinds, onEdit, onTogglePublic, onDelete }: Props) {
  const t = useTranslations('Assets');
  const kindId  = asset.kind || detectKindFromUrl(asset.modelUrl, kinds);
  const kindDef = kinds.find(k => k.id === kindId);
  const handler = getKind(kindId);
  const Thumb   = handler?.Thumbnail;

  const canEdit = !!handler?.Editor;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)', borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
      transition: 'border-color .15s',
    }}>
      {/* 썸네일 영역 */}
      <div
        onClick={() => { if (canEdit) onEdit(asset); }}
        style={{
          width: '100%', aspectRatio: '1', background: 'rgba(255,255,255,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', cursor: canEdit ? 'pointer' : 'default',
        }}>
        {Thumb
          ? <Thumb asset={asset} />
          : <span style={{ fontSize: 44, opacity: 0.4 }}>{kindDef?.icon || '📄'}</span>}

        {/* kind 배지 */}
        {kindDef && (
          <span style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            backdropFilter: 'blur(4px)',
          }}>
            {kindDef.icon} {kindDef.label}
          </span>
        )}

        {asset.isPublic && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(16,185,129,0.9)', color: '#fff',
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          }}>{t('publishing')}</span>
        )}
      </div>

      {/* 정보 */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {asset.name}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <a
            href={asset.modelUrl}
            download
            style={{ fontSize: 11, color: '#818cf8', textDecoration: 'none', padding: '3px 8px', background: 'rgba(99,102,241,0.15)', borderRadius: 5 }}
          >
            {t('download')}
          </a>
          <button
            onClick={() => onTogglePublic(asset)}
            style={{
              fontSize: 11, cursor: 'pointer', padding: '3px 8px', borderRadius: 5, border: 'none',
              background: asset.isPublic ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)',
              color: asset.isPublic ? '#6ee7b7' : 'rgba(255,255,255,0.5)',
            }}
          >
            {asset.isPublic ? t('publishing') : t('private')}
          </button>
          <button
            onClick={() => onDelete(asset.id)}
            style={{
              fontSize: 11, cursor: 'pointer', padding: '3px 8px', borderRadius: 5, border: 'none',
              background: 'rgba(239,68,68,0.12)', color: '#fca5a5',
            }}
          >
            {t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
