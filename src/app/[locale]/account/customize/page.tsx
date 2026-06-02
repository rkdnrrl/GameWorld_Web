'use client';
/**
 * 프로필 꾸미기 (Phase 17)
 *   - 자기소개 (bio)
 *   - 프로필 이미지 (업로드)
 *   - 배너 URL
 *   - 아이콘 이모지
 *   - 테마 색상
 *   - 웹사이트
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, session, ApiError } from '@/lib/api';

const PRESET_COLORS = ['#6366f1', '#ec4899', '#22c55e', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444', '#0ea5e9', '#84cc16', '#64748b'];
const PRESET_EMOJIS = ['🎮', '🎨', '🚀', '🌟', '🔥', '🌈', '⚡', '🎯', '🎪', '🎭', '🍀', '🌸', '🦄', '🐱', '🐶', '🦊'];

export default function CustomizePage() {
  const router = useRouter();
  const t = useTranslations('AccountCustomize');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [bio, setBio] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [iconEmoji, setIconEmoji] = useState('');
  const [themeColor, setThemeColor] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tk = session.getToken();
    if (!tk) { setNeedsLogin(true); setLoading(false); return; }
    api.getMyCustomProfile(tk)
      .then(d => {
        if (!d.profile) return;
        setBio(d.profile.bio || '');
        setWebsiteUrl(d.profile.websiteUrl || '');
        setBannerUrl(d.profile.bannerUrl || '');
        setIconEmoji(d.profile.iconEmoji || '');
        setThemeColor(d.profile.themeColor || '');
        setProfileImageUrl(d.profile.profileImageUrl);
      })
      .catch(e => setError(e instanceof ApiError ? e.message : 'load failed'))
      .finally(() => setLoading(false));
  }, []);

  async function onSave() {
    const tk = session.getToken();
    if (!tk) { router.push('/login'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.updateMyCustomProfile(tk, { bio, websiteUrl, bannerUrl, iconEmoji, themeColor });
      setSuccess(t('savedOk'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onUploadImage(file: File) {
    const tk = session.getToken();
    if (!tk) return;
    setUploading(true); setError('');
    try {
      const res = await api.uploadProfileImage(tk, file);
      setProfileImageUrl(res.profileImageUrl);
      setSuccess(t('imageUploaded'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (needsLogin) {
    return <main className="max-w-2xl mx-auto px-4 py-8"><p className="text-slate-400">{t('loginRequired')}</p></main>;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">{t('title')}</h1>
      <p className="text-sm text-slate-400 mb-6">{t('subtitle')}</p>

      {loading && <p className="text-slate-500 text-sm">{t('loading')}</p>}
      {error && <div className="mb-3 p-2 bg-rose-900/30 text-rose-300 text-sm rounded">{error}</div>}
      {success && <div className="mb-3 p-2 bg-emerald-900/30 text-emerald-300 text-sm rounded">{success}</div>}

      {!loading && (
        <>
          {/* 미리보기 */}
          <section className="mb-8 rounded-lg overflow-hidden border border-slate-700">
            <div
              className="h-32 relative"
              style={{
                background: bannerUrl
                  ? `url(${bannerUrl}) center/cover`
                  : `linear-gradient(135deg, ${themeColor || '#6366f1'} 0%, ${themeColor || '#6366f1'}88 100%)`,
              }}
            >
              <div className="absolute -bottom-8 left-4 flex items-end gap-3">
                <div className="w-20 h-20 rounded-full border-4 border-slate-800 bg-slate-700 flex items-center justify-center overflow-hidden">
                  {profileImageUrl
                    ? <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                    : iconEmoji ? <span className="text-4xl">{iconEmoji}</span>
                    : <span className="text-3xl">👤</span>}
                </div>
              </div>
            </div>
            <div className="pt-10 pb-4 px-4 bg-slate-800/50">
              <p className="text-sm text-slate-300">{bio || t('bioPlaceholder')}</p>
            </div>
          </section>

          {/* 프로필 이미지 업로드 */}
          <Field label={t('profileImage')}>
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f); }}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded disabled:opacity-50"
              >
                {uploading ? t('uploading') : t('chooseFile')}
              </button>
              {profileImageUrl && <span className="text-xs text-slate-400">{t('imageHint')}</span>}
            </div>
          </Field>

          {/* 자기소개 */}
          <Field label={t('bio')}>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder={t('bioPlaceholder')}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">{bio.length}/300</p>
          </Field>

          {/* 웹사이트 */}
          <Field label={t('website')}>
            <input
              type="url"
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
              maxLength={200}
              placeholder="https://"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
            />
          </Field>

          {/* 아이콘 이모지 */}
          <Field label={t('iconEmoji')}>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setIconEmoji(e)}
                  className={`w-10 h-10 rounded text-xl ${iconEmoji === e ? 'bg-indigo-600' : 'bg-slate-800 hover:bg-slate-700'}`}
                >{e}</button>
              ))}
              <button
                onClick={() => setIconEmoji('')}
                className="w-10 h-10 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-400"
              >✕</button>
            </div>
            <input
              type="text"
              value={iconEmoji}
              onChange={e => setIconEmoji(e.target.value.slice(0, 4))}
              maxLength={4}
              placeholder={t('iconCustomHint')}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
            />
          </Field>

          {/* 테마 색상 */}
          <Field label={t('themeColor')}>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setThemeColor(c)}
                  style={{ background: c }}
                  className={`w-10 h-10 rounded ${themeColor === c ? 'ring-2 ring-white' : ''}`}
                  aria-label={c}
                />
              ))}
              <button
                onClick={() => setThemeColor('')}
                className="w-10 h-10 rounded text-xs bg-slate-800 hover:bg-slate-700 text-slate-400"
              >✕</button>
            </div>
            <input
              type="text"
              value={themeColor}
              onChange={e => setThemeColor(e.target.value)}
              placeholder="#6366f1"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm font-mono"
            />
          </Field>

          {/* 배너 URL */}
          <Field label={t('bannerUrl')}>
            <input
              type="url"
              value={bannerUrl}
              onChange={e => setBannerUrl(e.target.value)}
              maxLength={400}
              placeholder="https://.../banner.jpg"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">{t('bannerHint')}</p>
          </Field>

          <div className="flex gap-3 mt-8">
            <button
              onClick={onSave}
              disabled={saving}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
            >
              {saving ? t('saving') : t('save')}
            </button>
            <button
              onClick={() => router.push('/account')}
              className="px-6 py-2 border border-slate-600 hover:bg-slate-700 rounded"
            >
              {t('back')}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-sm font-medium mb-2">{label}</label>
      {children}
    </div>
  );
}
