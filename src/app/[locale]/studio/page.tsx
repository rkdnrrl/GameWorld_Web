'use client';
import dynamic from 'next/dynamic';
import CreatorNav from '@/components/creator/CreatorNav';

const StudioCanvas = dynamic(() => import('@/components/studio/StudioCanvas'), { ssr: false });

export default function StudioPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: '#0f172a',
    }}>
      <CreatorNav />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <StudioCanvas />
      </div>
    </div>
  );
}
