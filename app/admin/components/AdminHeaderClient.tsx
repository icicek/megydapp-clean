// app/admin/components/AdminHeaderClient.tsx
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminToolbar from './AdminToolbar';

export default function AdminHeaderClient() {
  const router = useRouter();

  return (
    <div className="w-full">
      {/* Sağ üst aksiyonlar */}
      <div className="w-full flex items-center justify-end gap-2 mb-2">
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10
                     bg-white/5 hover:bg-white/10 transition-colors text-sm"
          title="Open documentation"
        >
          <span>📘</span>
          <span>Docs</span>
        </Link>
      </div>

      {/* Mevcut araç çubuğu */}
      <AdminToolbar onRefresh={() => router.refresh()} />
    </div>
  );
}
