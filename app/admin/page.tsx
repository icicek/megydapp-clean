'use client';

import dynamic from 'next/dynamic';

// AdminPanel bileşenini client-side olarak dinamik şekilde çağır
const AdminPanel = dynamic(() => import('@/components/AdminPanel'), { ssr: false });

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <AdminPanel />
    </div>
  );
}
