// components/ui/Skeleton.tsx
'use client';

export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/10 ${className}`} />;
}
