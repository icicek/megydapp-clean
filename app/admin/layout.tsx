// app/admin/layout.tsx
'use client';

import type { ReactNode } from 'react';
import AdminSessionSync from '@/components/wallet/AdminSessionSync';
import AdminTopNav from '@/components/AdminTopNav';
import AdminHeaderClient from './components/AdminHeaderClient';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <section className="min-h-screen px-4 py-4">
      {/* Session senkronizasyonu */}
      <AdminSessionSync />

      {/* Üst navigasyon */}
      <AdminTopNav />

      {/* Admin header: sağ üstte Docs butonu ve AdminToolbar */}
      <div className="mt-3 mb-4">
        <AdminHeaderClient />
      </div>

      {/* Ana içerik */}
      <main className="mt-2">
        {children}
      </main>
    </section>
  );
}
