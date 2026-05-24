'use client';
import dynamic from 'next/dynamic';

const StudioCanvas = dynamic(() => import('@/components/studio/StudioCanvas'), { ssr: false });

export default function StudioPage() {
  return <StudioCanvas />;
}
