'use client';
/**
 * 마켓 에셋 상세 모달 — 카드 클릭 시 정보(이름·작가·유형·태그·통계·등록일) + 액션 노출.
 *  · 남의 에셋: 가져오기 / 좋아요 / 신고 / (다운로드는 운영자만)
 *  · 내 에셋:   비공개로 전환 / 다운로드
 *  미디어(이미지·오디오·비디오)는 썸네일 클릭으로 미리보기(onPreview) 열기.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Asset, AssetKind } from '@/lib/assets/types';
import { detectKindFromUrl } from '@/lib/assets/types';
import { getKind } from '@/lib/assets/registry';
import { session } from '@/lib/api';

// 라이브 3D 뷰어(드래그 회전·확대·터치) — 모달에서만 띄우므로 컨텍스트 한계 무관. SSR 제외.
const Asset3DViewer = dynamic(() => import('./Asset3DViewer'), { ssr: false });

interface DetailAsset extends Asset {
  creatorId?: string;
  creator?: { username: string | null };
  liked?: boolean;
  likeCount?: number;
  importCount?: number;
}

interface Props {
  asset: DetailAsset;
  kinds: AssetKind[];
  importing?: boolean;
  imported?: boolean;
  liking?: boolean;
  reported?: boolean;
  unpublishing?: boolean;
  onClose: () => void;
  onImport: (a: Asset) => void;
  onToggleLike: (a: DetailAsset) => void;
  onReport: (a: Asset) => void;
  onUnpublish: (a: DetailAsset) => void;
  /** 미디어 미리보기 (kind 에 Preview 있을 때만) */
  onPreview?: (a: Asset) => void;
}

