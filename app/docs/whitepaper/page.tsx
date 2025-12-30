// app/docs/whitepaper/page.tsx
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Whitepaper — Coincarnation',
};

export default function WhitepaperRedirect() {
  redirect('/docs/print');
}
