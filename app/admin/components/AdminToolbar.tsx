// app/admin/components/AdminToolbar.tsx
'use client';

import Link from 'next/link';
import BulkUpdateDialog from './BulkUpdateDialog';
// import ExportCsvButton from '@/components/admin/ExportCsvButton'; // istersen aç

export default function AdminToolbar({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Sol taraf: (arama / filtre vs. varsa buraya) */}
      <div className="flex items-center gap-2" />

      {/* Sağ taraf: aksiyonlar */}
      <div className="ml-auto flex items-center gap-2">
        {/* ⬇️ Dev notlarına giden buton */}
        <Link
          href="/docs/dev"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10
                     bg-white/5 hover:bg-white/10 transition-colors text-sm"
          title="Developer notes / internal docs"
        >
          <span>📘</span>
          <span>Dev Notes</span>
        </Link>

        {/* İstersen CSV export’u tekrar görünür yap */}
        {/* <ExportCsvButton /> */}

        <BulkUpdateDialog onDone={onRefresh} />
      </div>
    </div>
  );
}
