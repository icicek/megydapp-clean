'use client';

import ClaimPanel from '@/components/ClaimPanel';

export default function ClaimPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-6">👤 Claim Panel</h1>
      <ClaimPanel />
    </div>
  );
}
