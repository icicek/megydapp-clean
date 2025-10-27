// app/admin/docs/page.tsx
import { redirect } from 'next/navigation';

export default function AdminDocsRedirect() {
  redirect('/docs/dev');
}
