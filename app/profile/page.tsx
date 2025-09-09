// app/profile/page.tsx  — Server Component
import nextDynamic from 'next/dynamic';

// Route-segment config: sayfayı her istekte dinamik çalıştır (cache yok)
export const dynamic = 'force-dynamic';

const ClaimPanel = nextDynamic(() => import('@/components/ClaimPanel'), {
  ssr: false,
  loading: () => (
    <p className="min-h-screen flex items-center justify-center text-blue-400">
      ⏳ Loading your claim panel…
    </p>
  ),
});

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <ClaimPanel />
    </main>
  );
}
