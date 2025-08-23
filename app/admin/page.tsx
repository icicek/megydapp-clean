'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const TOKEN_KEY = 'coincarnation_admin_token';

export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    if (!t) router.replace('/admin/login');   // token yoksa login
    else router.replace('/admin/tokens');     // token varsa yeni yönetim sayfası (birazdan ekleyeceğiz)
  }, [router]);

  return null;
}
