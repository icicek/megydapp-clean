'use client';
import { useRouter } from 'next/navigation';
import AdminToolbar from './AdminToolbar';

export default function AdminHeaderClient() {
  const router = useRouter();
  return <AdminToolbar onRefresh={() => router.refresh()} />;
}
