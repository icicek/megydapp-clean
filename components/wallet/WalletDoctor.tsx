'use client';
import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
const norm = (s:string)=>s.toLowerCase().replace(/[^a-z]/g,'');
export default function WalletDoctor(){
  const w=useWallet(); const [t,setT]=useState(0);
  const list=useMemo(()=>w.wallets.map(x=>({name:x.adapter.name,rs:(x as any).readyState??(x.adapter as any).readyState})),[w.wallets]);
  useEffect(()=>{console.log('[Doctor]',{connected:w.connected,connecting:(w as any).connecting,disconnecting:(w as any).disconnecting,selected:w.wallet?.adapter?.name,wallets:list});},[t,list,w.connected,w.wallet]);
  return(<div className="fixed bottom-4 right-4 z-[9999] bg-black/70 text-white text-xs p-3 rounded-lg border border-white/10">
    <div>connected: {String(w.connected)}</div>
    <div>connecting: {String((w as any).connecting)} | disconnecting: {String((w as any).disconnecting)}</div>
    <div>selected: {w.wallet?.adapter?.name||'-'}</div>
    <ul className="list-disc pl-4">{list.map((x,i)=><li key={i}>{x.name} (rs:{String(x.rs)})</li>)}</ul>
    <div className="pt-2 flex gap-2">
      <button className="px-2 py-1 bg-white/10 rounded" onClick={()=>setT(s=>s+1)}>log</button>
      <button className="px-2 py-1 bg-white/10 rounded" onClick={()=>w.disconnect().catch(()=>{})}>disconnect</button>
    </div>
  </div>);
}
