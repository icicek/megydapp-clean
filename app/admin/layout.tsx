// app/admin/layout.tsx
import type { ReactNode } from 'react';
import AdminSessionSync from '@/components/wallet/AdminSessionSync';
import AdminTopNav from '@/components/AdminTopNav';
import AppWalletBar from '@/components/AppWalletBar';
import AdminSectionNav from '@/components/admin/AdminSectionNav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <section className="bg-zinc-950 min-h-screen text-white">
      <AdminSessionSync />
      <AdminTopNav />

      <div className="px-4 sm:px-6 md:px-12 lg:px-20 pt-4 pb-6">
        <div className="max-w-6xl w-full mx-auto space-y-4">
          <AppWalletBar showAdminStatus />
          <AdminSectionNav />
        </div>
      </div>

      {children}
    </section>
  );
}