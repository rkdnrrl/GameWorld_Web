'use client';
/**
 * 프로필 꾸미기 — 페이지 wrapper. 폼은 ProfileCustomizeForm 컴포넌트.
 * 같은 폼이 /account 페이지의 모달에서도 재사용됨.
 *
 * 이 페이지는 직접 URL/북마크 호환 용도로 유지. 일반적 진입은 /account 모달.
 */
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ProfileCustomizeForm from '@/components/account/ProfileCustomizeForm';

export default function CustomizePage() {
  const router = useRouter();
  const t = useTranslations('AccountCustomize');

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">{t('title')}</h1>
      <p className="text-sm text-slate-400 mb-6">{t('subtitle')}</p>
      <ProfileCustomizeForm
        onClose={() => router.push('/account')}
        closeLabel={t('back')}
      />
    </main>
  );
}
