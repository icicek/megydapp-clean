'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Dinamik import: SSR hatası almamak için ClaimPanel'i client-side render eder
const ClaimPanel = dynamic(() => import('@/components/ClaimPanel'), { ssr: false });

export default function ProfilePage() {
  return <ClaimPanel />;
}