export default function AssetDetailModal({
  asset, kinds, importing, imported, liking, reported, unpublishing,
  onClose, onImport, onToggleLike, onReport, onUnpublish, onPreview,
}: Props) {
  const t = useTranslations('Assets');

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [me, setMe] = useState<{ id: string; isOperator?: boolean } | null>(null);
  useEffect(() => {
    const u = session.getUser();
    setMe(u ? { id: u.id, isOperator: u.isOperator } : null);
  }, []);

  const kindId  = asset.kind || detectKindFromUrl(asset.modelUrl, kinds);
  const kindDef = kinds.find(k => k.id === kindId);
  const handler = getKind(kindId);
  const Thumb   = handler?.Thumbnail;
  const canMediaPreview = !!handler?.Preview && !!onPreview;
  const isModel = kindId === 'model';   // 3D 모델 → 정적 썸네일 대신 라이브 뷰어

  const username = asset.creator?.username || null;
  const isOwn = !!me && !!asset.creatorId && asset.creatorId === me.id;
  const canDownload = !!me && (!!me.isOperator || (isOwn && !asset.metadata?.referenceOnly));
  const tags = asset.tags || [];

  const badge: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
    padding: '4px 9px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)',
  };
  const actionBtn: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, height: 38, padding: '0 16px', borderRadius: 9,
    border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(92vw, 860px)', maxHeight: '88vh', overflow: 'auto',
          background: '#121829', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          display: 'flex', flexWrap: 'wrap',
        }}>
        {/* 썸네일 / 3D 뷰어 / 미디어 미리보기 진입 */}
        <div
          onClick={() => { if (canMediaPreview) onPreview!(asset); }}
          style={{
            flex: '1 1 340px', minWidth: 280, aspectRatio: '4 / 3',
            background: 'radial-gradient(circle at 50% 35%, #25304a, #0e1424)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
            cursor: isModel ? 'grab' : canMediaPreview ? 'zoom-in' : 'default',
          }}>
          {isModel
            ? <Asset3DViewer url={asset.modelUrl} />
            : Thumb
              ? <Thumb asset={asset} />
              : <span style={{ fontSize: 64, opacity: 0.35 }}>{kindDef?.icon || '📄'}</span>}
          {isModel && (
            <span style={{
              position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
              fontSize: 11, fontWeight: 600, padding: '4px 10px', whiteSpace: 'nowrap',
              background: 'rgba(0,0,0,0.5)', borderRadius: 8, color: 'rgba(255,255,255,0.85)',
              backdropFilter: 'blur(4px)', pointerEvents: 'none',
            }}>
              🖱️ {t('detailDragHint')}
            </span>
          )}
          {canMediaPreview && (
            <span style={{
              position: 'absolute', bottom: 10, right: 10, fontSize: 11, fontWeight: 600,
              padding: '5px 10px', background: 'rgba(0,0,0,0.6)', borderRadius: 8, color: '#fff', backdropFilter: 'blur(4px)',
            }}>
              🔍 {t('detailPreview')}
            </span>
          )}
        </div>

        {/* 정보 */}
        <div style={{ flex: '1 1 320px', minWidth: 280, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, flex: 1, wordBreak: 'break-word', lineHeight: 1.25 }}>{asset.name}</h2>
            <button
              onClick={onClose}
              title={t('detailClose')}
              aria-label={t('detailClose')}
              style={{ flexShrink: 0, width: 30, height: 30, fontSize: 14, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
              ✕
            </button>
          </div>

          {/* 배지 — 유형 / 내 에셋 / 무료 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {kindDef && <span style={badge}>{kindDef.icon} {kindDef.label}</span>}
            {isOwn && <span style={{ ...badge, color: '#6ee7b7', background: 'rgba(16,185,129,0.14)' }}>⭐ {t('detailMyAsset')}</span>}
            <span style={{ ...badge, color: '#6ee7b7', background: 'rgba(16,185,129,0.14)' }}>{t('marketFree')}</span>
          </div>

          {/* 작가 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg,#6366f1,#a855f7)', color: '#fff', fontSize: 11, fontWeight: 800,
            }}>
              {(username || '?').charAt(0).toUpperCase()}
            </span>
            {username ? (
              <Link href={`/users/${encodeURIComponent(username)}`} title={t('viewCreatorPage')}
                style={{ fontSize: 13, color: '#a5b4fc', textDecoration: 'none' }}>
                @{username}
              </Link>
            ) : (
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{t('anonymousAuthor')}</span>
            )}
          </div>

          {/* 통계 + 등록일 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5, color: 'rgba(255,255,255,0.7)', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={t('like')}>
              <span style={{ color: '#fca5a5' }}>♥</span> {asset.likeCount ?? 0}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title={t('importCountTooltip')}>
              ↓ {asset.importCount ?? 0}
            </span>
            <span style={{ opacity: 0.7 }}>{t('detailCreatedAt')}: {new Date(asset.createdAt).toLocaleDateString()}</span>
          </div>

          {/* 태그 */}
          {tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tags.map(tg => (
                <span key={tg} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, background: 'rgba(99,102,241,0.16)', color: '#c7d2fe' }}>
                  # {tg}
                </span>
              ))}
            </div>
          )}

          {/* 액션 */}
          <div style={{ marginTop: 'auto', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isOwn ? (
                <button
                  onClick={() => { if (!unpublishing) onUnpublish(asset); }}
                  disabled={unpublishing}
                  style={{ ...actionBtn, flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff', opacity: unpublishing ? 0.6 : 1 }}>
                  🔒 {unpublishing ? t('detailMakingPrivate') : t('bulkMakePrivate')}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { if (!imported && !importing) onImport(asset); }}
                    disabled={importing || imported}
                    style={{ ...actionBtn, flex: 1, background: imported ? 'rgba(16,185,129,0.95)' : '#6366f1', color: '#fff', opacity: importing ? 0.6 : 1 }}>
                    {imported ? '✓ ' + t('marketImported') : importing ? '…' : '↓ ' + t('marketImport')}
                  </button>
                  <button
                    onClick={() => onToggleLike(asset)}
                    disabled={liking}
                    style={{ ...actionBtn, background: asset.liked ? 'rgba(239,68,68,0.9)' : 'rgba(255,255,255,0.08)', color: '#fff', opacity: liking ? 0.6 : 1 }}>
                    {asset.liked ? '♥' : '♡'} {asset.likeCount ?? 0}
                  </button>
                  <button
                    onClick={() => { if (!reported) onReport(asset); }}
                    disabled={reported}
                    title={reported ? t('reportAlready') : t('reportButton')}
                    style={{ ...actionBtn, background: 'rgba(255,255,255,0.08)', color: reported ? '#fbbf24' : '#fff', cursor: reported ? 'default' : 'pointer' }}>
                    {reported ? '⚠' : '⋯'}
                  </button>
                </>
              )}
            </div>

            {canDownload && (
              <a href={asset.modelUrl} download
                style={{ ...actionBtn, justifyContent: 'center', textDecoration: 'none', background: 'rgba(99,102,241,0.16)', color: '#c7d2fe', border: '1px solid rgba(99,102,241,0.3)' }}>
                {t('download')}
              </a>
            )}

            {isOwn && (
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>
                {t('detailMakePrivateHint')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
