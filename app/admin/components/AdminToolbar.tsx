'use client';

import BulkUpdateDialog from './BulkUpdateDialog';
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
