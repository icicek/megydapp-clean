// app/profile/ProfileClient.tsx
'use client';

import dynamic from 'next/dynamic';

// ClaimPanel client component ise burada güvenle ssr:false kullanabiliriz
const ClaimPanel = dynamic(() => import('@/components/ClaimPanel'), {
  ssr: false,
  loading: () => (
    <p className="min-h-screen flex items-center justify-center text-blue-400">
      ⏳ Loading your claim panel…
    </p>
  ),
});

export default function ProfileClient() {
  // Eğer alias/param okumanız gerekiyorsa burada useSearchParams/useParams ile okuyup ClaimPanel'e prop geçebilirsiniz.
  // const params = useSearchParams(); const alias = params.get('alias') ?? null;
  // return <ClaimPanel alias={alias} />;

  return <ClaimPanel />;
}
