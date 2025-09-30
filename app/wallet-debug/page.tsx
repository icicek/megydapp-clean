'use client';
import React,{useMemo,useState,useCallback} from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import WalletDoctor from '@/components/wallet/WalletDoctor';
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z]/g,'');
export default function Page(){
  const {wallets,select,connect,disconnect}=useWallet();
  const [msg,setMsg]=useState('');
  const phantom=useMemo(()=>wallets.find(w=>norm(w.adapter.name).includes('phantom'))?.adapter.name,[wallets]);
  const solflare=useMemo(()=>wallets.find(w=>norm(w.adapter.name).includes('solflare'))?.adapter.name,[wallets]);
  const go=useCallback(async(name?:string)=>{setMsg('');try{if(!name)throw new Error('adapter not found');select(name as WalletName);await connect();setMsg('connected ✓');}catch(e:any){setMsg(`${e?.name||''} ${e?.message||String(e)}`);}},[select,connect]);
  return(<div className="p-8 text-white"><h1 className="text-xl mb-4">Wallet Debug</h1>
    <div className="flex gap-2">
      <button className="px-3 py-2 bg-indigo-600 rounded" onClick={()=>go(phantom)}>Connect Phantom</button>
      <button className="px-3 py-2 bg-indigo-600 rounded" onClick={()=>go(solflare)}>Connect Solflare</button>
      <button className="px-3 py-2 bg-zinc-700 rounded" onClick={()=>disconnect()}>Disconnect</button>
    </div>
    <div className="mt-3 text-sm text-red-300">{msg}</div>
    <WalletDoctor/>
  </div>);
}
