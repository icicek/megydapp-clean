// components/docs/PageMeta.tsx
'use client';
export default function PageMeta({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs text-white/60">Internal Docs</div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {desc && <p className="text-white/70 mt-1">{desc}</p>}
      <hr className="mt-3 border-white/10" />
    </div>
  );
}
