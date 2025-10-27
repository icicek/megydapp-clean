'use client';

import BulkUpdateDialog from './BulkUpdateDialog';
import Link from 'next/link';
// import ExportCsvButton from './ExportCsvButton' // varsa aç

export default function AdminToolbar({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {/* Arama / Status filtreleri varsa buraya */}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {/* {ExportCsvButton && <ExportCsvButton />} */}
        <BulkUpdateDialog onDone={onRefresh} />
      </div>
    </div>
  );
}
<Link
  href="/docs/dev"
  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10
             bg-white/5 hover:bg-white/10 transition-colors text-sm"
  title="Developer notes / internal docs"
>
  <span>📘</span>
  <span>Dev Notes</span>
</Link>
