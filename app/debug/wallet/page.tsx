'use client';
import dynamic from 'next/dynamic';
const WalletDiag = dynamic(() => import('@/components/debug/WalletDiag'), { ssr: false });
export default function Page() { return <WalletDiag />; }
