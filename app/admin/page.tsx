'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
const TOKEN_KEY = 'coincarnation_admin_token';

export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    if (!t) router.replace('/admin/login');  // token yok → login
    else router.replace('/admin/tokens');    // token var → (bir sonraki adımda yapacağımız) yönetim sayfası
  }, [router]);
  return null;
}
