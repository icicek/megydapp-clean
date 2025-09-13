// app/admin/layout.tsx
import type { ReactNode } from 'react';
import AdminSessionSync from '@/components/wallet/AdminSessionSync';
import AdminTopNav from '@/components/AdminTopNav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      {/* /admin altında admin oturum kontrolü ve topbar */}
      <AdminSessionSync />
      <AdminTopNav />
      {children}
    </section>
  );
}
