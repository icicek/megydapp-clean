> ⚠️ **INTERNAL ONLY** — This document is for internal development reference and not served publicly.

# 🧭 Tokenlist Intelligence System
*"From chaos to clarity — one mint at a time."*

**Project:** Coincarnation DApp  
**Module:** Tokenlist & Metadata Resolver  
**Last Updated:** 2025-10-24  
**Maintainer:** Levershare Dev Core

---

## 🌐 Overview

The **Tokenlist Intelligence System** ensures every token shown inside Coincarnation carries its correct **symbol, name, and logo**, even when standard APIs fail.  
It blends curated tokenlists (Jupiter), on-chain metadata, and DEX intelligence (Dexscreener) to identify living / walking-dead / lost assets on Solana.

---

## ⚙️ System Map (file → role)

app/api/tokenlist/route.ts ← global list fetcher (Jupiter strict) → { mint: {symbol,name,logoURI,…} }
app/api/symbol/route.ts ← single-mint resolver (symbol/name/logo via tokenlist → fallbacks)
app/api/solana/tokens/route.ts ← server-side wallet token enumerator (preferred over client RPC)
lib/solana/tokenMeta.ts ← universal metadata resolver (fallback logic)
lib/utils.ts ← helpers (incl. fetchSolanaTokenList if used)
lib/client/fetchTokenMetadataClient.ts← Metaplex metadata client (browser-safe)
hooks/useWalletTokens.ts ← main hook: list wallet tokens → enrich with /api/tokenlist
components/HomePage.tsx ← token dropdown (Shadcn Select + logos)
components/CoincarneModal.tsx ← uses token.symbol/logo for UX during Coincarnation

> **Priority rule (pragmatic):**
> 1) **/api/tokenlist** symbol/name/logo **wins**.  
> 2) On-chain/meta **fills only missing** fields.  
> 3) As last resort, show **mint prefix** (UI fallback).

---

## 🔄 Data Flow

```mermaid
graph LR
A[Wallet] -->|/api/solana/tokens| B(Server)
B --> C[useWalletTokens Hook]
C -->|enrich| D[/api/tokenlist/]
D --> E{has meta?}
E -- yes --> F[UI uses symbol/logo]
E -- no  --> G[getTokenMeta()/api/symbol fallback]
G --> F
F --> H[HomePage Select & CoincarneModal]
🧩 Responsibilities
app/api/tokenlist/route.ts
Fetches https://tokens.jup.ag/strict (primary) or safe fallback if needed.
Returns { ok: true, data: Record<mint, {symbol,name,logoURI,verified,decimals?}> }.
Short TTL cache suggested on edge; UI uses no-store when debugging.
app/api/symbol/route.ts
GET /api/symbol?mint=<address>
For isolated mint checks in console/monitoring.
Uses tokenlist first, then Dexscreener / on-chain as fallback.
lib/solana/tokenMeta.ts
Pure resolver — merges tokenlist + fallback providers.
Safe guards against garbage (null bytes, whitespace, random 3–4 letter noise).
hooks/useWalletTokens.ts
Lists wallet SPL tokens (server route preferred; client RPC fallback).
Enriches tokens with /api/tokenlist → sets token.symbol & token.logoURI.
Exposes { tokens, loading, error, refetchTokens }.
components/HomePage.tsx
Renders the dropdown with logo + symbol + balance.
Disables dropdown until metadata is ready for clean UX.
components/CoincarneModal.tsx
Displays the resolved displaySymbol and uses it in confirmations/receipts.
💥 Troubleshooting (first-aid)
Symptom	Likely cause	Where to fix
All non-SOL symbols look like random codes	/api/tokenlist failing/empty	app/api/tokenlist/route.ts (check logs, network)
Only SOL visible	Token listing empty	app/api/solana/tokens/route.ts (RPC keys / rate limits)
One token wrong (e.g., POPCAT → ZN)	On-chain metadata overrides	lib/solana/tokenMeta.ts (tokenlist precedence)
Logos missing	logoURI absent in list	tokenlist route or add logo fallback in tokenMeta.ts
Dropdown says “Loading symbols…” forever	Effect not finishing	hooks/useWalletTokens.ts (ensure enrich completes)
🔍 Quick Debug Snippets (DevTools Console)
Total list entries:
Object.keys((await (await fetch('/api/tokenlist',{cache:'no-store'})).json()).data).length
Is a specific mint present?
const m='7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr';
(await (await fetch('/api/tokenlist',{cache:'no-store'})).json()).data[m]
Wallet view with symbols:
const owner = '<WALLET_BASE58>';
const toks  = (await (await fetch(`/api/solana/tokens?owner=${owner}`,{cache:'no-store'})).json()).tokens;
const map   = (await (await fetch('/api/tokenlist',{cache:'no-store'})).json()).data;
console.table(toks.map(t=>({ mint:t.mint, amount:t.amount, symbol: map[t.mint]?.symbol ?? null, name: map[t.mint]?.name ?? null })));
Single-mint resolver:
await (await fetch('/api/symbol?mint=7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr')).json()
🛡️ Operational Notes
Do not serve this doc from /public. Keep it in /docs.
Rate limits on public RPCs can break client-side fallbacks; prefer server route with provider keys.
If Jupiter is unreachable, keep a safe fallback list (optional) to avoid UI regressions.
🚨 Intervention Order
app/api/tokenlist/route.ts
hooks/useWalletTokens.ts
lib/solana/tokenMeta.ts
app/api/symbol/route.ts
components/HomePage.tsx
💫 Vision
“A token without a name is just lost code.
Coincarnation gives it back its identity.”